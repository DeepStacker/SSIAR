"""
Azure Response Processing Layer (Module 4)
============================================
Converts raw Azure Document Intelligence responses into a normalized application format.
Always stores the complete raw response for future re-processing.
"""
import json
from datetime import datetime
from typing import Optional, Any
from app.core.types import (
    NormalizedAzureResponse,
    NormalizedPage,
    NormalizedElement,
    NormalizedParagraph,
    NormalizedTableCell,
    NormalizedTable,
)


def normalize_azure_response(doc_id: str, raw_response: Any) -> NormalizedAzureResponse:
    """
    Normalize a raw Azure Document Intelligence response into application format.
    
    Input:  Azure AnalyzeResult object (or dict)
    Output: NormalizedAzureResponse with structured pages, elements, and raw storage.
    """
    # Handle both Azure SDK objects and raw dicts
    if hasattr(raw_response, "pages"):
        return _normalize_from_sdk(doc_id, raw_response)
    elif isinstance(raw_response, dict):
        return _normalize_from_dict(doc_id, raw_response)
    else:
        raise ValueError(f"Unsupported Azure response type: {type(raw_response)}")


def _scale_polygon(poly: list[float], unit: str) -> list[float]:
    if not poly:
        return []
    scale = 300.0 if unit == "inch" else 1.0
    return [val * scale for val in poly]


def _normalize_from_sdk(doc_id: str, result: Any) -> NormalizedAzureResponse:
    """Normalize from Azure SDK DocumentAnalysisResult."""
    model_id = getattr(result, "model_id", "prebuilt-read")
    pages = []

    # Collect top-level paragraphs/tables (SDK puts them on AnalyzeResult, not pages)
    top_paragraphs = getattr(result, "paragraphs", []) or []
    top_tables = getattr(result, "tables", []) or []

    for page in getattr(result, "pages", []) or []:
        unit = getattr(page, "unit", "inch")
        page_num = page.page_number if hasattr(page, "page_number") else (getattr(page, "page", 1))
        np_page = NormalizedPage(
            page=page_num,
            angle=getattr(page, "angle", 0.0),
            width=getattr(page, "width", 0.0) * (300.0 if unit == "inch" else 1.0),
            height=getattr(page, "height", 0.0) * (300.0 if unit == "inch" else 1.0),
        )
        
        # Process words
        for word in getattr(page, "words", []) or []:
            poly = _scale_polygon(list(getattr(word, "polygon", [])) or [], unit)
            np_page.elements.append(NormalizedElement(
                text=getattr(word, "content", ""),
                confidence=getattr(word, "confidence", 0.0),
                polygon=poly,
                element_type="word",
            ))
        
        # Process lines separately (not in elements) with computed confidence from constituent words
        for line in getattr(page, "lines", []) or []:
            poly = _scale_polygon(list(getattr(line, "polygon", [])) or [], unit)
            word_els = [el for el in np_page.elements if el.element_type == "word"]
            line_conf = _compute_line_confidence(poly, word_els) if poly else 0.0
            np_page.lines.append(NormalizedElement(
                text=getattr(line, "content", ""),
                confidence=line_conf,
                polygon=poly,
                element_type="line",
            ))

        # Extract paragraphs for this page
        for para in top_paragraphs:
            regions = getattr(para, "boundingRegions", None) or []
            if not regions:
                continue
            pg_num = getattr(regions[0], "pageNumber", 1) if hasattr(regions[0], "pageNumber") else 1
            if pg_num != page_num:
                continue
            poly = list(getattr(regions[0], "polygon", []) or [])
            if len(poly) >= 8:
                np_page.paragraphs.append(NormalizedParagraph(
                    content=getattr(para, "content", ""),
                    polygon=_scale_polygon(poly, unit),
                    role=getattr(para, "role", "none"),
                ))

        # Extract tables for this page
        for tbl in top_tables:
            cells = []
            for cell in getattr(tbl, "cells", []) or []:
                regions = getattr(cell, "boundingRegions", None) or []
                if not regions:
                    continue
                pg_num = getattr(regions[0], "pageNumber", 1) if hasattr(regions[0], "pageNumber") else 1
                if pg_num != page_num:
                    continue
                poly = list(getattr(regions[0], "polygon", []) or [])
                if len(poly) >= 8:
                    cells.append(NormalizedTableCell(
                        row_index=getattr(cell, "rowIndex", 0),
                        col_index=getattr(cell, "columnIndex", 0),
                        content=getattr(cell, "content", ""),
                        polygon=_scale_polygon(poly, unit),
                        is_header=getattr(cell, "kind", None) == "columnHeader",
                    ))
            if cells:
                np_page.tables.append(NormalizedTable(
                    row_count=getattr(tbl, "rowCount", 0),
                    col_count=getattr(tbl, "columnCount", 0),
                    cells=cells,
                ))

        # Process selection marks (checkboxes)
        for sel in getattr(page, "selection_marks", []) or []:
            poly = _scale_polygon(list(getattr(sel, "polygon", [])) or [], unit)
            np_page.elements.append(NormalizedElement(
                text="✓" if getattr(sel, "state", "unselected") == "selected" else "☐",
                confidence=getattr(sel, "confidence", 0.0),
                polygon=poly,
                element_type="selection_mark",
            ))
        
        pages.append(np_page)
    
    return NormalizedAzureResponse(
        document_id=doc_id,
        pages=pages,
        raw_response=_sdk_to_dict(result),
        model_id=model_id,
    )


