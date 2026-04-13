"""
Maintenance Router — Catalog Health, Compaction & Vacuum Center

Fixes:
  - $files/$snapshots metadata tables: use "schema"."table$files" format (Python-safe)
  - OPTIMIZE: use file_size_threshold => '128MB' (string, not PARSE_DURATION)
  - expire_snapshots: set session property iceberg.expire_snapshots_min_retention = '0s'
  - remove_orphan_files: set session property iceberg.remove_orphan_files_min_retention = '0s'
"""
import json
import asyncio
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Query, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.trino_service import TrinoService

router = APIRouter()


def _trino() -> TrinoService:
    """Standard Trino service for maintenance ops."""
    return TrinoService()


def _get_all_tables(branch: str) -> list[dict]:
    """List all user schemas + tables from iceberg catalog."""
    svc = TrinoService(branch=branch)
    try:
        schemas = svc.execute("SHOW SCHEMAS FROM iceberg")
        exclude = {"information_schema", "system"}
        result = []
        for (schema,) in schemas:
            if schema in exclude:
                continue
            try:
                tables = svc.execute(f'SHOW TABLES FROM iceberg."{schema}"')
                for (table,) in tables:
                    result.append({"schema": schema, "table": table})
            except Exception:
                pass
        return result
    finally:
        svc.close()


def _safe_meta_query(svc: TrinoService, sql: str, default=0):
    """Execute a metadata query, returning default on any error."""
    try:
        rows = svc.execute(sql)
        if rows and rows[0][0] is not None:
            return rows[0][0]
        return default
    except Exception:
        return default


def _scan_table(branch: str, schema: str, table: str) -> dict:
    """Scan health for one table: snapshot count + file stats (no destructive ops)."""
    # Use "schema"."table$suffix" format — both schema and table must be quoted
    files_ref     = f'"iceberg"."{schema}"."{table}$files"'
    snapshots_ref = f'"iceberg"."{schema}"."{table}$snapshots"'

    svc = TrinoService(branch=branch)
    try:
        info = {
            "schema": schema,
            "table": table,
            "status": "ok",
            "error": None,
            "snapshot_count": 0,
            "orphan_files": 0,
            "active_files": 0,
            "size_bytes": 0,
        }

        info["snapshot_count"] = _safe_meta_query(svc, f'SELECT count(*) FROM {snapshots_ref}')
        info["active_files"]   = _safe_meta_query(svc, f'SELECT count(*) FROM {files_ref}')
        info["size_bytes"]     = _safe_meta_query(svc, f'SELECT sum(file_size_in_bytes) FROM {files_ref}')

        return info
    except Exception as e:
        return {**info, "status": "error", "error": str(e)}
    finally:
        svc.close()


async def _sse_generator(branch: str) -> AsyncGenerator[str, None]:
    """Async SSE generator: stream per-table health scan results."""
    try:
        tables = await asyncio.to_thread(_get_all_tables, branch)
        total = len(tables)
        yield f"data: {json.dumps({'type': 'meta', 'total': total, 'branch': branch})}\n\n"

        summary = {
            "total_tables": total,
            "total_orphan_files": 0,
            "total_snapshots": 0,
            "total_size_bytes": 0,
        }

        for i, t in enumerate(tables):
            result = await asyncio.to_thread(_scan_table, branch, t["schema"], t["table"])
            result.update({"type": "table", "index": i + 1})
            summary["total_orphan_files"] += result.get("orphan_files", 0)
            summary["total_snapshots"]    += result.get("snapshot_count", 0)
            summary["total_size_bytes"]   += result.get("size_bytes", 0)
            yield f"data: {json.dumps(result)}\n\n"
            await asyncio.sleep(0)

        summary["type"] = "done"
        yield f"data: {json.dumps(summary)}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


