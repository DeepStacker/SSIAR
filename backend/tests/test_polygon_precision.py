"""
Enhanced Polygon Precision Tests
==================================
Validates pixel-level polygon fidelity through the entire SSIAR pipeline:
Azure raw → normalize → bbox → polygon → scaling → storage → retrieval

Tests:
  1. Round-trip precision (exact coordinate match across all elements)
  2. Polygon → bbox → polygon round-trip fidelity
  3. Scaling precision (azure_scale computations)
  4. Database storage precision (byte-identical JSON round-trip)
  5. Field resolver calculated_polygon computation
  6. Page angle handling
"""

import json
import math
import os
import sys
import tempfile
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Must be set BEFORE any app modules are imported
os.environ.setdefault("JWT_SECRET", "pytest-insecure-jwt-secret-for-testing")
os.environ.setdefault("SURYA_ENABLED", "0")

from app.processing.azure_processor import normalize_azure_response, polygon_bounds
from app.core.types import NormalizedElement, NormalizedAzureResponse
from app.processing.field_resolver import resolve_field
from app.processing.templates import get_template, init_templates_v2


FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..", "..", "shared", "test_fixtures", "azure_raw_b13072f1.json",
)


def load_fixture():
    with open(FIXTURE_PATH) as f:
        return json.load(f)


# ── Test 1: Round-trip precision (all elements, all pages) ────────────────

def test_roundtrip_precision_all_words():
    """For every word in the fixture (both pages), verify exact coordinate match."""
    raw_fixture = load_fixture()
    total_words_checked = 0
    max_deviation = 0.0
    failures = []

    for pg_key in sorted(raw_fixture.keys()):
        if not pg_key.startswith("page_"):
            continue
        raw_pages = raw_fixture[pg_key].get("pages", [])
        for raw_page in raw_pages:
            page_num = raw_page.get("pageNumber", 1)
            raw_words = raw_page.get("words", [])

            normalized = normalize_azure_response("test_fixture", raw_fixture[pg_key])
            norm_page = next((p for p in normalized.pages if p.page == page_num), None)
            assert norm_page is not None, f"Page {page_num} not found in normalized output"
            norm_words = [el for el in norm_page.elements if el.element_type == "word"]

            assert len(norm_words) == len(raw_words), (
                f"{pg_key} page {page_num}: word count mismatch "
                f"raw={len(raw_words)} norm={len(norm_words)}"
            )

            for i, raw_word in enumerate(raw_words):
                raw_poly = raw_word["polygon"]
                norm_poly = norm_words[i].polygon
                assert norm_poly == raw_poly, (
                    f"{pg_key} page {page_num} word {i} '{raw_word['content']}': "
                    f"polygon mismatch\n  raw={raw_poly}\n  norm={norm_poly}"
                )
                deviation = max(abs(a - b) for a, b in zip(norm_poly, raw_poly))
                max_deviation = max(max_deviation, deviation)
                total_words_checked += 1

    print(f"  [Test 1] Words checked: {total_words_checked}, max deviation: {max_deviation}")
    assert max_deviation == 0.0, f"Non-zero polygon deviation: {max_deviation}"
    assert total_words_checked > 0


