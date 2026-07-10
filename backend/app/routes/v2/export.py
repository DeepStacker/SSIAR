"""
Export API (V2)
================
Consolidated Excel/CSV export endpoint matching frontend requirements.
"""
from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Depends
from app.database import get_all_documents, get_document
from app.services.export_service import build_export
from app.auth import require_auth, get_current_user_id

router = APIRouter(dependencies=[Depends(require_auth)])


import asyncio

@router.get("/api/export")
async def export_results(
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
    loop = asyncio.get_running_loop()
    docs = await loop.run_in_executor(None, get_all_documents)

    if status_filter:
        filtered_docs = [d for d in docs if d["status"] == status_filter]
    else:
        filtered_docs = [d for d in docs if d["status"] in ("verified", "needs_review", "approved")]

    if doc_ids:
        ids_set = set(doc_ids.split(","))
        filtered_docs = [d for d in filtered_docs if d["id"] in ids_set]
    elif class_filter:
        filtered_docs = [d for d in filtered_docs if d.get("class") == class_filter]
    if date_from:
        from_str = date_from if "T" in date_from else date_from + "T00:00:00"
        filtered_docs = [d for d in filtered_docs if d.get("created_at", "") >= from_str]
    if date_to:
        to_str = date_to if "T" in date_to else date_to + "T23:59:59"
        filtered_docs = [d for d in filtered_docs if d.get("created_at", "") <= to_str]
    if roll_prefix:
        filtered_docs = [d for d in filtered_docs if d.get("roll_number", "").startswith(roll_prefix)]

    if not filtered_docs:
        raise HTTPException(status_code=400, detail="No documents match the filter criteria")

    return await loop.run_in_executor(None, lambda: build_export(filtered_docs, lang, columns, format))