"""
Router: Query Engine — Chạy SQL queries trên Trino.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.trino_service import TrinoService

router = APIRouter()


class QueryRequest(BaseModel):
    sql: str
    catalog: str = "iceberg"
    schema_name: str = "bronze"
    limit: int | None = 1000


@router.post("/execute")
async def execute_query(req: QueryRequest):
    """Thực thi SQL query trên Trino và trả về kết quả."""
    svc = TrinoService(catalog=req.catalog, schema=req.schema_name)
    try:
        sql = req.sql.strip().rstrip(";")
        if req.limit and "LIMIT" not in sql.upper():
            sql += f" LIMIT {req.limit}"

        rows = svc.execute(sql)
        columns = svc.get_columns()

        return {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "sql": sql,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()


@router.get("/catalogs")
async def list_catalogs():
    """Liệt kê tất cả catalogs."""
    svc = TrinoService()
    try:
        rows = svc.execute("SHOW CATALOGS")
        return {"catalogs": [r[0] for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        svc.close()
