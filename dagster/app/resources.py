"""
Dagster Resources — DE Platform
Shared resources: Trino connection.
"""
import os
import trino
from dagster import resource, Field, StringSource, IntSource


class TrinoConnection:
    """Thin wrapper around trino-python-client."""

    def __init__(self, host: str, port: int, user: str = "admin",
                 catalog: str = "iceberg", schema: str = "bronze"):
        self.conn = trino.dbapi.connect(
            host=host, port=port, user=user,
            catalog=catalog, schema=schema,
        )

    def execute(self, sql: str, params=None) -> list:
        cursor = self.conn.cursor()
        cursor.execute(sql, params)
        return cursor.fetchall()

    def close(self):
        self.conn.close()


@resource(
    config_schema={
        "host": Field(StringSource, default_value="trino", is_required=False),
        "port": Field(IntSource, default_value=8080, is_required=False),
        "user": Field(StringSource, default_value="admin", is_required=False),
    },
    description="Trino SQL connection resource",
)
def trino_resource(context):
    host = context.resource_config.get("host", os.getenv("TRINO_HOST", "trino"))
    port = int(context.resource_config.get("port", os.getenv("TRINO_PORT", "8080")))
    user = context.resource_config.get("user", "admin")
    conn = TrinoConnection(host=host, port=port, user=user)
    try:
        yield conn
    finally:
        conn.close()
