import sqlite3
import os
import json
import threading
from datetime import datetime
from pathlib import Path

# Compute paths relative to project root (backend/app/../../ = project root)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = str(BASE_DIR / "shared" / "database" / "ssiar.db")

_local = threading.local()

def get_db_connection():
    conn = getattr(_local, 'conn', None)
    if conn is not None:
        try:
            conn.execute("SELECT 1")
            # Verify the cached connection still points to the current DB_PATH
            # (tests can change DB_PATH between test classes)
            if getattr(_local, 'db_path', None) == DB_PATH:
                return conn
        except sqlite3.ProgrammingError:
            _local.conn = None
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    _local.conn = conn
    _local.db_path = DB_PATH
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create documents table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        status TEXT NOT NULL, -- 'processing', 'needs_review', 'verified', 'failed'
        classification TEXT, -- JSON string of classification type, DPI, pages, color status
        escalation_level TEXT DEFAULT 'level_1', -- 'level_1', 'level_2', 'level_3', 'level_4'
        created_at TEXT NOT NULL
    )
    """)
    
    # Create form_data table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS form_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL UNIQUE,
        roll_number TEXT,
        class TEXT,
        dob TEXT,
        gender TEXT,
        consent TEXT, -- 'Yes', 'No', or 'Unanswered'
        responses TEXT, -- JSON string of 25 answers e.g. {"q1": 3, ...}
        academic_scores TEXT, -- JSON string e.g. {"math": "69%", "science": "40%", "language": "60%", "rank": "45"}
        remarks TEXT, -- Transcribed text comments
        confidence_scores TEXT, -- JSON string of confidence fields
        quality_report TEXT, -- JSON string of scan quality stats
        verified_by_human INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
    """)
    
    # Audit trail table — logs every human edit for undo/review
    cursor.execute("""
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
    
    # Learning From Corrections table — stores corrections for offline model training
    cursor.execute("""
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
    
    # Schema version table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
    )
    """)

    # Azure Crop Cache table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS azure_crop_cache (
        crop_hash TEXT PRIMARY KEY,
        recognized_text TEXT,
        confidence REAL,
        saved_at TEXT
    )
    """)
    
    _run_migrations(cursor)
    
    conn.commit()
    print("Database initialized successfully at:", DB_PATH)

