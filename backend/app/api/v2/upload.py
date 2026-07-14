"""
Upload API (V2)
================
Handles multipart file uploads and batch processing.
"""
import os
import uuid
import asyncio
from typing import List
from fastapi import APIRouter, UploadFile, File, Query, HTTPException, Request, Depends
import fitz
from app.auth import require_auth, get_current_user_id
from app.config import MAX_UPLOAD_SIZE
from app.database import insert_document, store_pdf
from app.core.events import notify as SSE
from app.processing.jobs.document_jobs import get_job_queue, process_document_background
from app.models import BatchFolderRequest

router = APIRouter(dependencies=[Depends(require_auth)])

DEFAULT_CLASSIFICATION = {"type": "scanned", "dpi": 300, "pages": 1, "is_color": False}


def _queue_single_pdf(pdf_bytes, filename, auto_verify, pages=1, user_id=None):
    doc_id = str(uuid.uuid4())
    cls = {**DEFAULT_CLASSIFICATION, "pages": pages}
    insert_document(doc_id, filename, "processing", classification=cls, user_id=user_id)
    store_pdf(doc_id, pdf_bytes)
    SSE("document_upload", {"doc_id": doc_id, "status": "processing"}, user_id=user_id)
    get_job_queue().enqueue(
        "document_processing",
        doc_id,
        process_document_background,
        doc_id,
        pdf_bytes,
        filename,
        auto_verify=auto_verify,
        user_id=user_id
    )
    return doc_id


def _process_upload_sync(content, filename, auto_verify, split, user_id=None):
    doc_ids = []
    if split:
        src = fitz.open(stream=content, filetype="pdf")
        total = len(src)
        if total < 2 or total % 2 != 0:
            src.close()
            raise ValueError(f"Split requires even page count, got {total}")
        for i in range(0, total, 2):
            part = fitz.open()
            part.insert_pdf(src, from_page=i, to_page=i + 1)
            part_bytes = part.tobytes()
            part.close()
            base = os.path.splitext(filename)[0]
            doc_ids.append(_queue_single_pdf(part_bytes, f"{base}_p{i//2+1}.pdf", auto_verify, pages=2, user_id=user_id))
        src.close()
    else:
        doc_ids.append(_queue_single_pdf(content, filename, auto_verify, pages=1, user_id=user_id))
    return doc_ids


@router.post("/api/upload")
async def upload_files(
    request: Request,
    files: List[UploadFile] = File(...),
    auto_verify: bool = Query(False),
    split: bool = Query(False),
):
    uid = request.state.user_id
    tasks = []
    for f in files:
        if not f.filename or not f.filename.lower().endswith(".pdf"):
            continue
        content = await f.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File exceeds maximum upload size")
        loop = asyncio.get_event_loop()
        tasks.append(loop.run_in_executor(None, _process_upload_sync, content, f.filename, auto_verify, split, uid))
    doc_ids = []
    for coro in asyncio.as_completed(tasks):
        doc_ids.extend(await coro)
    return {"message": f"Uploaded {len(doc_ids)} file(s)", "document_ids": doc_ids, "auto_verify": auto_verify}


@router.post("/api/batch/process-folder")
async def batch_process_folder(payload: BatchFolderRequest):
    uid = get_current_user_id()
    folder = payload.folder_path
    auto_verify = payload.auto_verify
    if not folder:
        raise HTTPException(status_code=400, detail="Invalid folder path")
    real_path = os.path.realpath(folder)
    allowed_base = os.environ.get("ALLOWED_BATCH_DIR", "")
    if allowed_base:
        allowed_base = os.path.realpath(allowed_base)
        if not real_path.startswith(allowed_base + os.sep) and real_path != allowed_base:
            raise HTTPException(status_code=403, detail="Access to this directory is not allowed")
    if not os.path.isdir(real_path):
        raise HTTPException(status_code=400, detail="Invalid folder path")
    pdfs = sorted(f for f in os.listdir(real_path) if f.lower().endswith(".pdf"))
    if not pdfs:
        raise HTTPException(status_code=400, detail="No PDFs found")
        
    loop = asyncio.get_running_loop()
    def _read_and_queue_all():
        queued = []
        for fn in pdfs:
            with open(os.path.join(real_path, fn), "rb") as f:
                data = f.read()
            doc_id = str(uuid.uuid4())
            insert_document(doc_id, fn, "processing", classification=DEFAULT_CLASSIFICATION, user_id=uid)
            store_pdf(doc_id, data)
            SSE("document_upload", {"doc_id": doc_id, "status": "processing"}, user_id=uid)
            get_job_queue().enqueue(
                "document_processing",
                doc_id,
                process_document_background,
                doc_id,
                data,
                fn,
                auto_verify=auto_verify,
                user_id=uid
            )
            queued.append(doc_id)
        return queued

    queued = await loop.run_in_executor(None, _read_and_queue_all)
    return {"message": f"Queued {len(queued)} files", "document_ids": queued}
