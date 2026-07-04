import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.middleware import MaxBodySizeMiddleware
from app.database import init_db, get_db_connection
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

# Register routers
from app.routes.documents import router as documents_router
from app.routes.upload import router as upload_router
from app.routes.export import router as export_router
from app.routes.events import router as events_router

app.include_router(documents_router)
app.include_router(upload_router)
app.include_router(export_router)
app.include_router(events_router)


@app.on_event("startup")
def startup_event():
    init_db()
    init_templates()
    start_cleanup_thread()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE documents SET status = 'failed', escalation_level = 'level_4' WHERE status = 'processing'")
    stalled = cursor.rowcount
    conn.commit()
    conn.close()
    if stalled:
        print(f"Marked {stalled} stalled document(s) as failed (server restarted while processing)")
