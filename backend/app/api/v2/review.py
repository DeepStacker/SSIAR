"""
Human Review & Templates API (V2)
==================================
Endpoints for task reviews and template queries.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from app.auth import require_auth, get_current_user_id
from app.processing.review import (
    get_pending_review_tasks,
    submit_review,
    get_review_statistics,
)
from app.processing.templates import (
    list_templates,
    get_template,
)

router = APIRouter(dependencies=[Depends(require_auth)])


import asyncio

@router.get("/api/v2/review/tasks")
async def list_review_tasks(
    priority: Optional[str] = Query(None),
    limit: int = Query(50),
    document_id: Optional[str] = Query(None),
    field_type: Optional[str] = Query(None),
    error_type: Optional[str] = Query(None),
    sort_by: str = Query("priority"),
    sort_dir: str = Query("asc"),
):
    """Get all pending review tasks."""
    uid = get_current_user_id()
    loop = asyncio.get_running_loop()
    tasks, total_count = await loop.run_in_executor(
        None,
        lambda: get_pending_review_tasks(
            reviewer_id=uid if priority == "mine" else None,
            priority=priority if (priority and priority != "mine") else None,
            limit=limit,
            document_id=document_id,
            field_type=field_type,
            error_type=error_type,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
    )
    return {"tasks": tasks, "total": total_count}


@router.post("/api/v2/review/tasks/{task_id}/submit")
async def submit_review_task(
    task_id: int,
    corrected_value: str = Query(""),
):
    """Submit a correction for a review task."""
    import logging
    logger = logging.getLogger("review")
    uid = get_current_user_id()
    logger.info(f"DLQ submit: task_id={task_id}, corrected_value='{corrected_value}', uid={uid}")
    try:
        loop = asyncio.get_running_loop()
        success = await loop.run_in_executor(
            None,
            lambda: submit_review(task_id, corrected_value, uid or "system")
        )
        if not success:
            logger.warning(f"DLQ submit: task {task_id} not found")
            raise HTTPException(status_code=404, detail="Review task not found")
        logger.info(f"DLQ submit: task {task_id} resolved successfully")
        return {"message": "Review submitted successfully", "task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DLQ submit error for task {task_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/v2/review/stats")
async def review_statistics():
    """Get review system statistics."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, get_review_statistics)


@router.get("/api/v2/templates")
async def list_form_templates():
    """List all available form templates."""
    loop = asyncio.get_running_loop()
    templates = await loop.run_in_executor(None, list_templates)
    result = []
    for tid in templates:
        tmpl = await loop.run_in_executor(None, get_template, tid)
        if tmpl:
            result.append({
                "template_id": tmpl.template_id,
                "name": tmpl.name,
                "version": tmpl.version,
                "pages": tmpl.pages,
                "fields": [f.name for f in tmpl.fields],
            })
    return {"templates": result}


@router.get("/api/v2/templates/{template_id}")
async def get_template_details(template_id: str):
    """Get full template definition."""
    loop = asyncio.get_running_loop()
    tmpl = await loop.run_in_executor(None, get_template, template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl
