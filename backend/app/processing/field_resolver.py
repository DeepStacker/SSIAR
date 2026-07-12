"""
Dynamic Field Resolution Engine (Module 5)
============================================
Replaces manual coordinate mapping with semantic field understanding.
Uses anchors & relationships to locate field values in Azure's normalized output.
"""
import re
from typing import Optional
from app.core.types import (
    NormalizedAzureResponse,
    NormalizedPage,
    FieldDefinition,
    ReviewPriority,
)
from app.processing.azure_processor import find_text_near
from app.geometry.polygon import polygon_bounds


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
                
                # Check for match (either substring or split part match)
                is_match = False
                if "/" in anchor_text:
                    is_match = any(part.strip().lower() in label_content.lower() for part in anchor_text.split("/") if part.strip())
                else:
                    is_match = anchor_text.lower() in label_content.lower()
                    
                if is_match:
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
                            bbox = polygon_bounds(poly)
                            
                    # Get average confidence of words inside cell or default
                    conf = 1.0
                    spans = val_cell.get("spans", [])
                    word_confidences = []
                    # Locate word elements within the spans in the parent page raw data
                    pages_list = page_raw.get("pages", [])
                    target_page_raw = None
                    for p in pages_list:
                        p_num = p.get("pageNumber", p.get("page", 1))
                        if p_num == page_num:
                            target_page_raw = p
                            break
                    if not target_page_raw and pages_list:
                        target_page_raw = pages_list[0]
                        
                    if target_page_raw and spans:
                        words = target_page_raw.get("words", [])
                        for span in spans:
                            offset = span.get("offset", 0)
                            length = span.get("length", 0)
                            for word in words:
                                w_span = word.get("span", {})
                                w_offset = w_span.get("offset", 0)
                                if w_offset >= offset and w_offset < offset + length:
                                    word_confidences.append(word.get("confidence", 1.0))
                    if word_confidences:
                        conf = sum(word_confidences) / len(word_confidences)
                    
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
            
    # Calculate calculated_bbox and calculated_poly (either anchor-relative or template fallback)
    std_w = 595.0
    std_h = 842.0
    scale_x = page.width / std_w
    scale_y = page.height / std_h
    
    calculated_bbox = None
    calculated_poly = None
    
    if anchor_el and anchor_el.polygon and len(anchor_el.polygon) >= 8:
        poly = anchor_el.polygon
        p0 = (poly[0], poly[1])
        p1 = (poly[2], poly[3])
        p2 = (poly[4], poly[5])
        p3 = (poly[6], poly[7])
        
        # Unit vector along text baseline direction
        dx = p1[0] - p0[0]
        dy = p1[1] - p0[1]
        len_u = (dx * dx + dy * dy) ** 0.5
        u = (dx / len_u, dy / len_u) if len_u > 0 else (1.0, 0.0)
        
        # Unit vector perpendicular to text direction (pointing down)
        dx_v = p3[0] - p0[0]
        dy_v = p3[1] - p0[1]
        len_v = (dx_v * dx_v + dy_v * dy_v) ** 0.5
        v = (dx_v / len_v, dy_v / len_v) if len_v > 0 else (-u[1], u[0])
        
        fw = field_def.width * scale_x
        fh = field_def.height * scale_y
        gap = 5.0
        
        if direction == "right":
            v0 = (p1[0] + gap * u[0], p1[1] + gap * u[1])
            v1 = (v0[0] + fw * u[0], v0[1] + fw * u[1])
            v2 = (v1[0] + fh * v[0], v1[1] + fh * v[1])
            v3 = (v0[0] + fh * v[0], v0[1] + fh * v[1])
        elif direction == "left":
            v1 = (p0[0] - gap * u[0], p0[1] - gap * u[1])
            v0 = (v1[0] - fw * u[0], v1[1] - fw * u[1])
            v2 = (v1[0] + fh * v[0], v1[1] + fh * v[1])
            v3 = (v0[0] + fh * v[0], v0[1] + fh * v[1])
        elif direction == "below":
            v0 = (p3[0] + gap * v[0], p3[1] + gap * v[1])
            v1 = (v0[0] + fw * u[0], v0[1] + fw * u[1])
            v2 = (v1[0] + fh * v[0], v1[1] + fh * v[1])
            v3 = (v0[0] + fh * v[0], v0[1] + fh * v[1])
        elif direction == "above":
            v3 = (p0[0] - gap * v[0], p0[1] - gap * v[1])
            v2 = (p1[0] - gap * v[0], p1[1] - gap * v[1])
            v0 = (v3[0] - fh * v[0], v3[1] - fh * v[1])
            v1 = (v2[0] - fh * v[0], v2[1] - fh * v[1])
        else: # around
            v0 = (p3[0] - (fw / 2.0) * u[0] + gap * v[0], p3[1] - (fw / 2.0) * u[1] + gap * v[1])
            v1 = (v0[0] + fw * u[0], v0[1] + fw * u[1])
            v2 = (v1[0] + fh * v[0], v1[1] + fh * v[1])
            v3 = (v0[0] + fh * v[0], v0[1] + fh * v[1])
            
        calculated_poly = [
            v0[0], v0[1],
            v1[0], v1[1],
            v2[0], v2[1],
            v3[0], v3[1]
        ]
        xs = [v0[0], v1[0], v2[0], v3[0]]
        ys = [v0[1], v1[1], v2[1], v3[1]]
        calculated_bbox = [min(xs), min(ys), max(xs), max(ys)]
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
            calculated_bbox = [x0 * scale_x, y0 * scale_y, x1 * scale_x, y1 * scale_y]
            
            # Apply page-level rotation to fallback coordinates if rotated
            angle_deg = getattr(page, "angle", 0.0)
            if abs(angle_deg) > 0.05:
                import math
                theta = math.radians(angle_deg)
                cx = page.width / 2.0
                cy = page.height / 2.0
                
                def rotate_point(px, py):
                    tx = px - cx
                    ty = py - cy
                    rx = tx * math.cos(theta) - ty * math.sin(theta)
                    ry = tx * math.sin(theta) + ty * math.cos(theta)
                    return rx + cx, ry + cy
                    
                rx0, ry0 = rotate_point(calculated_bbox[0], calculated_bbox[1])
                rx1, ry1 = rotate_point(calculated_bbox[2], calculated_bbox[1])
                rx2, ry2 = rotate_point(calculated_bbox[2], calculated_bbox[3])
                rx3, ry3 = rotate_point(calculated_bbox[0], calculated_bbox[3])
                
                calculated_poly = [rx0, ry0, rx1, ry1, rx2, ry2, rx3, ry3]
                xs = [rx0, rx1, rx2, rx3]
                ys = [ry0, ry1, ry2, ry3]
                calculated_bbox = [min(xs), min(ys), max(xs), max(ys)]
            else:
                calculated_poly = [
                    calculated_bbox[0], calculated_bbox[1],
                    calculated_bbox[2], calculated_bbox[1],
                    calculated_bbox[2], calculated_bbox[3],
                    calculated_bbox[0], calculated_bbox[3]
                ]
    
    # Find candidate elements near the anchor using direction-aware tolerance
    # For right/left: cross-axis (dy) should be tight (field height)
    # For above/below: cross-axis (dx) should be tight (field width)
    scale = 300.0 / 72.0
    # Try inline value extraction first (if the matching line contains both label and value)
    if anchor_el:
        for el in page.lines:
            if anchor_text.lower() in el.text.lower():
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
                        return cleaned, el.confidence, True, polygon_bounds(el.polygon), el.polygon, page.page

    # Find candidate elements near the anchor using direction-aware tolerance
    # For right/left: cross-axis (dy) should be strictly constrained to same row (max 150 pixels)
    # For above/below: cross-axis (dx) should be constrained to same column (max 150 pixels)
    if direction in ("right", "left"):
        tolerance = 45.0 if field_def.name == "rank" else 150.0
    else:
        tolerance = 150.0
    candidates = find_text_near(page, anchor_text, direction, tolerance)
    
    if not candidates:
        # Fallback: try a broader search (max 250 pixels)
        # Avoid huge vertical jumps for the rank field to prevent mixing with subject rows
        candidates = find_text_near(page, anchor_text, direction, 60.0 if field_def.name == "rank" else 250.0)
        
    # If the field is remarks, we only want candidates that are reasonably close (within 150px vertically)
    # to avoid jumping over empty answer space into the next section/table.
    if field_def.name == "remarks" and candidates:
        anchor_bottom = polygon_bounds(anchor_el.polygon)[3] if anchor_el else 3640.0
        # If the candidate is a printed form label, discard candidates to force template fallback bbox
        if candidates[0].text in ("प्रतिशत", "भाषा", "गणित", "विज्ञान", "हिंदी"):
            candidates = []
        elif candidates[0].polygon and polygon_bounds(candidates[0].polygon)[1] - anchor_bottom > 200.0:
            candidates = []
    
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
    bbox = polygon_bounds(value_el.polygon)
    polygon = value_el.polygon
    
    # Merge consecutive words on the same row (e.g. "40" and "%")
    # Crucial: Ensure we do not merge words across distinct column/table boundaries.
    if value_el.element_type == "word":
        row_words = []
        vb = polygon_bounds(value_el.polygon)
        v_center = (vb[1] + vb[3]) / 2.0
        for el in page.elements:
            if el.element_type == "word" and el is not anchor_el:
                eb = polygon_bounds(el.polygon)
                el_v_center = (eb[1] + eb[3]) / 2.0
                if abs(el_v_center - v_center) < 25.0:
                    if direction == "right" and anchor_el and eb[0] < polygon_bounds(anchor_el.polygon)[2] - 15.0:
                        continue
                    row_words.append(el)
                    
        row_words.sort(key=lambda x: polygon_bounds(x.polygon)[0])
        
        segments = []
        current_segment = []
        for el in row_words:
            if not current_segment:
                current_segment.append(el)
            else:
                prev_el = current_segment[-1]
                gap = polygon_bounds(el.polygon)[0] - polygon_bounds(prev_el.polygon)[2]
                if gap < 80.0:
                    current_segment.append(el)
                else:
                    segments.append(current_segment)
                    current_segment = [el]
        if current_segment:
            segments.append(current_segment)
            
        target_segment = []
        for seg in segments:
            if value_el in seg:
                target_segment = seg
                break
                
        if target_segment:
            merged_elements = target_segment
            text = " ".join(el.text.strip() for el in merged_elements)
            confidence = sum(el.confidence for el in merged_elements) / len(merged_elements)
            
            # If we merged multiple words, compute the bounding box/polygon of the merged group
            if len(merged_elements) > 1:
                mx0 = min(polygon_bounds(el.polygon)[0] for el in merged_elements)
                my0 = min(polygon_bounds(el.polygon)[1] for el in merged_elements)
                mx1 = max(polygon_bounds(el.polygon)[2] for el in merged_elements)
                my1 = max(polygon_bounds(el.polygon)[3] for el in merged_elements)
                bbox = [mx0, my0, mx1, my1]
                polygon = [
                    mx0, my0,
                    mx1, my0,
                    mx1, my1,
                    mx0, my1
                ]
    
    # For selection marks, return the state
    if value_el.element_type == "selection_mark":
        return text, confidence, True, polygon_bounds(value_el.polygon), value_el.polygon, page.page
    
    # Some anchors detect the label itself (e.g., "जन्म तिथि") — skip if too similar
    if is_label(text, anchor_text):
        if len(candidates) > 1:
            value_el = candidates[1]
            text = value_el.text.strip()
            confidence = value_el.confidence
            bbox = polygon_bounds(value_el.polygon)
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
    if field_name.startswith("q"):
        try:
            q_num = int(field_name[1:])
            if q_num >= 21:
                return 2
        except ValueError:
            pass
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