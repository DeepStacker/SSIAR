import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Depends
from app.database import (
    get_document, get_all_documents, delete_document as db_delete,
    bulk_delete_documents, update_document_status, insert_or_update_form_data,
    log_correction_data, get_edit_history, get_page_image
)
from app.image.crops import extract_crop, get_crop_page
from app.ocr.normalizers import get_normalizer
from app.image.roi import ROIS_P1_POINTS, ROIS_P2_POINTS, ROIS_REMARKS_POINTS
from app.schemas import VerifyDataRequest, BulkRequest
from app.services.processing import get_executor, process_pdf_background
from app.sse import notify as notify_sse
from app.auth import require_auth, get_current_user_id

FIELD_NAMES = {"roll_number", "class", "dob", "gender", "math_pct", "science_pct", "language_pct", "rank"}
SCORE_FIELDS = {"math_pct", "science_pct", "language_pct", "rank"}
MAX_TEXT_LEN = 32

router = APIRouter(dependencies=[Depends(require_auth)])


def _clean_field(value: str | None) -> str | None:
    """Strip whitespace from OCR values. (Truncation removed — caused analytics/class-filter mismatches.)"""
    if not value or not isinstance(value, str):
        return value
    stripped = value.strip()
    return stripped if stripped else value


def _clean_doc(doc: dict) -> dict:
    for field in FIELD_NAMES:
        if field in doc:
            doc[field] = _clean_field(doc[field])
    return doc


@router.get("/api/documents")
def list_documents():
    docs = get_all_documents()
    return [_clean_doc(d) for d in docs]


