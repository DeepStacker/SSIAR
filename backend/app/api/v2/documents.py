"""
Documents API (V2)
====================
Clean V2 implementation — no backward compatibility.
"""
import asyncio
import threading
from typing import Optional
from datetime import datetime
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
    get_db_connection, put_conn,
)
from app.image.storage import delete_document_files
from app.models import VerifyDataRequest, BulkRequest
from app.core.events import notify as SSE
from app.image.crops import extract_crop, get_crop_page, generate_crop_jpeg
from app.image.page_utils import get_page, get_azure_scale, cache_crop_set, cache_page_set, _cache_crop, _cache_page_jpeg
from app.image.coordinate_resolver import (
    get_sdq_row_polygon_from_table,
    get_field_polygon_from_table,
    get_rank_polygon,
    get_static_fallback_polygon,
    scale_coordinates_to_image_size,
)
from app.config import TEMP_DIR, R2_PUBLIC_URL, use_r2
from app.image.storage import PROCESSED_DIR, get_roi_file, store_roi_file, get_page_image_file

router = APIRouter(dependencies=[Depends(require_auth)])


@router.get("/api/documents")
async def list_documents():
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, get_all_documents)


@router.get("/api/documents/{doc_id}")
async def get_document_details(doc_id: str):
    loop = asyncio.get_running_loop()
    doc = await loop.run_in_executor(None, get_document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    _enrich_coordinates(doc, doc_id)

    return doc


def _enrich_coordinates(doc: dict, doc_id: str) -> None:
    try:
        if "confidence_scores" not in doc or not isinstance(doc["confidence_scores"], dict):
            return
        cs = doc["confidence_scores"]
        if "v2_trust" not in cs or not isinstance(cs["v2_trust"], dict):
            cs["v2_trust"] = {}
        v2 = cs["v2_trust"]

        from app.database import get_db_connection, put_conn, USE_POSTGRES
        import json
        conn = get_db_connection()
        raw_dict = None
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT raw_response FROM azure_responses WHERE document_id = %s" if USE_POSTGRES else
                "SELECT raw_response FROM azure_responses WHERE document_id = ?",
                (doc_id,)
            )
            row = cur.fetchone()
            if row and row[0]:
                raw_dict = json.loads(row[0])
        finally:
            put_conn(conn)

        if raw_dict:
            for q_num in range(1, 26):
                q_key = f"q{q_num}"
                expected_page = 2 if q_num >= 13 else 1
                if q_key not in v2 or not v2[q_key].get("polygon"):
                    tbl_res = get_sdq_row_polygon_from_table(raw_dict, q_num)
                    if tbl_res:
                        poly, page_num = tbl_res
                        v2[q_key] = {"page": page_num, "polygon": poly}
                elif q_key in v2:
                    v2[q_key]["page"] = expected_page

            field_pages = {
                "roll_number": 1, "class": 1, "dob": 1, "gender": 1,
                "math_pct": 2, "science_pct": 2, "language_pct": 2
            }
            for field_name, expected_page in field_pages.items():
                if field_name not in v2 or not v2[field_name].get("polygon"):
                    res = get_field_polygon_from_table(raw_dict, field_name)
                    if res:
                        poly, page_num = res
                        v2[field_name] = {"page": page_num, "polygon": poly}
                elif field_name in v2:
                    v2[field_name]["page"] = expected_page

            if "rank" not in v2 or not v2["rank"].get("polygon"):
                res = get_rank_polygon(raw_dict)
                if res:
                    poly, page_num = res
                    v2["rank"] = {"page": page_num, "polygon": poly}
            elif "rank" in v2:
                v2["rank"]["page"] = 2

        all_enrich_fields = [
            "roll_number", "class", "dob", "gender",
            "math_pct", "science_pct", "language_pct", "rank",
            "consent", "remarks"
        ]
        for field_name in all_enrich_fields:
            if field_name not in v2 or not v2[field_name].get("polygon"):
                fallback = get_static_fallback_polygon(field_name)
                if fallback:
                    poly, page_num = fallback
                    v2[field_name] = {"page": page_num, "polygon": poly}

        if "consent" not in v2 or not v2["consent"].get("polygon"):
            v2["consent"] = {"page": 1, "polygon": [1550, 920, 2050, 920, 2050, 1070, 1550, 1070]}
        else:
            v2["consent"]["page"] = 1

        if "remarks" not in v2 or not v2["remarks"].get("polygon"):
            v2["remarks"] = {"page": 2, "polygon": [200, 2300, 2400, 2300, 2400, 2980, 200, 2980]}
        else:
            v2["remarks"]["page"] = 2

        scale_coordinates_to_image_size(doc_id, v2)
    except Exception as e:
        print(f"Error during coordinate enrichment: {e}")


