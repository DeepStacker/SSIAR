"""
Human Review System (Modules 9-10)
====================================
Purpose: Review only uncertain information rather than entire forms.
Supports review categories: critical fields, low trust fields, and random sampling.
Stores all corrections for future learning.
"""
from datetime import datetime
from typing import Optional
from app.database import get_db_connection, put_conn, USE_POSTGRES
if USE_POSTGRES:
    from psycopg2.extras import RealDictCursor


# ── Review Task Management ───────────────────────────────────────────────────

def create_review_task(
    document_id: str,
    field_name: str,
    original_value: str,
    priority: str = "low_trust",
    reviewer_id: Optional[str] = None,
    page_number: Optional[int] = None,
    confidence_score: Optional[float] = None,
    error_details: Optional[str] = None,
) -> str:
    """Create a review task for a specific field."""
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        now_str = datetime.now().isoformat()
        cur.execute(
            """INSERT INTO review_tasks 
               (document_id, field_name, original_value, priority, status, created_at, page_number, confidence_score, error_details)
               VALUES (%s, %s, %s, %s, 'pending', %s, %s, %s, %s) RETURNING id""" if USE_POSTGRES else
            """INSERT INTO review_tasks 
               (document_id, field_name, original_value, priority, status, created_at, page_number, confidence_score, error_details)
               VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)""",
            (document_id, field_name, original_value, priority, now_str, page_number, confidence_score, error_details)
        )
        if USE_POSTGRES:
            task_id = str(cur.fetchone()["id"])
        else:
            task_id = str(cur.lastrowid)
        return task_id
    finally:
        put_conn(conn)


