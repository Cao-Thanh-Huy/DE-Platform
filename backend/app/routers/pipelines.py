"""
Router: Pipelines — Production-grade Pipeline Registry
DB-backed với versioning, DAG validation, CTE compilation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import instance_state

from app.db.database import get_db
from app.db.models import Pipeline, PipelineVersion, PipelineRun, TaskRun, PipelineSchedule
from app.services.dag_service import DAGService
from app.services.dagster_service import DagsterService
from app.services.trino_service import TrinoService
from app.services.nessie_service import NessieService

router = APIRouter()
dag_service = DAGService()
nessie_service = NessieService()


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────────────────────

class PipelineCreate(BaseModel):
    name: str
    description: str | None = None
    engine: str = "trino"   # trino | spark
    owner: str = "admin"


class PipelineUpdate(BaseModel):
    description: str | None = None
    engine: str | None = None
    status: str | None = None
    is_enabled: bool | None = None


class PublishRequest(BaseModel):
    definition_json: dict         # Raw UI graph (React Flow nodes + edges)
    validate_schema: bool = True  # Whether to call DESCRIBE TABLE on source nodes


class ScheduleCreate(BaseModel):
    run_type: str = "scheduled"   # "scheduled" | "onetime"
    cron_expr: str | None = None  # Only for run_type="scheduled"
    run_at: str | None = None     # ISO datetime string — only for run_type="onetime"
    timezone: str = "UTC"
    enabled: bool = True


class CloneRequest(BaseModel):
    name: str


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _pipeline_to_dict(p: Pipeline, include_versions: bool = False, include_schedule: bool = False) -> dict:
    d = {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "owner": p.owner,
        "status": p.status,
        "engine": p.engine,
        "is_enabled": p.is_enabled,
        "latest_version": p.latest_version,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }

    if include_schedule:
        if p.schedules:
            s = p.schedules[0]
            d["schedule"] = {
                "id": str(s.id),
                "run_type": s.run_type,
                "cron_expr": s.cron_expr,
                "run_at": s.run_at.isoformat() if s.run_at else None,
                "timezone": s.timezone,
                "enabled": s.enabled,
                "last_triggered_at": s.last_triggered_at.isoformat() if s.last_triggered_at else None,
            }
        else:
            d["schedule"] = None

    if include_versions and hasattr(p, "versions"):
        d["versions"] = [
            {
                "id": str(v.id),
                "version": v.version,
                "compiled_sql": v.compiled_sql,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in sorted(p.versions, key=lambda x: x.version, reverse=True)
        ]
    return d


def _run_to_dict(r: PipelineRun, include_tasks: bool = False) -> dict:
    d = {
        "id": str(r.id),
        "pipeline_id": str(r.pipeline_id) if r.pipeline_id else None,
        "version": r.version,
        "status": r.status,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "ended_at": r.ended_at.isoformat() if r.ended_at else None,
        "triggered_by": r.triggered_by,
        "dagster_run_id": r.dagster_run_id,
        "branch_name": r.branch_name,
        "error_message": r.error_message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
    if include_tasks and hasattr(r, "task_runs"):
        d["task_runs"] = [
            {
                "id": str(t.id),
                "node_id": t.node_id,
                "node_type": t.node_type,
                "node_label": t.node_label,
                "status": t.status,
                "started_at": t.started_at.isoformat() if t.started_at else None,
                "ended_at": t.ended_at.isoformat() if t.ended_at else None,
                "trino_query_id": t.trino_query_id,
                "rows_affected": t.rows_affected,
                "compiled_sql": t.compiled_sql,
                "error_message": t.error_message,
            }
            for t in r.task_runs
        ]
    return d


async def _fetch_schema_map(dag, validate_schema: bool) -> dict[str, list[str]]:
    """Fetch column lists from Trino for all source nodes."""
    if not validate_schema:
        return {}
    trino = TrinoService()
    schema_map: dict[str, list[str]] = {}
    for node_id, node in dag.nodes.items():
        if node.type == "source":
            cfg = node.config
            catalog = cfg.get("catalog", "iceberg")
            schema = cfg.get("schema", "bronze")
            table = cfg.get("table", "")
            if table:
                columns = trino.describe_table(catalog, schema, table)
                schema_map[node_id] = columns
    return schema_map


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline CRUD
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/")
async def list_pipelines(
    status: str | None = Query(None, description="Filter by status"),
    owner: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List all pipelines with optional filters."""
    q = select(Pipeline).options(selectinload(Pipeline.schedules)).order_by(Pipeline.created_at.desc()).limit(limit).offset(offset)
    if status:
        q = q.where(Pipeline.status == status)
    if owner:
        q = q.where(Pipeline.owner == owner)

    result = await db.execute(q)
    pipelines = result.scalars().all()

    count_q = select(func.count()).select_from(Pipeline)
    count_result = await db.execute(count_q)
    total = count_result.scalar()

    return {
        "pipelines": [_pipeline_to_dict(p, include_schedule=True) for p in pipelines],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/", status_code=201)
async def create_pipeline(req: PipelineCreate, db: AsyncSession = Depends(get_db)):
    """Create a new pipeline (draft status, no definition yet)."""
    existing = await db.execute(select(Pipeline).where(Pipeline.name == req.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Pipeline '{req.name}' đã tồn tại")

    pipeline = Pipeline(
        name=req.name,
        description=req.description,
        engine=req.engine,
        owner=req.owner,
        status="draft",
        is_enabled=True,
        latest_version=0,
    )
    db.add(pipeline)
    await db.flush()

    return {"message": f"Pipeline '{req.name}' đã được tạo", "pipeline": _pipeline_to_dict(pipeline)}


@router.get("/{pipeline_id}")
async def get_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """Get pipeline detail with latest version definition."""
    result = await db.execute(
        select(Pipeline)
        .options(selectinload(Pipeline.versions))
        .options(selectinload(Pipeline.schedules))
        .where(Pipeline.id == uuid.UUID(pipeline_id))
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline không tồn tại")

    data = _pipeline_to_dict(pipeline, include_versions=False, include_schedule=True)

    # Attach latest version definition
    if pipeline.versions:
        latest = max(pipeline.versions, key=lambda v: v.version)
        data["definition_json"] = latest.definition_json
        data["dag_json"] = latest.dag_json
        data["compiled_sql"] = latest.compiled_sql
        data["version"] = latest.version

    return data


@router.put("/{pipeline_id}")
async def update_pipeline(
    pipeline_id: str,
    req: PipelineUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update pipeline metadata (not definition — use publish for that)."""
    result = await db.execute(select(Pipeline).where(Pipeline.id == uuid.UUID(pipeline_id)))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline không tồn tại")

    if req.description is not None:
        pipeline.description = req.description
    if req.engine is not None:
        pipeline.engine = req.engine
    if req.status is not None:
        if req.status not in ("draft", "active", "archived"):
            raise HTTPException(status_code=400, detail="Status không hợp lệ")
        pipeline.status = req.status
    if req.is_enabled is not None:
        pipeline.is_enabled = req.is_enabled
    pipeline.updated_at = datetime.now(timezone.utc)

    return {"message": "Pipeline đã được cập nhật", "pipeline": _pipeline_to_dict(pipeline)}


@router.post("/{pipeline_id}/toggle-enabled")
async def toggle_pipeline_enabled(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """Toggle pipeline enabled/disabled state."""
    result = await db.execute(select(Pipeline).where(Pipeline.id == uuid.UUID(pipeline_id)))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline không tồn tại")

    pipeline.is_enabled = not pipeline.is_enabled
    pipeline.updated_at = datetime.now(timezone.utc)

    state = "enabled" if pipeline.is_enabled else "disabled"
    return {
        "message": f"Pipeline '{pipeline.name}' đã được {state}",
        "is_enabled": pipeline.is_enabled,
        "pipeline": _pipeline_to_dict(pipeline),
    }


@router.delete("/{pipeline_id}")
async def delete_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """Soft delete (archive) a pipeline."""
    result = await db.execute(select(Pipeline).where(Pipeline.id == uuid.UUID(pipeline_id)))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline không tồn tại")

    pipeline.status = "archived"
    pipeline.updated_at = datetime.now(timezone.utc)

    return {"message": f"Pipeline '{pipeline.name}' đã được archive"}


@router.post("/{pipeline_id}/clone", status_code=201)
async def clone_pipeline(
    pipeline_id: str,
    req: CloneRequest,
    db: AsyncSession = Depends(get_db),
):
    """Clone a pipeline including its latest definition (but empty history/schedules)."""
    existing = await db.execute(select(Pipeline).where(Pipeline.name == req.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tên Pipeline đã tồn tại")

    result = await db.execute(
        select(Pipeline)
        .options(selectinload(Pipeline.versions))
        .where(Pipeline.id == uuid.UUID(pipeline_id))
    )
    origin_pipeline = result.scalar_one_or_none()
    if not origin_pipeline:
        raise HTTPException(status_code=404, detail="Pipeline gốc không tồn tại")

    new_pipeline = Pipeline(
        name=req.name,
        description=origin_pipeline.description,
        engine=origin_pipeline.engine,
        status="draft",
        is_enabled=True,
        owner=origin_pipeline.owner,
        latest_version=origin_pipeline.latest_version
    )
    db.add(new_pipeline)
    await db.flush()

    if origin_pipeline.versions:
        latest_v = max(origin_pipeline.versions, key=lambda v: v.version)
        new_version = PipelineVersion(
            pipeline_id=new_pipeline.id,
            version=latest_v.version,
            definition_json=latest_v.definition_json,
            dag_json=latest_v.dag_json,
            compiled_sql=latest_v.compiled_sql
        )
        db.add(new_version)
        new_pipeline.status = "active"
        await db.flush()

    return {"message": f"Pipeline đã được nhân bản thành '{req.name}'", "pipeline": _pipeline_to_dict(new_pipeline)}


# ─────────────────────────────────────────────────────────────────────────────
# Versioning — Publish
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{pipeline_id}/publish")
async def publish_pipeline(
    pipeline_id: str,
    req: PublishRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Validate definition + compile CTE SQL + create immutable version snapshot.
    This is the gate before any run.
    """
    result = await db.execute(select(Pipeline).where(Pipeline.id == uuid.UUID(pipeline_id)))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline không tồn tại")

    if pipeline.status == "archived":
        raise HTTPException(status_code=400, detail="Không thể publish pipeline đã archived")

    definition_json = req.definition_json

    # Step 1: Build DAG
    dag, _ = dag_service.build_and_validate(definition_json, schema_map=None)

    # Step 2: Fetch schema from Trino (if requested)
    schema_map = {}
    if req.validate_schema:
        schema_map = await _fetch_schema_map(dag, validate_schema=True)

    # Step 3: Validate
    errors = dag_service.validator.validate(dag, schema_map or None)
    if errors:
        return {
            "success": False,
            "errors": [
                {"code": e.code, "message": e.message, "node_id": e.node_id}
                for e in errors
            ],
        }

    # Step 4: Compile
    compiled_sql = dag_service.compile(dag)

    # Step 5: Build dag_json for storage
    dag_json = {
        "nodes": {
            nid: {"id": nid, "type": n.type, "label": n.label, "config": n.config}
            for nid, n in dag.nodes.items()
        },
        "edges": [
            {
                "source": e.source,
                "target": e.target,
                "source_handle": e.source_handle,
                "target_handle": e.target_handle,
            }
            for e in dag.edges
        ],
        "topo_order": dag.topo_order,
    }

    # Step 6: Create version
    new_version = pipeline.latest_version + 1
    version = PipelineVersion(
        pipeline_id=pipeline.id,
        version=new_version,
        definition_json=definition_json,
        dag_json=dag_json,
        compiled_sql=compiled_sql,
    )
    db.add(version)

    # Step 7: Update pipeline
    pipeline.latest_version = new_version
    pipeline.status = "active"
    pipeline.updated_at = datetime.now(timezone.utc)

    await db.flush()

    return {
        "success": True,
        "version": new_version,
        "compiled_sql": compiled_sql,
        "pipeline_id": pipeline_id,
    }


@router.get("/{pipeline_id}/versions")
async def list_versions(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """List all versions of a pipeline."""
    result = await db.execute(
        select(PipelineVersion)
        .where(PipelineVersion.pipeline_id == uuid.UUID(pipeline_id))
        .order_by(PipelineVersion.version.desc())
    )
    versions = result.scalars().all()
    return {
        "versions": [
            {
                "id": str(v.id),
                "version": v.version,
                "created_at": v.created_at.isoformat() if v.created_at else None,
                "has_sql": bool(v.compiled_sql),
            }
            for v in versions
        ]
    }


@router.get("/{pipeline_id}/versions/{version}/sql")
async def get_version_sql(pipeline_id: str, version: int, db: AsyncSession = Depends(get_db)):
    """Get compiled SQL for a specific version."""
    result = await db.execute(
        select(PipelineVersion)
        .where(
            PipelineVersion.pipeline_id == uuid.UUID(pipeline_id),
            PipelineVersion.version == version,
        )
    )
    ver = result.scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Version không tồn tại")
    return {"version": version, "compiled_sql": ver.compiled_sql, "dag_json": ver.dag_json}


# ─────────────────────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{pipeline_id}/run")
async def trigger_run(
    pipeline_id: str,
    version: int | None = Query(None, description="Version to run; defaults to latest"),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a pipeline run."""
    result = await db.execute(select(Pipeline).where(Pipeline.id == uuid.UUID(pipeline_id)))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline không tồn tại")

    if not pipeline.is_enabled:
        raise HTTPException(status_code=400, detail="Pipeline đang bị disabled. Hãy enable trước khi chạy.")

    if pipeline.latest_version == 0:
        raise HTTPException(status_code=400, detail="Pipeline chưa được publish. Hãy publish trước khi chạy.")

    run_version = version or pipeline.latest_version

    ver_result = await db.execute(
        select(PipelineVersion).where(
            PipelineVersion.pipeline_id == uuid.UUID(pipeline_id),
            PipelineVersion.version == run_version,
        )
    )
    pipeline_version = ver_result.scalar_one_or_none()
    if not pipeline_version or not pipeline_version.compiled_sql:
        raise HTTPException(status_code=400, detail=f"Version {run_version} không có compiled SQL")

    run = PipelineRun(
        pipeline_id=pipeline.id,
        version=run_version,
        status="pending",
        triggered_by="manual",
    )
    db.add(run)
    await db.flush()

    # Generate branch name and create Nessie branch 
    import re
    import time
    safe_name = re.sub(r'[^a-zA-Z0-9]+', '_', pipeline.name).strip('_').lower()
    branch_name = f"pipeline_{int(time.time())}_{safe_name}_run_{str(run.id).replace('-', '')[:8]}"
    try:
        await nessie_service.create_branch(branch_name, source_branch="main")
        run.branch_name = branch_name
        await db.flush()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tạo Nessie branch: {e}")

    # Trigger Dagster generic job
    dagster = DagsterService()
    dagster_run_id = None
    try:
        dagster_run_id = await dagster.trigger_pipeline_runner(
            pipeline_id=str(pipeline.id),
            run_id=str(run.id),
            version=run_version,
            pipeline_name=pipeline.name,
            branch_name=branch_name,
        )
        run.dagster_run_id = dagster_run_id
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
    except Exception as e:
        # Fallback: execute directly via Trino
        try:
            run.status = "running"
            run.started_at = datetime.now(timezone.utc)
            await db.flush()

            trino = TrinoService(branch=branch_name)
            query_id, rows = trino.execute_with_tracking(pipeline_version.compiled_sql)

            task = TaskRun(
                pipeline_run_id=run.id,
                node_id="compiled_cte",
                node_type="cte_query",
                node_label="CTE Pipeline Query",
                status="success",
                started_at=run.started_at,
                ended_at=datetime.now(timezone.utc),
                trino_query_id=query_id,
                rows_affected=rows,
                compiled_sql=pipeline_version.compiled_sql,
            )
            db.add(task)

            run.status = "success"
            run.ended_at = datetime.now(timezone.utc)
        except Exception as exec_err:
            run.status = "failed"
            run.ended_at = datetime.now(timezone.utc)
            run.error_message = str(exec_err)
            
            # Clean up branch manually on fallback fail
            try:
                await nessie_service.delete_branch(branch_name)
                try:
                    from app.services.trino_service import TrinoService
                    TrinoService().drop_catalog(f"ctlg_{branch_name.replace('-', '_')}")
                except Exception: pass
            except Exception as clean_err:
                import logging
                logging.getLogger("de.main").error(f"Cannot delete failed branch {branch_name}: {clean_err}")

    return {
        "message": f"Pipeline '{pipeline.name}' đang chạy",
        "run_id": str(run.id),
        "dagster_run_id": dagster_run_id,
        "status": run.status,
        "version": run_version,
    }


@router.get("/{pipeline_id}/runs")
async def list_runs(
    pipeline_id: str,
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List run history for a pipeline."""
    result = await db.execute(
        select(PipelineRun)
        .options(selectinload(PipelineRun.task_runs))
        .where(PipelineRun.pipeline_id == uuid.UUID(pipeline_id))
        .order_by(PipelineRun.created_at.desc())
        .limit(limit)
    )
    runs = result.scalars().all()
    return {"runs": [_run_to_dict(r, include_tasks=True) for r in runs]}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """Get run detail with task breakdown."""
    result = await db.execute(
        select(PipelineRun)
        .options(selectinload(PipelineRun.task_runs))
        .where(PipelineRun.id == uuid.UUID(run_id))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run không tồn tại")
    return _run_to_dict(run, include_tasks=True)


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """Cancel a running pipeline."""
    result = await db.execute(select(PipelineRun).options(selectinload(PipelineRun.task_runs)).where(PipelineRun.id == uuid.UUID(run_id)))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run không tồn tại")
    if run.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail=f"Không thể cancel run ở trạng thái '{run.status}'")

    trino = TrinoService()
    for task in run.task_runs:
        if task.trino_query_id:
            trino.cancel_query(task.trino_query_id)
            task.status = "failed"

    run.status = "cancelled"
    run.ended_at = datetime.now(timezone.utc)
    return {"message": "Run đã được cancel", "run_id": run_id}


# ─────────────────────────────────────────────────────────────────────────────
# Schedule
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{pipeline_id}/schedule")
async def set_schedule(
    pipeline_id: str,
    req: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
):
    """Set or replace schedule for a pipeline. Supports cron (scheduled) and one-time (onetime) modes."""
    result = await db.execute(select(Pipeline).where(Pipeline.id == uuid.UUID(pipeline_id)))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline không tồn tại")

    # Validate inputs
    if req.run_type == "scheduled":
        if not req.cron_expr or not req.cron_expr.strip():
            raise HTTPException(status_code=400, detail="cron_expr bắt buộc cho run_type='scheduled'")
    elif req.run_type == "onetime":
        if not req.run_at:
            raise HTTPException(status_code=400, detail="run_at bắt buộc cho run_type='onetime'")
    else:
        raise HTTPException(status_code=400, detail="run_type phải là 'scheduled' hoặc 'onetime'")

    # Parse run_at if onetime
    run_at_dt = None
    if req.run_at:
        try:
            run_at_dt = datetime.fromisoformat(req.run_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"run_at không đúng định dạng ISO datetime: {req.run_at}")

    # Upsert schedule
    existing = await db.execute(
        select(PipelineSchedule).where(PipelineSchedule.pipeline_id == uuid.UUID(pipeline_id))
    )
    schedule = existing.scalar_one_or_none()
    if schedule:
        schedule.run_type = req.run_type
        schedule.cron_expr = req.cron_expr if req.run_type == "scheduled" else None
        schedule.run_at = run_at_dt if req.run_type == "onetime" else None
        schedule.timezone = req.timezone
        schedule.enabled = req.enabled
    else:
        schedule = PipelineSchedule(
            pipeline_id=pipeline.id,
            run_type=req.run_type,
            cron_expr=req.cron_expr if req.run_type == "scheduled" else None,
            run_at=run_at_dt if req.run_type == "onetime" else None,
            timezone=req.timezone,
            enabled=req.enabled,
        )
        db.add(schedule)

    await db.flush()
    return {
        "message": "Schedule đã được cập nhật",
        "schedule": {
            "id": str(schedule.id),
            "pipeline_id": pipeline_id,
            "run_type": schedule.run_type,
            "cron_expr": schedule.cron_expr,
            "run_at": schedule.run_at.isoformat() if schedule.run_at else None,
            "timezone": schedule.timezone,
            "enabled": schedule.enabled,
        },
    }


@router.get("/{pipeline_id}/schedule")
async def get_schedule(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """Get schedule for a pipeline."""
    result = await db.execute(
        select(PipelineSchedule).where(PipelineSchedule.pipeline_id == uuid.UUID(pipeline_id))
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return {"schedule": None}
    return {
        "schedule": {
            "id": str(schedule.id),
            "pipeline_id": pipeline_id,
            "run_type": schedule.run_type,
            "cron_expr": schedule.cron_expr,
            "run_at": schedule.run_at.isoformat() if schedule.run_at else None,
            "timezone": schedule.timezone,
            "enabled": schedule.enabled,
            "last_triggered_at": schedule.last_triggered_at.isoformat() if schedule.last_triggered_at else None,
        }
    }


@router.delete("/{pipeline_id}/schedule")
async def delete_schedule(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """Remove schedule from a pipeline."""
    result = await db.execute(
        select(PipelineSchedule).where(PipelineSchedule.pipeline_id == uuid.UUID(pipeline_id))
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Pipeline chưa có schedule")
    await db.delete(schedule)
    return {"message": "Schedule đã được xóa"}


# ─────────────────────────────────────────────────────────────────────────────
# Internal — called by Dagster runner to report status
# ─────────────────────────────────────────────────────────────────────────────

class RunStatusUpdate(BaseModel):
    status: str
    dagster_run_id: str | None = None
    error_message: str | None = None


class TaskRunCreate(BaseModel):
    node_id: str
    node_type: str | None = None
    node_label: str | None = None
    status: str = "success"
    trino_query_id: str | None = None
    rows_affected: int | None = None
    compiled_sql: str | None = None
    error_message: str | None = None


@router.put("/runs/{run_id}/status")
async def update_run_status(
    run_id: str,
    req: RunStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Internal — Dagster calls this to update run status."""
    result = await db.execute(select(PipelineRun).where(PipelineRun.id == uuid.UUID(run_id)))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run không tồn tại")

    run.status = req.status
    if req.dagster_run_id:
        run.dagster_run_id = req.dagster_run_id
    if req.error_message:
        run.error_message = req.error_message
    if req.status in ("success", "failed", "cancelled"):
        run.ended_at = datetime.now(timezone.utc)
        
        # If failed/cancelled, clean up the branch immediately
        if req.status in ("failed", "cancelled") and run.branch_name:
            try:
                await nessie_service.delete_branch(run.branch_name)
                try:
                    from app.services.trino_service import TrinoService
                    TrinoService().drop_catalog(f"ctlg_{run.branch_name.replace('-', '_')}")
                except Exception: pass
            except Exception as e:
                import logging
                logging.getLogger("de.main").error(f"Cannot delete failed branch {run.branch_name}: {e}")
                
    if req.status == "running" and not run.started_at:
        run.started_at = datetime.now(timezone.utc)

    return {"ok": True}


@router.post("/runs/{run_id}/tasks")
async def create_task_run(
    run_id: str,
    req: TaskRunCreate,
    db: AsyncSession = Depends(get_db),
):
    """Internal — Dagster calls this to record task execution."""
    now = datetime.now(timezone.utc)
    task = TaskRun(
        pipeline_run_id=uuid.UUID(run_id),
        node_id=req.node_id,
        node_type=req.node_type,
        node_label=req.node_label,
        status=req.status,
        started_at=now,
        ended_at=now,
        trino_query_id=req.trino_query_id,
        rows_affected=req.rows_affected,
        compiled_sql=req.compiled_sql,
        error_message=req.error_message,
    )
    db.add(task)
    await db.flush()
    return {"task_run_id": str(task.id)}
