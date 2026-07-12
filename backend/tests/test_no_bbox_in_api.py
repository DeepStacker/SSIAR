"""
API Contract Test: Verify no bbox leaks in any API response.

This test recursively walks every JSON response from all v3 endpoints
and verifies no "bbox" key, "bounding_box" key, or bbox-like value
appears anywhere. Also checks v2_trust fields contain only polygon/page.
"""
import uuid
import pytest
from fastapi.testclient import TestClient


# ── recursive bbox checker ─────────────────────────────────────────────


def assert_no_bbox(obj, path="$"):
    """Recursively verify no bbox references exist in *obj*."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            key_lower = key.lower()
            if "bbox" in key_lower:
                raise AssertionError(
                    f"BBOX KEY FOUND at {path}.{key!r}: value={value!r}"
                )
            if key_lower == "bounding_box":
                raise AssertionError(
                    f"BOUNDING_BOX KEY FOUND at {path}.{key!r}: value={value!r}"
                )
            assert_no_bbox(value, f"{path}.{key!r}")

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            # Detect bbox-like arrays: exactly 4 numbers
            if (
                isinstance(item, list)
                and len(item) == 4
                and all(isinstance(x, (int, float)) for x in item)
                and "bbox" in str(path).lower()
            ):
                # We already caught bbox keys above, but belt-and-suspenders
                raise AssertionError(
                    f"BBOX-LIKE VALUE at {path}[{i}]: {item!r}"
                )
            assert_no_bbox(item, f"{path}[{i}]")

    elif isinstance(obj, (int, float, str, bool, type(None))):
        pass
    else:
        pass  # ignore non-serialisable types


# ── v2_trust field checker ─────────────────────────────────────────────


def assert_v2_trust_fields_only_polygon_and_page(trust_map, path):
    """Every entry in a v2_trust dict may only contain 'polygon' and 'page' keys."""
    if not isinstance(trust_map, dict):
        return
    for field_name, field_val in trust_map.items():
        if not isinstance(field_val, dict):
            continue
        allowed = {"polygon", "page"}
        actual_keys = set(field_val.keys())
        extra = actual_keys - allowed
        if extra:
            raise AssertionError(
                f"V2_TRUST has unexpected keys at {path}.{field_name!r}: "
                f"found {sorted(extra)} (allowed: {sorted(allowed)})"
            )


# ── test class ─────────────────────────────────────────────────────────


class TestNoBboxInAPI:
    """Comprehensive contract test: no bbox anywhere in v3 API responses."""

    _token = ""

    @pytest.fixture(scope="class", autouse=True)
    def _auth_bootstrap(self, client: TestClient):
        email = f"nocontract-{uuid.uuid4().hex[:12]}@test.com"
        pw = "NoBbox!Test999"
        r = client.post("/api/v3/auth/register", json={"email": email, "password": pw})
        assert r.status_code == 200, f"Register failed: {r.text}"
        body = r.json()
        assert body["success"] is True
        type(self)._token = body["data"]["token"]
        yield

    def _get(self, client, url_path, **kwargs):
        return client.get(
            url_path, headers={"Authorization": f"Bearer {self._token}"}, **kwargs
        )

    # ── helpers for v3 response envelope ───────────────────────────

    def _check_envelope(self, resp):
        """Verify standard v3 envelope and return the data payload."""
        body = resp.json()
        assert "success" in body, f"Missing 'success' in {body}"
        if body["success"] is True:
            assert "data" in body, f"Missing 'data' in success response: {body}"
            return body["data"]
        return body  # error body — still check it

    # ── 1. Auth endpoints ──────────────────────────────────────────

    def test_v3_auth_register_has_no_bbox(self, client):
        email = f"regchk-{uuid.uuid4().hex[:12]}@test.com"
        pw = "Check12345!"
        r = client.post(
            "/api/v3/auth/register", json={"email": email, "password": pw}
        )
        assert r.status_code == 200
        assert_no_bbox(r.json(), "v3-auth-register")

    def test_v3_auth_login_has_no_bbox(self, client):
        email = f"loginchk-{uuid.uuid4().hex[:12]}@test.com"
        pw = "Check12345!"
        client.post("/api/v3/auth/register", json={"email": email, "password": pw})
        r = client.post("/api/v3/auth/login", json={"email": email, "password": pw})
        assert r.status_code == 200
        assert_no_bbox(r.json(), "v3-auth-login")

    # ── 2. Documents list ──────────────────────────────────────────

    def test_v3_documents_list_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/documents")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        assert_no_bbox(data, "v3-documents-list")

    # ── 3. System endpoints ────────────────────────────────────────

    def test_v3_system_health_has_no_bbox(self, client):
        r = client.get("/api/v3/system/health")
        assert r.status_code == 200
        assert_no_bbox(r.json(), "v3-system-health")

    def test_v3_queue_status_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/system/queue-status")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert_no_bbox(data, "v3-queue-status")

    # ── 4. Review tasks ────────────────────────────────────────────

    def test_v3_review_tasks_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/review/tasks")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert_no_bbox(data, "v3-review-tasks")

    # ── 5. Analytics endpoints ─────────────────────────────────────

    def test_v3_analytics_summary_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/analytics/summary")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert_no_bbox(data, "v3-analytics-summary")

    def test_v3_analytics_demographics_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/analytics/demographics")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert_no_bbox(data, "v3-analytics-demographics")

    def test_v3_analytics_questionnaire_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/analytics/questionnaire")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert_no_bbox(data, "v3-analytics-questionnaire")

    def test_v3_analytics_academic_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/analytics/academic")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert_no_bbox(data, "v3-analytics-academic")

    def test_v3_analytics_processing_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/analytics/processing")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert_no_bbox(data, "v3-analytics-processing")

    def test_v3_analytics_data_quality_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/analytics/data-quality")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert_no_bbox(data, "v3-analytics-data-quality")

    def test_v3_analytics_per_field_confidence_has_no_bbox(self, client):
        r = self._get(client, "/api/v3/analytics/per-field-confidence")
        assert r.status_code == 200
        data = self._check_envelope(r)
        assert_no_bbox(data, "v3-per-field-confidence")

    # ── 6. Document detail (v2_trust check) ────────────────────────

    def test_v3_document_detail_v2_trust_no_bbox(self, client):
        """Fetch document detail and verify v2_trust fields contain only polygon+page."""
        lists = self._get(client, "/api/v3/documents")
        assert lists.status_code == 200
        doc_list = self._check_envelope(lists)
        if not doc_list:
            pytest.skip("No documents available to test detail endpoint")
        doc_id = doc_list[0].get("id")
        if not doc_id:
            pytest.skip("First document missing id field")

        r = self._get(client, f"/api/v3/documents/{doc_id}")
        assert r.status_code == 200, f"Document detail failed: {r.text}"
        data = self._check_envelope(r)

        # Full recursive bbox check
        assert_no_bbox(data, f"v3-document-detail/{doc_id}")

        # Specific v2_trust field check
        cs = data.get("confidence_scores")
        if isinstance(cs, dict):
            v2 = cs.get("v2_trust")
            if isinstance(v2, dict):
                assert_v2_trust_fields_only_polygon_and_page(
                    v2, f"v3-document-detail/{doc_id}.confidence_scores.v2_trust"
                )

    # ── 7. Nested Analytics drill-down ─────────────────────────────

    def test_analytics_no_bbox_in_nested_structures(self, client):
        """Ensure deeply nested analytics response has zero bbox references."""
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
            r = self._get(client, ep)
            assert r.status_code == 200, f"{ep} returned {r.status_code}"
            data = self._check_envelope(r)
            assert_no_bbox(data, ep)

    # ── 8. Legacy endpoints (v1/v2) ────────────────────────────────

    def test_legacy_auth_register_has_no_bbox(self, client):
        email = f"legacy-reg-{uuid.uuid4().hex[:12]}@test.com"
        r = client.post(
            "/api/auth/register", json={"email": email, "password": "Legacy!999"}
        )
        assert r.status_code == 200
        assert_no_bbox(r.json(), "legacy-auth-register")

    def test_legacy_auth_login_has_no_bbox(self, client):
        email = f"legacy-login-{uuid.uuid4().hex[:12]}@test.com"
        client.post(
            "/api/auth/register",
            json={"email": email, "password": "LegacyLogin!999"},
        )
        r = client.post(
            "/api/auth/login",
            json={"email": email, "password": "LegacyLogin!999"},
        )
        assert r.status_code == 200
        assert_no_bbox(r.json(), "legacy-auth-login")

    def test_legacy_analytics_summary_has_no_bbox(self, client):
        r = client.get(
            "/api/analytics/summary",
            headers={"Authorization": f"Bearer {self._token}"},
        )
        assert r.status_code == 200
        assert_no_bbox(r.json(), "legacy-analytics-summary")

    def test_legacy_queue_status_has_no_bbox(self, client):
        r = client.get(
            "/api/queue-status",
            headers={"Authorization": f"Bearer {self._token}"},
        )
        assert r.status_code == 200
        assert_no_bbox(r.json(), "legacy-queue-status")

    def test_legacy_documents_list_has_no_bbox(self, client):
        r = client.get(
            "/api/documents",
            headers={"Authorization": f"Bearer {self._token}"},
        )
        assert r.status_code == 200
        assert_no_bbox(r.json(), "legacy-documents-list")

    def test_legacy_document_detail_v2_trust_no_bbox(self, client):
        docs = client.get(
            "/api/documents",
            headers={"Authorization": f"Bearer {self._token}"},
        )
        dl = docs.json()
        if not dl:
            pytest.skip("No documents available for legacy detail test")
        doc_id = dl[0].get("id")
        if not doc_id:
            pytest.skip("First document missing id field")

        r = client.get(
            f"/api/documents/{doc_id}",
            headers={"Authorization": f"Bearer {self._token}"},
        )
        assert r.status_code == 200
        data = r.json()
        assert_no_bbox(data, f"legacy-document-detail/{doc_id}")

        cs = data.get("confidence_scores")
        if isinstance(cs, dict):
            v2 = cs.get("v2_trust")
            if isinstance(v2, dict):
                assert_v2_trust_fields_only_polygon_and_page(
                    v2, f"legacy-document-detail/{doc_id}.confidence_scores.v2_trust"
                )

    def test_legacy_review_tasks_has_no_bbox(self, client):
        r = client.get(
            "/api/v2/review/tasks",
            headers={"Authorization": f"Bearer {self._token}"},
        )
        assert r.status_code == 200
        assert_no_bbox(r.json(), "legacy-review-tasks")
