"""
Trino Service — Kết nối và thực thi SQL trên Trino.
"""
import trino
from app.config import settings


class TrinoService:
    def __init__(self, catalog: str = None, schema: str = None, branch: str = None):
        session_props = {}
        if branch and branch != "main":
            session_props["iceberg.nessie_reference_name"] = branch
            
        self.conn = trino.dbapi.connect(
            host=settings.trino_host,
            port=settings.trino_port,
            user=settings.trino_user,
            catalog=catalog or settings.trino_catalog,
            schema=schema or settings.trino_schema,
            session_properties=session_props if session_props else None,
        )
        self._cursor = None

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

    def close(self):
        if self.conn:
            self.conn.close()
