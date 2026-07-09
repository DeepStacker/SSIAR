"""
Dynamic Field Resolution Engine (Module 5)
============================================
Replaces manual coordinate mapping with semantic field understanding.
Uses anchors & relationships to locate field values in Azure's normalized output.
"""
import re
from typing import Optional
from app.processing.types import (
    NormalizedAzureResponse,
    NormalizedPage,
    FieldDefinition,
    ReviewPriority,
)
from app.processing.azure_processor import find_text_near


def resolve_field(
    field_def: FieldDefinition,
    normalized: NormalizedAzureResponse,
) -> tuple[str, float, bool, Optional[list[float]], Optional[list[float]], int]:
    """
    Resolve a field value from the normalized Azure response using
    anchor-based semantic resolution.
    
    Returns: (extracted_text, confidence, found, bbox, polygon, page_number)
    """
    if not normalized or not normalized.pages:
        return "", 0.0, False, None, None, 1
    
    page_num = _get_field_page(field_def.name, normalized.pages)
    
    # Find the matching page (1-indexed)
    page = None
    for p in normalized.pages:
        if p.page == page_num:
            page = p
            break
    
    if page is None:
        return "", 0.0, False, None, None, page_num
    
    anchor_text = field_def.anchor
    direction = field_def.relationship
    
    # Locate anchor element
    anchor_el = None
    for el in page.elements:
        if anchor_text.lower() in el.text.lower():
            anchor_el = el
            break
            
    # Calculate calculated_bbox (either anchor-relative or template fallback)
    scale = 300.0 / 72.0
    calculated_bbox = None
    if anchor_el:
        ax0, ay0, ax1, ay1 = anchor_el.bbox
        fw = field_def.width * scale
        fh = field_def.height * scale
        
        if direction == "below":
            bx0 = ax0
            by0 = ay1 + 5.0
            bx1 = ax0 + fw
            by1 = by0 + fh
        elif direction == "right":
            bx0 = ax1 + 5.0
            by0 = ay0
            bx1 = bx0 + fw
            by1 = ay0 + fh
        elif direction == "above":
            bx0 = ax0
            by0 = max(0.0, ay0 - fh - 5.0)
            bx1 = ax0 + fw
            by1 = ay0 - 5.0
        elif direction == "left":
            bx0 = max(0.0, ax0 - fw - 5.0)
            by0 = ay0
            bx1 = ax0 - 5.0
            by1 = ay0 + fh
        else: # around
            bx0 = max(0.0, ax0 - fw/2.0)
            by0 = ay1 + 5.0
            bx1 = ax0 + fw/2.0
            by1 = by0 + fh
        calculated_bbox = [bx0, by0, bx1, by1]
    else:
        # Fall back to template coordinates
        from app.image.roi import ROIS_P1_POINTS, ROIS_P2_POINTS, ROIS_REMARKS_POINTS
        rect = None
        if page_num == 1:
            if field_def.name in ROIS_P1_POINTS:
                rect = ROIS_P1_POINTS[field_def.name]
            elif field_def.name == "consent":
                rect = (470.0, 190.0, 555.0, 240.0)
        else:
            if field_def.name in ROIS_P2_POINTS:
                rect = ROIS_P2_POINTS[field_def.name]
            elif field_def.name == "remarks":
                rect = ROIS_REMARKS_POINTS['remarks']
                
        if rect:
            x0, y0, x1, y1 = rect
            calculated_bbox = [x0 * scale, y0 * scale, x1 * scale, y1 * scale]
    
    # Find candidate elements near the anchor
    tolerance = max(field_def.width, field_def.height) * 2.0 + 50.0
    candidates = find_text_near(page, anchor_text, direction, tolerance)
    
    if not candidates:
        # Fallback: try a broader search
        candidates = find_text_near(page, anchor_text, direction, tolerance * 2.0)
    
    if not candidates:
        calculated_poly = [
            calculated_bbox[0], calculated_bbox[1],
            calculated_bbox[2], calculated_bbox[1],
            calculated_bbox[2], calculated_bbox[3],
            calculated_bbox[0], calculated_bbox[3]
        ] if calculated_bbox else []
        return "", 0.0, False, calculated_bbox, calculated_poly, page.page
    
    # The closest element is likely the field value
    value_el = candidates[0]
    text = value_el.text.strip()
    confidence = value_el.confidence
    
    # For selection marks, return the state
    if value_el.element_type == "selection_mark":
        return text, confidence, True, value_el.bbox, value_el.polygon, page.page
    
    # Some anchors detect the label itself (e.g., "जन्म तिथि") — skip if too similar
    if is_label(text, anchor_text):
        if len(candidates) > 1:
            value_el = candidates[1]
            text = value_el.text.strip()
            confidence = value_el.confidence
        else:
            calculated_poly = [
                calculated_bbox[0], calculated_bbox[1],
                calculated_bbox[2], calculated_bbox[1],
                calculated_bbox[2], calculated_bbox[3],
                calculated_bbox[0], calculated_bbox[3]
            ] if calculated_bbox else []
            return "", 0.0, False, calculated_bbox, calculated_poly, page.page
            
    return text, confidence, True, value_el.bbox, value_el.polygon, page.page


def resolve_all_fields(
    template_id: str,
    normalized: NormalizedAzureResponse,
) -> dict[str, tuple[str, float, bool]]:
    """Resolve all fields defined in the template from normalized Azure data."""
    from app.processing.templates import get_template
    tmpl = get_template(template_id)
    if not tmpl:
        return {}
    
    results = {}
    for field_def in tmpl.fields:
        text, conf, found, _, _ = resolve_field(field_def, normalized)
        results[field_def.name] = (text, conf, found)
    
    return results


# ── Backward Compatibility: Map field names to template field names ──────────

def _get_field_page(field_name: str, pages: list) -> int:
    """Determine which page a field is on (1-indexed)."""
    p1_fields = {
        "roll_number", "class", "dob", "gender",
        "consent",
    }
    p2_fields = {
        "math_pct", "science_pct", "language_pct", "rank", "remarks",
    }
    # Q1..Q25 are on page 1 (Q1-Q20) or page 2 (Q21-Q25)
    # Default to page 1
    if field_name in p2_fields:
        return 2
    return 1


def normalize_value(text: str, field_type: str) -> str:
    """Normalize extracted text based on field type."""
    if not text:
        return ""
    
    # Convert Devanagari digits
    devanagari_digits = {
        '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
        '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
    }
    text = "".join(devanagari_digits.get(c, c) for c in text)
    
    if field_type == "number":
        # Keep only digits and common separators
        text = re.sub(r'[^0-9./\-]', '', text).strip()
    elif field_type == "date":
        # Normalize date separators
        text = text.replace('-', '/').replace('.', '/').replace('_', '/')
    elif field_type == "gender":
        text = text.strip().upper()
        if text in ("FEMALE", "FEM", "F"):
            text = "F"
        elif text in ("MALE", "M"):
            text = "M"
    
    return text.strip()


def is_label(text: str, anchor_text: str) -> bool:
    """Check if extracted text is just the label/anchor text itself."""
    t = text.strip().lower()
    a = anchor_text.strip().lower()
    if not t or not a:
        return False
    # Substring check
    if t in a or a in t:
        return True
    # Character overlap Jaccard ratio
    common = len(set(t) & set(a))
    ratio = common / max(len(set(t)), len(set(a)), 1)
    return ratio > 0.4