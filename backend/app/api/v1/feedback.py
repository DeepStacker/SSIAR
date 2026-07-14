import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.responses import FileResponse

from app.auth import require_auth, get_current_user_id, get_current_role
from app.database import get_db_connection, put_conn, USE_POSTGRES
from app.config import BASE_DIR
from app.core.events import notify

if USE_POSTGRES:
    from psycopg2.extras import RealDictCursor

logger = logging.getLogger("feedback")

FEEDBACK_UPLOAD_DIR = BASE_DIR / "shared" / "uploads" / "feedback"
FEEDBACK_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "text/plain",
}

MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


def _get_cursor(conn):
    return conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()


def _feedback_to_dict(row, with_user_email=False):
    d = {
        "id": row["id"],
        "user_id": row["user_id"],
        "subject": row["subject"],
        "message": row["message"],
        "attachment_path": row.get("attachment_path"),
        "attachment_type": row.get("attachment_type"),
        "status": row.get("status", "open"),
        "created_at": row["created_at"],
        "updated_at": row.get("updated_at"),
    }
    if with_user_email:
        d["user_email"] = row.get("user_email", "")
    return d


def _msg_to_dict(row):
    return {
        "id": row["id"],
        "feedback_id": row["feedback_id"],
        "user_id": row["user_id"],
        "message": row["message"],
        "attachment_path": row.get("attachment_path"),
        "attachment_type": row.get("attachment_type"),
        "created_at": row["created_at"],
        "user_email": row.get("user_email", ""),
    }


def _save_attachment(attachment: UploadFile) -> tuple:
    if attachment.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"File type {attachment.content_type} not allowed")
    content = attachment.file.read()
    if len(content) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(status_code=413, detail="Attachment must be under 10MB")
    ext = Path(attachment.filename).suffix or ""
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = FEEDBACK_UPLOAD_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(content)
    return unique_name, attachment.content_type