def _run_migrations(cursor):
    """Run migrations by directly inspecting table columns."""
    cursor.execute("PRAGMA table_info(documents)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if "classification" not in columns:
        try:
            cursor.execute("ALTER TABLE documents ADD COLUMN classification TEXT")
        except sqlite3.OperationalError:
            pass
            
    if "escalation_level" not in columns:
        try:
            cursor.execute("ALTER TABLE documents ADD COLUMN escalation_level TEXT DEFAULT 'level_1'")
        except sqlite3.OperationalError:
            pass

    if "pdf_data" not in columns:
        try:
            cursor.execute("ALTER TABLE documents ADD COLUMN pdf_data BLOB")
        except sqlite3.OperationalError:
            pass

def insert_document(doc_id, filename, status="processing", classification=None, escalation_level="level_1"):
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().isoformat()
    class_json = json.dumps(classification) if classification is not None else None
    cursor.execute(
        "INSERT INTO documents (id, filename, status, classification, escalation_level, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (doc_id, filename, status, class_json, escalation_level, now_str)
    )
    conn.commit()
    # conn.close()  # thread-local connection pool reuses per thread

def update_document_status(doc_id, status, escalation_level=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    if escalation_level:
        cursor.execute(
            "UPDATE documents SET status = ?, escalation_level = ? WHERE id = ?",
            (status, escalation_level, doc_id)
        )
    else:
        cursor.execute(
            "UPDATE documents SET status = ? WHERE id = ?",
            (status, doc_id)
        )
    conn.commit()
    # conn.close()  # thread-local connection pool reuses per thread

def _log_edit(cursor, doc_id, field_name, old_value, new_value):
    """Record a single field change in the audit trail."""
    if str(old_value) != str(new_value):
        now_str = datetime.now().isoformat()
        cursor.execute(
            "INSERT INTO edit_history (document_id, field_name, old_value, new_value, edited_at) VALUES (?, ?, ?, ?, ?)",
            (doc_id, field_name, str(old_value) if old_value is not None else None, str(new_value), now_str)
        )

def log_correction_data(doc_id, field_name, crop_path, ocr_pred, corrected_val, confidence, mode):
    """Saves a corrected pair for offline model training."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO corrections_training_data (document_id, field_name, crop_image_path, ocr_prediction, corrected_text, confidence_score, preprocessor_mode, saved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (doc_id, field_name, crop_path, ocr_pred, corrected_val, confidence, mode, now_str))
    conn.commit()
    # conn.close()  # thread-local connection pool reuses per thread

def insert_or_update_form_data(doc_id, roll_number, class_val, dob, gender, consent, responses, academic_scores, remarks, confidence_scores, quality_report=None, verified=0):
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().isoformat()
    
    cursor.execute("SELECT id FROM form_data WHERE document_id = ?", (doc_id,))
    row = cursor.fetchone()
    
    resp_json = json.dumps(responses)
    acad_json = json.dumps(academic_scores)
    conf_json = json.dumps(confidence_scores)
    qual_json = json.dumps(quality_report) if quality_report is not None else None
    
    if row:
        if verified == 1:
            # Fetch old values for audit trail
            cursor.execute("SELECT roll_number, class, dob, gender, consent, responses, academic_scores, remarks FROM form_data WHERE document_id = ?", (doc_id,))
            old = cursor.fetchone()
            if old:
                old_d = dict(old)
                _log_edit(cursor, doc_id, "roll_number", old_d.get("roll_number"), roll_number)
                _log_edit(cursor, doc_id, "class", old_d.get("class"), class_val)
                _log_edit(cursor, doc_id, "dob", old_d.get("dob"), dob)
                _log_edit(cursor, doc_id, "gender", old_d.get("gender"), gender)
                _log_edit(cursor, doc_id, "consent", old_d.get("consent"), consent)
                _log_edit(cursor, doc_id, "responses", old_d.get("responses"), resp_json)
                _log_edit(cursor, doc_id, "academic_scores", old_d.get("academic_scores"), acad_json)
                _log_edit(cursor, doc_id, "remarks", old_d.get("remarks"), remarks)
        
        if qual_json is not None:
            cursor.execute("""
                UPDATE form_data
                SET roll_number = ?, class = ?, dob = ?, gender = ?, consent = ?, responses = ?, academic_scores = ?, remarks = ?, confidence_scores = ?, quality_report = ?, verified_by_human = ?, updated_at = ?
                WHERE document_id = ?
            """, (roll_number, class_val, dob, gender, consent, resp_json, acad_json, remarks, conf_json, qual_json, verified, now_str, doc_id))
        else:
            cursor.execute("""
                UPDATE form_data
                SET roll_number = ?, class = ?, dob = ?, gender = ?, consent = ?, responses = ?, academic_scores = ?, remarks = ?, confidence_scores = ?, verified_by_human = ?, updated_at = ?
                WHERE document_id = ?
            """, (roll_number, class_val, dob, gender, consent, resp_json, acad_json, remarks, conf_json, verified, now_str, doc_id))
    else:
        cursor.execute("""
            INSERT INTO form_data (document_id, roll_number, class, dob, gender, consent, responses, academic_scores, remarks, confidence_scores, quality_report, verified_by_human, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (doc_id, roll_number, class_val, dob, gender, consent, resp_json, acad_json, remarks, conf_json, qual_json, verified, now_str))
        
    conn.commit()
    # conn.close()  # thread-local connection pool reuses per thread

def get_document(doc_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.id, d.filename, d.status, d.classification, d.escalation_level, d.created_at,
               f.roll_number, f.class, f.dob, f.gender, f.consent, f.responses, f.academic_scores, f.remarks, f.confidence_scores, f.quality_report, f.verified_by_human
        FROM documents d
        LEFT JOIN form_data f ON d.id = f.document_id
        WHERE d.id = ?
    """, (doc_id,))
    row = cursor.fetchone()
    # conn.close()  # thread-local connection pool reuses per thread
    if row:
        d = dict(row)
        if d['responses']:
            d['responses'] = json.loads(d['responses'])
        if d['academic_scores']:
            d['academic_scores'] = json.loads(d['academic_scores'])
        if d['confidence_scores']:
            d['confidence_scores'] = json.loads(d['confidence_scores'])
        if d['quality_report']:
            d['quality_report'] = json.loads(d['quality_report'])
        if d['classification']:
            d['classification'] = json.loads(d['classification'])
        return d
    return None

def get_all_documents():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.id, d.filename, d.status, d.classification, d.escalation_level, d.created_at,
               f.roll_number, f.class, f.dob, f.gender, f.consent, f.verified_by_human
        FROM documents d
        LEFT JOIN form_data f ON d.id = f.document_id
        ORDER BY d.created_at DESC
    """)
    rows = cursor.fetchall()
    # conn.close()  # thread-local connection pool reuses per thread
    
    res = []
    for r in rows:
        d = dict(r)
        if d['classification']:
            d['classification'] = json.loads(d['classification'])
        res.append(d)
    return res

def get_edit_history(doc_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT field_name, old_value, new_value, edited_at FROM edit_history WHERE document_id = ? ORDER BY edited_at DESC",
        (doc_id,)
    )
    rows = cursor.fetchall()
    # conn.close()  # thread-local connection pool reuses per thread
    return [dict(row) for row in rows]

def get_corrections_log():
    """Retrieve logged human corrections for review/training export."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM corrections_training_data ORDER BY saved_at DESC")
    rows = cursor.fetchall()
    # conn.close()  # thread-local connection pool reuses per thread
    return [dict(row) for row in rows]

def delete_document(doc_id):
    from app.image.storage import delete_document_disk
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    # conn.close()  # thread-local connection pool reuses per thread
    delete_document_disk(doc_id)

def bulk_delete_documents(doc_ids):
    from app.image.storage import delete_document_disk
    conn = get_db_connection()
    cursor = conn.cursor()
    placeholders = ",".join("?" * len(doc_ids))
    cursor.execute(f"DELETE FROM documents WHERE id IN ({placeholders})", doc_ids)
    conn.commit()
    # conn.close()  # thread-local connection pool reuses per thread
    for doc_id in doc_ids:
        delete_document_disk(doc_id)
    return cursor.rowcount

def store_pdf(doc_id, pdf_bytes):
    from app.image.storage import store_pdf_disk
    # Avoid writing binary data to SQLite. Set column to NULL and store on disk.
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE documents SET pdf_data = NULL WHERE id = ?", (doc_id,))
    conn.commit()
    # conn.close()  # thread-local connection pool reuses per thread
    store_pdf_disk(doc_id, pdf_bytes)

def get_pdf(doc_id):
    from app.image.storage import get_pdf_disk
    return get_pdf_disk(doc_id)

def store_page_image(doc_id, page_num, image_bytes):
    import cv2
    import numpy as np
    from app.image.storage import store_aligned_page_disk
    
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is not None:
        store_aligned_page_disk(doc_id, page_num, image)

def get_page_image(doc_id, page_num):
    from app.image.storage import get_aligned_page_disk
    return get_aligned_page_disk(doc_id, page_num)

