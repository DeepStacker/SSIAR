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
):
    """Get all pending review tasks."""
    uid = get_current_user_id()
    tasks = get_pending_review_tasks(
        reviewer_id=uid if priority == "mine" else None,
        priority=priority if priority != "mine" else None,
        limit=limit,
    )
    return {"tasks": tasks, "total": len(tasks)}


@router.post("/api/v2/review/tasks/{task_id}/submit")
def submit_review_task(
    task_id: int,
    corrected_value: str,
):
    """Submit a correction for a review task."""
    uid = get_current_user_id()
    success = submit_review(task_id, corrected_value, uid or "system")
    if not success:
        raise HTTPException(status_code=404, detail="Review task not found")
    return {"message": "Review submitted successfully", "task_id": task_id}


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
