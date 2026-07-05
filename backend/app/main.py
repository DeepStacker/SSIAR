import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.middleware import MaxBodySizeMiddleware
from app.database import init_db, get_db_connection, put_conn, USE_POSTGRES
from app.services.processing import init_templates, start_cleanup_thread

app = FastAPI(title="SSIAR SDQ Digitization API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(MaxBodySizeMiddleware)

from app.routes.documents import router as documents_router
from app.routes.upload import router as upload_router
from app.routes.export import router as export_router
from app.routes.events import router as events_router
from app.routes.analytics import router as analytics_router

app.include_router(documents_router)
app.include_router(upload_router)
app.include_router(export_router)
app.include_router(events_router)
app.include_router(analytics_router)


@app.on_event("startup")
def startup_event():
    init_db()
    init_templates()
    start_cleanup_thread()

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE documents SET status = 'failed', escalation_level = 'level_4' WHERE status = 'processing'"
        )
        stalled = cur.rowcount
        conn.commit()
        if stalled:
            print(f"Marked {stalled} stalled document(s) as failed (server restarted while processing)")
    finally:
        put_conn(conn)


@app.on_event("shutdown")
def shutdown_event():
    if USE_POSTGRES:
        from app.database import _pool
        if _pool:
            _pool.closeall()
