"""
Polygon Fidelity Tests
=======================
Verifies polygon coordinates are preserved exactly through the entire pipeline:
Azure raw response → normalize → store → retrieve → API response
"""
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.processing.azure_processor import normalize_azure_response
from app.geometry.polygon import polygon_bounds
from app.core.types import NormalizedElement


FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "shared",
    "test_fixtures",
    "azure_raw_b13072f1.json",
)


def load_fixture():
    with open(FIXTURE_PATH) as f:
        return json.load(f)


def test_polygon_preservation_words():
    """Verify polygon coordinates for all words match exactly between raw and normalized."""
    raw_fixture = load_fixture()
    raw_page = raw_fixture["page_1"]["pages"][0]

    normalized = normalize_azure_response("test_fixture", raw_fixture["page_1"])
    assert len(normalized.pages) == 1
    page = normalized.pages[0]

    raw_words = raw_page["words"]
    norm_words = [el for el in page.elements if el.element_type == "word"]

    assert len(norm_words) == len(raw_words), (
        f"Word count mismatch: raw={len(raw_words)} normalized={len(norm_words)}"
    )

    for i, raw_word in enumerate(raw_words):
        raw_poly = raw_word["polygon"]
        norm_poly = norm_words[i].polygon

        assert norm_poly == raw_poly, (
            f"Word {i} ('{raw_word['content']}'): polygon mismatch\n"
            f"  raw:  {raw_poly}\n"
            f"  norm: {norm_poly}"
        )

        assert norm_words[i].text == raw_word["content"]
        assert norm_words[i].confidence == raw_word["confidence"]

        xs = norm_poly[0::2]
        ys = norm_poly[1::2]
        expected_bbox = [min(xs), min(ys), max(xs), max(ys)]
        assert polygon_bounds(norm_poly) == expected_bbox, (
            f"Word {i}: bbox computed incorrectly\n"
            f"  computed: {polygon_bounds(norm_poly)}\n"
            f"  expected: {expected_bbox}"
        )


def test_polygon_preservation_selection_marks():
    """Verify polygon coordinates for selection marks match exactly."""
    raw_fixture = load_fixture()
    raw_page = raw_fixture["page_1"]["pages"][0]

    normalized = normalize_azure_response("test_fixture", raw_fixture["page_1"])
    page = normalized.pages[0]

    raw_marks = raw_page["selectionMarks"]
    norm_marks = [el for el in page.elements if el.element_type == "selection_mark"]

    assert len(norm_marks) == len(raw_marks), (
        f"Selection mark count mismatch: raw={len(raw_marks)} normalized={len(norm_marks)}"
    )

    for i, raw_mark in enumerate(raw_marks):
        raw_poly = raw_mark["polygon"]
        norm_poly = norm_marks[i].polygon

        assert norm_poly == raw_poly, (
            f"Selection mark {i}: polygon mismatch\n"
            f"  raw:  {raw_poly}\n"
            f"  norm: {norm_poly}"
        )

        expected_text = "✓" if raw_mark["state"] == "selected" else "☐"
        assert norm_marks[i].text == expected_text
        assert norm_marks[i].confidence == raw_mark["confidence"]

        xs = norm_poly[0::2]
        ys = norm_poly[1::2]
        expected_bbox = [min(xs), min(ys), max(xs), max(ys)]
        assert polygon_bounds(norm_poly) == expected_bbox


def test_specific_word_polygon():
    """Verify word index 0 from page 1 has exact polygon [1498,104,2059,88,2060,310,1500,322]."""
    raw_fixture = load_fixture()
    normalized = normalize_azure_response("test_fixture", raw_fixture["page_1"])
    page = normalized.pages[0]

    words = [el for el in page.elements if el.element_type == "word"]
    assert len(words) > 0

    expected_polygon = [1498, 104, 2059, 88, 2060, 310, 1500, 322]
    assert words[0].polygon == expected_polygon, (
        f"Word 0 polygon mismatch: expected {expected_polygon}, got {words[0].polygon}"
    )
    assert words[0].text == "अनुसंधान"
    assert words[0].confidence == 0.983

    xs = words[0].polygon[0::2]
    ys = words[0].polygon[1::2]
    expected_bbox = [min(xs), min(ys), max(xs), max(ys)]
    assert polygon_bounds(words[0].polygon) == expected_bbox


