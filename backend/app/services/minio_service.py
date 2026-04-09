"""
MinIO Service — S3-compatible object storage operations.
"""
from minio import Minio
from app.config import settings


class MinIOService:
    def __init__(self):
        self.client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def list_buckets(self) -> list:
        buckets = self.client.list_buckets()
        return [
            {"name": b.name, "created_at": str(b.creation_date)}
            for b in buckets
        ]

    def list_objects(self, bucket: str, prefix: str = "") -> list:
        objects = self.client.list_objects(bucket, prefix=prefix, recursive=False)
        result = []
        for obj in objects:
            result.append({
                "name": obj.object_name,
                "size": obj.size,
                "is_dir": obj.is_dir,
                "last_modified": str(obj.last_modified) if obj.last_modified else None,
            })
        return result

    def upload_file(self, bucket: str, object_name: str, data, length: int) -> dict:
        result = self.client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=data,
            length=length or -1,
            part_size=10 * 1024 * 1024,  # 10MB parts
        )
        return {"bucket": bucket, "object": result.object_name, "etag": result.etag}

    def delete_object(self, bucket: str, object_name: str):
        self.client.remove_object(bucket, object_name)
