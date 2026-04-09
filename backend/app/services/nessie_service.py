"""
Nessie Service — Giao tiếp với Nessie REST API v2.
"""
import httpx
from app.config import settings


class NessieService:
    def __init__(self):
        self.base_url = settings.nessie_uri
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)

    async def list_branches(self) -> list:
        resp = await self.client.get("/trees")
        resp.raise_for_status()
        data = resp.json()
        references = data.get("references", [])
        return [
            {"name": ref["name"], "hash": ref.get("hash", ""), "type": ref["type"]}
            for ref in references
            if ref["type"] == "BRANCH"
        ]

    async def list_tags(self) -> list:
        resp = await self.client.get("/trees")
        resp.raise_for_status()
        data = resp.json()
        references = data.get("references", [])
        return [
            {"name": ref["name"], "hash": ref.get("hash", ""), "type": ref["type"]}
            for ref in references
            if ref["type"] == "TAG"
        ]

    async def create_branch(self, name: str, source_branch: str = "main") -> dict:
        # Lấy hash của source branch
        resp = await self.client.get(f"/trees/{source_branch}")
        resp.raise_for_status()
        source = resp.json()

        # Tạo branch mới
        resp = await self.client.post(
            "/trees",
            json={
                "type": "BRANCH",
                "name": name,
                "hash": source.get("hash", ""),
            },
            params={"name": name, "type": "BRANCH"},
        )
        resp.raise_for_status()
        return resp.json()

    async def delete_branch(self, name: str):
        resp = await self.client.get(f"/trees/{name}")
        resp.raise_for_status()
        branch = resp.json()

        resp = await self.client.delete(
            f"/trees/{name}",
            params={"expectedHash": branch.get("hash", "")},
        )
        resp.raise_for_status()

    async def get_log(self, branch: str, limit: int = 50) -> list:
        resp = await self.client.get(
            f"/trees/{branch}/log",
            params={"maxRecords": limit},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("logEntries", [])

    async def get_contents(self, branch: str) -> list:
        resp = await self.client.get(f"/trees/{branch}/entries")
        resp.raise_for_status()
        data = resp.json()
        return data.get("entries", [])

    async def merge(self, from_branch: str, to_branch: str, message: str = None) -> dict:
        # Lấy hash của from_branch
        resp = await self.client.get(f"/trees/{from_branch}")
        resp.raise_for_status()
        from_ref = resp.json()

        # Merge
        merge_payload = {
            "fromRefName": from_branch,
            "fromHash": from_ref.get("hash", ""),
        }
        if message:
            merge_payload["message"] = message

        resp = await self.client.post(
            f"/trees/{to_branch}/merge",
            json=merge_payload,
        )
        resp.raise_for_status()
        return resp.json()

    async def diff(self, from_branch: str, to_branch: str) -> list:
        resp = await self.client.get(
            f"/trees/{from_branch}/diff/{to_branch}",
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("diffs", [])
