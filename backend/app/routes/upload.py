import os
import uuid
import asyncio
from typing import List
from fastapi import APIRouter, UploadFile, File, Query, HTTPException, Request
import fitz
from app.config import TEMP_DIR, MAX_UPLOAD_SIZE
from app.database import insert_document, store_pdf
from app.image.pdf import classify_document, ZOOM
from app.services.processing import get_executor, process_pdf_background

router = APIRouter()


def _classify_pdf(pdf_bytes: bytes) -> dict:
    did = str(uuid.uuid4())
    temp_pdf = os.path.join(TEMP_DIR, f"{did}_classify.pdf")
    with open(temp_pdf, "wb") as f:
        f.write(pdf_bytes)
    try:
        doc = fitz.open(temp_pdf)
        page = doc[0]
        mat = fitz.Matrix(ZOOM, ZOOM)
        pix = page.get_pixmap(matrix=mat)
        first_page_path = os.path.join(TEMP_DIR, f"{did}_first_page.png")
        pix.save(first_page_path)
        try:
            cls = classify_document(first_page_path)
            cls["pages"] = len(doc)
            return cls
        finally:
            if os.path.exists(first_page_path):
                os.remove(first_page_path)
    except Exception:
        return {"type": "scanned", "dpi": 300, "pages": 1, "is_color": False}
    finally:
        if os.path.exists(temp_pdf):
            os.remove(temp_pdf)


DEFAULT_CLASSIFICATION = {"type": "scanned", "dpi": 300, "pages": 1, "is_color": False}


def _queue_single_pdf(pdf_bytes: bytes, filename: str, auto_verify: bool, pages: int = 1) -> str:
    doc_id = str(uuid.uuid4())
    cls = {**DEFAULT_CLASSIFICATION, "pages": pages}
    insert_document(doc_id, filename, "processing", classification=cls, escalation_level="level_1")
    store_pdf(doc_id, pdf_bytes)
    get_executor().submit(process_pdf_background, doc_id, auto_verify)
    return doc_id


def _process_upload_sync(content: bytes, filename: str, auto_verify: bool, split: bool) -> list:
    """Process a single uploaded file (sync, runs in thread). Returns list of doc_ids."""
    doc_ids = []
    if split:
        src_doc = fitz.open(stream=content, filetype="pdf")
        total = len(src_doc)
        print(f"Split upload: {filename} has {total} pages")
        if total < 2 or total % 2 != 0:
            src_doc.close()
            raise ValueError(f"Split requires an even number of pages, got {total}")
        for i in range(0, total, 2):
            split_doc = fitz.open()
            split_doc.insert_pdf(src_doc, from_page=i, to_page=i + 1)
            split_bytes = split_doc.tobytes()
            split_doc.close()
            base = os.path.splitext(filename)[0]
            part_name = f"{base}_p{i//2+1}.pdf"
            did = _queue_single_pdf(split_bytes, part_name, auto_verify, pages=2)
            doc_ids.append(did)
        src_doc.close()
        print(f"Split upload: created {len(doc_ids)} documents from {filename}")
    else:
        src_doc = fitz.open(stream=content, filetype="pdf")
        total_pages = len(src_doc)
        src_doc.close()
        did = _queue_single_pdf(content, filename, auto_verify, pages=total_pages)
        doc_ids.append(did)
    return doc_ids


@router.post("/api/upload")
async def upload_files(
    request: Request,
    files: List[UploadFile] = File(...),
    auto_verify: bool = Query(False, description="Auto-verify high-confidence results"),
    split: bool = Query(False, description="Split merged PDF into 2-page documents"),
):
    doc_ids = []
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            continue
        content = await file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File '{file.filename}' exceeds maximum upload size of {MAX_UPLOAD_SIZE // (1024*1024)} MB"
            )
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _process_upload_sync, content, file.filename, auto_verify, split)
        doc_ids.extend(result)

    return {"message": f"Successfully uploaded {len(doc_ids)} file(s)", "document_ids": doc_ids, "auto_verify": auto_verify}


@router.post("/api/batch/process-folder")
def batch_process_folder(payload: dict):
    folder_path = payload.get("folder_path", "")
    auto_verify = payload.get("auto_verify", False)

    if not folder_path or not os.path.isdir(folder_path):
        raise HTTPException(status_code=400, detail="Invalid folder path")

    pdfs = sorted([f for f in os.listdir(folder_path) if f.lower().endswith(".pdf")])
    if not pdfs:
        raise HTTPException(status_code=400, detail="No PDFs found in folder")

    queued = []
    for filename in pdfs:
        doc_id = str(uuid.uuid4())
        src = os.path.join(folder_path, filename)

        with open(src, "rb") as f:
            pdf_bytes = f.read()

        temp_pdf = os.path.join(TEMP_DIR, f"{doc_id}_classify.pdf")
        with open(temp_pdf, "wb") as f:
            f.write(pdf_bytes)
        try:
            doc = fitz.open(temp_pdf)
            page = doc[0]
            mat = fitz.Matrix(ZOOM, ZOOM)
            pix = page.get_pixmap(matrix=mat)
            first_page_path = os.path.join(TEMP_DIR, f"{doc_id}_first_page.png")
            pix.save(first_page_path)
            try:
                classification = classify_document(first_page_path)
                classification["pages"] = len(doc)
            finally:
                if os.path.exists(first_page_path):
                    os.remove(first_page_path)
        except Exception:
            classification = {"type": "scanned", "dpi": 300, "pages": 1, "is_color": False}
        finally:
            if os.path.exists(temp_pdf):
                os.remove(temp_pdf)

        insert_document(doc_id, filename, "processing", classification=classification, escalation_level="level_1")
        store_pdf(doc_id, pdf_bytes)
        queued.append({"doc_id": doc_id, "filename": filename})
        get_executor().submit(process_pdf_background, doc_id, auto_verify)

    return {
        "message": f"Queued {len(queued)} PDFs for processing",
        "total": len(queued),
        "auto_verify": auto_verify,
        "documents": queued
    }
