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


@router.get("/api/v2/review/tasks")
def list_review_tasks(
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
    tasks, total_count = get_pending_review_tasks(
        reviewer_id=uid if priority == "mine" else None,
        priority=priority if (priority and priority != "mine") else None,
        limit=limit,
        document_id=document_id,
        field_type=field_type,
        error_type=error_type,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return {"tasks": tasks, "total": total_count}


@router.post("/api/v2/review/tasks/{task_id}/submit")
def submit_review_task(
    task_id: int,
    corrected_value: str = Query(""),
):
    """Submit a correction for a review task."""
    import logging
    logger = logging.getLogger("review")
    uid = get_current_user_id()
    logger.info(f"DLQ submit: task_id={task_id}, corrected_value='{corrected_value}', uid={uid}")
    try:
        success = submit_review(task_id, corrected_value, uid or "system")
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
def review_statistics():
    """Get review system statistics."""
    return get_review_statistics()


@router.get("/api/v2/templates")
def list_form_templates():
    """List all available form templates."""
    templates = list_templates()
    result = []
    for tid in templates:
        tmpl = get_template(tid)
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
def get_template_details(template_id: str):
    """Get full template definition."""
    tmpl = get_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl
