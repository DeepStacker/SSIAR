"""Coordinate resolution helpers — resolve field bounding boxes from
Azure table model, static templates, or stored database coordinates.

Extracted from app.api.v2.documents to allow reuse from crops.py
and break the API → processing dependency chain.
"""
from typing import Optional
from app.database import get_document, get_db_connection, put_conn


# ── Resolve from Azure table model ───────────────────────────────────────


def get_sdq_row_polygon_from_table(raw_dict: dict, q_num: int) -> Optional[tuple[list[float], int]]:
    """Determine the bounding box and polygon of the three checkbox cells
    for a specific question using Azure's table model."""
    page_num = 2 if q_num >= 13 else 1

    page_raw = raw_dict.get(f"page_{page_num}", {})
    if not page_raw or "pages" not in page_raw:
        page_raw = raw_dict

    tables = page_raw.get("tables", [])
    if not tables:
        for p in page_raw.get("pages", []):
            p_num = p.get("pageNumber", p.get("page", 1))
            if p_num == page_num:
                tables = p.get("tables", [])
                break

    if not tables:
        return None

    if page_num == 1:
        table = tables[1] if len(tables) >= 2 else tables[0]
        row_idx = q_num
    else:
        table = tables[0]
        row_idx = q_num - 13

    target_cells = []
    for cell in table.get("cells", []):
        if cell.get("rowIndex") == row_idx and cell.get("columnIndex") in (1, 2, 3):
            target_cells.append(cell)

    if not target_cells:
        return None

    polys = []
    unit = "pixel"
    for p in page_raw.get("pages", []):
        p_num = p.get("pageNumber", p.get("page", 1))
        if p_num == page_num:
            unit = p.get("unit", "pixel")
            break

    for cell in target_cells:
        regions = cell.get("boundingRegions", [])
        if regions:
            poly = regions[0].get("polygon", [])
            if unit == "inch":
                poly = [pt * 300.0 for pt in poly]
            if poly and len(poly) >= 8:
                polys.append(poly)

    if not polys:
        return None

    all_xs = []
    all_ys = []
    for poly in polys:
        all_xs.extend(poly[0::2])
        all_ys.extend(poly[1::2])

    x0 = min(all_xs)
    x1 = max(all_xs)
    y0 = min(all_ys)
    y1 = max(all_ys)

    pad_x = (x1 - x0) * 0.02
    pad_y = (y1 - y0) * 0.10

    polygon = [
        x0 - pad_x, y0 - pad_y,
        x1 + pad_x, y0 - pad_y,
        x1 + pad_x, y1 + pad_y,
        x0 - pad_x, y1 + pad_y
    ]
    return polygon, page_num


def get_field_polygon_from_table(raw_dict: dict, field_name: str) -> Optional[tuple[list[float], int]]:
    """Resolve demographics and academic field coordinates directly from raw Azure tables."""
    field_mappings = {
        "roll_number": (1, "रोल नंबर"),
        "class": (1, "कक्षा"),
        "dob": (1, "जन्म तिथि"),
        "gender": (1, "लिंग"),
        "math_pct": (2, "गणित/जीव"),
        "science_pct": (2, "विज्ञान/रासायन"),
        "language_pct": (2, "हिंदी"),
    }

    if field_name not in field_mappings:
        return None

    page_num, anchor = field_mappings[field_name]

    page_raw = raw_dict.get(f"page_{page_num}", {})
    if not page_raw or "pages" not in page_raw:
        page_raw = raw_dict

    tables = page_raw.get("tables", [])
    if not tables:
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

                is_match = False
                if "/" in anchor:
                    is_match = any(part.strip().lower() in label_content.lower() for part in anchor.split("/") if part.strip())
                else:
                    is_match = anchor.lower() in label_content.lower()

                if is_match:
                    regions = val_cell.get("boundingRegions", [])
                    if regions:
                        poly = regions[0].get("polygon", [])
                        unit = "pixel"
                        for p in page_raw.get("pages", []):
                            p_num = p.get("pageNumber", p.get("page", 1))
                            if p_num == page_num:
                                unit = p.get("unit", "pixel")
                                break
                        if unit == "inch":
                            poly = [pt * 300.0 for pt in poly]
                        if poly and len(poly) >= 8:
                            return poly, page_num

    return None


