"""
System Analytics API (V2)
==========================
Endpoints for system processing efficiency, metrics, cost analysis, and accuracy.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from app.auth import require_auth, get_current_user_id
from app.processing.analytics import (
    get_processing_summary,
    get_accuracy_summary,
    get_cost_metrics,
    get_review_metrics,
    get_escalation_distribution,
)

router = APIRouter(dependencies=[Depends(require_auth)])


@router.get("/api/v2/analytics/processing")
def system_processing_analytics(
    days: int = Query(7),
    class_filter: Optional[str] = Query(None, alias="class"),
):
    """Get processing pipeline analytics."""
    uid = get_current_user_id()
    return get_processing_summary(days=days, class_filter=class_filter, user_id=uid)


@router.get("/api/v2/analytics/accuracy")
def system_accuracy_analytics(
    days: int = Query(7),
):
    """Get accuracy metrics from corrections data."""
    return get_accuracy_summary(days=days)


@router.get("/api/v2/analytics/cost")
def system_cost_analytics():
    """Get Azure cost consumption metrics."""
    return get_cost_metrics()


@router.get("/api/v2/analytics/review")
def system_review_analytics():
    """Get human review metrics."""
    return get_review_metrics()


@router.get("/api/v2/analytics/escalation")
def system_escalation_analytics():
    """Get escalation level distribution."""
    uid = get_current_user_id()
    return get_escalation_distribution(user_id=uid)


@router.post("/api/v2/metrics")
def record_processing_metric(
    document_id: str,
    metric_name: str,
    metric_value: float,
    metric_unit: str = "",
):
    """Record a processing metric (e.g., azure_retry, processing_time)."""
    from app.database import get_db_connection, put_conn
    from datetime import datetime
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        now_str = datetime.now().isoformat()
        cur.execute(
            """INSERT INTO processing_metrics 
               (document_id, metric_name, metric_value, metric_unit, recorded_at)
               VALUES (?, ?, ?, ?, ?)""",
            (document_id, metric_name, metric_value, metric_unit, now_str)
        )
        conn.commit()
    finally:
        put_conn(conn)
    return {"message": "Metric recorded"}
