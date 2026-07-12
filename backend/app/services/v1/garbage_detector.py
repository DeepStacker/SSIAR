from app.database import get_db_connection, put_conn
from app.auth import get_current_user_id


def is_garbage_value(field: str, value: str) -> str | None:
    if not value or not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None

    length = len(stripped)
    digit_count = sum(c.isdigit() for c in stripped)

    max_lens = {"roll_number": 15, "class": 3, "dob": 12, "gender": 2}
    if field == "class" and stripped.isdigit() and len(stripped) <= 3:
        val = int(stripped)
        if val < 1 or val > 12:
            return f"Class value {val} outside valid range 1-12"
    if field in max_lens and length > max_lens[field]:
        return f"Length {length} exceeds max {max_lens[field]} for {field}"

    text_fields = {"gender"}
    if field in text_fields and digit_count > length * 0.7:
        return f"Value is ~{digit_count / length * 100:.0f}% digits for {field}"
    if field == "dob" and "/" not in stripped and length >= 6 and digit_count == length:
        return f"DOB is a solid digit block (no date separators)"

    if length >= 6:
        unique = len(set(stripped))
        if unique <= 2:
            return f"Highly repetitive value ({unique} unique chars)"

    return None


def collect_garbage_docs() -> list:
    uid = get_current_user_id()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if uid:
            cursor.execute("""
                SELECT d.id, d.filename, d.status, d.escalation_level,
                       f.roll_number, f.class, f.dob, f.gender
                FROM documents d
                LEFT JOIN form_data f ON d.id = f.document_id
                WHERE d.status IN ('needs_review', 'verified') AND d.user_id = ?
                ORDER BY d.created_at DESC
            """, (uid,))
        else:
            cursor.execute("""
                SELECT d.id, d.filename, d.status, d.escalation_level,
                       f.roll_number, f.class, f.dob, f.gender
                FROM documents d
                LEFT JOIN form_data f ON d.id = f.document_id
                WHERE d.status IN ('needs_review', 'verified')
                ORDER BY d.created_at DESC
            """)
        rows = cursor.fetchall()
    finally:
        put_conn(conn)

    results = []
    for row in rows:
        doc_id, filename, status, escalation = row[:4]
        fields = {"roll_number": row[4], "class": row[5], "dob": row[6], "gender": row[7]}
        issues = []
        for fname, fval in fields.items():
            reason = is_garbage_value(fname, fval)
            if reason:
                issues.append({"field": fname, "value": str(fval)[:60], "reason": reason})
        if issues:
            results.append({
                "doc_id": doc_id,
                "filename": filename,
                "status": status,
                "escalation_level": escalation,
                "issues": issues,
            })
    return results
