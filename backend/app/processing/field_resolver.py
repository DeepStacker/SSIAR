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


def _polygon_to_bbox(poly: list[float]) -> list[float]:
    if not poly or len(poly) < 8:
        return [0.0, 0.0, 0.0, 0.0]
    xs = poly[0::2]
    ys = poly[1::2]
    return [min(xs), min(ys), max(xs), max(ys)]


def resolve_field_from_tables(
    anchor_text: str,
    raw_response: dict,
    page_num: int
) -> Optional[tuple[str, float, list[float], list[float]]]:
    """Search for the anchor and its value in the structured tables from Azure DI."""
    if not raw_response:
        return None
        
    # Get the raw page data
    page_raw = raw_response.get(f"page_{page_num}", {})
    if not page_raw or "pages" not in page_raw:
        # Fallback if flat
        page_raw = raw_response
        
    tables = page_raw.get("tables", [])
    if not tables:
        # Check inside inner pages just in case
        for p in page_raw.get("pages", []):
            p_num = p.get("pageNumber", p.get("page", 1))
            if p_num == page_num:
                tables = p.get("tables", [])
                break
                
    if not tables:
        return None
        
    for table in tables:
        row_cells = {}
        for cell in table.get("cells", []):
            r_idx = cell.get("rowIndex")
            c_idx = cell.get("columnIndex")
            if r_idx is not None and c_idx is not None:
                row_cells.setdefault(r_idx, {})[c_idx] = cell
                
        for r_idx, cols in row_cells.items():
            if 0 in cols and 1 in cols:
                label_cell = cols[0]
                val_cell = cols[1]
                
                label_content = label_cell.get("content", "")
                if anchor_text.lower() in label_content.lower():
                    # Match found! Extract value content and coordinates
                    val_text = val_cell.get("content", "").strip()
                    
                    # Clean up prefix punctuation
                    val_text = re.sub(r'^[:\-\s\=]+', '', val_text).strip()
                    
                    # Extract polygon/bbox if present
                    poly = []
                    bbox = None
                    regions = val_cell.get("boundingRegions", [])
                    if regions:
                        poly = regions[0].get("polygon", [])
                        unit = "pixel"
                        # Try to detect unit from the parent page
                        for p in page_raw.get("pages", []):
                            p_num = p.get("pageNumber", p.get("page", 1))
                            if p_num == page_num:
                                unit = p.get("unit", "pixel")
                                break
                        if unit == "inch":
                            poly = [pt * 300.0 for pt in poly]
                        if poly and len(poly) >= 8:
                            bbox = _polygon_to_bbox(poly)
                            
                    # Get average confidence of words inside cell or default
                    conf = 1.0
                    
                    return val_text, conf, bbox, poly
                    
    return None


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
    
    # Try structured table resolution first (highest accuracy, handles rotations/perspective automatically)
    try:
        tbl_res = resolve_field_from_tables(anchor_text, normalized.raw_response, page_num)
        if tbl_res:
            val_text, val_conf, val_bbox, val_poly = tbl_res
            # If coordinates are valid, return them immediately
            if val_bbox and val_poly:
                return val_text, val_conf, True, val_bbox, val_poly, page_num
    except Exception as e:
        print(f"Table resolution error for {field_def.name}: {e}")
    
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
    
    # Find candidate elements near the anchor using direction-aware tolerance
    # For right/left: cross-axis (dy) should be tight (field height)
    # For above/below: cross-axis (dx) should be tight (field width)
    scale = 300.0 / 72.0
    # Try inline value extraction first (if the matching line contains both label and value)
    if anchor_el:
        for el in page.elements:
            if el.element_type == "line" and anchor_text.lower() in el.text.lower():
                cleaned = el.text.replace(anchor_text, "").strip()
                cleaned = re.sub(r'^[:\-\s\=]+', '', cleaned).strip()
                if cleaned:
                    is_valid = False
                    if field_def.type == "number" and any(c.isdigit() for c in cleaned) and len(cleaned) < 15:
                        is_valid = True
                    elif field_def.type == "date" and len(cleaned) < 15:
                        is_valid = True
                    elif field_def.type == "gender" and len(cleaned) < 10:
                        is_valid = True
                    if is_valid:
                        # Extract the trailing parts as the value
                        return cleaned, el.confidence, True, el.bbox, el.polygon, page.page

    # Find candidate elements near the anchor using direction-aware tolerance
    # For right/left: cross-axis (dy) should be strictly constrained to same row (max 150 pixels)
    # For above/below: cross-axis (dx) should be constrained to same column (max 150 pixels)
    if direction in ("right", "left"):
        tolerance = 150.0
    else:
        tolerance = 150.0
    candidates = find_text_near(page, anchor_text, direction, tolerance)
    
    if not candidates:
        # Fallback: try a broader search (max 250 pixels)
        candidates = find_text_near(page, anchor_text, direction, 250.0)
    
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
    bbox = value_el.bbox
    polygon = value_el.polygon
    
    # Merge consecutive words on the same row (e.g. "40" and "%")
    if value_el.element_type == "word":
        curr_el = value_el
        merged_elements = [value_el]
        while True:
            next_el = None
            for el in page.elements:
                if el.element_type == "word" and el not in merged_elements and el is not anchor_el:
                    # Check vertical alignment (same row) and immediate horizontal proximity
                    dy = abs((el.bbox[1] + el.bbox[3]) / 2.0 - (curr_el.bbox[1] + curr_el.bbox[3]) / 2.0)
                    dx = el.bbox[0] - curr_el.bbox[2]
                    if dy < 30.0 and 0.0 <= dx < 100.0:
                        next_el = el
                        break
            if next_el:
                text += " " + next_el.text.strip()
                merged_elements.append(next_el)
                curr_el = next_el
            else:
                break
        
        # If we merged multiple words, compute the bounding box/polygon of the merged group
        if len(merged_elements) > 1:
            mx0 = min(el.bbox[0] for el in merged_elements)
            my0 = min(el.bbox[1] for el in merged_elements)
            mx1 = max(el.bbox[2] for el in merged_elements)
            my1 = max(el.bbox[3] for el in merged_elements)
            bbox = [mx0, my0, mx1, my1]
            polygon = [
                mx0, my0,
                mx1, my0,
                mx1, my1,
                mx0, my1
            ]
    
    # For selection marks, return the state
    if value_el.element_type == "selection_mark":
        return text, confidence, True, value_el.bbox, value_el.polygon, page.page
    
    # Some anchors detect the label itself (e.g., "जन्म तिथि") — skip if too similar
    if is_label(text, anchor_text):
        if len(candidates) > 1:
            value_el = candidates[1]
            text = value_el.text.strip()
            confidence = value_el.confidence
            bbox = value_el.bbox
            polygon = value_el.polygon
        else:
            calculated_poly = [
                calculated_bbox[0], calculated_bbox[1],
                calculated_bbox[2], calculated_bbox[1],
                calculated_bbox[2], calculated_bbox[3],
                calculated_bbox[0], calculated_bbox[3]
            ] if calculated_bbox else []
            return "", 0.0, False, calculated_bbox, calculated_poly, page.page
            
    return text, confidence, True, bbox, polygon, page.page


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