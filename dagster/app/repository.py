"""
Dagster Repository — DE Platform
Registers: pipeline_runner (generic job) + schedule sensor
"""
from dagster import repository

from jobs.pipeline_runner import pipeline_runner
from sensors.postgres_schedule_sensor import postgres_schedule_sensor

@repository(name="lakehouse_repository")
def lakehouse_repository():
    """
    DE Platform Dagster Repository.
    Single generic 'pipeline_runner' job handles all pipelines defined in DE Studio.
    """
    return [
        pipeline_runner,
        postgres_schedule_sensor,
    ]
