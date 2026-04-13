import asyncio
from app.services.nessie_service import NessieService
import time

async def main():
    svc = NessieService()
    branch_name = f"test_schedule_{int(time.time())}"
    print(f"Creating branch: {branch_name}")
    resp = await svc.create_branch(branch_name, source_branch="main")
    print(resp)

if __name__ == "__main__":
    asyncio.run(main())