@router.get("/api/pages/{doc_id}/{page_num}")
def serve_page(doc_id: str, page_num: int):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Page not found")

    cache_key = (doc_id, page_num)
    if cache_key in _cache_page_jpeg:
        return Response(content=_cache_page_jpeg[cache_key], media_type="image/jpeg",
                        headers={
                            "Cache-Control": "public, max-age=86400",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "GET"
                        })

    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/pages/{doc_id}/page_{page_num}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    # 1. Try file system for exact requested page, fallback to page 1 if page 2 not found
    page_path = PROCESSED_DIR / doc_id / f"page_{page_num}.jpg"
    if not page_path.exists() and page_num == 2:
        page_path = PROCESSED_DIR / doc_id / "page_1.jpg"
        
    if page_path.exists():
        return FileResponse(str(page_path), media_type="image/jpeg",
                            headers={
                                "Cache-Control": "public, max-age=86400",
                                "Access-Control-Allow-Origin": "*",
                                "Access-Control-Allow-Methods": "GET"
                            })

    # 2. Try database files
    img_bytes = get_page_image_file(doc_id, page_num)
    if not img_bytes and page_num == 2:
        img_bytes = get_page_image_file(doc_id, 1)
    if img_bytes:
        cache_page_set(cache_key, img_bytes)
        return Response(content=img_bytes, media_type="image/jpeg",
                        headers={
                            "Cache-Control": "public, max-age=86400",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "GET"
                        })

    # 3. Try database page_images
    img = get_page_image(doc_id, page_num)
    if not img and page_num == 2:
        img = get_page_image(doc_id, 1)
    if img:
        cache_page_set(cache_key, img)
        return Response(content=img, media_type="image/jpeg",
                        headers={
                            "Cache-Control": "public, max-age=86400",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "GET"
                        })

    raise HTTPException(status_code=404, detail="Page not found")








