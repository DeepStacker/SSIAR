"""
Documents API (V2)
====================
Clean V2 implementation — no backward compatibility.
"""
import asyncio
import cv2
import numpy as np
import os
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response, FileResponse, StreamingResponse
from app.auth import require_auth, get_current_user_id
from app.database import (
    get_document, get_all_documents, delete_document as db_delete,
    bulk_delete_documents, update_document_status, insert_or_update_form_data,
    log_correction_data, get_edit_history, get_page_image,
)
from app.schemas import VerifyDataRequest, BulkRequest
from app.sse import notify as SSE
from app.image.crops import extract_crop, get_crop_page
from app.config import TEMP_DIR, R2_PUBLIC_URL, use_r2
from app.image.storage import PROCESSED_DIR, get_roi_file, store_roi_file, get_page_image_file

_cache_page = {}
_page_order: list = []


def _get_page(doc_id: str, page_num: int) -> np.ndarray | None:
    key = (doc_id, page_num)
    if key in _cache_page:
        return _cache_page[key]
    img_bytes = get_page_image(doc_id, page_num)
    if not img_bytes:
        return None
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if len(_cache_page) >= 4:
        oldest = _page_order.pop(0)
        _cache_page.pop(oldest, None)
    _cache_page[key] = img
    _page_order.append(key)
    return img


_cache_crop: dict[tuple[str, str], bytes] = {}
_crop_order: list = []


def _cache_crop_set(key: tuple[str, str], value: bytes):
    if len(_cache_crop) >= 256:
        oldest = _crop_order.pop(0)
        _cache_crop.pop(oldest, None)
    _cache_crop[key] = value
    _crop_order.append(key)

router = APIRouter(dependencies=[Depends(require_auth)])


@router.get("/api/documents")
def list_documents():
    return get_all_documents()