@router.get("/catalog-health/scan")
async def scan_catalog_health(branch: str = Query("main")):
    """SSE endpoint: stream per-table health scan results."""
    return StreamingResponse(
        _sse_generator(branch),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Maintenance Operations ────────────────────────────────────────────────────

JOBS: dict[str, dict] = {}

@router.get("/jobs")
async def get_all_jobs():
    """Return all jobs (running, success, error) to maintain UI history across F5."""
    return {"jobs": JOBS}

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOBS[job_id]

class MaintenanceRequest(BaseModel):
    branch: str = "main"
    schema_name: str
    table_name: str
    # Compaction
    target_file_size_mb: int = 128
    # Vacuum / expire snapshots
    retention_hours: int = 0   # 0 = expire all but retain_last
    retain_last: int = 1


def _run_optimize(schema: str, table: str, target_mb: int) -> dict:
    """
    Run OPTIMIZE (compaction) on a table.
    Correct syntax: file_size_threshold => '128MB'  (NOT PARSE_DURATION)
    """
    svc = _trino()
    try:
        sql = (
            f'ALTER TABLE "iceberg"."{schema}"."{table}" '
            f"EXECUTE optimize(file_size_threshold => '{target_mb}MB')"
        )
        rows = svc.execute(sql)
        rewritten_bytes   = rows[0][0] if rows and rows[0][0] else 0
        rewritten_records = rows[0][1] if rows and len(rows[0]) > 1 and rows[0][1] else 0

        return {
            "operation": "optimize",
            "status": "success",
            "rewritten_bytes": rewritten_bytes,
            "rewritten_records": rewritten_records,
            "message": f"✅ Compaction done — {rewritten_bytes:,} bytes rewritten into ≤{target_mb}MB files",
        }
    except Exception as e:
        return {"operation": "optimize", "status": "error", "message": f"❌ Compaction failed: {e}"}
    finally:
        svc.close()


def _run_expire_snapshots(schema: str, table: str, retention_hours: int, retain_last: int) -> dict:
    """
    Expire old snapshots.
    Use retain_last parameter (no min_retention constraint) instead of retention_threshold.
    """
    svc = _trino()
    try:
        # Override Trino minimum 7d safeguard for this session
        svc.execute("SET SESSION iceberg.expire_snapshots_min_retention = '0s'")
        
        # Use retain_last — not subject to min_retention time constraint
        sql = (
            f'ALTER TABLE "iceberg"."{schema}"."{table}" '
            f"EXECUTE expire_snapshots(retention_threshold => '0s', retain_last => {retain_last})"
        )
        svc.execute(sql)
        return {
            "operation": "expire_snapshots",
            "status": "success",
            "message": f"✅ Expired snapshots (kept last {retain_last})",
        }
    except Exception as e:
        return {"operation": "expire_snapshots", "status": "error", "message": f"❌ Expire failed: {e}"}
    finally:
        svc.close()


def _run_remove_orphan_files(schema: str, table: str) -> dict:
    """Remove orphan data files not referenced by any snapshot."""
    svc = _trino()
    try:
        # Override Trino minimum 7d safeguard for this session
        svc.execute("SET SESSION iceberg.remove_orphan_files_min_retention = '0s'")
        
        # Use 0s retention for immediate testing and cleanup
        sql = (
            f'ALTER TABLE "iceberg"."{schema}"."{table}" '
            f"EXECUTE remove_orphan_files(retention_threshold => '0s')"
        )
        rows = svc.execute(sql)
        stats = {}
        if rows:
            for row in rows:
                if len(row) >= 2:
                    stats[row[0]] = row[1]
        deleted = stats.get("deleted_files_count", 0)
        return {
            "operation": "remove_orphan_files",
            "status": "success",
            "deleted_files": deleted,
            "message": f"✅ Removed {deleted} orphan file(s)",
        }
    except Exception as e:
        return {"operation": "remove_orphan_files", "status": "error", "message": f"❌ Remove orphan files failed: {e}"}
    finally:
        svc.close()


@router.post("/tables/compaction")
async def run_compaction(req: MaintenanceRequest):
    """Run OPTIMIZE (file compaction) on one Iceberg table."""
    result = await asyncio.to_thread(
        _run_optimize, req.schema_name, req.table_name, req.target_file_size_mb
    )

    # File stats after compaction
    try:
        svc = TrinoService()
        files_ref = f'"iceberg"."{req.schema_name}"."{req.table_name}$files"'
        rows = svc.execute(f'SELECT count(*), sum(file_size_in_bytes) FROM {files_ref}')
        svc.close()
        result["files_after"] = rows[0][0] if rows else 0
        result["size_after"]  = rows[0][1] if rows and rows[0][1] else 0
    except Exception:
        pass

    return result


@router.post("/tables/vacuum")
async def run_vacuum(req: MaintenanceRequest):
    """Run expire_snapshots + remove_orphan_files (full vacuum) on one table."""
    expire_result  = await asyncio.to_thread(
        _run_expire_snapshots, req.schema_name, req.table_name,
        req.retention_hours, req.retain_last
    )
    orphan_result  = await asyncio.to_thread(
        _run_remove_orphan_files, req.schema_name, req.table_name
    )

    messages = [expire_result["message"], orphan_result["message"]]
    overall  = "success" if all(r["status"] == "success" for r in [expire_result, orphan_result]) else "partial"

    return {
        "status": overall,
        "messages": messages,
        "details": [expire_result, orphan_result],
    }


async def _bg_run_vacuum(job_id: str, req: MaintenanceRequest):
    JOBS[job_id] = {
        "status": "running", 
        "progress": "Đang xử lý dọn dẹp...",
        "type": "table_cleanup",
        "schema": req.schema_name,
        "table": req.table_name
    }
    try:
        result = await run_vacuum(req)
        JOBS[job_id] = {"status": result["status"], "messages": result["messages"], "details": result.get("details", [])}
    except Exception as e:
        JOBS[job_id] = {"status": "error", "error": str(e), "messages": [f"Lỗi: {e}"]}

@router.post("/tables/cleanup")
async def cleanup_table(req: MaintenanceRequest, background_tasks: BackgroundTasks):
    """Trigger vacuum in background."""
    job_id = str(uuid.uuid4())
    background_tasks.add_task(_bg_run_vacuum, job_id, req)
    return {"status": "processing", "job_id": job_id}


class CleanupAllRequest(BaseModel):
    branch: str = "main"
    retention_hours: int = 0
    retain_last: int = 1


async def _bg_cleanup_all(job_id: str, req: CleanupAllRequest):
    JOBS[job_id] = {
        "status": "running",
        "progress": "Đang nạp danh sách bảng...",
        "type": "catalog_cleanup"
    }
    try:
        tables = await asyncio.to_thread(_get_all_tables, req.branch)
        results = []
        for i, t in enumerate(tables):
            JOBS[job_id]["progress"] = f"Đang dọn dẹp {t['schema']}.{t['table']} ({i+1}/{len(tables)})"
            maint_req = MaintenanceRequest(
                branch=req.branch,
                schema_name=t["schema"],
                table_name=t["table"],
                retention_hours=req.retention_hours,
                retain_last=req.retain_last,
            )
            result = await run_vacuum(maint_req)
            result["schema"] = t["schema"]
            result["table"]  = t["table"]
            results.append(result)
        JOBS[job_id] = {"status": "success", "results": results}
    except Exception as e:
        JOBS[job_id] = {"status": "error", "error": str(e)}

@router.post("/catalog/cleanup-all")
async def cleanup_all_tables(req: CleanupAllRequest, background_tasks: BackgroundTasks):
    """Trigger vacuum on every table in the catalog in background."""
    job_id = str(uuid.uuid4())
    background_tasks.add_task(_bg_cleanup_all, job_id, req)
    return {"status": "processing", "job_id": job_id}