def get_pending_review_tasks(
    reviewer_id: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = 50,
    document_id: Optional[str] = None,
    field_type: Optional[str] = None,
    error_type: Optional[str] = None,
    sort_by: str = "priority",
    sort_dir: str = "asc",
    user_id: Optional[str] = None,
) -> tuple[list[dict], int]:
    """Get pending review tasks enriched with document metadata and coordinates, along with grand total count."""
    import json
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        conditions = ["r.status = 'pending'"]
        params = []
        
        if user_id:
            conditions.append("d.user_id = %s" if USE_POSTGRES else "d.user_id = ?")
            params.append(user_id)
        if reviewer_id:
            conditions.append("r.reviewer_id = %s" if USE_POSTGRES else "r.reviewer_id = ?")
            params.append(reviewer_id)
        if priority:
            conditions.append("r.priority = %s" if USE_POSTGRES else "r.priority = ?")
            params.append(priority)
        if document_id:
            conditions.append("r.document_id = %s" if USE_POSTGRES else "r.document_id = ?")
            params.append(document_id)
        if field_type == "sdq":
            conditions.append("r.field_name LIKE 'q%'")
        elif field_type == "demographic":
            conditions.append("r.field_name NOT LIKE 'q%'")
        if error_type:
            conditions.append("r.error_details = %s" if USE_POSTGRES else "r.error_details = ?")
            params.append(error_type)
            
        where = " AND ".join(conditions)
        
        # Get total unpaginated count matching filters
        cur.execute(
            f"SELECT COUNT(*) AS cnt FROM review_tasks r "
            f"LEFT JOIN documents d ON r.document_id = d.id "
            f"WHERE {where}",
            params
        )
        total_count = cur.fetchone()["cnt"]
        
        # Determine sorting clause
        sort_dir_sql = "DESC" if sort_dir.lower() == "desc" else "ASC"
        
        if sort_by == "priority":
            order_by = f"CASE r.priority WHEN 'critical' THEN 0 WHEN 'low_trust' THEN 1 ELSE 2 END {sort_dir_sql}, r.created_at ASC"
        elif sort_by == "confidence":
            order_by = f"r.confidence_score {sort_dir_sql}, r.created_at ASC"
        elif sort_by == "filename":
            order_by = f"d.filename {sort_dir_sql}, r.created_at ASC"
        elif sort_by == "created_at":
            order_by = f"r.created_at {sort_dir_sql}"
        else:
            order_by = f"CASE r.priority WHEN 'critical' THEN 0 WHEN 'low_trust' THEN 1 ELSE 2 END ASC, r.created_at ASC"
            
        cur.execute(
            f"SELECT r.*, d.filename FROM review_tasks r "
            f"LEFT JOIN documents d ON r.document_id = d.id "
            f"WHERE {where} ORDER BY {order_by} LIMIT {'%s' if USE_POSTGRES else '?'}",
            params + [limit]
        )
        
        rows = [dict(r) for r in cur.fetchall()]
        
        # Enrich coordinates from form_data confidence_scores
        for row in rows:
            doc_id = row["document_id"]
            field_name = row["field_name"]
            
            cur.execute("SELECT confidence_scores FROM form_data WHERE document_id = %s" if USE_POSTGRES else "SELECT confidence_scores FROM form_data WHERE document_id = ?", (doc_id,))
            fd_row = cur.fetchone()
            confidence_scores = fd_row["confidence_scores"] if fd_row else None
            if fd_row and confidence_scores:
                try:
                    cs = json.loads(confidence_scores)
                    v2_trust = cs.get("v2_trust", {})
                    field_data = v2_trust.get(field_name, {})
                    
                    if not row.get("page_number") and "page" in field_data:
                        row["page_number"] = field_data["page"]
                    if not row.get("confidence_score") and "trust_confidence" in field_data:
                        row["confidence_score"] = field_data["trust_confidence"]
                        
                    # Scale coordinates from 300 DPI space to actual image pixels (matching documents.py detail scaling)
                    polygon = field_data.get("polygon")
                    page_num = field_data.get("page", 1)
                    
                    is_fallback = False
                    if not polygon or len(polygon) < 8:
                        from app.image.page_utils import get_page
                        img = get_page(doc_id, page_num)
                        if img is not None:
                            h, w = img.shape[:2]
                            from app.image.crops import get_field_coordinates
                            polygon, page_num = get_field_coordinates(field_name, w, h)
                            is_fallback = True
                            
                    if polygon and not is_fallback:
                        from app.image.page_utils import get_page, get_azure_scale
                        img = get_page(doc_id, page_num)
                        if img is not None:
                            h, w = img.shape[:2]
                            scale_x, scale_y = get_azure_scale(doc_id, page_num, w, h)
                            if polygon and len(polygon) >= 8:
                                polygon = [
                                    pt * scale_x if idx % 2 == 0 else pt * scale_y
                                    for idx, pt in enumerate(polygon)
                                ]
                                
                    row["polygon"] = polygon
                except Exception:
                    row["polygon"] = None
            else:
                # Direct fallback to static template coordinates if form_data is missing/incomplete
                try:
                    from app.image.page_utils import get_page
                    page_num = row.get("page_number") or (2 if field_name in ("math_pct", "science_pct", "language_pct", "rank", "remarks") or (field_name.startswith("q") and int(field_name[1:]) >= 13) else 1)
                    img = get_page(doc_id, page_num)
                    if img is not None:
                        h, w = img.shape[:2]
                        from app.image.crops import get_field_coordinates
                        polygon, page_num = get_field_coordinates(field_name, w, h)
                        row["polygon"] = polygon
                    else:
                        row["polygon"] = None
                except Exception:
                    row["polygon"] = None
            
            # Default fallback for page number if still missing
            if not row.get("page_number"):
                if field_name.startswith("q") and field_name[1:].isdigit():
                    row["page_number"] = 2 if int(field_name[1:]) >= 13 else 1
                else:
                    row["page_number"] = 2 if field_name in ("math_pct", "science_pct", "language_pct", "rank", "remarks") else 1
                    
        return rows, total_count
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
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        now_str = datetime.now().isoformat()
        
        # Get original task
        cur.execute(
            "SELECT document_id, field_name, original_value FROM review_tasks WHERE id = %s" if USE_POSTGRES else
            "SELECT document_id, field_name, original_value FROM review_tasks WHERE id = ?",
            (task_id,)
        )
        task = cur.fetchone()
        if not task:
            return False
        
        doc_id = task["document_id"]
        field_name = task["field_name"]
        original_value = task["original_value"]
        
        # Update this task and any duplicate pending tasks for the same field in this document
        cur.execute(
            """UPDATE review_tasks 
               SET corrected_value = %s, status = 'completed', reviewer_id = %s, reviewed_at = %s
               WHERE document_id = %s AND field_name = %s AND status = 'pending'""" if USE_POSTGRES else
            """UPDATE review_tasks 
               SET corrected_value = ?, status = 'completed', reviewer_id = ?, reviewed_at = ?
               WHERE document_id = ? AND field_name = ? AND status = 'pending'""",
            (corrected_value, reviewer_id, now_str, doc_id, field_name)
        )
        
        # Ensure the specific task_id is marked completed (in case it wasn't pending, though it should be)
        cur.execute(
            """UPDATE review_tasks 
               SET corrected_value = %s, status = 'completed', reviewer_id = %s, reviewed_at = %s
               WHERE id = %s""" if USE_POSTGRES else
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
    from app.core.events import notify as notify_sse
    
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
            # Support multi-tick arrays e.g. '[1, 2]' or '1,2'
            val_str = corrected_value.strip()
            if val_str.startswith("[") and val_str.endswith("]"):
                try:
                    import json
                    responses[field_name] = json.loads(val_str)
                except Exception:
                    responses[field_name] = val_str
            elif "," in val_str:
                try:
                    responses[field_name] = [int(x.strip()) for x in val_str.split(",") if x.strip().isdigit()]
                except Exception:
                    responses[field_name] = val_str
            else:
                try:
                    responses[field_name] = int(val_str)
                except ValueError:
                    responses[field_name] = val_str
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
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM review_tasks WHERE document_id = %s AND status = 'pending'" if USE_POSTGRES else
            "SELECT COUNT(*) AS cnt FROM review_tasks WHERE document_id = ? AND status = 'pending'",
            (doc_id,)
        )
        remaining = cur.fetchone()["cnt"]
        if remaining == 0:
            # Mark document as verified
            update_document_status(doc_id, "verified")
            notify_sse("document_updated", {
                "doc_id": doc_id,
                "status": "verified",
                "escalation_level": doc.get("escalation_level", "level_1") if doc else "level_1"
            }, user_id=reviewer_id)
    finally:
        put_conn(conn)
        
    return True


def get_review_statistics() -> dict:
    """Get review system statistics."""
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        cur.execute("SELECT COUNT(*) AS cnt FROM review_tasks")
        total = cur.fetchone()["cnt"]
        
        cur.execute("SELECT COUNT(*) AS cnt FROM review_tasks WHERE status = 'pending'")
        pending = cur.fetchone()["cnt"]
        
        cur.execute("SELECT COUNT(*) AS cnt FROM review_tasks WHERE status = 'completed'")
        completed = cur.fetchone()["cnt"]
        
        cur.execute("""
            SELECT AVG(
                CASE WHEN original_value != corrected_value THEN 1.0 ELSE 0.0 END
            ) AS rate FROM review_tasks WHERE status = 'completed' AND corrected_value IS NOT NULL
        """)
        correction_rate = cur.fetchone()["rate"] or 0.0
        
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