def _normalize_from_dict(doc_id: str, raw: dict) -> NormalizedAzureResponse:
    """Normalize from a raw dict (e.g., loaded from JSON storage).
    
    Handles two formats:
    1. Flat: {"pages": [...], "modelId": ...}           (single analyzeResult)
    2. Per-page: {"page_1": {analyzeResult}, "page_2": {analyzeResult}}  (stored format)
    """
    model_id = raw.get("modelId", raw.get("model_id", "prebuilt-layout"))
    pages_raw = raw.get("pages", [])
    
    # Detect per-page storage format: {"page_1": {...}, "page_2": {...}}
    if not pages_raw:
        page_keys = sorted([k for k in raw.keys() if k.startswith("page_")])
        if page_keys:
            # Each page_N is a full analyzeResult; collect all inner pages
            for pg_key in page_keys:
                pg_idx = int(pg_key.split("_")[1])  # e.g. "page_1" -> 1
                sub_result = raw[pg_key]
                if not isinstance(sub_result, dict):
                    continue
                inner_pages = sub_result.get("pages", [])
                for ip in inner_pages:
                    # Override pageNumber to match the outer page key
                    ip_copy = dict(ip)
                    ip_copy["pageNumber"] = pg_idx
                    pages_raw.append(ip_copy)
    
    pages = []
    # Collect top-level paragraphs/tables (some Azure API versions put them at analyzeResult level)
    top_paragraphs = raw.get("paragraphs", [])
    top_tables = raw.get("tables", [])
    for p in pages_raw:
        unit = p.get("unit", "inch")
        page_num = p.get("pageNumber", p.get("page_number", p.get("page", 1)))
        np_page = NormalizedPage(
            page=page_num,
            angle=p.get("angle", 0.0),
            width=p.get("width", 0.0) * (300.0 if unit == "inch" else 1.0),
            height=p.get("height", 0.0) * (300.0 if unit == "inch" else 1.0),
        )
        
        for word in p.get("words", []):
            poly = _scale_polygon(word.get("polygon", []), unit)
            np_page.elements.append(NormalizedElement(
                text=word.get("content", ""),
                confidence=word.get("confidence", 0.0),
                polygon=poly,
                element_type="word",
            ))
        
        for line in p.get("lines", []):
            poly = _scale_polygon(line.get("polygon", []), unit)
            word_els = [el for el in np_page.elements if el.element_type == "word"]
            line_conf = _compute_line_confidence(poly, word_els) if poly else 0.0
            np_page.lines.append(NormalizedElement(
                text=line.get("content", ""),
                confidence=line_conf,
                polygon=poly,
                element_type="line",
            ))

        # Extract paragraphs from this page (from top-level paragraphs list)
        for para in top_paragraphs:
            regions = para.get("boundingRegions", [])
            if not regions:
                continue
            pg_num = regions[0].get("pageNumber", 1)
            if pg_num != page_num:
                continue
            poly = regions[0].get("polygon", [])
            if len(poly) >= 8:
                np_page.paragraphs.append(NormalizedParagraph(
                    content=para.get("content", ""),
                    polygon=_scale_polygon(poly, unit),
                    role=para.get("role", "none"),
                ))

        # Extract tables for this page (from top-level tables list)
        for tbl in top_tables:
            cells = []
            for cell in tbl.get("cells", []):
                regions = cell.get("boundingRegions", [])
                if not regions:
                    continue
                pg_num = regions[0].get("pageNumber", 1)
                if pg_num != page_num:
                    continue
                poly = regions[0].get("polygon", [])
                if len(poly) >= 8:
                    cells.append(NormalizedTableCell(
                        row_index=cell.get("rowIndex", 0),
                        col_index=cell.get("columnIndex", 0),
                        content=cell.get("content", ""),
                        polygon=_scale_polygon(poly, unit),
                        is_header=cell.get("kind") == "columnHeader",
                    ))
            if cells:
                np_page.tables.append(NormalizedTable(
                    row_count=tbl.get("rowCount", 0),
                    col_count=tbl.get("columnCount", 0),
                    cells=cells,
                ))

        for mark in p.get("selectionMarks", p.get("selection_marks", [])):
            poly = _scale_polygon(mark.get("polygon", []), unit)
            np_page.elements.append(NormalizedElement(
                text="✓" if mark.get("state") == "selected" else "☐",
                confidence=mark.get("confidence", 0.0),
                polygon=poly,
                element_type="selection_mark",
            ))
        
        pages.append(np_page)
    
    return NormalizedAzureResponse(
        document_id=doc_id,
        pages=pages,
        raw_response=raw,
        model_id=model_id,
    )