@router.get("/api/crops/{doc_id}/{filename}")
def serve_crop(doc_id: str, filename: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Crop not found")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    crop_name = filename.replace('.png', '')
    cache_key = (doc_id, crop_name)

    if cache_key in _cache_crop:
        return Response(content=_cache_crop[cache_key], media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/rois/{doc_id}/roi_{crop_name}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    roi_bytes = get_roi_file(doc_id, crop_name)
    if roi_bytes:
        cache_crop_set(cache_key, roi_bytes)
        return Response(content=roi_bytes, media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

    crop_bytes = generate_crop_jpeg(doc_id, crop_name)
    if crop_bytes is not None:
        cache_crop_set(cache_key, crop_bytes)
        return Response(content=crop_bytes, media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

    # Legacy fallback
    page_num = get_crop_page(crop_name)
    aligned_img = get_page(doc_id, page_num)
    if aligned_img is None:
        legacy_path = os.path.join(os.path.dirname(TEMP_DIR), "processed", doc_id, crop_name + ".png")
        if os.path.exists(legacy_path):
            return FileResponse(legacy_path)
        raise HTTPException(status_code=404, detail="Crop not found")

    crop = extract_crop(aligned_img, crop_name)
    if crop is None or crop.size == 0:
        legacy_path = os.path.join(os.path.dirname(TEMP_DIR), "processed", doc_id, crop_name + ".png")
        if os.path.exists(legacy_path):
            return FileResponse(legacy_path)
        raise HTTPException(status_code=404, detail="Crop region not found")

    _, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
    crop_bytes = buf.tobytes()
    cache_crop_set(cache_key, crop_bytes)
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
            raw_conf = ocr_conf.get(fn, 1.0)
            try:
                conf_val = float(raw_conf)
            except (TypeError, ValueError):
                conf_val = 1.0
            log_correction_data(doc_id, fn, f"db://{doc_id}/{fn}", orig, cv, conf_val, "human_review_v2")
    
    insert_or_update_form_data(
        doc_id=doc_id, roll_number=payload.roll_number, class_val=payload.class_val,
        dob=payload.dob, gender=payload.gender, consent=payload.consent,
        responses=payload.responses, academic_scores=payload.academic_scores,
        remarks=payload.remarks, confidence_scores=cs, verified=1,
    )
    update_document_status(doc_id, "verified", doc.get("escalation_level", "level_1"))
    
    # Automatically complete any pending review tasks for this document
    from app.database import USE_POSTGRES
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, field_name FROM review_tasks WHERE document_id = %s AND status = 'pending'" if USE_POSTGRES else
            "SELECT id, field_name FROM review_tasks WHERE document_id = ? AND status = 'pending'",
            (doc_id,)
        )
        pending_tasks = cur.fetchall()
        now_str = datetime.now().isoformat()
        reviewer_id = get_current_user_id() or "system"
        
        for task in pending_tasks:
            task_id = task["id"]
            field_name = task["field_name"]
            
            # Map corrected value from the verification payload
            val = None
            if field_name == "roll_number":
                val = payload.roll_number
            elif field_name == "class":
                val = payload.class_val
            elif field_name == "dob":
                val = payload.dob
            elif field_name == "gender":
                val = payload.gender
            elif field_name == "consent":
                val = payload.consent
            elif field_name == "remarks":
                val = payload.remarks
            elif field_name in ("math_pct", "science_pct", "language_pct", "rank"):
                val = payload.academic_scores.get(field_name, "")
            elif field_name.startswith("q") and field_name[1:].isdigit():
                q_val = payload.responses.get(field_name, 0)
                if isinstance(q_val, list):
                    val = ",".join(map(str, q_val))
                else:
                    val = str(q_val)
                    
            if val is not None:
                cur.execute(
                    "UPDATE review_tasks SET corrected_value = %s, status = 'completed', reviewer_id = %s, reviewed_at = %s WHERE id = %s" if USE_POSTGRES else
                    "UPDATE review_tasks SET corrected_value = ?, status = 'completed', reviewer_id = ?, reviewed_at = ? WHERE id = ?",
                    (val, reviewer_id, now_str, task_id)
                )
        conn.commit()
    except Exception as e:
        print(f"Failed to auto-resolve review tasks for {doc_id}: {e}")
    finally:
        put_conn(conn)

    SSE("document_updated", {"doc_id": doc_id, "status": "verified"}, user_id=get_current_user_id())
    return {"message": "Form successfully verified"}


@router.get("/api/documents/{doc_id}/history")
def get_history(doc_id: str):
    return {"document_id": doc_id, "history": get_edit_history(doc_id)}


@router.delete("/api/documents/{doc_id}")
def remove_document(doc_id: str):
    uid = get_current_user_id()
    if not get_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    db_delete(doc_id, user_id=uid, cleanup=False)
    threading.Thread(target=delete_document_files, args=(doc_id,), daemon=True).start()
    SSE("document_deleted", {"doc_id": doc_id}, user_id=get_current_user_id())
    return {"message": "Document deleted"}


@router.post("/api/documents/bulk-delete")
def bulk_delete(payload: BulkRequest):
    count = bulk_delete_documents(payload.doc_ids, cleanup=False)
    threading.Thread(target=_cleanup_files, args=(payload.doc_ids,), daemon=True).start()
    SSE("documents_bulk_deleted", {"count": count}, user_id=get_current_user_id())
    return {"message": f"Deleted {count} document(s)"}


def _cleanup_files(doc_ids: list[str]):
    for doc_id in doc_ids:
        try:
            delete_document_files(doc_id)
        except Exception:
            pass


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


@router.post("/api/documents/recover-stuck")
def recover_stuck_documents():
    from datetime import datetime, timedelta
    from app.database import get_db_connection, put_conn, USE_POSTGRES
    cutoff = (datetime.now() - timedelta(minutes=10)).isoformat()
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, filename FROM documents WHERE status = 'processing' AND created_at < %s" if USE_POSTGRES else
            "SELECT id, filename FROM documents WHERE status = 'processing' AND created_at < ?",
            (cutoff,)
        )
        stuck = cur.fetchall()
        if not stuck:
            return {"recovered": 0, "message": "No stuck documents found"}
        cur.execute(
            "UPDATE documents SET status = 'failed', escalation_level = 'level_4' WHERE status = 'processing' AND created_at < %s" if USE_POSTGRES else
            "UPDATE documents SET status = 'failed', escalation_level = 'level_4' WHERE status = 'processing' AND created_at < ?",
            (cutoff,)
        )
        conn.commit()
        for row in stuck:
            doc_id = row[0]
            SSE("document_updated", {
                "doc_id": doc_id, "status": "failed", "escalation_level": "level_4"
            })
        return {
            "recovered": len(stuck),
            "message": f"Marked {len(stuck)} stuck document(s) as failed"
        }
    finally:
        put_conn(conn)


@router.post("/api/documents/{doc_id}/reprocess")
def reprocess_document(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    from app.database import get_pdf
    pdf_bytes = get_pdf(doc_id)
    
    # Check if page images exist in the file system
    has_page_images = False
    from app.image.storage import PROCESSED_DIR
    page_1_path = PROCESSED_DIR / doc_id / "page_1.jpg"
    if page_1_path.exists():
        has_page_images = True
        
    if not pdf_bytes and not has_page_images:
        raise HTTPException(status_code=400, detail="Original PDF data or processed page images not found")
        
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
    from app.database import USE_POSTGRES
    conn = get_db_connection()
    raw_responses_str = None
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT raw_response FROM azure_responses WHERE document_id = %s" if USE_POSTGRES else
            "SELECT raw_response FROM azure_responses WHERE document_id = ?",
            (doc_id,)
        )
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
    from app.core.types import NormalizedAzureResponse
    
    raw_responses = json.loads(raw_responses_str)
    combined = NormalizedAzureResponse(document_id=doc_id)
    for k, v in raw_responses.items():
        if v:
            # Recreate normalized page elements
            normalized = normalize_azure_response(f"{doc_id}_{k}", v)
            combined.pages.extend(normalized.pages)
            
    text, conf, found, _, page_num = resolve_field(fd, combined)
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
async def event_stream(request: Request):
    import json
    from app.core.events import subscribe, unsubscribe
    uid = request.state.user_id if hasattr(request.state, "user_id") else None
    if not uid:
        uid = get_current_user_id()
    queue = subscribe(user_id=uid)
    from fastapi.responses import StreamingResponse

    async def gen():
        try:
            yield f"data: {json.dumps({'event': 'connected', 'data': {}})}\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(msg)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            unsubscribe(queue)

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

