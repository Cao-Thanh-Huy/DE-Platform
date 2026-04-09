"""
Dagster Service — Giao tiếp với Dagster qua GraphQL API.
Quản lý jobs, runs, schedules.
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

    async def reload_workspace(self):
        """Reload Dagster workspace để load pipelines mới."""
        query = """
        mutation {
            reloadRepositoryLocation(
                repositoryLocationName: "repository"
            ) {
                __typename
                ... on WorkspaceLocationEntry {
                    name
                    loadStatus
                }
                ... on ReloadNotSupported {
                    message
                }
                ... on RepositoryLocationNotFound {
                    message
                }
            }
        }
        """
        return await self._query(query)

    async def trigger_job(self, job_name: str) -> str:
        """Trigger chạy một job."""
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
            }
        }
        """
        data = await self._query(query, {"jobName": job_name})
        launch = data.get("launchRun", {})
        if launch.get("__typename") == "LaunchRunSuccess":
            return launch["run"]["runId"]
        raise Exception(f"Lỗi launch job: {launch}")

    async def get_job_runs(self, job_name: str, limit: int = 20) -> list:
        """Lấy lịch sử runs của job."""
        query = """
        query GetRuns($jobName: String!, $limit: Int!) {
            runsOrError(
                filter: { pipelineName: $jobName }
                limit: $limit
            ) {
                __typename
                ... on Runs {
                    results {
                        runId
                        status
                        startTime
                        endTime
                        tags {
                            key
                            value
                        }
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
        """Lấy danh sách schedules."""
        query = """
        query {
            schedulesOrError {
                __typename
                ... on Schedules {
                    results {
                        name
                        cronSchedule
                        scheduleState {
                            status
                        }
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
        """Bật/tắt schedule."""
        if start:
            mutation = """
            mutation($scheduleName: String!) {
                startSchedule(scheduleSelector: {
                    repositoryLocationName: "repository"
                    repositoryName: "lakehouse_repository"
                    scheduleName: $scheduleName
                }) {
                    __typename
                }
            }
            """
        else:
            mutation = """
            mutation($scheduleName: String!) {
                stopRunningSchedule(scheduleSelector: {
                    repositoryLocationName: "repository"
                    repositoryName: "lakehouse_repository"
                    scheduleName: $scheduleName
                }) {
                    __typename
                }
            }
            """
        return await self._query(mutation, {"scheduleName": schedule_name})