def polygon_bounds(polygon: list[float]) -> list[float]:
    if len(polygon) < 8:
        return [0.0, 0.0, 0.0, 0.0]
    xs = polygon[0::2]
    ys = polygon[1::2]
    return [min(xs), min(ys), max(xs), max(ys)]


def _sdk_to_dict(result: Any) -> dict:
    """Convert an Azure SDK result to a serializable dict."""
    try:
        import json
        # Some Azure SDK objects have an `as_dict()` or can be serialized
        if hasattr(result, "as_dict"):
            return result.as_dict()
        # Try JSON serialization
        return json.loads(json.dumps(result, default=str))
    except Exception:
        return {"error": "Failed to serialize Azure response"}


# ── Helper: Find text elements near a region ─────────────────────────────────

def _overlaps(box1: list[float], box2: list[float], threshold: float = 0.1) -> bool:
    if not box1 or not box2:
        return False
    x0_1, y0_1, x1_1, y1_1 = box1
    x0_2, y0_2, x1_2, y1_2 = box2
    
    # Intersection
    xi0 = max(x0_1, x0_2)
    yi0 = max(y0_1, y0_2)
    xi1 = min(x1_1, x1_2)
    yi1 = min(y1_1, y1_2)
    
    if xi1 <= xi0 or yi1 <= yi0:
        return False
        
    inter_area = (xi1 - xi0) * (yi1 - yi0)
    box1_area = (x1_1 - x0_1) * (y1_1 - y0_1)
    if box1_area <= 0:
        return False
    return (inter_area / box1_area) > threshold


