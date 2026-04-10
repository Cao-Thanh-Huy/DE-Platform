"""
Router: Data Models — Full CRUD Iceberg tables qua Trino.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.services.trino_service import TrinoService

router = APIRouter()


# ── Request Models ────────────────────────────────────────────

class CreateSchemaRequest(BaseModel):
    schema_name: str
    location: Optional[str] = None  # override default s3a://warehouse/<schema>/


class CreateTableRequest(BaseModel):
    schema_name: str = "bronze"
    table_name: str
    columns: list[dict]   # [{name, type, nullable?, comment?}]
    partition_by: Optional[list[str]] = None
    sort_by: Optional[list[str]] = None
    file_format: str = "PARQUET"
    comment: Optional[str] = None
    properties: Optional[dict] = None   # extra WITH(...) properties


class AlterTableRequest(BaseModel):
    add_columns: Optional[list[dict]] = None      # [{name, type, comment?}]
    drop_columns: Optional[list[str]] = None
    rename_column: Optional[dict] = None           # {from: "old", to: "new"}


class InsertDataRequest(BaseModel):
    rows: list[dict]


class RenameTableRequest(BaseModel):
    new_name: str


# ── Schema Endpoints ─────────────────────────────────────────

@router.get("/schemas")
async def list_schemas(branch: str = Query("main", description="Nessie branch")):
    """Liệt kê tất cả schemas trong catalog iceberg."""
    svc = TrinoService(branch=branch)
    try:
        rows = svc.execute("SHOW SCHEMAS FROM iceberg")
        # Lọc bỏ system schemas của Trino
        exclude = {"information_schema", "system"}
        return {"schemas": [r[0] for r in rows if r[0] not in exclude]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.post("/schemas", status_code=201)
async def create_schema(req: CreateSchemaRequest, branch: str = Query("main", description="Nessie branch")):
    """Tạo schema mới trong catalog iceberg."""
    svc = TrinoService(branch=branch)
    try:
        location = req.location or f"s3a://warehouse/{req.schema_name}/"
        sql = (
            f"CREATE SCHEMA IF NOT EXISTS iceberg.{req.schema_name} "
            f"WITH (location = '{location}')"
        )
        svc.execute(sql)
        return {
            "message": f"Schema '{req.schema_name}' đã được tạo",
            "location": location,
            "sql": sql,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.delete("/schemas/{schema_name}")
async def drop_schema(schema_name: str, branch: str = Query("main", description="Nessie branch")):
    """Xóa schema (phải empty)."""
    svc = TrinoService(branch=branch)
    try:
        svc.execute(f"DROP SCHEMA IF EXISTS iceberg.{schema_name}")
        return {"message": f"Schema '{schema_name}' đã được xóa"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


# ── Table List / CRUD ─────────────────────────────────────────

@router.get("/tables/{schema_name}")
async def list_tables(schema_name: str, branch: str = Query("main", description="Nessie branch")):
    """Liệt kê tất cả tables trong schema."""
    svc = TrinoService(branch=branch)
    try:
        rows = svc.execute(f"SHOW TABLES FROM iceberg.{schema_name}")
        return {"schema": schema_name, "tables": [r[0] for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.post("/tables", status_code=201)
async def create_table(req: CreateTableRequest, branch: str = Query("main", description="Nessie branch")):
    """Tạo Iceberg table mới với đầy đủ options."""
    # Build columns SQL
    col_parts = []
    for c in req.columns:
        col_def = f'{c["name"]} {c["type"]}'
        if c.get("comment"):
            col_def += f' COMMENT \'{c["comment"]}\''
        col_parts.append(col_def)
    cols_sql = ",\n  ".join(col_parts)

    sql = f"CREATE TABLE IF NOT EXISTS iceberg.{req.schema_name}.{req.table_name} (\n  {cols_sql}\n)"

    if req.comment:
        sql += f"\nCOMMENT '{req.comment}'"

    # WITH clause
    with_props = [f"format = '{req.file_format}'"]
    if req.partition_by:
        parts = ", ".join([f"'{p}'" for p in req.partition_by])
        with_props.append(f"partitioning = ARRAY[{parts}]")
    if req.sort_by:
        sorts = ", ".join([f"'{s}'" for s in req.sort_by])
        with_props.append(f"sorted_by = ARRAY[{sorts}]")
    if req.properties:
        for k, v in req.properties.items():
            with_props.append(f"'{k}' = '{v}'")

    sql += f"\nWITH (\n  {','.join(with_props)}\n)"

    svc = TrinoService(branch=branch)
    try:
        svc.execute(sql)
        return {
            "message": f"Bảng {req.schema_name}.{req.table_name} đã được tạo",
            "sql": sql,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.delete("/tables/{schema_name}/{table_name}")
async def drop_table(schema_name: str, table_name: str, branch: str = Query("main", description="Nessie branch")):
    """Xóa Iceberg table."""
    svc = TrinoService(branch=branch)
    try:
        svc.execute(f"DROP TABLE IF EXISTS iceberg.{schema_name}.{table_name}")
        return {"message": f"Bảng {schema_name}.{table_name} đã được xóa"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.post("/tables/{schema_name}/{table_name}/rename")
async def rename_table(schema_name: str, table_name: str, req: RenameTableRequest, branch: str = Query("main", description="Nessie branch")):
    """Đổi tên bảng."""
    svc = TrinoService(branch=branch)
    try:
        sql = (
            f"ALTER TABLE iceberg.{schema_name}.{table_name} "
            f"RENAME TO iceberg.{schema_name}.{req.new_name}"
        )
        svc.execute(sql)
        return {
            "message": f"Đổi tên thành công: {table_name} → {req.new_name}",
            "sql": sql,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


# ── Table Detail ──────────────────────────────────────────────

@router.get("/tables/{schema_name}/{table_name}/columns")
async def describe_table(schema_name: str, table_name: str, branch: str = Query("main", description="Nessie branch")):
    """Mô tả cấu trúc (columns) của table."""
    svc = TrinoService(branch=branch)
    try:
        rows = svc.execute(f"DESCRIBE iceberg.{schema_name}.{table_name}")
        columns = [
            {"name": r[0], "type": r[1], "extra": r[2], "comment": r[3]}
            for r in rows
        ]
        return {"schema": schema_name, "table": table_name, "columns": columns}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.get("/tables/{schema_name}/{table_name}/properties")
async def get_table_properties(schema_name: str, table_name: str, branch: str = Query("main", description="Nessie branch")):
    """Lấy table properties và generated DDL."""
    svc = TrinoService(branch=branch)
    try:
        # SHOW CREATE TABLE
        ddl_rows = svc.execute(
            f"SHOW CREATE TABLE iceberg.{schema_name}.{table_name}"
        )
        ddl = ddl_rows[0][0] if ddl_rows else ""

        # Table properties từ $properties metadata table
        props = {}
        try:
            prop_rows = svc.execute(
                f'SELECT key, value FROM "iceberg"."{schema_name}".'
                f'"{table_name}$properties"'
            )
            props = {r[0]: r[1] for r in prop_rows}
        except Exception:
            pass  # Metadata table có thể không available

        # Files metadata
        file_stats = {"file_count": 0, "total_size_bytes": 0}
        try:
            file_rows = svc.execute(
                f'SELECT COUNT(*), SUM(file_size_in_bytes) '
                f'FROM "iceberg"."{schema_name}"."{table_name}$files"'
            )
            if file_rows and file_rows[0][0] is not None:
                file_stats = {
                    "file_count": file_rows[0][0],
                    "total_size_bytes": file_rows[0][1] or 0,
                }
        except Exception:
            pass

        return {
            "schema": schema_name,
            "table": table_name,
            "ddl": ddl,
            "properties": props,
            "file_stats": file_stats,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.get("/tables/{schema_name}/{table_name}/stats")
async def get_table_stats(schema_name: str, table_name: str, branch: str = Query("main", description="Nessie branch")):
    """Row count + file stats của table."""
    svc = TrinoService(branch=branch)
    try:
        # Row count
        row_count = 0
        try:
            cnt = svc.execute(
                f"SELECT COUNT(*) FROM iceberg.{schema_name}.{table_name}"
            )
            row_count = cnt[0][0] if cnt else 0
        except Exception:
            pass

        # File stats
        file_count = 0
        total_size = 0
        try:
            frows = svc.execute(
                f'SELECT COUNT(*), SUM(file_size_in_bytes) '
                f'FROM "iceberg"."{schema_name}"."{table_name}$files"'
            )
            if frows and frows[0][0] is not None:
                file_count = frows[0][0]
                total_size = frows[0][1] or 0
        except Exception:
            pass

        # Snapshot count
        snapshot_count = 0
        try:
            srows = svc.execute(
                f'SELECT COUNT(*) FROM "iceberg"."{schema_name}".'
                f'"{table_name}$snapshots"'
            )
            snapshot_count = srows[0][0] if srows else 0
        except Exception:
            pass

        return {
            "schema": schema_name,
            "table": table_name,
            "row_count": row_count,
            "file_count": file_count,
            "total_size_bytes": total_size,
            "snapshot_count": snapshot_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.get("/tables/{schema_name}/{table_name}/preview")
async def preview_table(
    schema_name: str,
    table_name: str,
    limit: int = Query(default=50, le=200),
    snapshot_id: Optional[str] = Query(default=None),
    branch: str = Query("main", description="Nessie branch"),
):
    """Preview data (top N rows). Hỗ trợ time travel qua snapshot_id."""
    svc = TrinoService(branch=branch)
    try:
        if snapshot_id:
            sql = (
                f"SELECT * FROM iceberg.{schema_name}.{table_name} "
                f"FOR VERSION AS OF {snapshot_id} LIMIT {limit}"
            )
        else:
            sql = f"SELECT * FROM iceberg.{schema_name}.{table_name} LIMIT {limit}"

        rows = svc.execute(sql)

        # Lấy column names
        col_rows = svc.execute(f"DESCRIBE iceberg.{schema_name}.{table_name}")
        col_names = [r[0] for r in col_rows]
        column_details = [{"name": r[0], "type": str(r[1]).upper()} for r in col_rows]

        # Convert rows to list of dicts
        data = [dict(zip(col_names, row)) for row in rows]

        return {
            "schema": schema_name,
            "table": table_name,
            "columns": col_names,
            "column_details": column_details,
            "rows": data,
            "count": len(data),
            "snapshot_id": str(snapshot_id) if snapshot_id else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.get("/tables/{schema_name}/{table_name}/snapshots")
async def list_snapshots(schema_name: str, table_name: str, branch: str = Query("main", description="Nessie branch")):
    """Liệt kê Iceberg snapshots của table."""
    svc = TrinoService(branch=branch)
    try:
        rows = svc.execute(
            f'SELECT snapshot_id, committed_at, operation, summary '
            f'FROM "iceberg"."{schema_name}"."{table_name}$snapshots" '
            f'ORDER BY committed_at DESC LIMIT 50'
        )
        snapshots = [
            {
                "snapshot_id": str(r[0]),
                "committed_at": str(r[1]),
                "operation": r[2],
                "summary": r[3],
            }
            for r in rows
        ]
        curr_snap = None
        try:
            # Lấy snapshot hiện tại qua properties
            curr_rows = svc.execute(f'SELECT value FROM "iceberg"."{schema_name}"."{table_name}$properties" WHERE key = \'current-snapshot-id\'')
            if curr_rows:
                curr_snap = str(curr_rows[0][0])
        except Exception:
            pass

        return {"snapshots": snapshots, "current_snapshot_id": curr_snap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


# ── Alter Table ───────────────────────────────────────────────

@router.post("/tables/{schema_name}/{table_name}/alter")
async def alter_table(schema_name: str, table_name: str, req: AlterTableRequest, branch: str = Query("main", description="Nessie branch")):
    """Alter table: add column, drop column, hoặc rename column."""
    svc = TrinoService(branch=branch)
    executed = []
    try:
        base = f"ALTER TABLE iceberg.{schema_name}.{table_name}"

        if req.add_columns:
            for col in req.add_columns:
                col_def = f'{col["name"]} {col["type"]}'
                if col.get("comment"):
                    col_def += f' COMMENT \'{col["comment"]}\''
                sql = f"{base} ADD COLUMN {col_def}"
                svc.execute(sql)
                executed.append(sql)

        if req.drop_columns:
            for col_name in req.drop_columns:
                sql = f"{base} DROP COLUMN {col_name}"
                svc.execute(sql)
                executed.append(sql)

        if req.rename_column:
            old = req.rename_column["from"]
            new = req.rename_column["to"]
            sql = f"{base} RENAME COLUMN {old} TO {new}"
            svc.execute(sql)
            executed.append(sql)

        return {
            "message": f"Alter table {schema_name}.{table_name} thành công",
            "executed_sql": executed,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.post("/tables/{schema_name}/{table_name}/insert")
async def insert_data(schema_name: str, table_name: str, req: InsertDataRequest, branch: str = Query("main", description="Nessie branch")):
    """Insert n rows data mới vào table thông qua Parameterized Query."""
    svc = TrinoService(branch=branch)
    try:
        if not req.rows:
            return {"message": "No data to insert"}
        
        cols = ", ".join(f'"{k}"' for k in req.rows[0].keys())
        
        all_vals = []
        row_qmarks = []
        for r in req.rows:
            row_qmarks.append("(" + ", ".join(["?"] * len(r)) + ")")
            all_vals.extend(r.values())
            
        qmarks_sql = ", ".join(row_qmarks)
        sql = f"INSERT INTO iceberg.{schema_name}.{table_name} ({cols}) VALUES {qmarks_sql}"
        
        svc.execute(sql, all_vals)
        return {
            "message": f"Insert thành công {len(req.rows)} dòng vào {schema_name}.{table_name}",
            "sql": sql,
            "values": all_vals
        }
    except Exception as e:
        print("ERROR INSERT DATA:", str(e))
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


class RollbackRequest(BaseModel):
    snapshot_id: str

@router.post("/tables/{schema_name}/{table_name}/rollback")
async def rollback_table(schema_name: str, table_name: str, req: RollbackRequest, branch: str = Query("main", description="Nessie branch")):
    """Rollback bảng về một snapshot id cụ thể."""
    svc = TrinoService(branch=branch)
    try:
        sql = f"CALL iceberg.system.rollback_to_snapshot('{schema_name}', '{table_name}', {req.snapshot_id})"
        svc.execute(sql)
        return {"message": f"Rollback bảng {table_name} về snapshot {req.snapshot_id} thành công"}
    except Exception as e:
        logger.error(f"ERROR ROLLBACK: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── Maintenance ───────────────────────────────────────────────

class OptimizeRequest(BaseModel):
    branch: str = "main"

class VacuumRequest(BaseModel):
    branch: str = "main"
    retention_threshold: str = "7d"
    retain_last: int = 1

@router.post("/tables/{schema_name}/{table_name}/optimize")
async def optimize_table(schema_name: str, table_name: str, req: OptimizeRequest):
    """Thực hiện Compaction (gom cụm file) cho Bảng Iceberg."""
    svc = TrinoService(branch=req.branch)
    try:
        svc.execute(f'ALTER TABLE "iceberg"."{schema_name}"."{table_name}" EXECUTE OPTIMIZE')
        return {"status": "success", "message": "Gom cụm và tối ưu hóa file thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()

@router.post("/tables/{schema_name}/{table_name}/vacuum")
async def vacuum_table(schema_name: str, table_name: str, req: VacuumRequest):
    """Thực hiện Expire Snapshots dọn dẹp lịch sử cho Bảng Iceberg."""
    svc = TrinoService(branch=req.branch)
    try:
        query = f'ALTER TABLE "iceberg"."{schema_name}"."{table_name}" EXECUTE expire_snapshots(retention_threshold => \'{req.retention_threshold}\', retain_last => {req.retain_last})'
        svc.execute(query)
        return {"status": "success", "message": "Dọn dẹp snapshot cũ thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()
