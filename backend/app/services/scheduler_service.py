"""
DE Platform — Pipeline Scheduler Service
APScheduler-based background scheduler embedded in FastAPI.
Runs every 60s, polls pipeline_schedule table, triggers due pipelines via internal DB call.

Design:
  - run_type='scheduled': croniter evaluates cron expression against [last_check, now] window
  - run_type='onetime':   triggers if now >= run_at and not yet triggered (last_triggered_at is None)
  - Inserts a PipelineRun + executes Trino SQL directly (no HTTP round-trip to self)
  - Updates last_triggered_at after successful trigger
  - Disables one-time schedules after firing
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from croniter import croniter
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from app.db.database import AsyncSessionLocal
from app.db.models import Pipeline, PipelineRun, PipelineSchedule, PipelineVersion, TaskRun
from app.services.trino_service import TrinoService

log = logging.getLogger("de.scheduler")


async def _trigger_pipeline(
    pipeline: Pipeline,
    schedule: PipelineSchedule,
    version: PipelineVersion,
) -> None:
    """Execute one pipeline run via Trino (direct DB, no HTTP loop)."""
    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)

        # Create run record
        run = PipelineRun(
            pipeline_id=pipeline.id,
            version=version.version,
            status="running",
            triggered_by="schedule",
            started_at=now,
        )
        session.add(run)
        await session.flush()

        try:
            trino = TrinoService()
            query_id, rows = trino.execute_with_tracking(version.compiled_sql)

            task = TaskRun(
                pipeline_run_id=run.id,
                node_id="compiled_cte",
                node_type="cte_query",
                node_label="Scheduled CTE Run",
                status="success",
                started_at=now,
                ended_at=datetime.now(timezone.utc),
                trino_query_id=query_id,
                rows_affected=rows,
                compiled_sql=version.compiled_sql,
            )
            session.add(task)
            run.status = "success"
        except Exception as e:
            log.error(f"[scheduler] Pipeline '{pipeline.name}' run failed: {e}")
            run.status = "failed"
            run.error_message = str(e)

        run.ended_at = datetime.now(timezone.utc)

        # Update last_triggered_at
        schedule.last_triggered_at = now

        # Disable one-time schedule after firing
        if schedule.run_type == "onetime":
            schedule.enabled = False
            log.info(f"[scheduler] One-time schedule for '{pipeline.name}' disabled after firing")

        await session.commit()
        log.info(
            f"[scheduler] ✅ Pipeline '{pipeline.name}' triggered — "
            f"status={run.status}, rows={getattr(task, 'rows_affected', None) if run.status == 'success' else 'N/A'}"
        )


async def _check_and_trigger_schedules() -> None:
    """
    Core scheduler tick — runs every 60s.
    Evaluates all enabled schedules and triggers due pipelines.
    """
    now = datetime.now(timezone.utc)
    log.debug(f"[scheduler] Tick at {now.isoformat()}")

    try:
        async with AsyncSessionLocal() as session:
            # Fetch all enabled schedules for active, enabled pipelines
            result = await session.execute(
                select(PipelineSchedule)
                .join(Pipeline, Pipeline.id == PipelineSchedule.pipeline_id)
                .where(
                    PipelineSchedule.enabled == True,
                    Pipeline.is_enabled == True,
                    Pipeline.status == "active",
                    Pipeline.latest_version > 0,
                )
                .options(selectinload(PipelineSchedule.pipeline))
            )
            schedules = result.scalars().all()

            for schedule in schedules:
                pipeline = schedule.pipeline
                should_fire = False
                reason = ""

                # ── Scheduled (cron) ─────────────────────────────────────────
                if schedule.run_type == "scheduled":
                    if not schedule.cron_expr:
                        continue

                    # Determine the check window start
                    if schedule.last_triggered_at:
                        window_start = schedule.last_triggered_at
                    else:
                        # Never triggered before — check last 60s window
                        from datetime import timedelta
                        window_start = datetime.fromtimestamp(now.timestamp() - 60, tz=timezone.utc)

                    try:
                        cron = croniter(schedule.cron_expr, window_start)
                        next_run = cron.get_next(datetime)
                        if next_run <= now:
                            should_fire = True
                            reason = f"cron '{schedule.cron_expr}' → next={next_run.strftime('%H:%M:%S')}"
                    except Exception as e:
                        log.warning(f"[scheduler] Invalid cron for '{pipeline.name}': {e}")
                        continue

                # ── One-time ─────────────────────────────────────────────────
                elif schedule.run_type == "onetime":
                    if not schedule.run_at:
                        continue
                    run_at = schedule.run_at
                    if run_at.tzinfo is None:
                        run_at = run_at.replace(tzinfo=timezone.utc)

                    # Only fire if not already triggered
                    if now >= run_at and schedule.last_triggered_at is None:
                        should_fire = True
                        reason = f"one-time run_at={run_at.isoformat()}"

                if not should_fire:
                    continue

                # ── Fetch the pipeline version ───────────────────────────────
                ver_result = await session.execute(
                    select(PipelineVersion).where(
                        PipelineVersion.pipeline_id == pipeline.id,
                        PipelineVersion.version == pipeline.latest_version,
                    )
                )
                ver = ver_result.scalar_one_or_none()

                if not ver or not ver.compiled_sql:
                    log.warning(f"[scheduler] '{pipeline.name}' has no compiled SQL for v{pipeline.latest_version} — skip")
                    continue

                log.info(f"[scheduler] ⏰ Firing pipeline '{pipeline.name}' — {reason}")

                # Trigger async (non-blocking) so scheduler tick doesn't block
                asyncio.create_task(_trigger_pipeline(pipeline, schedule, ver))

    except Exception as e:
        log.error(f"[scheduler] Tick error: {e}", exc_info=True)


# ── APScheduler setup ─────────────────────────────────────────────────────────

_scheduler: AsyncIOScheduler | None = None


def create_scheduler() -> AsyncIOScheduler:
    """Create and configure the APScheduler instance."""
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        _check_and_trigger_schedules,
        trigger="interval",
        seconds=60,
        id="pipeline_schedule_checker",
        name="Pipeline Schedule Checker",
        replace_existing=True,
        max_instances=1,         # Prevent overlapping ticks
    )
    return scheduler


def start_scheduler() -> AsyncIOScheduler:
    """Start the background scheduler (called from FastAPI lifespan)."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler
    _scheduler = create_scheduler()
    _scheduler.start()
    log.info("[scheduler] ✅ APScheduler started — checking every 60s")
    return _scheduler


def stop_scheduler() -> None:
    """Stop the background scheduler (called from FastAPI lifespan)."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("[scheduler] Stopped")
