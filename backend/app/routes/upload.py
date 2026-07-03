import os
import uuid
from typing import List
from fastapi import APIRouter, UploadFile, File, Query, HTTPException, Request
import fitz
from app.config import TEMP_DIR, MAX_UPLOAD_SIZE
from app.database import insert_document, store_pdf
from app.pipeline import classify_document, ZOOM
from app.services.processing import get_executor, process_pdf_background

router = APIRouter()


@router.post("/api/upload")
async def upload_files(
    request: Request,
    files: List[UploadFile] = File(...),
    auto_verify: bool = Query(False, description="Auto-verify high-confidence results"),
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
        doc_id = str(uuid.uuid4())
        store_pdf(doc_id, content)

        temp_pdf = os.path.join(TEMP_DIR, f"{doc_id}_classify.pdf")
        with open(temp_pdf, "wb") as f:
            f.write(content)
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

        insert_document(doc_id, file.filename, "processing", classification=classification, escalation_level="level_1")
        doc_ids.append(doc_id)
        get_executor().submit(process_pdf_background, doc_id, auto_verify)

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
        store_pdf(doc_id, pdf_bytes)

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
        queued.append({"doc_id": doc_id, "filename": filename})
        get_executor().submit(process_pdf_background, doc_id, auto_verify)

    return {
        "message": f"Queued {len(queued)} PDFs for processing",
        "total": len(queued),
        "auto_verify": auto_verify,
        "documents": queued
    }
