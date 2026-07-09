"""
Analytics Dashboard (Module 14) & Reporting System (Module 15)
===============================================================
Focuses on system analytics (not business analytics).
Tracks processing metrics, accuracy, cost, and human review statistics.
"""
import json
from datetime import datetime, timedelta
from typing import Optional
from app.database import get_db_connection, put_conn


# ── Processing Metrics ───────────────────────────────────────────────────────

def get_processing_summary(
    days: int = 7,
    class_filter: Optional[str] = None,
    user_id: Optional[str] = None,
) -> dict:
    """Get processing summary metrics."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        since = (datetime.now() - timedelta(days=days)).isoformat()
        
        # Build filter conditions
        filters = ["d.created_at >= ?"]
        params = [since]
        
        if user_id:
            filters.append("d.user_id = ?")
            params.append(user_id)
        if class_filter:
            filters.append("f.class = ?")
            filters_str = " AND fd_join"
            filters.append(f"fd.class = ?")
            params.append(class_filter)
            fd_join = " LEFT JOIN form_data fd ON d.id = fd.document_id"
        else:
            fd_join = ""
        
        # Rebuild cleanly
        base_filters = ["d.created_at >= ?"]
        base_params = [since]
        extra_fd_join = ""
        if user_id:
            base_filters.append("d.user_id = ?")
            base_params.append(user_id)
        if class_filter:
            extra_fd_join = " LEFT JOIN form_data fd ON d.id = fd.document_id"
            base_filters.append("fd.class = ?")
            base_params.append(class_filter)
        
        where = " AND ".join(base_filters)
        
        # Total processed
        cur.execute(
            f"SELECT COUNT(*) FROM documents d{extra_fd_join} WHERE {where}",
            base_params
        )
        total_processed = cur.fetchone()[0]
        
        # By status
        cur.execute(
            f"SELECT d.status, COUNT(*) as count FROM documents d{extra_fd_join} WHERE {where} GROUP BY d.status",
            base_params
        )
        by_status = {r["status"]: r["count"] for r in cur.fetchall()}
        
        # Average processing time (estimated from created_at vs updated_at for verified docs)
        cur.execute(
            f"""SELECT AVG(
                CAST(
                    strftime('%s', f.updated_at) - strftime('%s', d.created_at) 
                    AS REAL
                )
            ) FROM documents d{extra_fd_join}
            JOIN form_data f ON d.id = f.document_id
            WHERE {where} AND d.status IN ('verified', 'approved', 'needs_review')""",
            base_params
        )
        avg_time = cur.fetchone()[0]
        
        # Failed count
        cur.execute(
            f"SELECT COUNT(*) FROM documents d{extra_fd_join} WHERE {where} AND d.status = 'failed'",
            base_params
        )
        failed = cur.fetchone()[0]
        
        return {
            "total_processed": total_processed,
            "by_status": by_status,
            "average_processing_time_seconds": round(avg_time or 0, 1),
            "failed_count": failed,
            "period_days": days,
        }
    finally:
        put_conn(conn)


# ── Accuracy Metrics ────────────────────────────────────────────────────────

def get_accuracy_summary(
    days: int = 7,
    class_filter: Optional[str] = None,
) -> dict:
    """Get accuracy metrics from corrections and confidence data."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        since = (datetime.now() - timedelta(days=days)).isoformat()
        
        # Average OCR confidence
        cur.execute("""
            SELECT AVG(fd.confidence_score) FROM corrections_training_data fd
            WHERE fd.saved_at >= ?
        """, (since,))
        avg_ocr_confidence = cur.fetchone()[0] or 0.0
        
        # Correction rate
        cur.execute("""
            SELECT COUNT(*) FROM corrections_training_data
            WHERE saved_at >= ?
        """, (since,))
        total_corrections = cur.fetchone()[0]
        
        cur.execute("""
            SELECT COUNT(*) FROM corrections_training_data
            WHERE saved_at >= ? AND ocr_prediction != corrected_text AND corrected_text != ''
        """, (since,))
        actual_corrections = cur.fetchone()[0]
        
        correction_rate = (actual_corrections / total_corrections) if total_corrections > 0 else 0.0
        
        # Review percentage
        cur.execute("""
            SELECT COUNT(*) FROM review_tasks
            WHERE created_at >= ?
        """, (since,))
        review_tasks = cur.fetchone()[0]
        
        cur.execute("""
            SELECT COUNT(*) FROM documents WHERE created_at >= ?
        """, (since,))
        total_docs = max(cur.fetchone()[0], 1)
        
        return {
            "avg_ocr_confidence": round(avg_ocr_confidence, 3),
            "correction_rate": round(correction_rate, 3),
            "total_corrections": total_corrections,
            "actual_corrections": actual_corrections,
            "review_percentage": round(review_tasks / total_docs * 100, 1) if total_docs > 0 else 0.0,
        }
    finally:
        put_conn(conn)


