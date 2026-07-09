import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.middleware import MaxBodySizeMiddleware
from app.database import init_db, get_db_connection, put_conn, USE_POSTGRES

app = FastAPI(title="SSIAR Document Intelligence Platform V2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(MaxBodySizeMiddleware)

from app.routes.auth import router as auth_router
from app.routes.v2.documents import router as documents_router
from app.routes.v2.upload import router as upload_router
from app.routes.v2.export import router as export_router
from app.routes.v2.review import router as review_router
from app.routes.v2.analytics import router as analytics_router
from app.routes.analytics import router as domain_analytics_router

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(upload_router)
app.include_router(export_router)
app.include_router(review_router)
app.include_router(analytics_router)
app.include_router(domain_analytics_router)


@app.on_event("startup")
def startup_event():
    init_db()
    from app.processing.templates import init_templates_v2
    init_templates_v2()

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
