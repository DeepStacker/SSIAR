"""Tracking & statistics endpoints for per-document stats, issues, fixes, and DLQ."""

from datetime import datetime
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