def _compute_line_confidence(line_poly: list[float], word_elements: list[NormalizedElement]) -> float:
    if not line_poly or len(line_poly) < 8:
        return 0.0
    line_bbox = polygon_bounds(line_poly)
    matching = [w for w in word_elements if w.element_type == "word" and _overlaps(polygon_bounds(w.polygon), line_bbox, 0.0)]
    if not matching:
        return 0.0
    return sum(w.confidence for w in matching) / len(matching)


def find_text_near(
    page: NormalizedPage,
    anchor_text: str,
    direction: str = "below",
    tolerance: float = 50.0,
) -> list[NormalizedElement]:
    """
    Find text elements near a given anchor text on the page.
    Uses spatial relationship to locate field values.
    
    For 'right'/'left': requires significant horizontal displacement from anchor
    and tight vertical alignment. Sorts by vertical closeness first, then distance.
    
    For 'below'/'above': requires significant vertical displacement from anchor
    and tight horizontal alignment. Sorts by horizontal closeness first, then distance.
    """
    # Find the anchor element (prefer line elements for multi-word anchors)
    anchor_el = None
    for el in page.elements:
        if anchor_text.lower() in el.text.lower():
            anchor_el = el
            break
    
    if anchor_el is None:
        return []
    
    ax0, ay0, ax1, ay1 = polygon_bounds(anchor_el.polygon)
    
    # Expand anchor boundary to the full line containing the anchor text to establish the true label boundary
    for el in page.lines:
        if anchor_text.lower() in el.text.lower():
            lb = polygon_bounds(el.polygon)
            ax0 = min(ax0, lb[0])
            ay0 = min(ay0, lb[1])
            ax1 = max(ax1, lb[2])
            ay1 = max(ay1, lb[3])
            break
            
    acx = (ax0 + ax1) / 2.0
    acy = (ay0 + ay1) / 2.0
    
    candidates = []
    for el in page.elements:
        if el is anchor_el:
            continue
        # Only consider word elements for value extraction (skip lines to avoid
        # picking up compound labels like "जन्म तिथि" when searching for "जन्म")
        if el.element_type not in ("word", "selection_mark"):
            continue
        # Skip elements that overlap significantly with the anchor boundary
        if _overlaps(polygon_bounds(el.polygon), [ax0, ay0, ax1, ay1], 0.2):
            continue
            
        ex0, ey0, ex1, ey1 = polygon_bounds(el.polygon)
        ecx = (ex0 + ex1) / 2.0
        ecy = (ey0 + ey1) / 2.0
        
        dx = ecx - acx
        dy = ecy - acy
        
        match = False
        cross_axis_dev = 0.0  # deviation on the perpendicular axis
        
        # Enforce that the value must be strictly on the target side of the expanded anchor label boundary
        if direction == "right" and ex0 >= ax1 - 15.0 and abs(dy) < tolerance:
            match = True
            cross_axis_dev = abs(dy)
        elif direction == "left" and ex1 <= ax0 + 15.0 and abs(dy) < tolerance:
            match = True
            cross_axis_dev = abs(dy)
        elif direction == "below" and ey0 >= ay1 - 15.0 and abs(dx) < tolerance:
            match = True
            cross_axis_dev = abs(dx)
        elif direction == "above" and ey1 <= ay0 + 15.0 and abs(dx) < tolerance:
            match = True
            cross_axis_dev = abs(dx)
        
        if match:
            main_distance = (dx ** 2 + dy ** 2) ** 0.5
            # Sort key: cross-axis deviation dominates (100x weight), then main distance
            sort_key = cross_axis_dev * 100.0 + main_distance
            candidates.append((sort_key, el))
    
    # Sort by weighted key (tightest vertical/horizontal alignment first)
    candidates.sort(key=lambda x: x[0])
    return [c for _, c in candidates]