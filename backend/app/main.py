"""
DE Platform — FastAPI Backend
Entry point: cung cấp REST API cho DE Studio frontend.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import models, pipelines, nessie, query, storage, maintenance
from app.db.database import init_db
from app.services.scheduler_service import start_scheduler, stop_scheduler

log = logging.getLogger("de.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    scheduler = start_scheduler()
    log.info("✅ DE Platform backend started with pipeline scheduler")
    yield
    # Shutdown
    stop_scheduler()
    log.info("DE Platform backend shutting down")


app = FastAPI(
    title="DE Platform API",
    description="Backend API cho DE Studio — quản lý Data Models, Pipelines, Nessie Git, Trino Queries, MinIO Storage",
    version="2.0.0",
    lifespan=lifespan,
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
app.include_router(models.router,       prefix="/api/models",       tags=["Data Models"])
app.include_router(pipelines.router,    prefix="/api/pipelines",    tags=["Pipelines"])
app.include_router(nessie.router,       prefix="/api/nessie",       tags=["Nessie Git"])
app.include_router(query.router,        prefix="/api/query",        tags=["Query Engine"])
app.include_router(storage.router,      prefix="/api/storage",      tags=["Storage"])
app.include_router(maintenance.router,  prefix="/api/maintenance",  tags=["Maintenance"])


@app.get("/api/health", tags=["Health"])
async def health_check():
    """Kiểm tra trạng thái API server."""
    return {
        "status": "healthy",
        "service": "de-platform-api",
        "version": "2.0.0",
        "scheduler": "running",
    }
