"""
Dagster Sensor — PostgreSQL-driven Schedule Executor
Polls pipeline_schedule every 60s:
  - run_type='scheduled': evaluates cron expression with croniter
  - run_type='onetime':   checks if run_at has passed and not yet triggered

Calls FastAPI backend POST /api/pipelines/{id}/run when a pipeline is due.
"""
import os
import requests
import psycopg2
from datetime import datetime, timezone

from croniter import croniter
from dagster import sensor, SensorEvaluationContext, SkipReason

BACKEND_URL = os.getenv("BACKEND_API_URL", "http://de-backend:8000")
DB_HOST     = os.getenv("DAGSTER_POSTGRES_HOST",     "de-postgres")
DB_USER     = os.getenv("DAGSTER_POSTGRES_USER",     "postgres")
DB_PASS     = os.getenv("DAGSTER_POSTGRES_PASSWORD", "postgres")
DB_NAME     = os.getenv("DAGSTER_POSTGRES_DB",       "postgres")


def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, user=DB_USER,
        password=DB_PASS, dbname=DB_NAME,
        connect_timeout=5,
    )


@sensor(job_name="pipeline_runner", minimum_interval_seconds=60, name="de_platform_schedule_sensor")
def postgres_schedule_sensor(context: SensorEvaluationContext):
    """
    DE Platform — master scheduler sensor.

    Reads from pipeline_schedule + pipeline tables, determines which pipelines
    are due to run, triggers them via the FastAPI backend, and marks one-time
    schedules as 'triggered' (by setting enabled=False + last_triggered_at).

    Flow:
      1. Every 60s Dagster daemon calls this sensor
      2. For each enabled schedule:
         a. run_type='scheduled'  → use croniter to check if cron fires in [last_eval, now]
         b. run_type='onetime'    → check if now >= run_at and not already triggered
      3. POST to backend /api/pipelines/{id}/run
      4. For onetime: set enabled=False + last_triggered_at=now in DB
      5. For scheduled: set last_triggered_at=now in DB
      6. Update sensor cursor to now.timestamp()
    """
    now = datetime.now(timezone.utc)
    last_eval_time = float(context.cursor) if context.cursor else (now.timestamp() - 120)
    last_eval_dt   = datetime.fromtimestamp(last_eval_time, tz=timezone.utc)

    triggered_pipelines = []

    try:
        conn = get_db_connection()
        cur  = conn.cursor()

        # Fetch all enabled schedules for active, enabled pipelines with at least one version
        cur.execute("""
            SELECT
                s.id            AS schedule_id,
                s.pipeline_id,
                s.run_type,
                s.cron_expr,
                s.run_at,
                s.timezone,
                p.name          AS pipeline_name,
                p.latest_version
            FROM pipeline_schedule s
            JOIN pipeline p ON s.pipeline_id = p.id
            WHERE
                s.enabled        = TRUE
                AND p.is_enabled  = TRUE
                AND p.status     = 'active'
                AND p.latest_version > 0
        """)
        schedules = cur.fetchall()

        for row in schedules:
            (schedule_id, pipeline_id, run_type, cron_expr,
             run_at, tz, pipeline_name, latest_version) = row

            should_run = False
            reason     = ""

            # ── Scheduled (cron) ────────────────────────────────────────────
            if run_type == "scheduled":
                if not cron_expr:
                    context.log.warning(f"[{pipeline_name}] run_type=scheduled but cron_expr is NULL — skip")
                    continue
                try:
                    cron = croniter(cron_expr, last_eval_dt)
                    next_run = cron.get_next(datetime)
                    if next_run <= now:
                        should_run = True
                        reason = f"cron '{cron_expr}' fired at {next_run.isoformat()}"
                except Exception as e:
                    context.log.error(f"[{pipeline_name}] Invalid cron '{cron_expr}': {e}")
                    continue

            # ── One-time ─────────────────────────────────────────────────────
            elif run_type == "onetime":
                if not run_at:
                    context.log.warning(f"[{pipeline_name}] run_type=onetime but run_at is NULL — skip")
                    continue
                # run_at comes from DB as datetime (possibly naive or tz-aware)
                if run_at.tzinfo is None:
                    run_at = run_at.replace(tzinfo=timezone.utc)
                if now >= run_at:
                    should_run = True
                    reason = f"one-time run_at={run_at.isoformat()} has passed"

            if not should_run:
                continue

            # ── Trigger via FastAPI ──────────────────────────────────────────
            context.log.info(f"⏰ [{pipeline_name}] Triggering run — {reason}")
            try:
                resp = requests.post(
                    f"{BACKEND_URL}/api/pipelines/{pipeline_id}/run",
                    timeout=20,
                )
                if resp.status_code == 200:
                    run_data = resp.json()
                    context.log.info(
                        f"✅ [{pipeline_name}] run started — run_id={run_data.get('run_id', '?')[:8]}"
                    )
                    triggered_pipelines.append(pipeline_name)

                    # Update last_triggered_at in DB
                    cur.execute(
                        "UPDATE pipeline_schedule SET last_triggered_at = %s WHERE id = %s",
                        (now, schedule_id)
                    )

                    # For one-time: disable after firing
                    if run_type == "onetime":
                        cur.execute(
                            "UPDATE pipeline_schedule SET enabled = FALSE WHERE id = %s",
                            (schedule_id,)
                        )
                        context.log.info(f"📅 [{pipeline_name}] One-time schedule disabled after trigger")

                    conn.commit()
                else:
                    context.log.error(
                        f"❌ [{pipeline_name}] Backend returned {resp.status_code}: {resp.text[:200]}"
                    )
            except requests.RequestException as req_err:
                context.log.error(f"❌ [{pipeline_name}] HTTP error triggering run: {req_err}")

        cur.close()
        conn.close()

    except psycopg2.Error as db_err:
        context.log.error(f"[sensor] DB connection error: {db_err}")

    # Update cursor to current time so next eval knows from where to check
    context.update_cursor(str(now.timestamp()))

    if triggered_pipelines:
        context.log.info(f"[sensor] Done. Triggered {len(triggered_pipelines)} pipeline(s): {', '.join(triggered_pipelines)}")
    else:
        return SkipReason(f"No pipelines due at {now.strftime('%Y-%m-%d %H:%M:%S UTC')}")