@router.get("/api/documents/{doc_id}")
def get_document_details(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/api/documents/{doc_id}/verify")
def verify_document(doc_id: str, payload: VerifyDataRequest):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    conf_scores = doc.get("confidence_scores", {})
    ocr_conf = conf_scores.get("ocr", {})
    prep_modes = conf_scores.get("preprocessing_modes", {})

    # SDQ form has Math, Science, Language only — no Hindi field
    fields_to_compare = {
        "roll_number": payload.roll_number,
        "class": payload.class_val,
        "dob": payload.dob,
        "gender": payload.gender,
        "math_pct": payload.academic_scores.get("math_pct", ""),
        "science_pct": payload.academic_scores.get("science_pct", ""),
        "language_pct": payload.academic_scores.get("language_pct", ""),
        "rank": payload.academic_scores.get("rank", "")
    }

    for field_name, corrected_val in fields_to_compare.items():
        original_ocr = doc.get(field_name) if field_name in doc else doc.get("academic_scores", {}).get(field_name, "")
        if original_ocr != corrected_val:
            crop_path = f"db://{doc_id}/{field_name}"
            confidence = ocr_conf.get(field_name, 1.0)
            mode = prep_modes.get(field_name, "standard")
            log_correction_data(
                doc_id=doc_id,
                field_name=field_name,
                crop_path=crop_path,
                ocr_pred=original_ocr,
                corrected_val=corrected_val,
                confidence=confidence,
                mode=mode
            )

    insert_or_update_form_data(
        doc_id=doc_id,
        roll_number=payload.roll_number,
        class_val=payload.class_val,
        dob=payload.dob,
        gender=payload.gender,
        consent=payload.consent,
        responses=payload.responses,
        academic_scores=payload.academic_scores,
        remarks=payload.remarks,
        confidence_scores=conf_scores,
        verified=1
    )

    # Preserve original escalation_level from processing — human verification confirms data
    # accuracy but does NOT change scan quality / alignment. Keeps Level 1 = truly clean scans.
    original_escalation = doc.get("escalation_level", "level_1")
    update_document_status(doc_id, "verified", original_escalation)
    notify_sse("document_updated", {"doc_id": doc_id, "status": "verified", "escalation_level": original_escalation}, user_id=get_current_user_id())
    return {"message": "Form successfully verified"}


@router.delete("/api/documents/{doc_id}")
def remove_document(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db_delete(doc_id)
    notify_sse("document_deleted", {"doc_id": doc_id}, user_id=get_current_user_id())
    return {"message": "Document deleted successfully"}


@router.post("/api/documents/bulk-delete")
def bulk_delete(payload: BulkRequest):
    count = bulk_delete_documents(payload.doc_ids)
    notify_sse("documents_bulk_deleted", {"count": count}, user_id=get_current_user_id())
    return {"message": f"Deleted {count} document(s)"}


@router.post("/api/documents/bulk-verify")
def bulk_verify(payload: BulkRequest):
    count = 0
    for doc_id in payload.doc_ids:
        doc = get_document(doc_id)
        if doc and doc["status"] != "verified":
            update_document_status(doc_id, "verified", "level_1")
            count += 1
    notify_sse("documents_bulk_verified", {"count": count}, user_id=get_current_user_id())
    return {"message": f"Verified {count} document(s)"}


@router.post("/api/documents/{doc_id}/reprocess")
def reprocess_document(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    from app.database import get_pdf
    if not get_pdf(doc_id):
        raise HTTPException(status_code=400, detail="Original PDF data not found in database")
    update_document_status(doc_id, "processing")
    get_executor().submit(process_pdf_background, doc_id)
    notify_sse("document_updated", {"doc_id": doc_id, "status": "processing"}, user_id=get_current_user_id())
    return {"message": "Reprocessing started", "doc_id": doc_id}


@router.post("/api/documents/bulk-reprocess")
def bulk_reprocess(payload: BulkRequest):
    from app.database import get_pdf
    count = 0
    for doc_id in payload.doc_ids:
        if get_pdf(doc_id):
            update_document_status(doc_id, "processing")
            get_executor().submit(process_pdf_background, doc_id)
            count += 1
    return {"message": f"Reprocessing {count} document(s)"}


@router.post("/api/documents/{doc_id}/reprocess-field/{field_name}")
def reprocess_field(doc_id: str, field_name: str):
    if field_name not in FIELD_NAMES:
        raise HTTPException(status_code=400, detail=f"Unsupported field: {field_name}")

    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    page_num = get_crop_page(field_name)
    img_bytes = get_page_image(doc_id, page_num)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Aligned page not found in database")

    nparr = np.frombuffer(img_bytes, np.uint8)
    aligned_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if aligned_img is None:
        raise HTTPException(status_code=500, detail="Failed to decode aligned page")

    # Check cached Azure full-page result first (avoids repeat API call)
    _conf_scores = doc.get("confidence_scores") or {}
    _azure_cache = _conf_scores.get("_azure_cache") or {}
    _page_key = "page_1" if field_name in ROIS_P1_POINTS else "page_2"
    _cached = _azure_cache.get(_page_key, {}).get(field_name)
    if _cached and _cached[0] and _cached[1] > 0:
        norm_val, is_valid = get_normalizer(field_name)[0](_cached[0])
        if is_valid and norm_val:
            print(f"⟳ reprocess_field {field_name}: using cached Azure result '{norm_val}' conf={_cached[1]:.3f}")
            new_confidence = _cached[1]
            result = type('obj', (object,), {'text': norm_val, 'confidence': _cached[1], 'engine_name': 'azure_cached'})()
            # Fall through to update logic below
        else:
            result = None
    else:
        result = None

    if result is None:
        return {
            "field_name": field_name,
            "value": doc.get(field_name) or doc.get("academic_scores", {}).get(field_name, ""),
            "engine": "none",
            "confidence": 0,
            "updated": False,
            "message": "No cached Azure result available — re-upload document to reprocess"
        }

    print(f"⟳ reprocess_field {field_name}: engine={result.engine_name} raw='{result.text}' norm='{norm_val}' valid={is_valid} conf={result.confidence:.3f}")

    old_conf_scores = doc.get("confidence_scores") or {}
    old_ocr_confs = old_conf_scores.get("ocr") or {}

    # Accept any valid non-empty result — parseable data matters more than confidence
    if not norm_val:
        return {
            "field_name": field_name,
            "value": doc.get(field_name) or doc.get("academic_scores", {}).get(field_name, ""),
            "engine": result.engine_name,
            "confidence": 0,
            "updated": False,
            "message": "No parseable data from any engine"
        }

    old_form = doc
    if field_name in SCORE_FIELDS:
        academic = dict(old_form.get("academic_scores") or {})
        academic[field_name] = norm_val
        academic_scores = academic
    else:
        academic_scores = old_form.get("academic_scores") or {}

    roll_number = norm_val if field_name == "roll_number" else (old_form.get("roll_number") or "")
    class_val = norm_val if field_name == "class" else (old_form.get("class") or "")
    dob = norm_val if field_name == "dob" else (old_form.get("dob") or "")
    gender = norm_val if field_name == "gender" else (old_form.get("gender") or "")

    new_ocr_confs = dict(old_ocr_confs)
    new_ocr_confs[field_name] = new_confidence
    conf_scores = dict(old_conf_scores)
    conf_scores["ocr"] = new_ocr_confs

    insert_or_update_form_data(
        doc_id=doc_id,
        roll_number=roll_number,
        class_val=class_val,
        dob=dob,
        gender=gender,
        consent=old_form.get("consent") or "Unanswered",
        responses=old_form.get("responses") or {},
        academic_scores=academic_scores,
        remarks=old_form.get("remarks") or "",
        confidence_scores=conf_scores,
        verified=0
    )

    notify_sse("document_updated", {"doc_id": doc_id, "status": doc["status"]}, user_id=get_current_user_id())

    return {
        "field_name": field_name,
        "value": norm_val,
        "engine": result.engine_name,
        "confidence": new_confidence,
        "valid": is_valid,
        "updated": True
    }


@router.get("/api/documents/{doc_id}/history")
def document_edit_history(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return get_edit_history(doc_id)


@router.get("/api/corrections-log")
def fetch_corrections_log():
    from app.database import get_corrections_log
    return get_corrections_log()


@router.get("/api/queue-status")
def queue_status():
    from app.services.processing import get_worker_count
    docs = get_all_documents()
    levels = {"level_1": 0, "level_2": 0, "level_3": 0, "level_4": 0}
    for d in docs:
        lev = d.get("escalation_level", "level_1")
        if lev in levels:
            levels[lev] += 1
    return {
        "total": len(docs),
        "processing": len([d for d in docs if d["status"] == "processing"]),
        "needs_review": len([d for d in docs if d["status"] == "needs_review"]),
        "verified": len([d for d in docs if d["status"] == "verified"]),
        "failed": len([d for d in docs if d["status"] == "failed"]),
        "by_escalation": levels,
        "workers": get_worker_count()
    }