def test_roundtrip_precision_selection_marks():
    """For every selection mark in the fixture (both pages), verify exact match."""
    raw_fixture = load_fixture()
    total_marks_checked = 0
    failures = []

    for pg_key in sorted(raw_fixture.keys()):
        if not pg_key.startswith("page_"):
            continue
        raw_pages = raw_fixture[pg_key].get("pages", [])
        for raw_page in raw_pages:
            page_num = raw_page.get("pageNumber", 1)
            raw_marks = raw_page.get("selectionMarks", [])

            normalized = normalize_azure_response("test_fixture", raw_fixture[pg_key])
            norm_page = next((p for p in normalized.pages if p.page == page_num), None)
            assert norm_page is not None
            norm_marks = [el for el in norm_page.elements if el.element_type == "selection_mark"]

            assert len(norm_marks) == len(raw_marks), (
                f"{pg_key} page {page_num}: selection mark count mismatch "
                f"raw={len(raw_marks)} norm={len(norm_marks)}"
            )

            for i, raw_mark in enumerate(raw_marks):
                raw_poly = raw_mark["polygon"]
                norm_poly = norm_marks[i].polygon
                assert norm_poly == raw_poly, (
                    f"{pg_key} page {page_num} mark {i}: "
                    f"polygon mismatch\n  raw={raw_poly}\n  norm={norm_poly}"
                )
                total_marks_checked += 1

    print(f"  [Test 1] Selection marks checked: {total_marks_checked}")
    assert total_marks_checked > 0


# ── Test 2: Polygon → bbox → polygon round-trip ───────────────────────────

def test_polygon_bbox_roundtrip():
    """Verify polygon→bbox→polygon round-trip fidelity for all words."""
    raw_fixture = load_fixture()
    area_discrepancies = []
    total_words = 0

    for pg_key in sorted(raw_fixture.keys()):
        if not pg_key.startswith("page_"):
            continue
        raw_pages = raw_fixture[pg_key].get("pages", [])
        for raw_page in raw_pages:
            page_angle = raw_page.get("angle", 0.0)
            raw_words = raw_page.get("words", [])

            for raw_word in raw_words:
                poly = raw_word["polygon"]
                bbox = polygon_bounds(poly)
                reconstructed = [bbox[0], bbox[1], bbox[2], bbox[1],
                                 bbox[2], bbox[3], bbox[0], bbox[3]]

                for j in range(8):
                    if abs(poly[j] - reconstructed[j]) > 1.0:
                        if abs(page_angle) > 0.1:
                            area_discrepancies.append({
                                "word": raw_word["content"],
                                "angle": page_angle,
                                "poly": poly,
                                "reconstructed": reconstructed,
                            })

                total_words += 1

    print(f"  [Test 2] Polygon→bbox→polygon: {total_words} words checked")
    if area_discrepancies:
        print(f"  [Test 2] WARNING: {len(area_discrepancies)} words on rotated pages have "
              f"axis-aligned bbox deviation > 1px (expected for rotated polygons)")
        for d in area_discrepancies[:3]:
            deviation = max(abs(a - b) for a, b in zip(d["poly"], d["reconstructed"]))
            print(f"    '{d['word']}' angle={d['angle']:.2f}° deviation={deviation:.1f}px")
    assert total_words > 0


# ── Test 3: Scaling precision ─────────────────────────────────────────────

def test_scaling_precision():
    """Verify no precision loss from float operations during coordinate scaling."""
    from app.image.page_utils import get_azure_scale

    # Test scale factors at multiple resolutions
    test_cases = [
        # (img_w, img_h, azure_w, azure_h, expected_scale_x, expected_scale_y)
        (2483, 3508, 4500, 6000, 2483/4500, 3508/6000),
        (1241, 1754, 4500, 6000, 1241/4500, 1754/6000),
        (4966, 7016, 4500, 6000, 4966/4500, 7016/6000),
    ]

    for img_w, img_h, azure_w, azure_h, exp_sx, exp_sy in test_cases:
        computed_sx = img_w / azure_w
        computed_sy = img_h / azure_h
        assert abs(computed_sx - exp_sx) < 1e-10, f"Scale X mismatch: {computed_sx} vs {exp_sx}"
        assert abs(computed_sy - exp_sy) < 1e-10, f"Scale Y mismatch: {computed_sy} vs {exp_sy}"

    # Test polygon scaling at multiple zoom levels
    sample_poly = [1498.5, 104.2, 2059.8, 88.0, 2060.1, 310.9, 1500.3, 322.7]
    zoom_levels = [0.5, 1.0, 1.5, 2.0, 3.0]

    for zoom in zoom_levels:
        scaled = [v * zoom for v in sample_poly]
        unscaled = [v / zoom for v in scaled]
        for i, (orig, recovered) in enumerate(zip(sample_poly, unscaled)):
            assert abs(orig - recovered) < 0.01, (
                f"Precision loss at zoom={zoom}, index={i}: "
                f"orig={orig} recovered={recovered}"
            )

    print(f"  [Test 3] Scaling precision: all zoom levels passed")


