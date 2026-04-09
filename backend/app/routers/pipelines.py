"""
Router: Pipelines — Quản lý pipeline jobs động (giống AWS Glue Studio).
Pipeline definitions được lưu dưới dạng JSON và Dagster sẽ load chúng.
"""
import json
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.services.dagster_service import DagsterService

router = APIRouter()

PIPELINE_DIR = settings.pipeline_definitions_dir


class PipelineStep(BaseModel):
    name: str
    type: str = "sql"  # sql | python
    sql: str | None = None
    description: str | None = None


class CreatePipelineRequest(BaseModel):
    name: str
    description: str | None = None
    schedule: str | None = None  # Cron expression, e.g. "0 */6 * * *"
    branch: str = "main"  # Nessie branch
    steps: list[PipelineStep]


class UpdatePipelineRequest(BaseModel):
    description: str | None = None
    schedule: str | None = None
    branch: str | None = None
    steps: list[PipelineStep] | None = None


def _ensure_pipeline_dir():
    os.makedirs(PIPELINE_DIR, exist_ok=True)


def _pipeline_path(name: str) -> str:
    return os.path.join(PIPELINE_DIR, f"{name}.json")


def _load_pipeline(name: str) -> dict | None:
    path = _pipeline_path(name)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def _save_pipeline(defn: dict):
    _ensure_pipeline_dir()
    path = _pipeline_path(defn["name"])
    with open(path, "w") as f:
        json.dump(defn, f, indent=2, default=str)


@router.get("/")
async def list_pipelines():
    """Liệt kê tất cả pipeline definitions."""
    _ensure_pipeline_dir()
    pipelines = []
    for fname in sorted(os.listdir(PIPELINE_DIR)):
        if fname.endswith(".json"):
            with open(os.path.join(PIPELINE_DIR, fname)) as f:
                try:
                    pipelines.append(json.load(f))
                except json.JSONDecodeError:
                    pass
    return {"pipelines": pipelines, "total": len(pipelines)}


@router.get("/{name}")
async def get_pipeline(name: str):
    """Lấy chi tiết một pipeline."""
    defn = _load_pipeline(name)
    if not defn:
        raise HTTPException(status_code=404, detail=f"Pipeline '{name}' không tồn tại")
    return defn


@router.post("/")
async def create_pipeline(req: CreatePipelineRequest):
    """
    Tạo pipeline mới. Pipeline sẽ được lưu dưới dạng JSON
    và Dagster sẽ tự động load khi workspace được reload.
    """
    if _load_pipeline(req.name):
        raise HTTPException(status_code=409, detail=f"Pipeline '{req.name}' đã tồn tại")

    defn = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "description": req.description,
        "schedule": req.schedule,
        "branch": req.branch,
        "steps": [step.model_dump() for step in req.steps],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "status": "active",
    }

    _save_pipeline(defn)

    # Reload Dagster workspace để load pipeline mới
    dagster = DagsterService()
    try:
        await dagster.reload_workspace()
    except Exception as e:
        # Pipeline vẫn được lưu, Dagster sẽ load lần sau
        pass

    return {"message": f"Pipeline '{req.name}' đã được tạo", "pipeline": defn}


@router.put("/{name}")
async def update_pipeline(name: str, req: UpdatePipelineRequest):
    """Cập nhật pipeline definition."""
    defn = _load_pipeline(name)
    if not defn:
        raise HTTPException(status_code=404, detail=f"Pipeline '{name}' không tồn tại")

    if req.description is not None:
        defn["description"] = req.description
    if req.schedule is not None:
        defn["schedule"] = req.schedule
    if req.branch is not None:
        defn["branch"] = req.branch
    if req.steps is not None:
        defn["steps"] = [step.model_dump() for step in req.steps]
    defn["updated_at"] = datetime.now().isoformat()

    _save_pipeline(defn)

    dagster = DagsterService()
    try:
        await dagster.reload_workspace()
    except Exception:
        pass

    return {"message": f"Pipeline '{name}' đã được cập nhật", "pipeline": defn}


@router.delete("/{name}")
async def delete_pipeline(name: str):
    """Xóa pipeline definition."""
    path = _pipeline_path(name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Pipeline '{name}' không tồn tại")

    os.remove(path)

    dagster = DagsterService()
    try:
        await dagster.reload_workspace()
    except Exception:
        pass

    return {"message": f"Pipeline '{name}' đã được xóa"}


@router.post("/{name}/run")
async def trigger_pipeline(name: str):
    """Chạy pipeline ngay lập tức (manual trigger)."""
    defn = _load_pipeline(name)
    if not defn:
        raise HTTPException(status_code=404, detail=f"Pipeline '{name}' không tồn tại")

    dagster = DagsterService()
    try:
        run_id = await dagster.trigger_job(name)
        return {"message": f"Pipeline '{name}' đã được trigger", "run_id": run_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi trigger pipeline: {e}")


@router.get("/{name}/runs")
async def get_pipeline_runs(name: str, limit: int = 20):
    """Lấy lịch sử chạy của pipeline."""
    dagster = DagsterService()
    try:
        runs = await dagster.get_job_runs(name, limit)
        return {"pipeline": name, "runs": runs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
