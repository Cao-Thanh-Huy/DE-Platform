"""
Dagster Repository — DE Platform
Tải dynamic pipelines từ DE Studio + health check mặc định.
"""
from dagster import repository, job, op, OpExecutionContext
from resources import trino_resource
from pipeline_factory import build_all_dynamic_pipelines


# ── Health Check Job (luôn có sẵn) ──────────────────────────
@op(required_resource_keys={"trino"})
def health_check_op(context: OpExecutionContext):
    """Kiểm tra kết nối Trino từ Dagster."""
    result = context.resources.trino.execute("SELECT 1 AS health")
    context.log.info(f"✅ Trino health check: {result}")
    return "ok"


@job(resource_defs={"trino": trino_resource})
def health_check_job():
    """Kiểm tra kết nối Trino ↔ Dagster."""
    health_check_op()


# ── Repository ──────────────────────────────────────────────
@repository
def lakehouse_repository():
    # Luôn có health_check
    base_jobs = [health_check_job]

    # Load dynamic pipelines từ DE Studio
    dynamic_jobs, dynamic_schedules = build_all_dynamic_pipelines()

    return base_jobs + dynamic_jobs + dynamic_schedules
