"""
DE Platform — Pipeline Scheduler Service
APScheduler-based background scheduler embedded in FastAPI.
Runs every 60s, polls pipeline_schedule table, triggers due pipelines.

Design:
  - run_type='scheduled': croniter evaluates cron expression against [last_triggered_at, now] window
  - run_type='onetime':   triggers if now >= run_at and not yet triggered (last_triggered_at is None)
  - Executes Trino SQL directly (no HTTP round-trip to self)
  - Updates last_triggered_at IMMEDIATELY in tick session (before async task)
  - Disables one-time schedules after firing
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from croniter import croniter
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.db.database import AsyncSessionLocal
from app.db.models import Pipeline, PipelineRun, PipelineSchedule, PipelineVersion, TaskRun
from app.services.trino_service import TrinoService
from app.services.nessie_service import NessieService

log = logging.getLogger("de.scheduler")


async def _execute_pipeline_run(
    pipeline_id: uuid.UUID,
    pipeline_name: str,
    schedule_id: uuid.UUID,
    version_id: uuid.UUID,
    run_type: str,
    version_num: int,
    compiled_sql: str,
) -> None:
    """Execute one pipeline run in a fresh DB session."""
    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)

        run = PipelineRun(
            pipeline_id=pipeline_id,
            version=version_num,
            status="running",
            triggered_by="schedule",
            started_at=now,
        )
        session.add(run)
        await session.flush()

        import re
        import time
        safe_name = re.sub(r'[^a-zA-Z0-9]+', '_', pipeline_name).strip('_').lower()
        branch_name = f"pipeline_{int(time.time())}_{safe_name}_run_{str(run.id).replace('-', '')[:8]}"
        
        nessie_svc = NessieService()
        try:
            await nessie_svc.create_branch(branch_name, source_branch="main")
            run.branch_name = branch_name
            await session.flush()
        except Exception as e:
            log.error(f"[scheduler] Failed to create branch {branch_name}: {e}")
            run.status = "failed"
            run.error_message = f"Failed to create branch: {e}"
            run.ended_at = datetime.now(timezone.utc)
            await session.commit()
            return

        try:
            trino = TrinoService(branch=branch_name)
            query_id, rows = trino.execute_with_tracking(compiled_sql)

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
                compiled_sql=compiled_sql,
            )
            session.add(task)
            run.status = "success"
            log.info(
                f"[scheduler] ✅ '{pipeline_name}' success — "
                f"run={str(run.id)[:8]}, rows={rows}"
            )
        except Exception as e:
            log.error(f"[scheduler] ❌ '{pipeline_name}' run failed: {e}")
            run.status = "failed"
            run.error_message = str(e)
            
            # Clean up failed branch
            try:
                await nessie_svc.delete_branch(branch_name)
                try:
                    TrinoService().drop_catalog(f"ctlg_{branch_name.replace('-', '_')}")
                except Exception: pass
            except Exception as clean_err:
                log.error(f"[scheduler] Cannot delete failed branch {branch_name}: {clean_err}")

        run.ended_at = datetime.now(timezone.utc)

        # Disable one-time schedule after firing
        if run_type == "onetime":
            await session.execute(
                update(PipelineSchedule)
                .where(PipelineSchedule.id == schedule_id)
                .values(enabled=False)
            )
            log.info(f"[scheduler] 📅 '{pipeline_name}' one-time schedule disabled")

        await session.commit()


async def _check_and_trigger_schedules() -> None:
    """
    Core scheduler tick — runs every 60s.
    Evaluates all enabled schedules and triggers pipelines that are due.
    Updates last_triggered_at in the SAME session before launching async tasks.
    """
    now = datetime.now(timezone.utc)
    log.info(f"[scheduler] ⏰ Tick at {now.strftime('%Y-%m-%d %H:%M:%S UTC')}")

    tasks_to_launch: list[dict] = []

    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PipelineSchedule)
                .join(Pipeline, Pipeline.id == PipelineSchedule.pipeline_id)
                .where(
                    PipelineSchedule.enabled == True,      # noqa: E712
                    Pipeline.is_enabled == True,           # noqa: E712
                    Pipeline.status == "active",
                    Pipeline.latest_version > 0,
                )
                .options(selectinload(PipelineSchedule.pipeline))
            )
            schedules = result.scalars().all()

            log.info(f"[scheduler] Found {len(schedules)} active enabled schedules")

            for schedule in schedules:
                pipeline = schedule.pipeline
                should_fire = False
                reason = ""

                # ── Scheduled (cron) ─────────────────────────────────────────
                if schedule.run_type == "scheduled":
                    if not schedule.cron_expr:
                        continue

                    # Window start: last triggered or 120s ago (safe fallback)
                    if schedule.last_triggered_at:
                        window_start = schedule.last_triggered_at
                        # Ensure tz-aware
                        if window_start.tzinfo is None:
                            window_start = window_start.replace(tzinfo=timezone.utc)
                    else:
                        window_start = now - timedelta(seconds=120)

                    try:
                        cron = croniter(schedule.cron_expr, window_start)
                        next_run = cron.get_next(datetime)
                        if next_run <= now:
                            should_fire = True
                            reason = f"cron '{schedule.cron_expr}' → fired at {next_run.strftime('%H:%M:%S')}"
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
                    # Only fire if time passed AND never triggered
                    if now >= run_at and schedule.last_triggered_at is None:
                        should_fire = True
                        reason = f"one-time run_at={run_at.strftime('%Y-%m-%d %H:%M:%S')}"

                if not should_fire:
                    continue

                # ── Fetch compiled version ─────────────────────────────────
                ver_result = await session.execute(
                    select(PipelineVersion).where(
                        PipelineVersion.pipeline_id == pipeline.id,
                        PipelineVersion.version == pipeline.latest_version,
                    )
                )
                ver = ver_result.scalar_one_or_none()
                if not ver or not ver.compiled_sql:
                    log.warning(f"[scheduler] '{pipeline.name}' v{pipeline.latest_version} has no SQL — skip")
                    continue

                log.info(f"[scheduler] 🚀 Firing '{pipeline.name}' — {reason}")

                # ✅ Update last_triggered_at NOW, in same session, before async task
                schedule.last_triggered_at = now

                # Collect task info (avoid passing detached ORM objects)
                tasks_to_launch.append({
                    "pipeline_id":   pipeline.id,
                    "pipeline_name": pipeline.name,
                    "schedule_id":   schedule.id,
                    "version_id":    ver.id,
                    "run_type":      schedule.run_type,
                    "version_num":   ver.version,
                    "compiled_sql":  ver.compiled_sql,
                })

            # Commit last_triggered_at updates for all pipelines in this tick
            if tasks_to_launch:
                await session.commit()
                log.info(f"[scheduler] Updated last_triggered_at for {len(tasks_to_launch)} pipeline(s)")

    except Exception as e:
        log.error(f"[scheduler] Tick error: {e}", exc_info=True)
        return

    # Launch execution tasks AFTER the session is closed (fresh sessions per task)
    for task_info in tasks_to_launch:
        asyncio.create_task(_execute_pipeline_run(**task_info))

    if not tasks_to_launch:
        log.info("[scheduler] No pipelines due this tick")


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