@router.post("")
async def create_feedback(
    request: Request,
    subject: str = Form(...),
    message: str = Form(...),
    attachment: Optional[UploadFile] = File(None),
):
    require_auth(request)
    user_id = get_current_user_id()

    if not subject or not subject.strip():
        raise HTTPException(status_code=400, detail="Subject is required")
    if not message or not message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    subject = subject.strip()
    message = message.strip()

    attachment_path = None
    attachment_type = None

    if attachment and attachment.filename:
        attachment_path, attachment_type = _save_attachment(attachment)

    now = datetime.utcnow().isoformat()
    conn = get_db_connection()
    try:
        cur = _get_cursor(conn)
        if USE_POSTGRES:
            cur.execute(
                """INSERT INTO feedback (user_id, subject, message, attachment_path, attachment_type, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (user_id, subject, message, attachment_path, attachment_type, now, now),
            )
            feedback_id = cur.fetchone()["id"]
        else:
            cur.execute(
                """INSERT INTO feedback (user_id, subject, message, attachment_path, attachment_type, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (user_id, subject, message, attachment_path, attachment_type, now, now),
            )
            feedback_id = cur.lastrowid
        conn.commit()
        notify("feedback_created", {"feedback_id": feedback_id})
        return {"id": feedback_id, "created_at": now}
    except Exception as e:
        logger.exception("Failed to create feedback")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        put_conn(conn)


@router.get("")
async def list_feedback(
    request: Request,
    status: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
):
    require_auth(request)
    user_id = get_current_user_id()
    role = get_current_role()

    conn = get_db_connection()
    try:
        cur = _get_cursor(conn)
        ph = "%s" if USE_POSTGRES else "?"

        if role == "admin":
            cur.execute(
                f"SELECT COUNT(*) AS cnt FROM feedback f LEFT JOIN users u ON f.user_id = u.id"
                + (f" WHERE f.status = {ph}" if status else ""),
                (status,) if status else (),
            )
            total = cur.fetchone()["cnt"] if USE_POSTGRES else cur.fetchone()[0]

            cur.execute(
                f"""SELECT f.*, u.email as user_email FROM feedback f
                    LEFT JOIN users u ON f.user_id = u.id
                    {'WHERE f.status = ' + ph if status else ''}
                    ORDER BY f.created_at DESC LIMIT {ph} OFFSET {ph}""",
                (*(status,), limit, offset) if status else (limit, offset),
            )
            rows = cur.fetchall()
        else:
            cur.execute(f"SELECT COUNT(*) AS cnt FROM feedback WHERE user_id = {ph}", (user_id,))
            total = cur.fetchone()["cnt"] if USE_POSTGRES else cur.fetchone()[0]
            cur.execute(
                f"SELECT * FROM feedback WHERE user_id = {ph} ORDER BY created_at DESC LIMIT {ph} OFFSET {ph}",
                (user_id, limit, offset),
            )
            rows = cur.fetchall()

        items = [_feedback_to_dict(r, with_user_email=(role == "admin")) for r in rows]
        return {"items": items, "total": total}
    except Exception as e:
        logger.exception("Failed to list feedback")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        put_conn(conn)


@router.get("/{feedback_id}")
async def get_feedback(feedback_id: int, request: Request):
    require_auth(request)
    user_id = get_current_user_id()
    role = get_current_role()

    conn = get_db_connection()
    try:
        cur = _get_cursor(conn)
        ph = "%s" if USE_POSTGRES else "?"
        cur.execute(
            f"""SELECT f.*, u.email as user_email FROM feedback f
               LEFT JOIN users u ON f.user_id = u.id
               WHERE f.id = {ph}""",
            (feedback_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Feedback not found")
        if row["user_id"] != user_id and role != "admin":
            raise HTTPException(status_code=403, detail="Access denied")
        return _feedback_to_dict(row, with_user_email=True)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get feedback")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        put_conn(conn)


@router.put("/{feedback_id}/status")
async def update_feedback_status(feedback_id: int, request: Request, status: str = Query(...)):
    require_auth(request)
    role = get_current_role()
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin permissions required")
    if status not in ("open", "in_progress", "resolved", "closed"):
        raise HTTPException(status_code=400, detail="Invalid status")

    now = datetime.utcnow().isoformat()
    conn = get_db_connection()
    try:
        cur = _get_cursor(conn)
        ph = "%s" if USE_POSTGRES else "?"
        cur.execute(f"UPDATE feedback SET status = {ph}, updated_at = {ph} WHERE id = {ph}", (status, now, feedback_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Feedback not found")
        conn.commit()
        notify("feedback_status", {"feedback_id": feedback_id, "status": status})
        return {"message": f"Feedback status updated to {status}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update feedback status")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        put_conn(conn)


@router.get("/{feedback_id}/messages")
async def list_messages(feedback_id: int, request: Request):
    require_auth(request)
    user_id = get_current_user_id()
    role = get_current_role()

    conn = get_db_connection()
    try:
        cur = _get_cursor(conn)
        ph = "%s" if USE_POSTGRES else "?"
        cur.execute(f"SELECT user_id FROM feedback WHERE id = {ph}", (feedback_id,))
        fb = cur.fetchone()
        if not fb:
            raise HTTPException(status_code=404, detail="Feedback not found")
        if fb["user_id"] != user_id and role != "admin":
            raise HTTPException(status_code=403, detail="Access denied")

        cur.execute(
            f"""SELECT m.*, u.email as user_email FROM feedback_messages m
               LEFT JOIN users u ON m.user_id = u.id
               WHERE m.feedback_id = {ph}
               ORDER BY m.created_at ASC""",
            (feedback_id,),
        )
        msgs = [_msg_to_dict(r) for r in cur.fetchall()]
        return {"messages": msgs}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to list messages")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        put_conn(conn)


@router.post("/{feedback_id}/messages")
async def add_message(
    feedback_id: int,
    request: Request,
    message: str = Form(...),
    attachment: Optional[UploadFile] = File(None),
):
    require_auth(request)
    user_id = get_current_user_id()
    role = get_current_role()

    if not message or not message.strip():
        raise HTTPException(status_code=400, detail="Message is required")
    message = message.strip()

    conn = get_db_connection()
    try:
        cur = _get_cursor(conn)
        ph = "%s" if USE_POSTGRES else "?"

        cur.execute(f"SELECT user_id, status FROM feedback WHERE id = {ph}", (feedback_id,))
        fb = cur.fetchone()
        if not fb:
            raise HTTPException(status_code=404, detail="Feedback not found")
        if fb["user_id"] != user_id and role != "admin":
            raise HTTPException(status_code=403, detail="Access denied")
        if fb["status"] == "closed" and role != "admin":
            raise HTTPException(status_code=400, detail="This feedback is closed")

        attachment_path = None
        attachment_type = None
        if attachment and attachment.filename:
            attachment_path, attachment_type = _save_attachment(attachment)

        now = datetime.utcnow().isoformat()
        if USE_POSTGRES:
            cur.execute(
                """INSERT INTO feedback_messages (feedback_id, user_id, message, attachment_path, attachment_type, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                (feedback_id, user_id, message, attachment_path, attachment_type, now),
            )
            msg_id = cur.fetchone()["id"]
        else:
            cur.execute(
                """INSERT INTO feedback_messages (feedback_id, user_id, message, attachment_path, attachment_type, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (feedback_id, user_id, message, attachment_path, attachment_type, now),
            )
            msg_id = cur.lastrowid

        cur.execute(f"UPDATE feedback SET updated_at = {ph} WHERE id = {ph}", (now, feedback_id))
        conn.commit()
        notify("feedback_message", {"feedback_id": feedback_id})
        return {"id": msg_id, "created_at": now}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to add message")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        put_conn(conn)


@router.get("/attachments/{filename}")
async def serve_attachment(filename: str, request: Request):
    require_auth(request)
    file_path = FEEDBACK_UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Attachment not found")
    return FileResponse(str(file_path))
