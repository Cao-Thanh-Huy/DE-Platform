"""
Dagster Resources — Trino + Backend API
"""
import os

import httpx
import trino
from dagster import resource, ConfigurableResource, EnvVar


TRINO_HOST = os.getenv("TRINO_HOST", "trino")
TRINO_PORT = int(os.getenv("TRINO_PORT", "8080"))
TRINO_USER = os.getenv("TRINO_USER", "admin")
BACKEND_URL = os.getenv("BACKEND_API_URL", "http://backend:8000")


# ── Trino Resource ────────────────────────────────────────────────────────────

class TrinoClient:
    def __init__(self, host: str, port: int, user: str):
        self.host = host
        self.port = port
        self.user = user

    def execute_with_tracking(self, sql: str, branch: str = None) -> tuple[str | None, int]:
        catalog_name = "iceberg"
        if branch and branch != "main":
            # Trino 480 doesn't support session properties for nessie references.
            # Instead, we dynamically create a catalog for this specific branch.
            catalog_name = f"ctlg_{branch.replace('-', '_')}"
            create_catalog_sql = f"""
            CREATE CATALOG IF NOT EXISTS {catalog_name} USING iceberg WITH (
                "iceberg.catalog.type" = 'nessie',
                "iceberg.nessie-catalog.uri" = 'http://nessie:19120/api/v2',
                "iceberg.nessie-catalog.ref" = '{branch}',
                "iceberg.nessie-catalog.default-warehouse-dir" = 's3a://warehouse/',
                "fs.native-s3.enabled" = 'true',
                "s3.endpoint" = 'http://minio:9000',
                "s3.region" = 'us-east-1',
                "s3.path-style-access" = 'true',
                "s3.aws-access-key" = 'admin',
                "s3.aws-secret-key" = 'minio123456',
                "iceberg.file-format" = 'PARQUET'
            )
            """
            try:
                # Need a separate connection to run CREATE CATALOG without session catalog context restricting it
                with trino.dbapi.connect(host=self.host, port=self.port, user=self.user) as tmp_conn:
                    tmp_conn.cursor().execute(create_catalog_sql)
            except Exception as e:
                pass # Proceed anyway
                
            import re
            sql = re.sub(r'\biceberg\b\.', f"{catalog_name}.", sql)

        conn = trino.dbapi.connect(
            host=self.host,
            port=self.port,
            user=self.user,
            catalog=catalog_name,
        )
        cursor = conn.cursor()
        cursor.execute(sql)

        query_id: str | None = None
        try:
            if hasattr(cursor, "_query") and cursor._query:
                query_id = getattr(cursor._query, "query_id", None)
            if not query_id and hasattr(cursor, "stats"):
                query_id = (cursor.stats or {}).get("queryId")
        except Exception:
            pass

        rows_affected = 0
        try:
            results = cursor.fetchall()
            if results and len(results) == 1 and len(results[0]) == 1:
                try:
                    rows_affected = int(results[0][0])
                except (TypeError, ValueError):
                    rows_affected = len(results)
            else:
                rows_affected = len(results)
        except Exception:
            pass

        return query_id, rows_affected


@resource
def trino_resource(context):
    return TrinoClient(
        host=TRINO_HOST,
        port=TRINO_PORT,
        user=TRINO_USER,
    )


# ── Backend API Resource ──────────────────────────────────────────────────────

class BackendAPIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=30.0)

    def get_compiled_sql(self, pipeline_id: str, version: int) -> str | None:
        try:
            resp = self.client.get(
                f"{self.base_url}/api/pipelines/{pipeline_id}/versions/{version}/sql"
            )
            resp.raise_for_status()
            return resp.json().get("compiled_sql")
        except Exception as e:
            raise Exception(f"Failed to fetch compiled SQL: {e}")

    def update_run_status(
        self,
        run_id: str,
        status: str,
        dagster_run_id: str | None = None,
        error_message: str | None = None,
    ):
        payload = {"status": status}
        if dagster_run_id:
            payload["dagster_run_id"] = dagster_run_id
        if error_message:
            payload["error_message"] = error_message
        try:
            resp = self.client.put(
                f"{self.base_url}/api/pipelines/runs/{run_id}/status",
                json=payload,
            )
            resp.raise_for_status()
        except Exception as e:
            raise Exception(f"Failed to update run status: {e}")

    def create_task_run(
        self,
        run_id: str,
        node_id: str,
        node_type: str | None = None,
        node_label: str | None = None,
        status: str = "success",
        trino_query_id: str | None = None,
        rows_affected: int | None = None,
        compiled_sql: str | None = None,
        error_message: str | None = None,
    ):
        payload = {
            "node_id": node_id,
            "node_type": node_type,
            "node_label": node_label,
            "status": status,
            "trino_query_id": trino_query_id,
            "rows_affected": rows_affected,
            "compiled_sql": compiled_sql,
            "error_message": error_message,
        }
        try:
            resp = self.client.post(
                f"{self.base_url}/api/pipelines/runs/{run_id}/tasks",
                json=payload,
            )
            resp.raise_for_status()
        except Exception as e:
            raise Exception(f"Failed to create task run: {e}")


@resource
def backend_api_resource(context):
    return BackendAPIClient(base_url=BACKEND_URL)
