"""Tracking & statistics endpoints for per-document stats, issues, fixes, and DLQ."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from app.database import (
    get_db_connection, put_conn, USE_POSTGRES,
    update_document_status, log_fix, log_issue,
)

if USE_POSTGRES:
    from psycopg2.extras import RealDictCursor

def _cursor(conn):
    return conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()


def _row_to_json(row):
    """Convert a DB row (RealDictRow) to a plain dict with JSON-safe types."""
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, Decimal):
            d[k] = float(v)
        elif isinstance(v, date):
            d[k] = v.isoformat()
    return d

router = APIRouter()


# ── Per-Document Stats ───────────────────────────────────────────────────────

@router.get("/api/stats/document/{doc_id}")
def get_document_stats(doc_id: str):
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        cur.execute(
            "SELECT id, filename, status, escalation_level, error_message, retry_count, created_at "
            "FROM documents WHERE id = %s" if USE_POSTGRES else
            "SELECT id, filename, status, escalation_level, error_message, retry_count, created_at "
            "FROM documents WHERE id = ?",
            (doc_id,)
        )
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(404, "Document not found")

        result = dict(doc)
        if result.get("retry_count") is None:
            result["retry_count"] = 0

        cur.execute(
            "SELECT COUNT(*) as cnt FROM document_issues WHERE document_id = %s"
            if USE_POSTGRES else
            "SELECT COUNT(*) as cnt FROM document_issues WHERE document_id = ?",
            (doc_id,)
        )
        result["total_issues"] = cur.fetchone()["cnt"]

        cur.execute(
            "SELECT COUNT(*) as cnt FROM document_issues WHERE document_id = %s AND resolved_at IS NOT NULL"
            if USE_POSTGRES else
            "SELECT COUNT(*) as cnt FROM document_issues WHERE document_id = ? AND resolved_at IS NOT NULL",
            (doc_id,)
        )
        result["resolved_issues"] = cur.fetchone()["cnt"]

        cur.execute(
            "SELECT issue_type, severity, description, created_at, resolved_at "
            "FROM document_issues WHERE document_id = %s ORDER BY created_at DESC LIMIT 50"
            if USE_POSTGRES else
            "SELECT issue_type, severity, description, created_at, resolved_at "
            "FROM document_issues WHERE document_id = ? ORDER BY created_at DESC LIMIT 50",
            (doc_id,)
        )
        result["issues"] = [dict(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT COUNT(*) as cnt FROM document_fixes WHERE document_id = %s"
            if USE_POSTGRES else
            "SELECT COUNT(*) as cnt FROM document_fixes WHERE document_id = ?",
            (doc_id,)
        )
        result["total_fixes"] = cur.fetchone()["cnt"]

        cur.execute(
            "SELECT fix_type, field_name, previous_value, new_value, triggered_by, created_at "
            "FROM document_fixes WHERE document_id = %s ORDER BY created_at DESC LIMIT 50"
            if USE_POSTGRES else
            "SELECT fix_type, field_name, previous_value, new_value, triggered_by, created_at "
            "FROM document_fixes WHERE document_id = ? ORDER BY created_at DESC LIMIT 50",
            (doc_id,)
        )
        result["fixes"] = [dict(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT metric_name, metric_value, metric_unit, recorded_at "
            "FROM processing_metrics WHERE document_id = %s ORDER BY recorded_at DESC"
            if USE_POSTGRES else
            "SELECT metric_name, metric_value, metric_unit, recorded_at "
            "FROM processing_metrics WHERE document_id = ? ORDER BY recorded_at DESC",
            (doc_id,)
        )
        result["metrics"] = [dict(r) for r in cur.fetchall()]

        conn.commit()
        return result
    finally:
        put_conn(conn)


# ── DLQ (Dead Letter Queue) ──────────────────────────────────────────────────

@router.get("/api/stats/dlq")
def list_dlq(
    status_filter: Optional[str] = Query(None, alias="status"),
):
    conn = get_db_connection()
    try:
        cur = _cursor(conn)
        where = "WHERE d.status = 'failed'"
        params: list = []
        if status_filter:
            where = "WHERE d.status = %s" if USE_POSTGRES else "WHERE d.status = ?"
            params.append(status_filter)

        cur.execute(
            f"SELECT d.id, d.filename, d.status, d.escalation_level, d.error_message, "
            f"d.retry_count, d.created_at, "
            f"(SELECT COUNT(*) as cnt FROM document_issues di WHERE di.document_id = d.id) as issue_count, "
            f"(SELECT COUNT(*) as cnt FROM document_fixes df WHERE df.document_id = d.id) as fix_count "
            f"FROM documents d {where} "
            f"ORDER BY d.created_at DESC LIMIT 100"
            if USE_POSTGRES else
            f"SELECT d.id, d.filename, d.status, d.escalation_level, d.error_message, "
            f"d.retry_count, d.created_at, "
            f"(SELECT COUNT(*) as cnt FROM document_issues di WHERE di.document_id = d.id) as issue_count, "
            f"(SELECT COUNT(*) as cnt FROM document_fixes df WHERE df.document_id = d.id) as fix_count "
            f"FROM documents d {where} "
            f"ORDER BY d.created_at DESC LIMIT 100",
            params if USE_POSTGRES else params,
        )
        rows = cur.fetchall()
        return {
            "total": len(rows),
            "documents": [dict(r) for r in rows],
        }
    finally:
        put_conn(conn)


@router.post("/api/stats/dlq/{doc_id}/retry")
def retry_from_dlq(doc_id: str):
    from app.database import get_document, get_pdf
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    pdf_bytes = get_pdf(doc_id)
    if not pdf_bytes:
        raise HTTPException(400, "Original PDF data not found for retry")

    from app.database import update_document_error, increment_retry_count
    update_document_error(doc_id, None)
    increment_retry_count(doc_id)
    log_fix(doc_id, fix_type="dlq_retry", field_name=None,
            triggered_by="system")

    from app.processing.jobs.document_jobs import get_job_queue, process_document_background
    get_job_queue().enqueue(
        "document_processing",
        doc_id,
        process_document_background,
        doc_id,
        pdf_bytes,
        doc["filename"],
        auto_verify=False,
    )
    from app.core.events import notify as notify_sse
    from app.auth import get_current_user_id
    notify_sse("document_updated", {"doc_id": doc_id, "status": "processing"},
               user_id=get_current_user_id())

    return {"message": "DLQ retry started", "doc_id": doc_id}


# ── Summary Stats ────────────────────────────────────────────────────────────

@router.get("/api/stats/summary")
def get_tracking_summary():
    conn = get_db_connection()
    try:
        cur = _cursor(conn)

        cur.execute("SELECT COUNT(*) as cnt FROM documents")
        total = cur.fetchone()['cnt']

        by_status = {}
        for s in ("processing", "approved", "needs_review", "verified", "failed",
                   "azure_completed", "validation_completed"):
            cur.execute(
                "SELECT COUNT(*) as cnt FROM documents WHERE status = %s"
                if USE_POSTGRES else
                "SELECT COUNT(*) as cnt FROM documents WHERE status = ?",
                (s,)
            )
            by_status[s] = cur.fetchone()['cnt']

        by_escalation = {}
        for el in ("level_1", "level_2", "level_3", "level_4"):
            cur.execute(
                "SELECT COUNT(*) as cnt FROM documents WHERE escalation_level = %s"
                if USE_POSTGRES else
                "SELECT COUNT(*) as cnt FROM documents WHERE escalation_level = ?",
                (el,)
            )
            by_escalation[el] = cur.fetchone()['cnt']

        cur.execute("SELECT COUNT(*) as cnt FROM document_issues")
        total_issues = cur.fetchone()['cnt']

        cur.execute("SELECT COUNT(*) as cnt FROM document_issues WHERE resolved_at IS NOT NULL")
        resolved_issues = cur.fetchone()['cnt']

        cur.execute("SELECT COUNT(*) as cnt FROM document_fixes")
        total_fixes = cur.fetchone()['cnt']

        cur.execute(
            "SELECT issue_type, COUNT(*) as cnt FROM document_issues "
            "GROUP BY issue_type ORDER BY cnt DESC"
        )
        issues_by_type = [dict(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT severity, COUNT(*) as cnt FROM document_issues "
            "GROUP BY severity ORDER BY cnt DESC"
        )
        issues_by_severity = [dict(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT fix_type, COUNT(*) as cnt FROM document_fixes "
            "GROUP BY fix_type ORDER BY cnt DESC"
        )
        fixes_by_type = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT COUNT(*) as cnt FROM documents WHERE retry_count > 0")
        documents_with_retries = cur.fetchone()['cnt']

        cur.execute("SELECT COALESCE(SUM(retry_count), 0) as cnt FROM documents")
        total_retries = cur.fetchone()['cnt'] or 0

        return {
            "total_documents": total,
            "by_status": by_status,
            "by_escalation": by_escalation,
            "total_issues": total_issues,
            "resolved_issues": resolved_issues,
            "resolution_rate": round(resolved_issues / total_issues, 3) if total_issues else 0,
            "issues_by_type": issues_by_type,
            "issues_by_severity": issues_by_severity,
            "total_fixes": total_fixes,
            "fixes_by_type": fixes_by_type,
            "documents_with_retries": documents_with_retries,
            "total_retries": total_retries,
        }
    finally:
        put_conn(conn)


# ── Issues Listing ──────────────────────────────────────────────────────────

@router.get("/api/stats/issues")
def list_issues(
    severity: Optional[str] = Query(None),
    issue_type: Optional[str] = Query(None),
    resolved: Optional[bool] = Query(None),
    doc_id: Optional[str] = Query(None, alias="document_id"),
    limit: int = Query(100, le=500),
):
    conn = get_db_connection()
    try:
        cur = _cursor(conn)
        clauses = []
        params: list = []
        if severity:
            clauses.append("di.severity = %s" if USE_POSTGRES else "di.severity = ?")
            params.append(severity)
        if issue_type:
            clauses.append("di.issue_type = %s" if USE_POSTGRES else "di.issue_type = ?")
            params.append(issue_type)
        if resolved is True:
            clauses.append("di.resolved_at IS NOT NULL")
        elif resolved is False:
            clauses.append("di.resolved_at IS NULL")
        if doc_id:
            clauses.append("di.document_id = %s" if USE_POSTGRES else "di.document_id = ?")
            params.append(doc_id)
        where = "WHERE " + " AND ".join(clauses) if clauses else ""

        cur.execute(
            f"SELECT di.*, d.filename "
            f"FROM document_issues di "
            f"LEFT JOIN documents d ON d.id = di.document_id "
            f"{where} ORDER BY di.created_at DESC LIMIT {limit}"
        )
        issues = [dict(r) for r in cur.fetchall()]
        return {"total": len(issues), "issues": issues}
    finally:
        put_conn(conn)


# ── Processing Funnel ───────────────────────────────────────────────────────

@router.get("/api/stats/funnel")
def get_processing_funnel():
    conn = get_db_connection()
    try:
        cur = _cursor(conn)
        cur.execute(
            "SELECT status, COUNT(*) as cnt FROM documents GROUP BY status "
            "ORDER BY CASE status "
            "  WHEN 'uploaded' THEN 1 WHEN 'processing' THEN 2 "
            "  WHEN 'azure_completed' THEN 3 WHEN 'validation_completed' THEN 4 "
            "  WHEN 'needs_review' THEN 5 WHEN 'review_required' THEN 6 "
            "  WHEN 'verified' THEN 7 WHEN 'approved' THEN 8 "
            "  WHEN 'failed' THEN 9 ELSE 10 END"
        )
        stages = [dict(r) for r in cur.fetchall()]
        total = sum(s["cnt"] for s in stages)
        return {"total": total, "stages": stages}
    finally:
        put_conn(conn)


# ── Trends (Time-Series) ────────────────────────────────────────────────────

@router.get("/api/stats/trends")
def get_trends(days: int = Query(30, le=365)):
    conn = get_db_connection()
    try:
        cur = _cursor(conn)
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()

        cur.execute(
            "SELECT DATE(created_at) as d, COUNT(*) as cnt "
            "FROM documents WHERE created_at >= %s GROUP BY d ORDER BY d"
            if USE_POSTGRES else
            "SELECT DATE(created_at) as d, COUNT(*) as cnt "
            "FROM documents WHERE created_at >= ? GROUP BY d ORDER BY d",
            (cutoff,)
        )
        docs_per_day = [_row_to_json(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT DATE(created_at) as d, COUNT(*) as cnt "
            "FROM document_issues WHERE created_at >= %s GROUP BY d ORDER BY d"
            if USE_POSTGRES else
            "SELECT DATE(created_at) as d, COUNT(*) as cnt "
            "FROM document_issues WHERE created_at >= ? GROUP BY d ORDER BY d",
            (cutoff,)
        )
        issues_per_day = [_row_to_json(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT DATE(created_at) as d, COUNT(*) as cnt "
            "FROM document_fixes WHERE created_at >= %s GROUP BY d ORDER BY d"
            if USE_POSTGRES else
            "SELECT DATE(created_at) as d, COUNT(*) as cnt "
            "FROM document_fixes WHERE created_at >= ? GROUP BY d ORDER BY d",
            (cutoff,)
        )
        fixes_per_day = [_row_to_json(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT ROUND(AVG(metric_value)::numeric, 2)::float8 as avg_val, "
            "ROUND(MIN(metric_value)::numeric, 2)::float8 as min_val, "
            "ROUND(MAX(metric_value)::numeric, 2)::float8 as max_val, "
            "COUNT(*) as samples "
            "FROM processing_metrics WHERE metric_name = 'processing_time_seconds'"
            if USE_POSTGRES else
            "SELECT ROUND(AVG(metric_value), 2) as avg_val, "
            "ROUND(MIN(metric_value), 2) as min_val, "
            "ROUND(MAX(metric_value), 2) as max_val, "
            "COUNT(*) as samples "
            "FROM processing_metrics WHERE metric_name = 'processing_time_seconds'"
        )
        raw = cur.fetchone()
        processing_time = dict(raw) if raw else {}

        cur.execute(
            "SELECT ROUND(AVG(metric_value)::numeric, 2)::float8 as avg_val, COUNT(*) as samples "
            "FROM processing_metrics WHERE metric_name = 'review_fields_count'"
            if USE_POSTGRES else
            "SELECT ROUND(AVG(metric_value), 2) as avg_val, COUNT(*) as samples "
            "FROM processing_metrics WHERE metric_name = 'review_fields_count'"
        )
        raw = cur.fetchone()
        review_fields = dict(raw) if raw else {}

        return {
            "docs_per_day": docs_per_day,
            "issues_per_day": issues_per_day,
            "fixes_per_day": fixes_per_day,
            "processing_time": processing_time,
            "review_fields": review_fields,
        }
    finally:
        put_conn(conn)


# ── Field-Level Quality ────────────────────────────────────────────────────

@router.get("/api/stats/fields")
def get_field_quality():
    conn = get_db_connection()
    try:
        cur = _cursor(conn)
        cur.execute(
            "SELECT field_name, issue_type, COUNT(*) as cnt "
            "FROM document_issues WHERE field_name IS NOT NULL "
            "GROUP BY field_name, issue_type ORDER BY cnt DESC LIMIT 50"
        )
        field_breakdown = [_row_to_json(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT field_name, COUNT(*) as cnt "
            "FROM document_issues WHERE field_name IS NOT NULL "
            "GROUP BY field_name ORDER BY cnt DESC LIMIT 20"
        )
        field_totals = [_row_to_json(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT field_name, COUNT(*) as cnt "
            "FROM document_fixes WHERE field_name IS NOT NULL "
            "GROUP BY field_name ORDER BY cnt DESC LIMIT 20"
        )
        field_fixes = [_row_to_json(r) for r in cur.fetchall()]

        return {
            "field_breakdown": field_breakdown,
            "field_totals": field_totals,
            "field_fixes": field_fixes,
        }
    finally:
        put_conn(conn)


# ── User Activity ──────────────────────────────────────────────────────────

@router.get("/api/stats/activity")
def get_user_activity():
    conn = get_db_connection()
    try:
        cur = _cursor(conn)
        cur.execute(
            "SELECT reviewer_id, COUNT(*) as cnt "
            "FROM review_tasks WHERE reviewer_id IS NOT NULL AND status = 'completed' "
            "GROUP BY reviewer_id ORDER BY cnt DESC"
        )
        review_activity = [dict(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT triggered_by, COUNT(*) as cnt "
            "FROM document_fixes WHERE triggered_by IS NOT NULL "
            "GROUP BY triggered_by ORDER BY cnt DESC"
        )
        fix_activity = [dict(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT COUNT(*) as total_reviews FROM review_tasks WHERE status = 'completed'"
        )
        total_reviews = cur.fetchone()["total_reviews"]

        cur.execute(
            "SELECT COUNT(*) as total_corrections FROM edit_history"
        )
        total_corrections = cur.fetchone()["total_corrections"]

        cur.execute(
            "SELECT COUNT(*) as total_fixes FROM document_fixes"
        )
        total_fixes = cur.fetchone()["total_fixes"]

        return {
            "review_activity": review_activity,
            "fix_activity": fix_activity,
            "total_reviews": total_reviews,
            "total_corrections": total_corrections,
            "total_fixes": total_fixes,
        }
    finally:
        put_conn(conn)


# ── Processing Metrics Aggregate ────────────────────────────────────────────

@router.get("/api/stats/processing")
def get_processing_aggregate():
    conn = get_db_connection()
    try:
        cur = _cursor(conn)
        cur.execute(
            "SELECT metric_name, "
            "ROUND(AVG(metric_value)::numeric, 2) as avg_val, "
            "ROUND(MIN(metric_value)::numeric, 2) as min_val, "
            "ROUND(MAX(metric_value)::numeric, 2) as max_val, "
            "COUNT(*) as samples, metric_unit "
            "FROM processing_metrics GROUP BY metric_name, metric_unit"
            if USE_POSTGRES else
            "SELECT metric_name, "
            "ROUND(AVG(metric_value), 2) as avg_val, "
            "ROUND(MIN(metric_value), 2) as min_val, "
            "ROUND(MAX(metric_value), 2) as max_val, "
            "COUNT(*) as samples, metric_unit "
            "FROM processing_metrics GROUP BY metric_name, metric_unit"
        )
        metrics = [_row_to_json(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT escalation_level, COUNT(*) as cnt "
            "FROM documents GROUP BY escalation_level ORDER BY escalation_level"
        )
        escalation = [_row_to_json(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT status, COUNT(*) as cnt, "
            "ROUND(AVG(COALESCE(retry_count, 0))::numeric, 1)::float8 as avg_retries "
            "FROM documents GROUP BY status"
            if USE_POSTGRES else
            "SELECT status, COUNT(*) as cnt, "
            "ROUND(AVG(COALESCE(retry_count, 0)), 1) as avg_retries "
            "FROM documents GROUP BY status"
        )
        status_breakdown = [_row_to_json(r) for r in cur.fetchall()]

        return {
            "metrics": metrics,
            "escalation": escalation,
            "status_breakdown": status_breakdown,
        }
    finally:
        put_conn(conn)


# ── Resolve Issue ────────────────────────────────────────────────────────────

@router.post("/api/stats/issues/{issue_id}/resolve")
def resolve_issue(issue_id: int, resolution: str = "manual"):
    conn = get_db_connection()
    try:
        cur = _cursor(conn)
        now_str = datetime.now().isoformat()
        cur.execute(
            "UPDATE document_issues SET resolved_at = %s, resolution = %s WHERE id = %s"
            if USE_POSTGRES else
            "UPDATE document_issues SET resolved_at = ?, resolution = ? WHERE id = ?",
            (now_str, resolution, issue_id)
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Issue not found")
        return {"message": "Issue resolved", "issue_id": issue_id}
    finally:
        put_conn(conn)
