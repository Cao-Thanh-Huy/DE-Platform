"""
DE Platform — Configuration
Đọc env vars cho tất cả services.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Trino ---
    trino_host: str = "trino"
    trino_port: int = 8080
    trino_user: str = "admin"
    trino_catalog: str = "iceberg"
    trino_schema: str = "bronze"

    # --- MinIO ---
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "admin"
    minio_secret_key: str = "minio123456"
    minio_secure: bool = False

    # --- Nessie ---
    nessie_uri: str = "http://nessie:19120/api/v2"

    # --- Vault ---
    vault_addr: str = "http://vault:8200"
    vault_token: str = "dev-root-token"

    # --- Dagster ---
    dagster_webserver_url: str = "http://dagster-webserver:3000"
    dagster_graphql_url: str = "http://dagster-webserver:3000/graphql"

    # --- Pipeline Registry (Postgres async) ---
    database_url: str = "postgresql+asyncpg://deplatform:deplatform123@postgres:5432/deplatform"

    # --- Pipeline definitions (legacy, kept for backward compat) ---
    pipeline_definitions_dir: str = "/opt/dagster/pipelines"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
