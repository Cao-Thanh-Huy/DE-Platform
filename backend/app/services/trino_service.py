"""
Trino Service — Kết nối và thực thi SQL trên Trino.
Bổ sung: query_id tracking, schema introspection, query status polling.
"""
import httpx
import trino
from app.config import settings


class TrinoService:
    def __init__(self, catalog: str = None, schema: str = None, branch: str = None):
        session_props = {}
        if branch and branch != "main":
            # NOTE: Trino 480 Iceberg connector doesn't support session properties for nessie references.
            pass

        self.conn = trino.dbapi.connect(
            host=settings.trino_host,
            port=settings.trino_port,
            user=settings.trino_user,
            catalog=catalog or settings.trino_catalog,
            schema=schema or settings.trino_schema,
            session_properties=session_props if session_props else None,
        )
        self._cursor = None

    # ── Basic Execute ─────────────────────────────────────────────────────────

    def execute(self, sql: str, params=None) -> list:
        self._cursor = self.conn.cursor()
        self._cursor.execute(sql, params)
        try:
            return self._cursor.fetchall()
        except Exception:
            return []

    def get_columns(self) -> list[str]:
        """Lấy tên columns từ query vừa thực thi."""
        if self._cursor and self._cursor.description:
            return [desc[0] for desc in self._cursor.description]
        return []

    # ── Execute with Query ID Tracking ───────────────────────────────────────

    def execute_with_tracking(self, sql: str) -> tuple[str | None, int]:
        """
        Execute SQL và trả về (trino_query_id, rows_affected).
        query_id dùng để link sang Trino UI và theo dõi status.
        """
        cursor = self.conn.cursor()
        cursor.execute(sql)

        # Trino Python driver exposes query_id via cursor stats
        query_id: str | None = None
        try:
            # Access query id from the cursor's query stats
            if hasattr(cursor, "_query") and cursor._query:
                query_id = getattr(cursor._query, "query_id", None)
            if not query_id and hasattr(cursor, "stats"):
                query_id = (cursor.stats or {}).get("queryId")
        except Exception:
            pass

        rows_affected = 0
        try:
            results = cursor.fetchall()
            rows_affected = len(results)
            # For DML (INSERT/MERGE), Trino returns rows affected as result
            if results and len(results) == 1 and len(results[0]) == 1:
                try:
                    rows_affected = int(results[0][0])
                except (TypeError, ValueError):
                    rows_affected = len(results)
        except Exception:
            pass

        self._cursor = cursor
        return query_id, rows_affected

    def drop_catalog(self, catalog_name: str):
        """Xóa catalog dynamic nếu tồn tại."""
        try:
            cursor = self.conn.cursor()
            cursor.execute(f"DROP CATALOG IF EXISTS {catalog_name}")
        except Exception:
            pass

    # ── Schema Introspection ──────────────────────────────────────────────────

    def describe_table(self, catalog: str, schema: str, table: str) -> list[str]:
        """
        Returns list of column names for a table.
        Used by DAGValidator for schema validation.
        """
        try:
            rows = self.execute(f"DESCRIBE {catalog}.{schema}.{table}")
            # DESCRIBE returns: (Column, Type, Extra, Comment)
            return [row[0] for row in rows if row]
        except Exception:
            return []

    def table_exists(self, catalog: str, schema: str, table: str) -> bool:
        """Check if table exists via information_schema."""
        try:
            rows = self.execute(
                f"SELECT table_name FROM {catalog}.information_schema.tables "
                f"WHERE table_schema = '{schema}' AND table_name = '{table}'"
            )
            return len(rows) > 0
        except Exception:
            return False

    def get_schemas(self, catalog: str = None) -> list[str]:
        """List schemas in catalog."""
        cat = catalog or settings.trino_catalog
        try:
            rows = self.execute(f"SHOW SCHEMAS FROM {cat}")
            return [row[0] for row in rows if row]
        except Exception:
            return []

    # ── Query Status Polling ──────────────────────────────────────────────────

    def get_query_status(self, query_id: str) -> dict:
        """
        Poll Trino REST API for query status.
        Returns dict with state, queryId, etc.
        """
        url = f"http://{settings.trino_host}:{settings.trino_port}/v1/query/{query_id}"
        try:
            resp = httpx.get(url, headers={"X-Trino-User": settings.trino_user}, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "query_id": query_id,
                    "state": data.get("state", "UNKNOWN"),
                    "elapsed_ms": data.get("queryStats", {}).get("elapsedTime", ""),
                    "rows_processed": data.get("queryStats", {}).get("processedRows", 0),
                    "ui_url": f"http://localhost:{settings.trino_port}/ui/query.html?{query_id}",
                }
            return {"query_id": query_id, "state": "NOT_FOUND"}
        except Exception as e:
            return {"query_id": query_id, "state": "ERROR", "error": str(e)}

    def cancel_query(self, query_id: str) -> bool:
        """Cancel a running Trino query."""
        url = f"http://{settings.trino_host}:{settings.trino_port}/v1/query/{query_id}"
        try:
            resp = httpx.delete(url, headers={"X-Trino-User": settings.trino_user}, timeout=10)
            return resp.status_code in (200, 204)
        except Exception:
            return False

    def close(self):
        if self.conn:
            self.conn.close()
