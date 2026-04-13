import asyncio
import json
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        # GET diff
        resp = await client.get("http://localhost:8000/api/nessie/diff/pipeline_test_pipeline_mr_run_2adaf12d/main")
        print(json.dumps(resp.json(), indent=2))

asyncio.run(main())
