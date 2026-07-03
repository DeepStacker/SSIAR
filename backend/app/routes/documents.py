from fastapi import APIRouter, HTTPException
from app.database import (
    get_document, get_all_documents, delete_document as db_delete,
    bulk_delete_documents, update_document_status, insert_or_update_form_data,
    log_correction_data, get_edit_history
)
from app.schemas import VerifyDataRequest, BulkRequest
from app.services.processing import get_executor, process_pdf_background
from app.sse import notify as notify_sse

router = APIRouter()


@router.get("/api/documents")
def list_documents():
    return get_all_documents()


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

    update_document_status(doc_id, "verified", "level_1")
    notify_sse("document_updated", {"doc_id": doc_id, "status": "verified", "escalation_level": "level_1"})
    return {"message": "Form successfully verified"}


@router.delete("/api/documents/{doc_id}")
def remove_document(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db_delete(doc_id)
    notify_sse("document_deleted", {"doc_id": doc_id})
    return {"message": "Document deleted successfully"}


@router.post("/api/documents/bulk-delete")
def bulk_delete(payload: BulkRequest):
    count = bulk_delete_documents(payload.doc_ids)
    notify_sse("documents_bulk_deleted", {"count": count})
    return {"message": f"Deleted {count} document(s)"}


@router.post("/api/documents/bulk-verify")
def bulk_verify(payload: BulkRequest):
    count = 0
    for doc_id in payload.doc_ids:
        doc = get_document(doc_id)
        if doc and doc["status"] != "verified":
            update_document_status(doc_id, "verified", "level_1")
            count += 1
    notify_sse("documents_bulk_verified", {"count": count})
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
    notify_sse("document_updated", {"doc_id": doc_id, "status": "processing"})
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
        "workers": get_executor()._max_workers
    }
