"""
DE Platform — Pipeline Registry ORM Models
5 tables: pipeline, pipeline_version, pipeline_run, task_run, pipeline_schedule
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, BigInteger, Boolean,
    DateTime, ForeignKey, UniqueConstraint, Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.db.database import Base


def now_utc():
    return datetime.now(timezone.utc)


# ── Pipeline ─────────────────────────────────────────────────────────────────

class Pipeline(Base):
    __tablename__ = "pipeline"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(255), unique=True, nullable=False, index=True)
    description     = Column(Text, nullable=True)
    owner           = Column(String(255), default="admin", nullable=False)
    status          = Column(
        SAEnum("draft", "active", "archived", name="pipeline_status"),
        default="draft", nullable=False,
    )
    engine          = Column(
        SAEnum("trino", "spark", name="pipeline_engine"),
        default="trino", nullable=False,
    )
    is_enabled      = Column(Boolean, default=True, nullable=False)   # NEW: enable/disable pipeline
    latest_version  = Column(Integer, default=0, nullable=False)
    created_at      = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at      = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)

    versions        = relationship("PipelineVersion", back_populates="pipeline", cascade="all, delete-orphan")
    runs            = relationship("PipelineRun", back_populates="pipeline", cascade="all, delete-orphan")
    schedules       = relationship("PipelineSchedule", back_populates="pipeline", cascade="all, delete-orphan")


# ── Pipeline Version ─────────────────────────────────────────────────────────

class PipelineVersion(Base):
    __tablename__ = "pipeline_version"
    __table_args__ = (UniqueConstraint("pipeline_id", "version"),)

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipeline_id     = Column(UUID(as_uuid=True), ForeignKey("pipeline.id", ondelete="CASCADE"), nullable=False, index=True)
    version         = Column(Integer, nullable=False)
    definition_json = Column(JSONB, nullable=False)   # raw UI graph (nodes + edges)
    dag_json        = Column(JSONB, nullable=False)    # normalized DAG after build
    compiled_sql    = Column(Text, nullable=True)      # CTE SQL compiled for Trino
    created_at      = Column(DateTime(timezone=True), default=now_utc, nullable=False)

    pipeline        = relationship("Pipeline", back_populates="versions")


# ── Pipeline Run ──────────────────────────────────────────────────────────────

class PipelineRun(Base):
    __tablename__ = "pipeline_run"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipeline_id     = Column(UUID(as_uuid=True), ForeignKey("pipeline.id", ondelete="SET NULL"), nullable=True, index=True)
    version         = Column(Integer, nullable=False)
    status          = Column(
        SAEnum("pending", "running", "success", "failed", "cancelled", name="run_status"),
        default="pending", nullable=False,
    )
    started_at      = Column(DateTime(timezone=True), nullable=True)
    ended_at        = Column(DateTime(timezone=True), nullable=True)
    triggered_by    = Column(
        SAEnum("manual", "schedule", name="trigger_type"),
        default="manual", nullable=False,
    )
    dagster_run_id  = Column(String(255), nullable=True, index=True)
    error_message   = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), default=now_utc, nullable=False)

    pipeline        = relationship("Pipeline", back_populates="runs")
    task_runs       = relationship("TaskRun", back_populates="pipeline_run", cascade="all, delete-orphan")


# ── Task Run ──────────────────────────────────────────────────────────────────

class TaskRun(Base):
    __tablename__ = "task_run"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipeline_run_id = Column(UUID(as_uuid=True), ForeignKey("pipeline_run.id", ondelete="CASCADE"), nullable=False, index=True)
    node_id         = Column(String(255), nullable=False)
    node_type       = Column(String(50), nullable=True)
    node_label      = Column(String(255), nullable=True)
    status          = Column(
        SAEnum("pending", "running", "success", "failed", name="task_status"),
        default="pending", nullable=False,
    )
    started_at      = Column(DateTime(timezone=True), nullable=True)
    ended_at        = Column(DateTime(timezone=True), nullable=True)
    trino_query_id  = Column(String(255), nullable=True)     # link sang Trino UI
    rows_affected   = Column(BigInteger, nullable=True)
    compiled_sql    = Column(Text, nullable=True)            # SQL thực tế đã chạy
    error_message   = Column(Text, nullable=True)

    pipeline_run    = relationship("PipelineRun", back_populates="task_runs")


# ── Pipeline Schedule ─────────────────────────────────────────────────────────

class PipelineSchedule(Base):
    __tablename__ = "pipeline_schedule"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pipeline_id         = Column(UUID(as_uuid=True), ForeignKey("pipeline.id", ondelete="CASCADE"), nullable=False, unique=True)
    run_type            = Column(
        SAEnum("scheduled", "onetime", name="schedule_run_type"),
        default="scheduled", nullable=False,
    )   # NEW: "scheduled" = cron recurring, "onetime" = specific datetime
    cron_expr           = Column(String(100), nullable=True)   # only for run_type="scheduled"
    run_at              = Column(DateTime(timezone=True), nullable=True)  # NEW: only for run_type="onetime"
    timezone            = Column(String(100), default="UTC", nullable=False)
    enabled             = Column(Boolean, default=True, nullable=False)
    last_triggered_at   = Column(DateTime(timezone=True), nullable=True)
    created_at          = Column(DateTime(timezone=True), default=now_utc, nullable=False)

    pipeline            = relationship("Pipeline", back_populates="schedules")
