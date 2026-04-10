"""
Maintenance Router — Catalog Health & Cleanup Center
Cung cấp SSE streaming để scan orphan files, snapshots trên toàn catalog.
"""
import json
import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.trino_service import TrinoService

router = APIRouter()


def _get_all_tables(branch: str) -> list[dict]:
    """Lấy toàn bộ danh sách schema + table từ iceberg catalog."""
    svc = TrinoService(branch=branch)
    try:
        schemas = svc.execute("SHOW SCHEMAS FROM iceberg")
        exclude = {"information_schema", "system"}
        result = []
        for (schema,) in schemas:
            if schema in exclude:
                continue
            try:
                tables = svc.execute(f'SHOW TABLES FROM "iceberg"."{schema}"')
                for (table,) in tables:
                    result.append({"schema": schema, "table": table})
            except Exception:
                pass
        return result
    finally:
        svc.close()


def _scan_table(branch: str, schema: str, table: str) -> dict:
    """Scan health cho 1 table: orphan files + snapshot count + size."""
    svc = TrinoService(branch=branch)
    try:
        info = {"schema": schema, "table": table, "status": "ok", "error": None}

        # Snapshot count
        try:
            snap_rows = svc.execute(
                f'SELECT count(*) FROM "iceberg"."{schema}"."{table}$snapshots"'
            )
            info["snapshot_count"] = snap_rows[0][0] if snap_rows else 0
        except Exception:
            info["snapshot_count"] = 0

        # Orphan files scan (remove_orphan_files trả về stats)
        try:
            orphan_rows = svc.execute(
                f'ALTER TABLE "iceberg"."{schema}"."{table}" '
                f"EXECUTE remove_orphan_files(retention_threshold => '7d')"
            )
            # rows: [['stat_key', value], ...]
            stats = {r[0]: r[1] for r in orphan_rows}
            info["orphan_files"] = stats.get("deleted_files_count", 0)
            info["active_files"] = stats.get("active_files_count", 0)
            info["scanned_files"] = stats.get("scanned_files_count", 0)
        except Exception as e:
            info["orphan_files"] = 0
            info["active_files"] = 0
            info["scanned_files"] = 0
            info["orphan_error"] = str(e)

        # Table size (từ $files metadata)
        try:
            size_rows = svc.execute(
                f'SELECT sum(file_size_in_bytes) FROM "iceberg"."{schema}"."{table}$files"'
            )
            info["size_bytes"] = size_rows[0][0] if size_rows and size_rows[0][0] else 0
        except Exception:
            info["size_bytes"] = 0

        return info
    finally:
        svc.close()


async def _sse_generator(branch: str) -> AsyncGenerator[str, None]:
    """Async generator stream từng table kết quả scan qua SSE."""
    try:
        tables = await asyncio.to_thread(_get_all_tables, branch)
        total = len(tables)

        # Gửi meta message trước
        yield f"data: {json.dumps({'type': 'meta', 'total': total, 'branch': branch})}\n\n"

        summary = {"total_tables": total, "total_orphan_files": 0, "total_snapshots": 0, "total_size_bytes": 0}

        for i, t in enumerate(tables):
            result = await asyncio.to_thread(_scan_table, branch, t["schema"], t["table"])
            result["type"] = "table"
            result["index"] = i + 1

            summary["total_orphan_files"] += result.get("orphan_files", 0)
            summary["total_snapshots"] += result.get("snapshot_count", 0)
            summary["total_size_bytes"] += result.get("size_bytes", 0)

            yield f"data: {json.dumps(result)}\n\n"
            await asyncio.sleep(0)  # yield control

        # Gửi summary cuối cùng
        summary["type"] = "done"
        yield f"data: {json.dumps(summary)}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


@router.get("/catalog-health/scan")
async def scan_catalog_health(branch: str = Query("main")):
    """
    SSE Endpoint: Stream kết quả scan health từng table trong catalog.
    Client dùng EventSource API để nhận từng kết quả dần dần.
    """
    return StreamingResponse(
        _sse_generator(branch),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


class CleanupTableRequest(BaseModel):
    branch: str = "main"
    schema_name: str
    table_name: str
    retention_threshold: str = "7d"
    retain_last: int = 1


@router.post("/tables/cleanup")
async def cleanup_table(req: CleanupTableRequest):
    """Dọn dẹp 1 table: expire snapshots + remove orphan files."""
    svc = TrinoService(branch=req.branch)
    msgs = []
    try:
        # 1. Expire snapshots
        try:
            svc.execute(
                f'ALTER TABLE "iceberg"."{req.schema_name}"."{req.table_name}" '
                f"EXECUTE expire_snapshots(retention_threshold => '{req.retention_threshold}', retain_last => {req.retain_last})"
            )
            msgs.append("✅ Expire snapshots thành công")
        except Exception as e:
            msgs.append(f"⚠️ Expire snapshots lỗi: {e}")

        # 2. Remove orphan files
        try:
            rows = svc.execute(
                f'ALTER TABLE "iceberg"."{req.schema_name}"."{req.table_name}" '
                f"EXECUTE remove_orphan_files(retention_threshold => '{req.retention_threshold}')"
            )
            stats = {r[0]: r[1] for r in rows}
            deleted = stats.get("deleted_files_count", 0)
            msgs.append(f"✅ Xóa {deleted} orphan file(s) thành công")
        except Exception as e:
            msgs.append(f"⚠️ Remove orphan files lỗi: {e}")

        return {"status": "success", "messages": msgs}
    finally:
        svc.close()


class CleanupAllRequest(BaseModel):
    branch: str = "main"
    retention_threshold: str = "7d"
    retain_last: int = 1


@router.post("/catalog/cleanup-all")
async def cleanup_all_tables(req: CleanupAllRequest):
    """Dọn dẹp toàn bộ catalog: expire + orphan files cho từng table."""
    tables = await asyncio.to_thread(_get_all_tables, req.branch)
    results = []
    for t in tables:
        r = CleanupTableRequest(
            branch=req.branch,
            schema_name=t["schema"],
            table_name=t["table"],
            retention_threshold=req.retention_threshold,
            retain_last=req.retain_last,
        )
        result = await cleanup_table(r)
        result["schema"] = t["schema"]
        result["table"] = t["table"]
        results.append(result)
    return {"status": "success", "results": results}