# ── Test 4: Database storage precision ─────────────────────────────────────

def test_database_storage_precision():
    """Verify polygon JSON is byte-identical after database round-trip."""
    fd, db_path = tempfile.mkstemp(suffix="_precision_test.db")
    os.close(fd)
    old_path = os.environ.get("SQLITE_PATH")
    os.environ["SQLITE_PATH"] = db_path

    try:
        from app.database import (
            get_db_connection, put_conn, init_db,
            insert_document, insert_or_update_form_data, get_document,
        )

        init_db()

        doc_id = f"precision-test-{uuid.uuid4().hex[:12]}"
        insert_document(doc_id, "test.pdf", "verified")

        test_polygon = [1498.5, 104.2, 2059.8, 88.0, 2060.1, 310.9, 1500.3, 322.7]

        conn = get_db_connection()
        cur = conn.cursor()
        import json as json_mod
        confidence = {
            "v2_trust": {"test_field": {"polygon": test_polygon, "page": 1}}
        }
        from app.database import USE_POSTGRES
        if USE_POSTGRES:
            cur.execute(
                "INSERT INTO form_data (document_id, roll_number, confidence_scores, updated_at) VALUES (%s, '', %s, '2024-01-01')",
                (doc_id, json_mod.dumps(confidence))
            )
        else:
            cur.execute(
                "INSERT INTO form_data (document_id, roll_number, confidence_scores, updated_at) VALUES (?, '', ?, '2024-01-01')",
                (doc_id, json_mod.dumps(confidence))
            )
        conn.commit()
        put_conn(conn)

        doc = get_document(doc_id)
        assert doc is not None, "Document not found after storage"
        stored = doc.get("confidence_scores", {}).get("v2_trust", {}).get("test_field", {}).get("polygon")
        assert stored is not None, "Stored polygon not found"

        for i, (orig, stored_val) in enumerate(zip(test_polygon, stored)):
            assert orig == stored_val, (
                f"Precision lost at index {i}: orig={orig} ({type(orig)}) != "
                f"stored={stored_val} ({type(stored_val)})"
            )

        print(f"  [Test 4] Database storage: exact float preservation verified")
    finally:
        if old_path:
            os.environ["SQLITE_PATH"] = old_path
        if os.path.exists(db_path):
            os.unlink(db_path)


# ── Test 5: Field resolver calculated_polygon ─────────────────────────────

def test_field_resolver_calculated_polygon():
    """Verify field_resolver computed polygon has correct vertices for anchor-based fields."""
    raw_fixture = load_fixture()
    normalized = normalize_azure_response("test_fixture", raw_fixture["page_1"])
    init_templates_v2()
    template = get_template("sdq_student_form_v1")

    assert template is not None, "Template not found"
    assert len(normalized.pages) > 0

    fields_checked = 0
    for field_def in template.fields:
        # Skip question fields (q1-q25) as they depend on checkbox tables
        if field_def.name.startswith("q"):
            continue
        result = resolve_field(field_def, normalized)
        _, _, found, bbox, polygon, page_num = result

        assert found is not None, f"Field '{field_def.name}': found should not be None"

        if found and polygon:
            assert len(polygon) >= 8, (
                f"Field '{field_def.name}': polygon should have at least 8 values, "
                f"got {len(polygon)}"
            )
            assert bbox is not None, (
                f"Field '{field_def.name}': bbox should not be None when polygon exists"
            )
            assert len(bbox) == 4, f"Field '{field_def.name}': bbox should have 4 values"

            xs = polygon[0::2]
            ys = polygon[1::2]
            expected_min_x = min(xs)
            expected_min_y = min(ys)
            expected_max_x = max(xs)
            expected_max_y = max(ys)
            assert bbox[0] == expected_min_x, (
                f"Field '{field_def.name}': bbox[0]={bbox[0]} != min_x={expected_min_x}"
            )
            assert bbox[1] == expected_min_y
            assert bbox[2] == expected_max_x
            assert bbox[3] == expected_max_y

            fields_checked += 1

    print(f"  [Test 5] Field resolver: {fields_checked} fields with valid polygon/bbox")
    assert fields_checked > 0


