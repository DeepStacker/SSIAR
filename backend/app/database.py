"""Database abstraction layer supporting both SQLite and PostgreSQL."""
import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional, Any

from app.config import DATABASE_URL

USE_POSTGRES = DATABASE_URL.startswith("postgresql")

if USE_POSTGRES:
    import psycopg2
    import psycopg2.pool
    from psycopg2.extras import RealDictCursor, RealDictRow

    _pool = None
    _pool_lock = threading.Lock()

    def _get_pool():
        global _pool
        if _pool is None:
            with _pool_lock:
                if _pool is None:
                    _pool = psycopg2.pool.ThreadedConnectionPool(
                        minconn=2, maxconn=20, dsn=DATABASE_URL
                    )
        return _pool

    def get_db_connection():
        return _get_pool().getconn()

    def put_conn(conn):
        _get_pool().putconn(conn)

else:
    import sqlite3
    from app.config import BASE_DIR as CFG_BASE_DIR

    _local = threading.local()

    def get_db_connection():
        conn = getattr(_local, 'conn', None)
        if conn is not None:
            try:
                conn.execute("SELECT 1")
                return conn
            except Exception:
                _local.conn = None
        db_path = os.environ.get(
            "SQLITE_PATH",
            str(CFG_BASE_DIR / "shared" / "database" / "ssiar.db")
        )
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        conn = sqlite3.connect(db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        _local.conn = conn
        return conn

    def put_conn(conn):
        pass  # SQLite uses thread-local, no release needed


def _dict_from_row(row) -> dict:
    """Convert a row (sqlite3.Row or RealDictRow) to a plain dict."""
    return dict(row)


def init_db():
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        if USE_POSTGRES:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    status TEXT NOT NULL,
                    classification TEXT,
                    escalation_level TEXT DEFAULT 'level_1',
                    created_at TEXT NOT NULL,
                    user_id TEXT REFERENCES users(id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS form_data (
                    id SERIAL PRIMARY KEY,
                    document_id TEXT NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
                    roll_number TEXT,
                    class TEXT,
                    dob TEXT,
                    gender TEXT,
                    consent TEXT,
                    responses TEXT,
                    academic_scores TEXT,
                    remarks TEXT,
                    confidence_scores TEXT,
                    quality_report TEXT,
                    verified_by_human INTEGER DEFAULT 0,
                    updated_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS edit_history (
                    id SERIAL PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    field_name TEXT NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    edited_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS corrections_training_data (
                    id SERIAL PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    field_name TEXT NOT NULL,
                    crop_image_path TEXT NOT NULL,
                    ocr_prediction TEXT,
                    corrected_text TEXT NOT NULL,
                    confidence_score REAL,
                    preprocessor_mode TEXT,
                    saved_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS azure_crop_cache (
                    crop_hash TEXT PRIMARY KEY,
                    recognized_text TEXT,
                    confidence REAL,
                    saved_at TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS azure_responses (
                    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
                    raw_response TEXT,
                    saved_at TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS processing_metrics (
                    id SERIAL PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    metric_name TEXT NOT NULL,
                    metric_value REAL,
                    metric_unit TEXT,
                    recorded_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS review_tasks (
                    id SERIAL PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    field_name TEXT NOT NULL,
                    original_value TEXT,
                    corrected_value TEXT,
                    priority TEXT NOT NULL DEFAULT 'normal',
                    status TEXT NOT NULL DEFAULT 'pending',
                    reviewer_id TEXT,
                    reviewed_at TEXT,
                    created_at TEXT NOT NULL
                )
            """)
        else:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    status TEXT NOT NULL,
                    classification TEXT,
                    escalation_level TEXT DEFAULT 'level_1',
                    created_at TEXT NOT NULL,
                    user_id TEXT REFERENCES users(id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS form_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id TEXT NOT NULL UNIQUE,
                    roll_number TEXT,
                    class TEXT,
                    dob TEXT,
                    gender TEXT,
                    consent TEXT,
                    responses TEXT,
                    academic_scores TEXT,
                    remarks TEXT,
                    confidence_scores TEXT,
                    quality_report TEXT,
                    verified_by_human INTEGER DEFAULT 0,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS edit_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id TEXT NOT NULL,
                    field_name TEXT NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    edited_at TEXT NOT NULL,
                    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS corrections_training_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id TEXT NOT NULL,
                    field_name TEXT NOT NULL,
                    crop_image_path TEXT NOT NULL,
                    ocr_prediction TEXT,
                    corrected_text TEXT NOT NULL,
                    confidence_score REAL,
                    preprocessor_mode TEXT,
                    saved_at TEXT NOT NULL,
                    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS azure_crop_cache (
                    crop_hash TEXT PRIMARY KEY,
                    recognized_text TEXT,
                    confidence REAL,
                    saved_at TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS azure_responses (
                    document_id TEXT PRIMARY KEY,
                    raw_response TEXT,
                    saved_at TEXT,
                    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS processing_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id TEXT NOT NULL,
                    metric_name TEXT NOT NULL,
                    metric_value REAL,
                    metric_unit TEXT,
                    recorded_at TEXT NOT NULL,
                    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS review_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id TEXT NOT NULL,
                    field_name TEXT NOT NULL,
                    original_value TEXT,
                    corrected_value TEXT,
                    priority TEXT NOT NULL DEFAULT 'normal',
                    status TEXT NOT NULL DEFAULT 'pending',
                    reviewer_id TEXT,
                    reviewed_at TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
                )
            """)
            _run_migrations(cur)
        conn.commit()
        print(f"Database initialized ({'PostgreSQL' if USE_POSTGRES else 'SQLite'})")
    finally:
        put_conn(conn)


def _run_migrations(cursor):
    cursor.execute("PRAGMA table_info(documents)")
    columns = [col[1] for col in cursor.fetchall()]
    if "classification" not in columns:
        try:
            cursor.execute("ALTER TABLE documents ADD COLUMN classification TEXT")
        except Exception:
            pass
    if "escalation_level" not in columns:
        try:
            cursor.execute("ALTER TABLE documents ADD COLUMN escalation_level TEXT DEFAULT 'level_1'")
        except Exception:
            pass
    if "user_id" not in columns:
        try:
            cursor.execute("ALTER TABLE documents ADD COLUMN user_id TEXT REFERENCES users(id)")
        except Exception:
            pass

    # Create default admin user for backward compatibility with existing docs
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        import hashlib, os, secrets
        default_id = "default_admin"
        default_email = "admin@ssiar.local"
        salt = os.urandom(16)
        dk = hashlib.pbkdf2_hmac("sha256", b"admin123", salt, 100_000)
        pw_hash = salt.hex() + ":" + dk.hex()
        cursor.execute(
            "INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (default_id, default_email, pw_hash, __import__("datetime").datetime.now().isoformat())
        )
        cursor.execute("UPDATE documents SET user_id = ? WHERE user_id IS NULL", (default_id,))


def insert_document(doc_id: str, filename: str, status: str = "processing",
                    classification: Optional[dict] = None,
                    escalation_level: str = "level_1",
                    user_id: Optional[str] = None):
    from app.auth import get_current_user_id
    uid = user_id or get_current_user_id()
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        now_str = datetime.now().isoformat()
        class_json = json.dumps(classification) if classification else None
        cur.execute(
            "INSERT INTO documents (id, filename, status, classification, escalation_level, created_at, user_id) VALUES (%s, %s, %s, %s, %s, %s, %s)"
            if USE_POSTGRES else
            "INSERT INTO documents (id, filename, status, classification, escalation_level, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (doc_id, filename, status, class_json, escalation_level, now_str, uid)
        )
        conn.commit()
    finally:
        put_conn(conn)


def update_document_status(doc_id: str, status: str, escalation_level: Optional[str] = None):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        if escalation_level:
            cur.execute(
                "UPDATE documents SET status = %s, escalation_level = %s WHERE id = %s"
                if USE_POSTGRES else
                "UPDATE documents SET status = ?, escalation_level = ? WHERE id = ?",
                (status, escalation_level, doc_id)
            )
        else:
            cur.execute(
                "UPDATE documents SET status = %s WHERE id = %s"
                if USE_POSTGRES else
                "UPDATE documents SET status = ? WHERE id = ?",
                (status, doc_id)
            )
        conn.commit()
    finally:
        put_conn(conn)


def _log_edit(cur, doc_id: str, field_name: str, old_value: Any, new_value: Any):
    if str(old_value) != str(new_value):
        now_str = datetime.now().isoformat()
        cur.execute(
            "INSERT INTO edit_history (document_id, field_name, old_value, new_value, edited_at) VALUES (%s, %s, %s, %s, %s)"
            if USE_POSTGRES else
            "INSERT INTO edit_history (document_id, field_name, old_value, new_value, edited_at) VALUES (?, ?, ?, ?, ?)",
            (doc_id, field_name, str(old_value) if old_value is not None else None, str(new_value), now_str)
        )


def log_correction_data(doc_id: str, field_name: str, crop_path: str,
                        ocr_pred: Optional[str], corrected_val: str,
                        confidence: Optional[float], mode: str):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        now_str = datetime.now().isoformat()
        cur.execute(
            "INSERT INTO corrections_training_data (document_id, field_name, crop_image_path, ocr_prediction, corrected_text, confidence_score, preprocessor_mode, saved_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
            if USE_POSTGRES else
            "INSERT INTO corrections_training_data (document_id, field_name, crop_image_path, ocr_prediction, corrected_text, confidence_score, preprocessor_mode, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (doc_id, field_name, crop_path, ocr_pred, corrected_val, confidence, mode, now_str)
        )
        conn.commit()
    finally:
        put_conn(conn)


def insert_or_update_form_data(doc_id: str, roll_number: str, class_val: str,
                               dob: str, gender: str, consent: str,
                               responses: dict, academic_scores: dict,
                               remarks: str, confidence_scores: dict,
                               quality_report: Optional[dict] = None,
                               verified: int = 0):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        now_str = datetime.now().isoformat()
        resp_json = json.dumps(responses)
        acad_json = json.dumps(academic_scores)
        conf_json = json.dumps(confidence_scores)
        qual_json = json.dumps(quality_report) if quality_report else None

        cur.execute(
            "SELECT id FROM form_data WHERE document_id = %s" if USE_POSTGRES else
            "SELECT id FROM form_data WHERE document_id = ?", (doc_id,)
        )
        row = cur.fetchone()

        if row:
            # Always capture dirty-field diffs (audit trail for both verified and unverified updates)
            cur.execute(
                "SELECT roll_number, class, dob, gender, consent, responses, academic_scores, remarks FROM form_data WHERE document_id = %s"
                if USE_POSTGRES else
                "SELECT roll_number, class, dob, gender, consent, responses, academic_scores, remarks FROM form_data WHERE document_id = ?",
                (doc_id,)
            )
            old = cur.fetchone()
            if old:
                old_d = dict(old)
                _log_edit(cur, doc_id, "roll_number", old_d.get("roll_number"), roll_number)
                _log_edit(cur, doc_id, "class", old_d.get("class"), class_val)
                _log_edit(cur, doc_id, "dob", old_d.get("dob"), dob)
                _log_edit(cur, doc_id, "gender", old_d.get("gender"), gender)
                _log_edit(cur, doc_id, "consent", old_d.get("consent"), consent)
                _log_edit(cur, doc_id, "responses", old_d.get("responses"), resp_json)
                _log_edit(cur, doc_id, "academic_scores", old_d.get("academic_scores"), acad_json)
                _log_edit(cur, doc_id, "remarks", old_d.get("remarks"), remarks)

            if qual_json:
                cur.execute(
                    "UPDATE form_data SET roll_number=%s, class=%s, dob=%s, gender=%s, consent=%s, responses=%s, academic_scores=%s, remarks=%s, confidence_scores=%s, quality_report=%s, verified_by_human=%s, updated_at=%s WHERE document_id=%s"
                    if USE_POSTGRES else
                    "UPDATE form_data SET roll_number=?, class=?, dob=?, gender=?, consent=?, responses=?, academic_scores=?, remarks=?, confidence_scores=?, quality_report=?, verified_by_human=?, updated_at=? WHERE document_id=?",
                    (roll_number, class_val, dob, gender, consent, resp_json, acad_json, remarks, conf_json, qual_json, verified, now_str, doc_id)
                )
            else:
                cur.execute(
                    "UPDATE form_data SET roll_number=%s, class=%s, dob=%s, gender=%s, consent=%s, responses=%s, academic_scores=%s, remarks=%s, confidence_scores=%s, verified_by_human=%s, updated_at=%s WHERE document_id=%s"
                    if USE_POSTGRES else
                    "UPDATE form_data SET roll_number=?, class=?, dob=?, gender=?, consent=?, responses=?, academic_scores=?, remarks=?, confidence_scores=?, verified_by_human=?, updated_at=? WHERE document_id=?",
                    (roll_number, class_val, dob, gender, consent, resp_json, acad_json, remarks, conf_json, verified, now_str, doc_id)
                )
        else:
            cur.execute(
                "INSERT INTO form_data (document_id, roll_number, class, dob, gender, consent, responses, academic_scores, remarks, confidence_scores, quality_report, verified_by_human, updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
                if USE_POSTGRES else
                "INSERT INTO form_data (document_id, roll_number, class, dob, gender, consent, responses, academic_scores, remarks, confidence_scores, quality_report, verified_by_human, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (doc_id, roll_number, class_val, dob, gender, consent, resp_json, acad_json, remarks, conf_json, qual_json, verified, now_str)
            )
        conn.commit()
    finally:
        put_conn(conn)


def get_document(doc_id: str) -> Optional[dict]:
    from app.auth import get_current_user_id
    uid = get_current_user_id()
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        cur.execute(
            """SELECT d.id, d.filename, d.status, d.classification, d.escalation_level, d.created_at,
               f.roll_number, f.class, f.dob, f.gender, f.consent, f.responses,
               f.academic_scores, f.remarks, f.confidence_scores, f.quality_report, f.verified_by_human
               FROM documents d LEFT JOIN form_data f ON d.id = f.document_id WHERE d.id = %s AND d.user_id = %s"""
            if USE_POSTGRES else
            """SELECT d.id, d.filename, d.status, d.classification, d.escalation_level, d.created_at,
               f.roll_number, f.class, f.dob, f.gender, f.consent, f.responses,
               f.academic_scores, f.remarks, f.confidence_scores, f.quality_report, f.verified_by_human
               FROM documents d LEFT JOIN form_data f ON d.id = f.document_id WHERE d.id = ? AND d.user_id = ?""",
            (doc_id, uid) if uid else (doc_id,)
        )
        row = cur.fetchone()
        if row:
            d = dict(row)
            for key in ('responses', 'academic_scores', 'confidence_scores', 'quality_report', 'classification'):
                if d.get(key):
                    try:
                        d[key] = json.loads(d[key])
                    except (json.JSONDecodeError, TypeError):
                        pass
            return d
        return None
    finally:
        put_conn(conn)


def document_exists_by_filename(filename: str) -> bool:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM documents WHERE filename = %s"
            if USE_POSTGRES else
            "SELECT COUNT(*) FROM documents WHERE filename = ?",
            (filename,)
        )
        count = cur.fetchone()[0]
        return count > 0
    finally:
        put_conn(conn)


def get_all_documents() -> list:
    from app.auth import get_current_user_id
    uid = get_current_user_id()
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        if uid:
            cur.execute(
                """SELECT d.id, d.filename, d.status, d.classification, d.escalation_level, d.created_at,
                   f.roll_number, f.class, f.dob, f.gender, f.consent, f.verified_by_human
                   FROM documents d LEFT JOIN form_data f ON d.id = f.document_id
                   WHERE d.user_id = ?
                   ORDER BY d.created_at DESC""",
                (uid,)
            )
        else:
            cur.execute(
                """SELECT d.id, d.filename, d.status, d.classification, d.escalation_level, d.created_at,
                   f.roll_number, f.class, f.dob, f.gender, f.consent, f.verified_by_human
                   FROM documents d LEFT JOIN form_data f ON d.id = f.document_id
                   ORDER BY d.created_at DESC"""
            )
        rows = cur.fetchall()
        results = []
        for r in rows:
            d = dict(r)
            if d.get('classification'):
                try:
                    d['classification'] = json.loads(d['classification'])
                except (json.JSONDecodeError, TypeError):
                    pass
            results.append(d)
        return results
    finally:
        put_conn(conn)


def get_edit_history(doc_id: str) -> list:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        cur.execute(
            "SELECT field_name, old_value, new_value, edited_at FROM edit_history WHERE document_id = %s ORDER BY edited_at DESC"
            if USE_POSTGRES else
            "SELECT field_name, old_value, new_value, edited_at FROM edit_history WHERE document_id = ? ORDER BY edited_at DESC",
            (doc_id,)
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        put_conn(conn)


def get_corrections_log() -> list:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        cur.execute("SELECT * FROM corrections_training_data ORDER BY saved_at DESC")
        return [dict(r) for r in cur.fetchall()]
    finally:
        put_conn(conn)


def delete_document(doc_id: str):
    from app.auth import get_current_user_id
    from app.image.storage import delete_document_files
    uid = get_current_user_id()
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        if uid:
            cur.execute(
                "DELETE FROM documents WHERE id = %s AND user_id = %s" if USE_POSTGRES else
                "DELETE FROM documents WHERE id = ? AND user_id = ?",
                (doc_id, uid)
            )
        else:
            cur.execute(
                "DELETE FROM documents WHERE id = %s" if USE_POSTGRES else
                "DELETE FROM documents WHERE id = ?", (doc_id,)
            )
        conn.commit()
    finally:
        put_conn(conn)
    delete_document_files(doc_id)


def bulk_delete_documents(doc_ids: list) -> int:
    from app.auth import get_current_user_id
    from app.image.storage import delete_document_files
    uid = get_current_user_id()
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        placeholders = ",".join("%s" if USE_POSTGRES else "?" for _ in doc_ids)
        if uid:
            cur.execute(f"DELETE FROM documents WHERE id IN ({placeholders}) AND user_id = ?", [*doc_ids, uid])
        else:
            cur.execute(f"DELETE FROM documents WHERE id IN ({placeholders})", doc_ids)
        conn.commit()
        count = cur.rowcount
    finally:
        put_conn(conn)
    for doc_id in doc_ids:
        delete_document_files(doc_id)
    return count


def store_pdf(doc_id: str, pdf_bytes: bytes):
    from app.image.storage import store_pdf_file
    store_pdf_file(doc_id, pdf_bytes)


def get_pdf(doc_id: str) -> bytes:
    from app.image.storage import get_pdf_file
    return get_pdf_file(doc_id)


def store_page_image(doc_id: str, page_num: int, image_bytes: bytes):
    from app.image.storage import store_page_image_file
    store_page_image_file(doc_id, page_num, image_bytes)


def get_page_image(doc_id: str, page_num: int) -> bytes:
    from app.image.storage import get_page_image_file
    return get_page_image_file(doc_id, page_num)
