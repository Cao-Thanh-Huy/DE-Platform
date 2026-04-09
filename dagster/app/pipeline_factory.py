"""
Dynamic Pipeline Factory — DE Platform
Tạo Dagster jobs động từ pipeline definitions (JSON).
Pipeline definitions được DE Studio (FastAPI) ghi vào /opt/dagster/pipelines/.
"""
import json
import os
import glob
import logging
from dagster import op, job, schedule, OpExecutionContext, ScheduleDefinition

from resources import trino_resource

logger = logging.getLogger(__name__)

PIPELINE_DIR = os.getenv("PIPELINE_DEFINITIONS_DIR", "/opt/dagster/pipelines")


def load_pipeline_definitions() -> list:
    """Đọc tất cả pipeline definitions từ thư mục shared volume."""
    definitions = []
    pattern = os.path.join(PIPELINE_DIR, "*.json")
    for filepath in sorted(glob.glob(pattern)):
        try:
            with open(filepath, "r") as f:
                defn = json.load(f)
                defn["_filepath"] = filepath
                definitions.append(defn)
        except Exception as e:
            logger.error(f"Lỗi đọc pipeline definition {filepath}: {e}")
    return definitions


def create_sql_op(step_name: str, sql: str, step_order: int):
    """Tạo một Dagster op thực hiện SQL query qua Trino."""

    @op(
        name=f"{step_name}_{step_order}",
        required_resource_keys={"trino"},
        description=f"Execute SQL step: {step_name}",
    )
    def _sql_op(context: OpExecutionContext):
        context.log.info(f"▶ Thực thi SQL step [{step_name}]: {sql[:200]}...")
        try:
            result = context.resources.trino.execute(sql)
            context.log.info(f"✅ Step [{step_name}] hoàn thành. Rows: {len(result)}")
            return result
        except Exception as e:
            context.log.error(f"❌ Step [{step_name}] lỗi: {e}")
            raise

    return _sql_op


def build_job_from_definition(defn: dict):
    """
    Tạo Dagster job từ pipeline definition.

    Pipeline definition format (JSON):
    {
        "name": "bronze_to_silver_orders",
        "description": "Transform raw orders to silver layer",
        "schedule": "0 */6 * * *",  # Cron expression (optional)
        "branch": "main",           # Nessie branch
        "steps": [
            {
                "name": "create_silver_table",
                "type": "sql",
                "sql": "CREATE TABLE IF NOT EXISTS iceberg.silver.orders ..."
            },
            {
                "name": "transform_data",
                "type": "sql",
                "sql": "INSERT INTO iceberg.silver.orders SELECT ... FROM iceberg.bronze.raw_orders"
            }
        ]
    }
    """
    pipeline_name = defn.get("name", "unnamed_pipeline")
    steps = defn.get("steps", [])

    # Tạo ops từ steps
    ops = []
    for i, step in enumerate(steps):
        step_name = step.get("name", f"step_{i}")
        sql = step.get("sql", "SELECT 1")
        op_fn = create_sql_op(step_name, sql, i)
        ops.append(op_fn)

    @job(
        name=pipeline_name,
        resource_defs={"trino": trino_resource},
        description=defn.get("description", ""),
        tags={"source": "de-studio", "branch": defn.get("branch", "main")},
    )
    def _dynamic_job():
        # Chain ops sequentially
        prev = None
        for op_fn in ops:
            if prev is None:
                prev = op_fn()
            else:
                prev = op_fn()

    return _dynamic_job


def build_schedule_from_definition(defn: dict, job_fn):
    """Tạo Dagster schedule từ cron expression."""
    cron = defn.get("schedule")
    if not cron:
        return None

    pipeline_name = defn.get("name", "unnamed")
    return ScheduleDefinition(
        name=f"{pipeline_name}_schedule",
        job=job_fn,
        cron_schedule=cron,
        default_status=None,
    )


def build_all_dynamic_pipelines():
    """Load tất cả pipeline definitions và tạo jobs + schedules."""
    definitions = load_pipeline_definitions()
    jobs = []
    schedules = []

    for defn in definitions:
        try:
            job_fn = build_job_from_definition(defn)
            jobs.append(job_fn)

            sched = build_schedule_from_definition(defn, job_fn)
            if sched:
                schedules.append(sched)

            logger.info(f"✅ Loaded pipeline: {defn.get('name')}")
        except Exception as e:
            logger.error(f"❌ Lỗi tạo pipeline {defn.get('name')}: {e}")

    return jobs, schedules
