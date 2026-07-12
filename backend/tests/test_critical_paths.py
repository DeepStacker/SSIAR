"""Integration tests covering the 6 critical processing paths of the SSIAR backend."""
import io
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


class TestCriticalPaths:
    """Suite of integration tests for critical SSIAR API paths.

    Tests are ordered to build on each other (upload → list → analytics).
    Authentication is bootstrapped once per class via an autouse fixture.
    """

    _token = ""

    @pytest.fixture(scope="class", autouse=True)
    def _auth_bootstrap(self, client: TestClient):
        """Register + login a dedicated test user; store JWT for all authenticated tests."""
        email = f"ci-class-{uuid.uuid4().hex[:12]}@example.com"
        pw = "ClassPass!789"
        r = client.post("/api/auth/register", json={"email": email, "password": pw})
        assert r.status_code == 200, f"Class auth-bootstrap register failed: {r.text}"
        r = client.post("/api/auth/login", json={"email": email, "password": pw})
        assert r.status_code == 200, f"Class auth-bootstrap login failed: {r.text}"
        type(self)._token = r.json()["token"]
        yield

    # ── 1. Health Check ────────────────────────────────────────────────────

    def test_health_check(self, client: TestClient):
        """GET /api/health returns 200 with healthy status (no auth required)."""
        resp = client.get("/api/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "healthy"
        assert "service" in body

    # ── 2. User Registration + Login ───────────────────────────────────────

    def test_register_and_login(self, client: TestClient):
        """Register a fresh user, then log in and receive a valid JWT token."""
        email = f"flow-test-{uuid.uuid4().hex[:12]}@test.com"
        pw = "FlowPass!456"

        # Register
        r = client.post("/api/auth/register", json={"email": email, "password": pw})
        assert r.status_code == 200, f"Register failed: {r.text}"
        reg = r.json()
        assert "token" in reg
        assert reg["email"] == email
        assert "user_id" in reg

        # Login with same credentials
        r = client.post("/api/auth/login", json={"email": email, "password": pw})
        assert r.status_code == 200, f"Login failed: {r.text}"
        login = r.json()
        assert "token" in login
        assert login["email"] == email
        assert login["user_id"] == reg["user_id"]

    # ── 3. Document Upload ─────────────────────────────────────────────────

    def test_upload_document(self, client: TestClient):
        """POST /api/upload with a minimal valid PDF returns document_ids.

        The background processing job queue is mocked to avoid triggering
        actual PDF rendering and Azure OCR calls.
        """
        import fitz
        pdf = fitz.open()
        pdf.new_page(width=595, height=842)
        pdf_bytes = pdf.tobytes()
        pdf.close()

        headers = {"Authorization": f"Bearer {self._token}"}

        with patch("app.api.v2.upload.get_job_queue") as mock_queue:
            mock_queue.return_value.enqueue.return_value = None
            resp = client.post(
                "/api/upload",
                files={"files": ("test_minimal.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
                headers=headers,
            )

        assert resp.status_code == 200, f"Upload failed: {resp.text}"
        data = resp.json()
        assert "document_ids" in data
        assert len(data["document_ids"]) >= 1
        assert data["message"] == "Uploaded 1 file(s)"

    # ── 4. Queue Status ────────────────────────────────────────────────────

    def test_queue_status(self, client: TestClient):
        """GET /api/queue-status returns queue statistics with expected keys."""
        headers = {"Authorization": f"Bearer {self._token}"}
        resp = client.get("/api/queue-status", headers=headers)
        assert resp.status_code == 200, f"Queue status failed: {resp.text}"
        data = resp.json()
        for key in ("total", "processing", "needs_review", "verified", "failed",
                     "workers", "by_escalation"):
            assert key in data, f"Missing key '{key}' in queue-status response"
        assert isinstance(data["by_escalation"], dict)

    # ── 5. Document Listing ────────────────────────────────────────────────

    def test_documents_list(self, client: TestClient):
        """GET /api/documents returns a list of documents."""
        headers = {"Authorization": f"Bearer {self._token}"}
        resp = client.get("/api/documents", headers=headers)
        assert resp.status_code == 200, f"Documents list failed: {resp.text}"
        docs = resp.json()
        assert isinstance(docs, list)

    # ── 6. Analytics Summary ───────────────────────────────────────────────

    def test_analytics_summary(self, client: TestClient):
        """GET /api/analytics/summary returns KPI data without error."""
        headers = {"Authorization": f"Bearer {self._token}"}
        resp = client.get("/api/analytics/summary", headers=headers)
        assert resp.status_code == 200, f"Analytics summary failed: {resp.text}"
        data = resp.json()
        for key in ("total_forms", "verified_forms", "pending_review",
                     "average_confidence", "data_completeness", "processing_trend"):
            assert key in data, f"Missing key '{key}' in analytics summary"