def get_rank_polygon(raw_dict: dict) -> Optional[tuple[list[float], int]]:
    """Resolve rank coordinates from page 2 lines."""
    page_num = 2
    page_raw = raw_dict.get(f"page_{page_num}", {})
    if not page_raw or "pages" not in page_raw:
        page_raw = raw_dict

    pages = page_raw.get("pages", [])
    if not pages:
        return None

    p = pages[0]
    lines = p.get("lines", [])
    for line in lines:
        content = line.get("content", "")
        if "रैंक" in content:
            poly = line.get("polygon", [])
            unit = p.get("unit", "pixel")
            if unit == "inch":
                poly = [pt * 300.0 for pt in poly]
            if poly and len(poly) >= 8:
                return poly, page_num
    return None


def get_static_fallback_polygon(field_name: str) -> Optional[tuple[list[float], int]]:
    """Get standard static template coordinate coordinates for a field."""
    from app.image.roi import ROIS_P1_POINTS, ROIS_P2_POINTS, ROIS_REMARKS_POINTS
    scale = 300.0 / 72.0

    p2_keys = {'math_pct', 'science_pct', 'language_pct', 'rank', 'remarks'}

    page_num = 1
    if field_name in p2_keys:
        page_num = 2
    elif field_name.startswith("q"):
        try:
            q_num = int(field_name[1:])
            if q_num >= 13:
                page_num = 2
        except ValueError:
            pass

    if field_name.startswith("q") and page_num in (1, 2):
        try:
            from app.image.pdf import P1_Y_RANGES, P2_Y_RANGES, COLS_X_PTS
            q_num = int(field_name[1:])
            if page_num == 1:
                idx = q_num - 1
                y0, y1 = P1_Y_RANGES[idx] if 0 <= idx < len(P1_Y_RANGES) else (0, 0)
            else:
                idx = q_num - 13
                y0, y1 = P2_Y_RANGES[idx] if 0 <= idx < len(P2_Y_RANGES) else (0, 0)
            x0 = 230.0
            x1 = (COLS_X_PTS[-1] + 2.5) + 70.0
            s = scale
            polygon = [
                x0 * s, y0 * s,
                x1 * s, y0 * s,
                x1 * s, y1 * s,
                x0 * s, y1 * s
            ]
            return polygon, page_num
        except Exception:
            pass

    rect = None
    if page_num == 1:
        if field_name in ROIS_P1_POINTS:
            rect = ROIS_P1_POINTS[field_name]
        elif field_name == "consent":
            rect = (470.0, 190.0, 555.0, 240.0)
    else:
        if field_name in ROIS_P2_POINTS:
            rect = ROIS_P2_POINTS[field_name]
        elif field_name == "remarks":
            rect = ROIS_REMARKS_POINTS['remarks']

    if rect:
        x0, y0, x1, y1 = rect
        s = scale
        polygon = [
            x0 * s, y0 * s,
            x1 * s, y0 * s,
            x1 * s, y1 * s,
            x0 * s, y1 * s
        ]
        return polygon, page_num

    return None


# ── Scale coordinates from Azure space to image pixels ───────────────────


def scale_coordinates_to_image_size(doc_id: str, v2: dict):
    """Scale all coordinates in v2_trust from 300 DPI to physical page image dimensions."""
    from app.image.page_utils import get_page, get_azure_scale

    page_dims = {}

    for field_name, val in v2.items():
        if not isinstance(val, dict):
            continue

        page_num = val.get("page", 1)

        if page_num not in page_dims:
            img = get_page(doc_id, page_num)
            if img is not None:
                h, w = img.shape[:2]
                page_dims[page_num] = (w, h)
            else:
                page_dims[page_num] = None

        dims = page_dims[page_num]
        if not dims:
            continue

        img_w, img_h = dims
        scale_x, scale_y = get_azure_scale(doc_id, page_num, img_w, img_h)

        poly = val.get("polygon")
        if poly and len(poly) >= 8:
            val["polygon"] = [
                pt * scale_x if i % 2 == 0 else pt * scale_y
                for i, pt in enumerate(poly)
            ]