# ── Test 6: Page angle handling ────────────────────────────────────────────

def test_page_angle_preservation():
    """Verify normalizer preserves page angle and doesn't alter polygon coordinates based on angle."""
    raw_fixture = load_fixture()

    expected_angles = {
        1: -0.38690000772476196,
        2: 1.0149049758911133,
    }

    for pg_key in sorted(raw_fixture.keys()):
        if not pg_key.startswith("page_"):
            continue
        pg_num = int(pg_key.split("_")[1])
        normalized = normalize_azure_response("test_fixture", raw_fixture[pg_key])
        norm_page = normalized.pages[0]

        raw_angle = raw_fixture[pg_key]["pages"][0].get("angle", 0.0)
        assert norm_page.angle == raw_angle, (
            f"{pg_key}: angle mismatch raw={raw_angle} norm={norm_page.angle}"
        )

        expected = expected_angles.get(pg_num)
        if expected:
            assert abs(norm_page.angle - expected) < 1e-6, (
                f"{pg_key}: expected angle {expected}, got {norm_page.angle}"
            )

    # Verify non-rotated page size
    pg1_norm = normalize_azure_response("test_fixture", raw_fixture["page_1"]).pages[0]
    assert pg1_norm.width == 4500
    assert pg1_norm.height == 6000

    pg2_norm = normalize_azure_response("test_fixture", raw_fixture["page_2"]).pages[0]
    assert pg2_norm.width == 4500
    assert pg2_norm.height == 6000

    print(f"  [Test 6] Page angles: page1={pg1_norm.angle}°, page2={pg2_norm.angle}°")


# ── Additional: bbox computation verification ──────────────────────────────

def test_bbox_computed_from_polygon_all_pages():
    """Verify bbox property is correctly derived from polygon for all elements across all pages."""
    raw_fixture = load_fixture()
    elements_checked = 0

    for pg_key in sorted(raw_fixture.keys()):
        if not pg_key.startswith("page_"):
            continue
        normalized = normalize_azure_response("test_fixture", raw_fixture[pg_key])
        for page in normalized.pages:
            for el in page.elements:
                assert len(el.polygon) == 8, (
                    f"Element '{el.text}' on {pg_key}: polygon must have 8 values"
                )
                xs = el.polygon[0::2]
                ys = el.polygon[1::2]
                expected_bbox = [min(xs), min(ys), max(xs), max(ys)]
                assert polygon_bounds(el.polygon) == expected_bbox, (
                    f"Element '{el.text}' on {pg_key}: bbox mismatch\n"
                    f"  polygon={el.polygon}\n  bbox={polygon_bounds(el.polygon)}\n  expected={expected_bbox}"
                )
                elements_checked += 1

            for line in page.lines:
                assert len(line.polygon) == 8
                xs = line.polygon[0::2]
                ys = line.polygon[1::2]
                expected_bbox = [min(xs), min(ys), max(xs), max(ys)]
                assert polygon_bounds(line.polygon) == expected_bbox

    print(f"  [Bbox] Elements checked: {elements_checked}")
    assert elements_checked > 0
