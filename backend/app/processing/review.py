"""
Human Review System (Modules 9-10)
====================================
Purpose: Review only uncertain information rather than entire forms.
Supports review categories: critical fields, low trust fields, and random sampling.
Stores all corrections for future learning.
"""
from datetime import datetime
from typing import Optional
from app.database import get_db_connection, put_conn


# ── Review Task Management ───────────────────────────────────────────────────

def create_review_task(
    document_id: str,
    field_name: str,
    original_value: str,
    priority: str = "low_trust",
    reviewer_id: Optional[str] = None,
) -> str:
    """Create a review task for a specific field."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        now_str = datetime.now().isoformat()
        cur.execute(
            """INSERT INTO review_tasks 
               (document_id, field_name, original_value, priority, status, created_at)
               VALUES (?, ?, ?, ?, 'pending', ?)""",
            (document_id, field_name, original_value, priority, now_str)
        )
        conn.commit()
        task_id = cur.lastrowid
        return str(task_id)
    finally:
        put_conn(conn)


def get_pending_review_tasks(
    reviewer_id: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """Get pending review tasks."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        conditions = ["status = 'pending'"]
        params = []
        
        if reviewer_id:
            conditions.append("reviewer_id = ?")
            params.append(reviewer_id)
        if priority:
            conditions.append("priority = ?")
            params.append(priority)
        
        where = " AND ".join(conditions)
        cur.execute(
            f"SELECT * FROM review_tasks WHERE {where} ORDER BY "
            "CASE priority WHEN 'critical' THEN 0 WHEN 'low_trust' THEN 1 ELSE 2 END, "
            "created_at ASC LIMIT ?",
            params + [limit]
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        put_conn(conn)


def submit_review(
    task_id: int,
    corrected_value: str,
    reviewer_id: str,
) -> bool:
    """Submit a correction for a review task."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        now_str = datetime.now().isoformat()
        
        # Get original task
        cur.execute(
            "SELECT document_id, field_name, original_value FROM review_tasks WHERE id = ?",
            (task_id,)
        )
        task = cur.fetchone()
        if not task:
            return False
        
        doc_id = task["document_id"]
        field_name = task["field_name"]
        original_value = task["original_value"]
        
        # Update task
        cur.execute(
            """UPDATE review_tasks 
               SET corrected_value = ?, status = 'completed', reviewer_id = ?, reviewed_at = ?
               WHERE id = ?""",
            (corrected_value, reviewer_id, now_str, task_id)
        )
        
        # Log correction data
        from app.database import log_correction_data
        log_correction_data(
            doc_id=doc_id,
            field_name=field_name,
            crop_path=f"db://{doc_id}/{field_name}",
            ocr_pred=original_value,
            corrected_val=corrected_value,
            confidence=0.0,
            mode="human_review",
        )
        
        conn.commit()
    finally:
        put_conn(conn)
        
    # Update form_data and document status outside the transaction to prevent locks
    from app.database import get_document, insert_or_update_form_data, update_document_status
    from app.sse import notify as notify_sse
    
    doc = get_document(doc_id)
    if doc:
        # Prepare updated fields
        roll_number = doc.get("roll_number") or ""
        class_val = doc.get("class") or ""
        dob = doc.get("dob") or ""
        gender = doc.get("gender") or ""
        consent = doc.get("consent") or "Unanswered"
        remarks = doc.get("remarks") or ""
        academic_scores = doc.get("academic_scores") or {}
        responses = doc.get("responses") or {}
        confidence_scores = doc.get("confidence_scores") or {}
        
        # Map corrected value to the correct field
        if field_name == "roll_number":
            roll_number = corrected_value
        elif field_name == "class":
            class_val = corrected_value
        elif field_name == "dob":
            dob = corrected_value
        elif field_name == "gender":
            gender = corrected_value
        elif field_name == "consent":
            consent = corrected_value
        elif field_name == "remarks":
            remarks = corrected_value
        elif field_name in ("math_pct", "science_pct", "language_pct", "rank"):
            academic_scores[field_name] = corrected_value
        elif field_name.startswith("q") and field_name[1:].isdigit():
            try:
                responses[field_name] = int(corrected_value)
            except ValueError:
                responses[field_name] = corrected_value
        # Update the confidence scores mapping to make the corrected field high confidence
        if isinstance(confidence_scores, dict):
            ocr_map = confidence_scores.setdefault("ocr", {})
            ocr_map[field_name] = "high_confidence"
            
            v2_trust = confidence_scores.setdefault("v2_trust", {})
            if field_name in v2_trust:
                v2_trust[field_name]["trust_confidence"] = 1.0
                v2_trust[field_name]["ocr_confidence"] = 1.0
                v2_trust[field_name]["validation_score"] = 1.0
                
        # Save the updated form data back to DB
        insert_or_update_form_data(
            doc_id=doc_id,
            roll_number=roll_number,
            class_val=class_val,
            dob=dob,
            gender=gender,
            consent=consent,
            responses=responses,
            academic_scores=academic_scores,
            remarks=remarks,
            confidence_scores=confidence_scores,
            verified=1
        )
        
    # Check if there are any remaining pending review tasks for this document
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM review_tasks WHERE document_id = ? AND status = 'pending'",
            (doc_id,)
        )
        remaining = cur.fetchone()[0]
        if remaining == 0:
            # Mark document as approved
            update_document_status(doc_id, "approved")
            notify_sse("document_updated", {
                "doc_id": doc_id,
                "status": "approved",
                "escalation_level": doc.get("escalation_level", "level_1") if doc else "level_1"
            }, user_id=reviewer_id)
    finally:
        put_conn(conn)
        
    return True


def get_review_statistics() -> dict:
    """Get review system statistics."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM review_tasks")
        total = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM review_tasks WHERE status = 'pending'")
        pending = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM review_tasks WHERE status = 'completed'")
        completed = cur.fetchone()[0]
        
        cur.execute("""
            SELECT AVG(
                CASE WHEN original_value != corrected_value THEN 1.0 ELSE 0.0 END
            ) FROM review_tasks WHERE status = 'completed' AND corrected_value IS NOT NULL
        """)
        correction_rate = cur.fetchone()[0] or 0.0
        
        return {
            "total_tasks": total,
            "pending": pending,
            "completed": completed,
            "correction_rate": correction_rate,
        }
    finally:
        put_conn(conn)


# ── Human Correction Learning Database ──────────────────────────────────────

def store_correction_feedback(
    doc_id: str,
    field_name: str,
    original_value: str,
    corrected_value: str,
    image_crop_path: Optional[str] = None,
    model_output: Optional[str] = None,
    confidence: float = 0.0,
    reviewer: Optional[str] = None,
) -> None:
    """Store human correction for future training/analysis."""
    from app.database import log_correction_data as db_log_correction
    db_log_correction(
        doc_id=doc_id,
        field_name=field_name,
        crop_path=image_crop_path or f"db://{doc_id}/{field_name}",
        ocr_pred=original_value or model_output,
        corrected_val=corrected_value,
        confidence=confidence,
        mode="human_review_v2",
    )