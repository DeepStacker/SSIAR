from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from app.database import get_all_documents, get_document
from app.services.export_service import build_export

router = APIRouter()


@router.get("/api/export")
def export_results(
    format: str = Query("excel", pattern="^(excel|csv)$"),
    lang: str = Query("en", pattern="^(en|hi)$"),
    status_filter: Optional[str] = Query(None, alias="status"),
    class_filter: Optional[str] = Query(None, alias="class"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    roll_prefix: Optional[str] = Query(None),
    columns: Optional[str] = Query(None),
    doc_ids: Optional[str] = Query(None),
):
    docs = get_all_documents()

    if status_filter:
        filtered_docs = [d for d in docs if d["status"] == status_filter]
    else:
        filtered_docs = [d for d in docs if d["status"] in ("verified", "needs_review")]

    if doc_ids:
        ids_set = set(doc_ids.split(","))
        filtered_docs = [d for d in filtered_docs if d["id"] in ids_set]
    elif class_filter:
        filtered_docs = [d for d in filtered_docs if d.get("class") == class_filter]
    if date_from:
        filtered_docs = [d for d in filtered_docs if d.get("created_at", "") >= date_from]
    if date_to:
        filtered_docs = [d for d in filtered_docs if d.get("created_at", "") <= date_to]
    if roll_prefix:
        filtered_docs = [d for d in filtered_docs if d.get("roll_number", "").startswith(roll_prefix)]

    if not filtered_docs:
        raise HTTPException(status_code=400, detail="No documents match the filter criteria")

    return build_export(filtered_docs, lang, columns, format)
