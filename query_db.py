from app.db.database import SessionLocal
from app.db.models import PipelineRun
session = SessionLocal()
runs = session.query(PipelineRun).order_by(PipelineRun.started_at.desc()).limit(5).all()
for r in runs:
    print(r.id, r.status, r.branch_name, r.triggered_by)
