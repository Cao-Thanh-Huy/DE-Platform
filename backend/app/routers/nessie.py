"""
Router: Nessie Git — Quản lý branches, tags, commits cho data versioning.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.nessie_service import NessieService

router = APIRouter()


class CreateBranchRequest(BaseModel):
    name: str
    source_branch: str = "main"


class MergeRequest(BaseModel):
    from_branch: str
    to_branch: str = "main"
    message: str | None = None


class CreateTagRequest(BaseModel):
    name: str
    branch: str = "main"


@router.get("/branches")
async def list_branches():
    """Liệt kê tất cả branches."""
    svc = NessieService()
    branches = await svc.list_branches()
    return {"branches": branches}


@router.post("/branches")
async def create_branch(req: CreateBranchRequest):
    """Tạo branch mới từ source branch."""
    svc = NessieService()
    try:
        result = await svc.create_branch(req.name, req.source_branch)
        return {"message": f"Branch '{req.name}' đã được tạo từ '{req.source_branch}'", "branch": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/branches/{name}")
async def delete_branch(name: str):
    """Xóa branch."""
    if name == "main":
        raise HTTPException(status_code=400, detail="Không thể xóa branch 'main'")
    svc = NessieService()
    try:
        await svc.delete_branch(name)
        # Đồng thời dọn dẹp dynamic catalog trên Trino (nếu do pipeline tạo ra)
        try:
            from app.services.trino_service import TrinoService
            catalog_name = f"ctlg_{name.replace('-', '_')}"
            TrinoService().drop_catalog(catalog_name)
        except Exception:
            pass
        return {"message": f"Branch '{name}' đã được xóa"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/branches/{name}/log")
async def get_branch_log(name: str, limit: int = 50):
    """Lấy commit log của branch."""
    svc = NessieService()
    try:
        log = await svc.get_log(name, limit)
        return {"branch": name, "log": log}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/branches/{name}/contents")
async def get_branch_contents(name: str):
    """Lấy danh sách objects (tables) trên branch."""
    svc = NessieService()
    try:
        contents = await svc.get_contents(name)
        return {"branch": name, "contents": contents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/merge")
async def merge_branches(req: MergeRequest):
    """Merge branch vào branch đích."""
    svc = NessieService()
    try:
        result = await svc.merge(req.from_branch, req.to_branch, req.message)
        return {"message": f"Merge '{req.from_branch}' → '{req.to_branch}' thành công", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/diff/{from_branch}/{to_branch}")
async def diff_branches(from_branch: str, to_branch: str):
    """So sánh sự khác biệt giữa 2 branches."""
    svc = NessieService()
    try:
        diff = await svc.diff(from_branch, to_branch)
        return {"from": from_branch, "to": to_branch, "diff": diff}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tags")
async def list_tags():
    """Liệt kê tất cả tags."""
    svc = NessieService()
    tags = await svc.list_tags()
    return {"tags": tags}


@router.post("/tags")
async def create_tag(req: CreateTagRequest):
    """Tạo tag từ branch."""
    svc = NessieService()
    try:
        result = await svc.create_tag(req.name, req.branch)
        return {"message": f"Tag '{req.name}' đã được tạo từ branch '{req.branch}'", "tag": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
