"""
DE Platform — FastAPI Backend
Entry point: cung cấp REST API cho DE Studio frontend.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import models, pipelines, nessie, query, storage

app = FastAPI(
    title="DE Platform API",
    description="Backend API cho DE Studio — quản lý Data Models, Pipelines, Nessie Git, Trino Queries, MinIO Storage",
    version="1.0.0",
)

# --- CORS cho frontend ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Mount Routers ---
app.include_router(models.router, prefix="/api/models", tags=["Data Models"])
app.include_router(pipelines.router, prefix="/api/pipelines", tags=["Pipelines"])
app.include_router(nessie.router, prefix="/api/nessie", tags=["Nessie Git"])
app.include_router(query.router, prefix="/api/query", tags=["Query Engine"])
app.include_router(storage.router, prefix="/api/storage", tags=["Storage"])


@app.get("/api/health", tags=["Health"])
async def health_check():
    """Kiểm tra trạng thái API server."""
    return {"status": "healthy", "service": "de-platform-api"}
