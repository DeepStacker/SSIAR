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


def _get_azure_scale(doc_id: str, page_num: int, img_w: int, img_h: int) -> tuple[float, float]:
    """Compute scale factors from Azure coordinate space to actual image pixel space."""
    from app.database import get_db_connection, put_conn
    import json
    
    scaled_azure_w = 2483.0  # default fallback (A4 at 300 DPI)
    scaled_azure_h = 3508.0
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
        row = cur.fetchone()
        if row and row[0]:
            try:
                raw_dict = json.loads(row[0])
                for p in raw_dict.get("pages", []):
                    p_num = p.get("pageNumber", p.get("page", 1))
                    if p_num == page_num:
                        w_val = p.get("width", 0.0)
                        h_val = p.get("height", 0.0)
                        unit_val = p.get("unit", "inch")
                        scale_val = 300.0 if unit_val == "inch" else 1.0
                        scaled_azure_w = w_val * scale_val
                        scaled_azure_h = h_val * scale_val
                        break
            except Exception:
                pass
    finally:
        put_conn(conn)
    
    return img_w / scaled_azure_w, img_h / scaled_azure_h


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

    # Check if a dynamic V2 bounding box/polygon and page exist in form_data
    doc = get_document(doc_id)
    if doc:
        confidence_scores = doc.get("confidence_scores", {})
        v2_trust = confidence_scores.get("v2_trust", {}) if isinstance(confidence_scores, dict) else {}
        field_info = v2_trust.get(crop_name, {}) if isinstance(v2_trust, dict) else {}
        polygon = field_info.get("polygon")
        bbox = field_info.get("bbox")
        res_page = field_info.get("page")
        
        # For checkbox questions, dynamically compute row bbox from Azure selection marks
        if not bbox and not polygon and crop_name.startswith("q"):
            from app.database import get_db_connection, put_conn
            from app.processing.azure_processor import normalize_azure_response
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
                
            if raw_responses_str:
                try:
                    import json
                    raw_dict = json.loads(raw_responses_str)
                    norm = normalize_azure_response(doc_id, raw_dict)
                    q_num = int(crop_name[1:])
                    is_page_2 = q_num >= 13
                    target_page = 2 if is_page_2 else 1
                    
                    page = next((p for p in norm.pages if p.page == target_page), None)
                    if page:
                        sel_marks = [el for el in page.elements if el.element_type == "selection_mark"]
                        rows = []
                        for mark in sel_marks:
                            my = mark.bbox[1]
                            found_row = False
                            for r in rows:
                                if abs(r[0].bbox[1] - my) < 50.0:
                                    r.append(mark)
                                    found_row = True
                                    break
                            if not found_row:
                                rows.append([mark])
                        for r in rows:
                            r.sort(key=lambda m: m.bbox[0])
                        rows.sort(key=lambda r: sum(m.bbox[1] for m in r) / len(r))
                        
                        if not is_page_2:
                            q_rows = [r for r in rows if (sum(m.bbox[1] for m in r) / len(r)) >= 1200.0]
                            row_idx = q_num - 1
                        else:
                            q_rows = rows
                            row_idx = q_num - 13
                            
                        if 0 <= row_idx < len(q_rows):
                            target_row = q_rows[row_idx]
                            # Center vertically on checkboxes, span full checkbox column width
                            ry_center = sum((m.bbox[1] + m.bbox[3]) / 2.0 for m in target_row) / len(target_row)
                            scale_pt = 300.0 / 72.0
                            row_height_px = 35.0 * scale_pt
                            
                            rx0 = 230.0 * scale_pt
                            rx1 = 545.0 * scale_pt
                            ry0 = ry_center - row_height_px / 2.0
                            ry1 = ry_center + row_height_px / 2.0
                            
                            bbox = [rx0, ry0, rx1, ry1]
                            res_page = target_page
                except Exception:
                    pass
                    
        if (polygon or bbox) and res_page:
            aligned_img = _get_page(doc_id, res_page)
            if aligned_img is not None:
                h_img, w_img = aligned_img.shape[:2]
                
                # Compute scale factors from Azure coordinate space to actual image pixels
                scale_x, scale_y = _get_azure_scale(doc_id, res_page, w_img, h_img)
                
                crop = None
                
                # === PRIMARY: Polygon-based perspective crop ===
                if polygon and len(polygon) >= 8:
                    import numpy as np
                    # polygon is [x0,y0, x1,y1, x2,y2, x3,y3] — 4 corners
                    pts = []
                    for i in range(0, 8, 2):
                        px = polygon[i] * scale_x
                        py = polygon[i+1] * scale_y
                        pts.append([px, py])
                    pts = np.array(pts, dtype=np.float32)
                    
                    # Determine output width/height from the polygon edges
                    w1 = np.linalg.norm(pts[1] - pts[0])
                    w2 = np.linalg.norm(pts[2] - pts[3])
                    h1 = np.linalg.norm(pts[3] - pts[0])
                    h2 = np.linalg.norm(pts[2] - pts[1])
                    out_w = int(max(w1, w2))
                    out_h = int(max(h1, h2))
                    
                    if out_w > 5 and out_h > 5:
                        # Add padding
                        pad_x = int(out_w * 0.08)
                        pad_y = int(out_h * 0.12)
                        
                        # Expand polygon outward for padding
                        center = pts.mean(axis=0)
                        padded_pts = pts.copy()
                        for i in range(4):
                            direction = pts[i] - center
                            norm = np.linalg.norm(direction)
                            if norm > 0:
                                padded_pts[i] = pts[i] + direction / norm * max(pad_x, pad_y)
                        
                        # Clamp to image bounds
                        padded_pts[:, 0] = np.clip(padded_pts[:, 0], 0, w_img - 1)
                        padded_pts[:, 1] = np.clip(padded_pts[:, 1], 0, h_img - 1)
                        
                        out_w_padded = out_w + 2 * pad_x
                        out_h_padded = out_h + 2 * pad_y
                        
                        dst = np.array([
                            [0, 0],
                            [out_w_padded - 1, 0],
                            [out_w_padded - 1, out_h_padded - 1],
                            [0, out_h_padded - 1]
                        ], dtype=np.float32)
                        
                        M = cv2.getPerspectiveTransform(padded_pts, dst)
                        crop = cv2.warpPerspective(aligned_img, M, (out_w_padded, out_h_padded),
                                                   flags=cv2.INTER_CUBIC,
                                                   borderMode=cv2.BORDER_REPLICATE)
                
                # === FALLBACK: Axis-aligned bbox crop ===
                if crop is None and bbox:
                    x0, y0, x1, y1 = [int(val) for val in bbox]
                    x0 = int(x0 * scale_x)
                    y0 = int(y0 * scale_y)
                    x1 = int(x1 * scale_x)
                    y1 = int(y1 * scale_y)
                    
                    pad_x = int(35 * scale_x)
                    pad_y = int(20 * scale_y)
                    x0 = max(0, x0 - pad_x)
                    y0 = max(0, y0 - pad_y)
                    x1 = min(w_img, x1 + pad_x)
                    y1 = min(h_img, y1 + pad_y)
                    crop = aligned_img[y0:y1, x0:x1]
                
                if crop is not None and crop.size > 0:
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


@router.get("/api/queue-status")
def queue_status():
    from app.processing.jobs.document_jobs import get_worker_count
    from app.database import get_all_documents
    docs = get_all_documents()
    levels = {"level_1": 0, "level_2": 0, "level_3": 0, "level_4": 0}
    for d in docs:
        lev = d.get("escalation_level", "level_1")
        if lev in levels:
            levels[lev] += 1
            
    return {
        "total": len(docs),
        "processing": len([d for d in docs if d["status"] == "processing"]),
        "needs_review": len([d for d in docs if d["status"] in ("needs_review", "review_required")]),
        "verified": len([d for d in docs if d["status"] in ("verified", "approved")]),
        "failed": len([d for d in docs if d["status"] == "failed"]),
        "workers": get_worker_count(),
        "by_escalation": levels,
    }


@router.get("/api/events")
async def event_stream():
    import json
    from app.sse import subscribe, unsubscribe
    uid = get_current_user_id()
    queue = subscribe(user_id=uid)
    try:
        from fastapi.responses import StreamingResponse
        async def gen():
            # Send initial connection verification message
            yield f"data: {json.dumps({'event': 'connected', 'data': {}})}\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(msg)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Content-Encoding": "none",
            }
        )
    finally:
        unsubscribe(queue)