"""
Dagster — Generic Pipeline Runner Job
1 job duy nhất chạy tất cả pipelines.
Pipeline ID + version được truyền qua run tags.
"""
from datetime import datetime, timezone

from dagster import job, op, OpExecutionContext

from resources import trino_resource, backend_api_resource


@op(required_resource_keys={"trino", "backend_api"})
def execute_pipeline_op(context: OpExecutionContext):
    """
    Generic op: fetch compiled SQL from Backend API → execute on Trino → report back.
    """
    tags = context.run.tags
    pipeline_id = tags.get("pipeline_id")
    run_id = tags.get("run_id")
    version = int(tags.get("version", "0"))
    pipeline_name = tags.get("pipeline_name", "unknown")
    dagster_run_id = context.run.run_id

    context.log.info(f"▶ Starting pipeline '{pipeline_name}' (id={pipeline_id}, version={version})")

    # 1. Report running status
    try:
        context.resources.backend_api.update_run_status(
            run_id=run_id,
            status="running",
            dagster_run_id=dagster_run_id,
        )
    except Exception as e:
        context.log.warning(f"Could not update run status: {e}")

    # 2. Fetch compiled SQL
    context.log.info("⬇ Fetching compiled SQL from Backend API...")
    compiled_sql = context.resources.backend_api.get_compiled_sql(
        pipeline_id=pipeline_id,
        version=version,
    )
    if not compiled_sql:
        error_msg = f"No compiled SQL found for pipeline {pipeline_id} version {version}"
        context.log.error(f"❌ {error_msg}")
        context.resources.backend_api.update_run_status(
            run_id=run_id, status="failed", error_message=error_msg
        )
        raise Exception(error_msg)

    context.log.info(f"📋 Compiled SQL ({len(compiled_sql)} chars):\n{compiled_sql[:500]}...")

    # 3. Execute on Trino
    context.log.info("🚀 Executing on Trino...")
    start_time = datetime.now(timezone.utc)
    query_id = None
    rows_affected = 0

    try:
        query_id, rows_affected = context.resources.trino.execute_with_tracking(compiled_sql)
        context.log.info(f"✅ Execution complete. query_id={query_id}, rows={rows_affected}")
    except Exception as e:
        context.log.error(f"❌ Trino execution failed: {e}")
        # Report task run
        context.resources.backend_api.create_task_run(
            run_id=run_id,
            node_id="cte_pipeline",
            node_type="cte_query",
            node_label="CTE Pipeline Query",
            status="failed",
            trino_query_id=query_id,
            compiled_sql=compiled_sql,
            error_message=str(e),
        )
        # Report pipeline run failure
        context.resources.backend_api.update_run_status(
            run_id=run_id, status="failed", error_message=str(e)
        )
        raise

    end_time = datetime.now(timezone.utc)
    duration = (end_time - start_time).total_seconds()

    # 4. Report task run
    try:
        context.resources.backend_api.create_task_run(
            run_id=run_id,
            node_id="cte_pipeline",
            node_type="cte_query",
            node_label="CTE Pipeline Query",
            status="success",
            trino_query_id=query_id,
            rows_affected=rows_affected,
            compiled_sql=compiled_sql,
        )
    except Exception as e:
        context.log.warning(f"Could not create task run record: {e}")

    # 5. Mark pipeline run success
    try:
        context.resources.backend_api.update_run_status(
            run_id=run_id,
            status="success",
            dagster_run_id=dagster_run_id,
        )
    except Exception as e:
        context.log.warning(f"Could not update final run status: {e}")

    context.log.info(f"🎉 Pipeline '{pipeline_name}' completed in {duration:.2f}s. Rows={rows_affected}, trino_query_id={query_id}")
    return {"query_id": query_id, "rows_affected": rows_affected, "duration_s": duration}


@job(
    name="pipeline_runner",
    resource_defs={
        "trino": trino_resource,
        "backend_api": backend_api_resource,
    },
    description="Generic pipeline runner — executes any DE Studio pipeline via tags.",
    tags={"source": "de-studio"},
)
def pipeline_runner():
    execute_pipeline_op()
