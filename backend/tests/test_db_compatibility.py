"""
Cross-database compatibility test suite.
Runs all critical operations and verifies behavior on the active database.
To run against PostgreSQL: DATABASE_URL=postgresql://user:pass@host:5432/db pytest tests/test_db_compatibility.py
"""
import os
import io
import tempfile
import pytest

os.environ.setdefault("JWT_SECRET", "test-db-compat-secret-min-32chars!")

@pytest.fixture(scope="module")
def client():
    fd, path = tempfile.mkstemp(suffix="_ssiar_test.db")
    os.environ["SQLITE_PATH"] = path
    from app.database import init_db
    init_db()
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    yield c
    os.close(fd)
    if os.path.exists(path):
        os.unlink(path)
@pytest.fixture(scope="module")
def auth_headers(client):
    r = client.post("/api/v3/auth/register", json={"email": "db-test@compat.io", "password": "TestDbPass123"})
    if r.status_code == 200:
        token = r.json()["data"]["token"]
    else:
        r = client.post("/api/v3/auth/login", json={"email": "db-test@compat.io", "password": "TestDbPass123"})
        token = r.json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}
def test_health(client):
    r = client.get("/api/v3/system/health")
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "healthy"
def test_auth_register_login(client):
    email = f"user-{os.urandom(4).hex()}@test.com"
    r = client.post("/api/v3/auth/register", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200
    token = r.json()["data"]["token"]
    r = client.post("/api/v3/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200
    assert "token" in r.json()["data"]
    r = client.post("/api/v3/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
def test_document_crud(client, auth_headers):
    h = auth_headers

    # List (empty initially)
    r = client.get("/api/v3/documents", headers=h)
    assert r.status_code == 200
    assert isinstance(r.json()["data"], list)

    # Upload
    import fitz
    pdf = fitz.open()
    pdf.new_page(width=595, height=842)
    buf = io.BytesIO()
    pdf.save(buf)
    pdf.close()
    buf.seek(0)
    r = client.post("/api/v3/upload?auto_verify=false", files={"files": ("test.pdf", buf, "application/pdf")}, headers=h)
    assert r.status_code == 200
    doc_ids = r.json()["data"]["document_ids"]
    assert len(doc_ids) > 0
    doc_id = doc_ids[0]

    # Get detail
    r = client.get(f"/api/v3/documents/{doc_id}", headers=h)
    assert r.status_code in (200, 404)  # 404 if processing hasn't created form_data yet

    # Get history
    r = client.get(f"/api/v3/documents/{doc_id}/history", headers=h)
    assert r.status_code == 200

    # Delete
    r = client.delete(f"/api/v3/documents/{doc_id}", headers=h)
    assert r.status_code == 200

    # Verify deletion
    r = client.get(f"/api/v3/documents/{doc_id}", headers=h)
    assert r.status_code == 404
def test_bulk_operations(client, auth_headers):
    
    h = auth_headers
    r = client.post("/api/v3/documents/bulk-delete", json={"doc_ids": []}, headers=h)
    assert r.status_code == 200

    r = client.post("/api/v3/documents/bulk-verify", json={"doc_ids": []}, headers=h)
    assert r.status_code == 200

    r = client.post("/api/v3/documents/recover-stuck", headers=h)
    assert r.status_code == 200
def test_queue_status(client, auth_headers):
    
    r = client.get("/api/v3/system/queue-status", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    for k in ("total", "processing", "needs_review", "verified", "failed"):
        assert k in data
def test_review_tasks(client, auth_headers):
    
    r = client.get("/api/v3/review/tasks", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert isinstance(data["tasks"], list)
    assert "total" in data
def test_analytics_endpoints(client, auth_headers):
    
    endpoints = [
        "/api/v3/analytics/summary",
        "/api/v3/analytics/demographics",
        "/api/v3/analytics/questionnaire",
        "/api/v3/analytics/academic",
        "/api/v3/analytics/processing",
        "/api/v3/analytics/data-quality",
        "/api/v3/analytics/per-field-confidence",
    ]
    for ep in endpoints:
        r = client.get(ep, headers=auth_headers)
        assert r.status_code == 200, f"{ep} failed: {r.status_code}"
        body = r.json()
        assert body["success"] is True, f"{ep}: {body}"
        assert "data" in body
def test_auth_errors(client, auth_headers):
    
    r = client.get("/api/v3/documents")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"
    
    r = client.get("/api/v3/documents/nonexistent", headers=auth_headers)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_db_insert_update_delete_cycle(client):
    """Test a complete insert-update-delete cycle to verify ACID properties."""
    from app.database import get_db_connection, put_conn, USE_POSTGRES

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        doc_id = f"acid-test-{os.urandom(4).hex()}"

        # INSERT
        now = "2024-01-01T00:00:00"
        cur.execute(
            "INSERT INTO documents (id, filename, status, created_at) VALUES (%s, %s, %s, %s)" if USE_POSTGRES else
            "INSERT INTO documents (id, filename, status, created_at) VALUES (?, ?, ?, ?)",
            (doc_id, "acid.pdf", "processing", now)
        )

        # SELECT verify
        cur.execute(
            "SELECT status FROM documents WHERE id = %s" if USE_POSTGRES else
            "SELECT status FROM documents WHERE id = ?", (doc_id,)
        )
        row = cur.fetchone()
        assert row is not None
        assert row[0] == "processing"

        # UPDATE
        cur.execute(
            "UPDATE documents SET status = %s WHERE id = %s" if USE_POSTGRES else
            "UPDATE documents SET status = ? WHERE id = ?", ("verified", doc_id)
        )

        cur.execute(
            "SELECT status FROM documents WHERE id = %s" if USE_POSTGRES else
            "SELECT status FROM documents WHERE id = ?", (doc_id,)
        )
        assert cur.fetchone()[0] == "verified"

        # DELETE
        cur.execute(
            "DELETE FROM documents WHERE id = %s" if USE_POSTGRES else
            "DELETE FROM documents WHERE id = ?", (doc_id,)
        )

        cur.execute(
            "SELECT COUNT(*) FROM documents WHERE id = %s" if USE_POSTGRES else
            "SELECT COUNT(*) FROM documents WHERE id = ?", (doc_id,)
        )
        assert cur.fetchone()[0] == 0

        conn.commit()
    finally:
        put_conn(conn)
def test_rollback_behavior(client):
    """Verify transaction rollback works correctly."""
    from app.database import get_db_connection, put_conn, USE_POSTGRES

    doc_id = f"rollback-{os.urandom(4).hex()}"
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        # Start transaction, insert, then rollback
        cur.execute(
            "INSERT INTO documents (id, filename, status, created_at) VALUES (%s, %s, %s, %s)" if USE_POSTGRES else
            "INSERT INTO documents (id, filename, status, created_at) VALUES (?, ?, ?, ?)",
            (doc_id, "rollback.pdf", "processing", "2024-01-01T00:00:00")
        )
        conn.rollback()

        cur.execute(
            "SELECT COUNT(*) FROM documents WHERE id = %s" if USE_POSTGRES else
            "SELECT COUNT(*) FROM documents WHERE id = ?", (doc_id,)
        )
        assert cur.fetchone()[0] == 0, "Rollback failed — document still exists after rollback"
    finally:
        put_conn(conn)
def test_unique_constraint(client):
    """Verify unique constraints are enforced."""
    from app.database import get_db_connection, put_conn, USE_POSTGRES

    doc_id = f"unique-{os.urandom(4).hex()}"
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO documents (id, filename, status, created_at) VALUES (%s, %s, %s, %s)" if USE_POSTGRES else
            "INSERT INTO documents (id, filename, status, created_at) VALUES (?, ?, ?, ?)",
            (doc_id, "unique.pdf", "processing", "2024-01-01T00:00:00")
        )
        conn.commit()

        with pytest.raises(Exception):
            cur.execute(
                "INSERT INTO documents (id, filename, status, created_at) VALUES (%s, %s, %s, %s)" if USE_POSTGRES else
                "INSERT INTO documents (id, filename, status, created_at) VALUES (?, ?, ?, ?)",
                (doc_id, "duplicate.pdf", "processing", "2024-01-01T00:00:00")
            )
            conn.commit()
        conn.rollback()
    finally:
        put_conn(conn)
def test_index_existence(client):
    """Verify all expected indexes exist."""
    from app.database import get_db_connection, put_conn, USE_POSTGRES

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        if USE_POSTGRES:
            cur.execute("""
                SELECT indexname FROM pg_indexes 
                WHERE schemaname = 'public'
            """)
        else:
            cur.execute("SELECT name FROM sqlite_master WHERE type = 'index'")
        indexes = {row[0] for row in cur.fetchall()}
        expected = {
            'idx_documents_user_id', 'idx_documents_status', 'idx_documents_created_at',
            'idx_form_data_document_id', 'idx_edit_history_document_id',
            'idx_review_tasks_document_id', 'idx_review_tasks_status',
        }
        missing = expected - indexes
        assert not missing, f"Missing indexes: {missing}"
    finally:
        put_conn(conn)
