"""
Router: Storage — Quản lý files trên MinIO.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from app.services.minio_service import MinIOService

router = APIRouter()


@router.get("/buckets")
async def list_buckets():
    """Liệt kê tất cả buckets."""
    svc = MinIOService()
    buckets = svc.list_buckets()
    return {"buckets": buckets}


@router.get("/objects/{bucket_name}")
async def list_objects(bucket_name: str, prefix: str = ""):
    """Liệt kê objects trong bucket."""
    svc = MinIOService()
    try:
        objects = svc.list_objects(bucket_name, prefix)
        return {"bucket": bucket_name, "prefix": prefix, "objects": objects}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload/{bucket_name}")
async def upload_file(bucket_name: str, path: str = "", file: UploadFile = File(...)):
    """Upload file vào bucket."""
    svc = MinIOService()
    try:
        object_name = f"{path}/{file.filename}" if path else file.filename
        result = svc.upload_file(bucket_name, object_name, file.file, file.size)
        return {"message": f"File '{file.filename}' đã upload", "object": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/objects/{bucket_name}/{object_name:path}")
async def delete_object(bucket_name: str, object_name: str):
    """Xóa object khỏi bucket."""
    svc = MinIOService()
    try:
        svc.delete_object(bucket_name, object_name)
        return {"message": f"Object '{object_name}' đã được xóa khỏi bucket '{bucket_name}'"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