def test_bbox_computed_from_polygon():
    """Verify bbox is computed correctly from polygon for all elements."""
    raw_fixture = load_fixture()
    normalized = normalize_azure_response("test_fixture", raw_fixture["page_1"])
    page = normalized.pages[0]

    for el in page.elements:
        assert len(el.polygon) == 8, f"Element '{el.text}' has non-quadrilateral polygon"
        xs = el.polygon[0::2]
        ys = el.polygon[1::2]
        expected_bbox = [min(xs), min(ys), max(xs), max(ys)]
        assert polygon_bounds(el.polygon) == expected_bbox, (
            f"Element '{el.text}': bbox mismatch\n"
            f"  polygon: {el.polygon}\n"
            f"  bbox:    {polygon_bounds(el.polygon)}\n"
            f"  expected:{expected_bbox}"
        )


def test_paragraphs_extracted():
    """Verify paragraphs are extracted from the raw response."""
    raw_fixture = load_fixture()
    normalized = normalize_azure_response("test_fixture", raw_fixture["page_1"])
    page = normalized.pages[0]

    assert len(page.paragraphs) > 0, "No paragraphs were extracted"

    raw_paragraphs = raw_fixture["page_1"].get("paragraphs", [])
    assert len(page.paragraphs) == len(raw_paragraphs), (
        f"Paragraph count mismatch: raw={len(raw_paragraphs)} norm={len(page.paragraphs)}"
    )

    for i, (raw_para, norm_para) in enumerate(zip(raw_paragraphs, page.paragraphs)):
        raw_poly = raw_para["boundingRegions"][0]["polygon"]
        assert norm_para.polygon == raw_poly, (
            f"Paragraph {i}: polygon mismatch\n"
            f"  content: {raw_para['content'][:50]}\n"
            f"  raw:  {raw_poly}\n"
            f"  norm: {norm_para.polygon}"
        )
        assert norm_para.content == raw_para.get("content", "")
        assert norm_para.role == raw_para.get("role", "none")


def test_tables_extracted():
    """Verify tables are extracted from the raw response."""
    raw_fixture = load_fixture()
    normalized = normalize_azure_response("test_fixture", raw_fixture["page_1"])
    page = normalized.pages[0]

    assert len(page.tables) > 0, "No tables were extracted"

    raw_tables = raw_fixture["page_1"].get("tables", [])
    assert len(page.tables) == len(raw_tables), (
        f"Table count mismatch: raw={len(raw_tables)} norm={len(page.tables)}"
    )

    for tbl_idx, (raw_tbl, norm_tbl) in enumerate(zip(raw_tables, page.tables)):
        assert norm_tbl.row_count == raw_tbl.get("rowCount", 0)
        assert norm_tbl.col_count == raw_tbl.get("columnCount", 0)
        assert len(norm_tbl.cells) == len(raw_tbl.get("cells", []))

        for cell_idx, (raw_cell, norm_cell) in enumerate(zip(raw_tbl["cells"], norm_tbl.cells)):
            raw_poly = raw_cell["boundingRegions"][0]["polygon"]
            assert norm_cell.polygon == raw_poly, (
                f"Table {tbl_idx} cell {cell_idx}: polygon mismatch\n"
                f"  raw:  {raw_poly}\n"
                f"  norm: {norm_cell.polygon}"
            )
            assert norm_cell.row_index == raw_cell.get("rowIndex", 0)
            assert norm_cell.col_index == raw_cell.get("columnIndex", 0)
            assert norm_cell.content == raw_cell.get("content", "")
            assert norm_cell.is_header == (raw_cell.get("kind") == "columnHeader")


def test_lines_separated_from_elements():
    """Verify lines are in page.lines, not in page.elements."""
    raw_fixture = load_fixture()
    normalized = normalize_azure_response("test_fixture", raw_fixture["page_1"])
    page = normalized.pages[0]

    raw_lines = raw_fixture["page_1"]["pages"][0].get("lines", [])
    assert len(page.lines) == len(raw_lines)

    element_line_count = sum(1 for el in page.elements if el.element_type == "line")
    assert element_line_count == 0, (
        "Lines should not be in page.elements; they belong in page.lines"
    )

    for i, (raw_line, norm_line) in enumerate(zip(raw_lines, page.lines)):
        raw_poly = raw_line["polygon"]
        assert norm_line.polygon == raw_poly, (
            f"Line {i}: polygon mismatch\n"
            f"  raw:  {raw_poly}\n"
            f"  norm: {norm_line.polygon}"
        )
        assert norm_line.text == raw_line["content"]
        assert norm_line.confidence > 0.0, (
            f"Line {i} has zero confidence; should be computed from word confidences"
        )
