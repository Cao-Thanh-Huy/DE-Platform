"""
Dagster Service — Giao tiếp với Dagster qua GraphQL API.
Generic Job pattern: 1 job "pipeline_runner" cho tất cả pipelines.
"""
import httpx
from app.config import settings


class DagsterService:
    def __init__(self):
        self.graphql_url = settings.dagster_graphql_url
        self.client = httpx.AsyncClient(timeout=30.0)

    async def _query(self, query: str, variables: dict = None) -> dict:
        resp = await self.client.post(
            self.graphql_url,
            json={"query": query, "variables": variables or {}},
        )
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            raise Exception(f"GraphQL errors: {data['errors']}")
        return data.get("data", {})

    async def trigger_pipeline_runner(
        self,
        pipeline_id: str,
        run_id: str,
        version: int,
        pipeline_name: str,
    ) -> str:
        """
        Trigger the generic 'pipeline_runner' job with pipeline metadata as tags.
        The job fetches compiled SQL from the Backend API using these tags.
        """
        query = """
        mutation LaunchRun($tags: [ExecutionTag!]!) {
            launchRun(
                executionParams: {
                    selector: {
                        repositoryLocationName: "repository"
                        repositoryName: "lakehouse_repository"
                        jobName: "pipeline_runner"
                    }
                    runConfigData: {}
                    executionMetadata: {
                        tags: $tags
                    }
                }
            ) {
                __typename
                ... on LaunchRunSuccess {
                    run {
                        runId
                        status
                    }
                }
                ... on PythonError {
                    message
                    stack
                }
                ... on InvalidSubsetError {
                    message
                }
                ... on RunConflict {
                    message
                }
            }
        }
        """
        tags = [
            {"key": "pipeline_id", "value": pipeline_id},
            {"key": "run_id", "value": run_id},
            {"key": "version", "value": str(version)},
            {"key": "pipeline_name", "value": pipeline_name},
            {"key": "source", "value": "de-studio"},
        ]
        data = await self._query(query, {"tags": tags})
        launch = data.get("launchRun", {})
        if launch.get("__typename") == "LaunchRunSuccess":
            return launch["run"]["runId"]
        raise Exception(f"Lỗi launch pipeline_runner: {launch}")

    # ── Legacy / kept for compatibility ──────────────────────────────────────

    async def trigger_job(self, job_name: str) -> str:
        """Legacy: trigger a named job directly (not recommended for new pipelines)."""
        query = """
        mutation LaunchRun($jobName: String!) {
            launchRun(
                executionParams: {
                    selector: {
                        repositoryLocationName: "repository"
                        repositoryName: "lakehouse_repository"
                        jobName: $jobName
                    }
                    runConfigData: {}
                }
            ) {
                __typename
                ... on LaunchRunSuccess {
                    run { runId status }
                }
                ... on PythonError {
                    message
                }
            }
        }
        """
        data = await self._query(query, {"jobName": job_name})
        launch = data.get("launchRun", {})
        if launch.get("__typename") == "LaunchRunSuccess":
            return launch["run"]["runId"]
        raise Exception(f"Lỗi launch job: {launch}")

    async def get_run_status(self, dagster_run_id: str) -> dict:
        """Poll run status from Dagster."""
        query = """
        query GetRun($runId: ID!) {
            runOrError(runId: $runId) {
                __typename
                ... on Run {
                    runId
                    status
                    startTime
                    endTime
                    tags { key value }
                }
                ... on RunNotFoundError {
                    message
                }
            }
        }
        """
        data = await self._query(query, {"runId": dagster_run_id})
        run_data = data.get("runOrError", {})
        if run_data.get("__typename") == "Run":
            return {
                "dagster_run_id": run_data.get("runId"),
                "status": run_data.get("status"),
                "start_time": run_data.get("startTime"),
                "end_time": run_data.get("endTime"),
            }
        return {"dagster_run_id": dagster_run_id, "status": "UNKNOWN"}

    async def get_job_runs(self, job_name: str, limit: int = 20) -> list:
        """List recent runs for a job."""
        query = """
        query GetRuns($jobName: String!, $limit: Int!) {
            runsOrError(
                filter: { pipelineName: $jobName }
                limit: $limit
            ) {
                __typename
                ... on Runs {
                    results {
                        runId status startTime endTime
                        tags { key value }
                    }
                }
            }
        }
        """
        data = await self._query(query, {"jobName": job_name, "limit": limit})
        runs_data = data.get("runsOrError", {})
        if runs_data.get("__typename") == "Runs":
            return runs_data.get("results", [])
        return []

    async def get_schedules(self) -> list:
        """Get all schedules from Dagster."""
        query = """
        query {
            schedulesOrError {
                __typename
                ... on Schedules {
                    results {
                        name cronSchedule
                        scheduleState { status }
                        pipelineName
                    }
                }
            }
        }
        """
        data = await self._query(query)
        sched_data = data.get("schedulesOrError", {})
        if sched_data.get("__typename") == "Schedules":
            return sched_data.get("results", [])
        return []

    async def toggle_schedule(self, schedule_name: str, start: bool = True):
        """Enable/disable a Dagster schedule."""
        if start:
            mutation = """
            mutation($scheduleName: String!) {
                startSchedule(scheduleSelector: {
                    repositoryLocationName: "repository"
                    repositoryName: "lakehouse_repository"
                    scheduleName: $scheduleName
                }) { __typename }
            }
            """
        else:
            mutation = """
            mutation($scheduleName: String!) {
                stopRunningSchedule(scheduleSelector: {
                    repositoryLocationName: "repository"
                    repositoryName: "lakehouse_repository"
                    scheduleName: $scheduleName
                }) { __typename }
            }
            """
        return await self._query(mutation, {"scheduleName": schedule_name})