@router.get("/api/documents/{doc_id}")
def get_document_details(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/api/documents/{doc_id}/status")
def get_status(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    cs = doc.get("confidence_scores", {}) or {}
    return {
        "document_id": doc_id,
        "status": doc.get("status"),
        "escalation_level": doc.get("escalation_level"),
        "created_at": doc.get("created_at"),
        "has_confidence_scores": bool(cs),
        "verified": doc.get("verified_by_human", 0),
    }


@router.get("/api/documents/{doc_id}/confidence")
def get_confidence(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    cs = doc.get("confidence_scores", {}) or {}
    return {
        "document_id": doc_id,
        "trust_confidence": cs.get("v2_trust", {}),
        "cross_field_penalty": cs.get("cross_field_penalty", 0),
        "cross_field_reason": cs.get("cross_field_reason", ""),
        "review_fields": cs.get("review_fields", []),
    }


@router.get("/api/pages/{doc_id}/{page_num}")
@router.get("/api/documents/{doc_id}/page/{page_num}")
def serve_page(doc_id: str, page_num: int):
    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/pages/{doc_id}/page_{page_num}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    page_path = PROCESSED_DIR / doc_id / f"page_{page_num}.jpg"
    if page_path.exists():
        return FileResponse(str(page_path), media_type="image/jpeg",
                            headers={"Cache-Control": "public, max-age=86400"})

    img_bytes = get_page_image_file(doc_id, page_num)
    if img_bytes:
        return Response(content=img_bytes, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})

    # Fallback to DB
    img = get_page_image(doc_id, page_num)
    if img:
        return Response(content=img, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})

    raise HTTPException(status_code=404, detail="Page not found")


@router.get("/api/crops/{doc_id}/{filename}")
def serve_crop(doc_id: str, filename: str):
    crop_name = filename.replace('.png', '')
    cache_key = (doc_id, crop_name)

    if cache_key in _cache_crop:
        return Response(content=_cache_crop[cache_key], media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=3600"})

    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/rois/{doc_id}/roi_{crop_name}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    roi_bytes = get_roi_file(doc_id, crop_name)
    if roi_bytes:
        _cache_crop_set(cache_key, roi_bytes)
        return Response(content=roi_bytes, media_type="image/jpeg",
                        headers={"Cache-Control": "private, max-age=86400"})

    # Check if a dynamic V2 bounding box and page exist in form_data
    doc = get_document(doc_id)
    if doc:
        confidence_scores = doc.get("confidence_scores", {})
        v2_trust = confidence_scores.get("v2_trust", {}) if isinstance(confidence_scores, dict) else {}
        field_info = v2_trust.get(crop_name, {})
        bbox = field_info.get("bbox")
        res_page = field_info.get("page")
        if bbox and res_page:
            aligned_img = _get_page(doc_id, res_page)
            if aligned_img is not None:
                h_img, w_img = aligned_img.shape[:2]
                x0, y0, x1, y1 = [int(val) for val in bbox]
                # Add a comfort padding of 15 pixels
                pad = 15
                x0 = max(0, x0 - pad)
                y0 = max(0, y0 - pad)
                x1 = min(w_img, x1 + pad)
                y1 = min(h_img, y1 + pad)
                crop = aligned_img[y0:y1, x0:x1]
                
                _, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
                crop_bytes = buf.tobytes()
                _cache_crop_set(cache_key, crop_bytes)
                store_roi_file(doc_id, crop_name, crop)
                return Response(content=crop_bytes, media_type="image/jpeg",
                                headers={"Cache-Control": "public, max-age=3600"})

    # Fallback to legacy coordinate-based cropping
    page_num = get_crop_page(crop_name)
    aligned_img = _get_page(doc_id, page_num)

    if aligned_img is None:
        legacy_path = os.path.join(os.path.dirname(TEMP_DIR), "processed", doc_id, filename)
        if os.path.exists(legacy_path):
            return FileResponse(legacy_path)
        raise HTTPException(status_code=404, detail="Crop not found")

    crop = extract_crop(aligned_img, crop_name)
    if crop is None or crop.size == 0:
        legacy_path = os.path.join(os.path.dirname(TEMP_DIR), "processed", doc_id, filename)
        if os.path.exists(legacy_path):
            return FileResponse(legacy_path)
        raise HTTPException(status_code=404, detail="Crop region not found")

    _, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
    crop_bytes = buf.tobytes()
    _cache_crop_set(cache_key, crop_bytes)
    store_roi_file(doc_id, crop_name, crop)
    return Response(content=crop_bytes, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=3600"})


@router.post("/api/documents/{doc_id}/verify")
def verify_document(doc_id: str, payload: VerifyDataRequest):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    cs = doc.get("confidence_scores", {}) or {}
    ocr_conf = cs.get("ocr", {})
    fields_to_compare = {
        "roll_number": payload.roll_number,
        "class": payload.class_val,
        "dob": payload.dob,
        "gender": payload.gender,
        "math_pct": payload.academic_scores.get("math_pct", ""),
        "science_pct": payload.academic_scores.get("science_pct", ""),
        "language_pct": payload.academic_scores.get("language_pct", ""),
        "rank": payload.academic_scores.get("rank", ""),
    }
    for fn, cv in fields_to_compare.items():
        orig = doc.get(fn) or doc.get("academic_scores", {}).get(fn, "")
        if orig != cv:
            log_correction_data(doc_id, fn, f"db://{doc_id}/{fn}", orig, cv, ocr_conf.get(fn, 1.0), "human_review_v2")
    
    insert_or_update_form_data(
        doc_id=doc_id, roll_number=payload.roll_number, class_val=payload.class_val,
        dob=payload.dob, gender=payload.gender, consent=payload.consent,
        responses=payload.responses, academic_scores=payload.academic_scores,
        remarks=payload.remarks, confidence_scores=cs, verified=1,
    )
    update_document_status(doc_id, "verified", doc.get("escalation_level", "level_1"))
    SSE("document_updated", {"doc_id": doc_id, "status": "verified"}, user_id=get_current_user_id())
    return {"message": "Form successfully verified"}


@router.get("/api/documents/{doc_id}/history")
def get_history(doc_id: str):
    return {"document_id": doc_id, "history": get_edit_history(doc_id)}


@router.delete("/api/documents/{doc_id}")
def remove_document(doc_id: str):
    if not get_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    db_delete(doc_id)
    SSE("document_deleted", {"doc_id": doc_id}, user_id=get_current_user_id())
    return {"message": "Document deleted"}


@router.post("/api/documents/bulk-delete")
def bulk_delete(payload: BulkRequest):
    count = bulk_delete_documents(payload.doc_ids)
    SSE("documents_bulk_deleted", {"count": count}, user_id=get_current_user_id())
    return {"message": f"Deleted {count} document(s)"}


@router.post("/api/documents/bulk-verify")
def bulk_verify(payload: BulkRequest):
    count = 0
    for doc_id in payload.doc_ids:
        doc = get_document(doc_id)
        if doc and doc["status"] != "verified":
            update_document_status(doc_id, "verified", "level_1")
            count += 1
    SSE("documents_bulk_verified", {"count": count}, user_id=get_current_user_id())
    return {"message": f"Verified {count} document(s)"}


@router.post("/api/documents/{doc_id}/reprocess")
def reprocess_document(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    from app.database import get_pdf
    pdf_bytes = get_pdf(doc_id)
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Original PDF data not found")
    update_document_status(doc_id, "processing")
    
    from app.processing.jobs.document_jobs import get_job_queue, process_document_background
    get_job_queue().enqueue(
        "document_processing",
        doc_id,
        process_document_background,
        doc_id,
        pdf_bytes,
        doc["filename"],
        auto_verify=False,
        user_id=get_current_user_id()
    )
    SSE("document_updated", {"doc_id": doc_id, "status": "processing"}, user_id=get_current_user_id())
    return {"message": "Reprocessing started", "doc_id": doc_id}


@router.post("/api/documents/bulk-reprocess")
def bulk_reprocess(payload: BulkRequest):
    from app.database import get_pdf
    from app.processing.jobs.document_jobs import get_job_queue, process_document_background
    count = 0
    for doc_id in payload.doc_ids:
        doc = get_document(doc_id)
        if doc:
            pdf_bytes = get_pdf(doc_id)
            if pdf_bytes:
                update_document_status(doc_id, "processing")
                get_job_queue().enqueue(
                    "document_processing",
                    doc_id,
                    process_document_background,
                    doc_id,
                    pdf_bytes,
                    doc["filename"],
                    auto_verify=False,
                    user_id=get_current_user_id()
                )
                count += 1
    return {"message": f"Reprocessing {count} document(s)"}


@router.post("/api/documents/{doc_id}/reprocess-field/{field_name}")
def reprocess_field(doc_id: str, field_name: str):
    from app.database import get_db_connection, put_conn
    from app.processing.templates import get_field_definition
    from app.processing.field_resolver import resolve_field, normalize_value
    
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    fd = get_field_definition("sdq_student_form_v1", field_name)
    if not fd:
        raise HTTPException(status_code=400, detail=f"Invalid field: {field_name}")
        
    # Get raw responses from database
    conn = get_db_connection()
    raw_responses_str = None
    try:
        cur = conn.cursor()
        cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
        row = cur.fetchone()
        if row:
            raw_responses_str = row[0]
    finally:
        put_conn(conn)
        
    if not raw_responses_str:
        # Fallback: reprocess the whole document
        from app.database import get_pdf
        pdf_bytes = get_pdf(doc_id)
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Raw PDF data not found to reprocess")
        from app.processing.jobs.document_jobs import get_job_queue, process_document_background
        get_job_queue().enqueue(
            "document_processing",
            doc_id,
            process_document_background,
            doc_id,
            pdf_bytes,
            doc["filename"],
            auto_verify=False,
            user_id=get_current_user_id()
        )
        return {
            "field_name": field_name,
            "value": "",
            "engine": "azure",
            "confidence": 0.0,
            "valid": False,
            "updated": True,
            "message": "Enqueued full document reprocessing task"
        }
        
    # Re-normalize/re-combine raw response and resolve the single field
    import json
    from app.processing.azure_processor import normalize_azure_response
    from app.processing.types import NormalizedAzureResponse
    
    raw_responses = json.loads(raw_responses_str)
    combined = NormalizedAzureResponse(document_id=doc_id)
    for k, v in raw_responses.items():
        if v:
            # Recreate normalized page elements
            normalized = normalize_azure_response(f"{doc_id}_{k}", v)
            combined.pages.extend(normalized.pages)
            
    text, conf, found, bbox, page_num = resolve_field(fd, combined)
    if not found:
        return {
            "field_name": field_name,
            "value": "",
            "engine": "azure",
            "confidence": 0.0,
            "valid": False,
            "updated": False,
            "message": "Field not found in OCR elements"
        }
        
    normalized_text = normalize_value(text, fd.type)
    
    # Save the updated field value back to form_data table
    from app.database import insert_or_update_form_data
    roll_number = doc.get("roll_number") or ""
    class_val = doc.get("class") or ""
    dob = doc.get("dob") or ""
    gender = doc.get("gender") or ""
    consent = doc.get("consent") or "Unanswered"
    remarks = doc.get("remarks") or ""
    academic_scores = doc.get("academic_scores") or {}
    responses = doc.get("responses") or {}
    confidence_scores = doc.get("confidence_scores") or {}
    
    # Map resolved value to the correct field
    if field_name == "roll_number":
        roll_number = normalized_text
    elif field_name == "class":
        class_val = normalized_text
    elif field_name == "dob":
        dob = normalized_text
    elif field_name == "gender":
        gender = normalized_text
    elif field_name == "consent":
        consent = normalized_text
    elif field_name == "remarks":
        remarks = normalized_text
    elif field_name in ("math_pct", "science_pct", "language_pct", "rank"):
        academic_scores[field_name] = normalized_text
        
    insert_or_update_form_data(
        doc_id=doc_id,
        roll_number=roll_number,
        class_val=class_val,
        dob=dob,
        gender=gender,
        consent=consent,
        responses=responses,
        academic_scores=academic_scores,
        remarks=remarks,
        confidence_scores=confidence_scores,
        verified=doc.get("verified_by_human", 0)
    )
    
    SSE("document_updated", {"doc_id": doc_id, "status": doc["status"]}, user_id=get_current_user_id())
    
    return {
        "field_name": field_name,
        "value": normalized_text,
        "engine": "azure",
        "confidence": conf,
        "valid": True,
        "updated": True
    }


@router.get("/api/events")
async def event_stream():
    from app.sse import subscribe, unsubscribe
    uid = get_current_user_id()
    queue = subscribe(user_id=uid)
    try:
        from fastapi.responses import StreamingResponse
        async def gen():
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"event: {msg['event']}\ndata: {msg['data']}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        return StreamingResponse(gen(), media_type="text/event-stream")
    finally:
        unsubscribe(queue)