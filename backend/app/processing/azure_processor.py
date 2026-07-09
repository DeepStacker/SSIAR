"""
Azure Response Processing Layer (Module 4)
============================================
Converts raw Azure Document Intelligence responses into a normalized application format.
Always stores the complete raw response for future re-processing.
"""
import json
from datetime import datetime
from typing import Optional, Any
from app.processing.types import (
    NormalizedAzureResponse,
    NormalizedPage,
    NormalizedElement,
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


def _normalize_from_sdk(doc_id: str, result: Any) -> NormalizedAzureResponse:
    """Normalize from Azure SDK DocumentAnalysisResult."""
    model_id = getattr(result, "model_id", "prebuilt-read")
    pages = []
    
    for page in getattr(result, "pages", []) or []:
        np_page = NormalizedPage(
            page=page.page_number if hasattr(page, "page_number") else (getattr(page, "page", 1)),
            angle=getattr(page, "angle", 0.0),
            width=getattr(page, "width", 0.0),
            height=getattr(page, "height", 0.0),
        )
        
        # Process words
        for word in getattr(page, "words", []) or []:
            poly = list(getattr(word, "polygon", [])) or []
            bbox = _polygon_to_bbox(poly) if poly else [0, 0, 0, 0]
            np_page.elements.append(NormalizedElement(
                text=getattr(word, "content", ""),
                bbox=bbox,
                confidence=getattr(word, "confidence", 0.0),
                polygon=poly,
                element_type="word",
            ))
        
        # Process lines for additional context
        for line in getattr(page, "lines", []) or []:
            poly = list(getattr(line, "polygon", [])) or []
            bbox = _polygon_to_bbox(poly) if poly else [0, 0, 0, 0]
            np_page.elements.append(NormalizedElement(
                text=getattr(line, "content", ""),
                bbox=bbox,
                confidence=getattr(line, "confidence", 0.0),
                polygon=poly,
                element_type="line",
            ))
        
        # Process selection marks (checkboxes)
        for sel in getattr(page, "selection_marks", []) or []:
            poly = list(getattr(sel, "polygon", [])) or []
            bbox = _polygon_to_bbox(poly) if poly else [0, 0, 0, 0]
            np_page.elements.append(NormalizedElement(
                text="✓" if getattr(sel, "state", "unselected") == "selected" else "☐",
                bbox=bbox,
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
    """Normalize from a raw dict (e.g., loaded from JSON storage)."""
    model_id = raw.get("model_id", "prebuilt-read")
    pages_raw = raw.get("pages", [])
    pages = []
    
    for p in pages_raw:
        np_page = NormalizedPage(
            page=p.get("page_number", p.get("page", 1)),
            angle=p.get("angle", 0.0),
            width=p.get("width", 0.0),
            height=p.get("height", 0.0),
        )
        
        for word in p.get("words", []):
            poly = word.get("polygon", [])
            bbox = _polygon_to_bbox(poly) if poly else [0, 0, 0, 0]
            np_page.elements.append(NormalizedElement(
                text=word.get("content", ""),
                bbox=bbox,
                confidence=word.get("confidence", 0.0),
                polygon=poly,
                element_type="word",
            ))
        
        for line in p.get("lines", []):
            poly = line.get("polygon", [])
            bbox = _polygon_to_bbox(poly) if poly else [0, 0, 0, 0]
            np_page.elements.append(NormalizedElement(
                text=line.get("content", ""),
                bbox=bbox,
                confidence=line.get("confidence", 0.0),
                polygon=poly,
                element_type="line",
            ))
        
        for mark in p.get("selection_marks", []):
            poly = mark.get("polygon", [])
            bbox = _polygon_to_bbox(poly) if poly else [0, 0, 0, 0]
            np_page.elements.append(NormalizedElement(
                text="✓" if mark.get("state") == "selected" else "☐",
                bbox=bbox,
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


def _polygon_to_bbox(poly: list[float]) -> list[float]:
    """Convert polygon [x0,y0,x1,y1,...] to [x_min, y_min, x_max, y_max]."""
    if len(poly) < 4:
        return [0, 0, 0, 0]
    xs = poly[0::2]
    ys = poly[1::2]
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

def find_text_near(
    page: NormalizedPage,
    anchor_text: str,
    direction: str = "below",
    tolerance: float = 50.0,
) -> list[NormalizedElement]:
    """
    Find text elements near a given anchor text on the page.
    Uses spatial relationship to locate field values.
    """
    # Find the anchor element
    anchor_el = None
    for el in page.elements:
        if anchor_text.lower() in el.text.lower():
            anchor_el = el
            break
    
    if anchor_el is None:
        return []
    
    ax0, ay0, ax1, ay1 = anchor_el.bbox
    acx = (ax0 + ax1) / 2.0
    acy = (ay0 + ay1) / 2.0
    
    candidates = []
    for el in page.elements:
        if el is anchor_el:
            continue
        ex0, ey0, ex1, ey1 = el.bbox
        ecx = (ex0 + ex1) / 2.0
        ecy = (ey0 + ey1) / 2.0
        
        dx = ecx - acx
        dy = ecy - acy
        
        match = False
        if direction == "below" and dy > 0 and abs(dx) < tolerance:
            match = True
        elif direction == "above" and dy < 0 and abs(dx) < tolerance:
            match = True
        elif direction == "right" and dx > 0 and abs(dy) < tolerance:
            match = True
        elif direction == "left" and dx < 0 and abs(dy) < tolerance:
            match = True
        
        if match:
            distance = (dx ** 2 + dy ** 2) ** 0.5
            candidates.append((distance, el))
    
    # Sort by distance (closest first)
    candidates.sort(key=lambda x: x[0])
    return [c for _, c in candidates]