# ── Cost Metrics ─────────────────────────────────────────────────────────────

def get_cost_metrics() -> dict:
    """Track Azure page consumption and cost estimates."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Count documents with Azure responses
        cur.execute("""
            SELECT COUNT(DISTINCT document_id) FROM azure_responses
        """)
        docs_with_azure = cur.fetchone()[0]
        
        # Estimate pages consumed (approximate from raw response size)
        cur.execute("""
            SELECT SUM(
                CASE 
                    WHEN length(raw_response) > 1000 THEN 2
                    WHEN length(raw_response) > 100 THEN 1
                    ELSE 0
                END
            ) FROM azure_responses
        """)
        estimated_pages = cur.fetchone()[0] or 0
        
        # Retry count from metrics
        cur.execute("""
            SELECT COUNT(*) FROM processing_metrics
            WHERE metric_name = 'azure_retry'
        """)
        retry_count = cur.fetchone()[0]
        
        return {
            "documents_processed_with_azure": docs_with_azure,
            "estimated_pages_consumed": estimated_pages,
            "estimated_cost_per_page": 0.015,  # Approximate Azure DI cost in USD
            "estimated_total_cost": round(estimated_pages * 0.015, 4),
            "retry_count": retry_count,
        }
    finally:
        put_conn(conn)


# ── Human Review Metrics ────────────────────────────────────────────────────

def get_review_metrics() -> dict:
    """Get human review productivity and pending metrics."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Pending reviews
        cur.execute("""
            SELECT COUNT(*) FROM review_tasks WHERE status = 'pending'
        """)
        pending = cur.fetchone()[0]
        
        # By priority
        cur.execute("""
            SELECT priority, COUNT(*) as count FROM review_tasks 
            WHERE status = 'pending'
            GROUP BY priority
        """)
        by_priority = {r["priority"]: r["count"] for r in cur.fetchall()}
        
        # Average review time (completed tasks)
        cur.execute("""
            SELECT AVG(
                strftime('%s', reviewed_at) - strftime('%s', created_at)
            ) FROM review_tasks
            WHERE status = 'completed' AND reviewed_at IS NOT NULL
        """)
        avg_review_time = cur.fetchone()[0]
        
        # Reviewer productivity
        cur.execute("""
            SELECT reviewer_id, COUNT(*) as count FROM review_tasks
            WHERE status = 'completed' AND reviewer_id IS NOT NULL
            GROUP BY reviewer_id
        """)
        reviewer_productivity = {
            r["reviewer_id"]: r["count"] for r in cur.fetchall()
        }
        
        return {
            "pending_reviews": pending,
            "by_priority": by_priority,
            "average_review_time_seconds": round(avg_review_time or 0, 1),
            "reviewer_productivity": reviewer_productivity,
        }
    finally:
        put_conn(conn)


# ── Escalation Level Distribution ────────────────────────────────────────────

def get_escalation_distribution(
    days: int = 30,
    user_id: Optional[str] = None,
) -> dict:
    """Get distribution of documents by escalation level."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        since = (datetime.now() - timedelta(days=days)).isoformat()
        
        filters = ["created_at >= ?"]
        params = [since]
        if user_id:
            filters.append("user_id = ?")
            params.append(user_id)
        
        where = " AND ".join(filters)
        
        cur.execute(
            f"SELECT escalation_level, COUNT(*) as count FROM documents WHERE {where} GROUP BY escalation_level",
            params
        )
        return {r["escalation_level"]: r["count"] for r in cur.fetchall()}
    finally:
        put_conn(conn)