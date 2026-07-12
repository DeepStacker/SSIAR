"""
Page-Level Processing
=====================
Checkbox density analysis and selection mark resolution for document pages.
"""
import numpy as np
import cv2
from typing import Optional, Any
from app.geometry.polygon import polygon_bounds


def check_checkbox_density(page_img: np.ndarray, poly: list[float], page_w: float, page_h: float, unit: str = "pixel") -> float:
    """Check density of dark pixels within a checkbox region."""
    try:
        if unit == "inch":
            poly = [pt * 300.0 for pt in poly]

        h_img, w_img = page_img.shape[:2]
        scale_x = w_img / page_w
        scale_y = h_img / page_h

        xs = poly[0::2]
        ys = poly[1::2]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)

        x0 = int(x0 * scale_x)
        y0 = int(y0 * scale_y)
        x1 = int(x1 * scale_x)
        y1 = int(y1 * scale_y)

        crop = page_img[y0:y1, x0:x1]
        if crop.size == 0:
            return 0.0
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
        w, h = gray.shape[1], gray.shape[0]

        # Shave 30% to completely remove borders
        center = gray[int(h*0.30):int(h*0.70), int(w*0.30):int(w*0.70)]
        if center.size == 0:
            return 0.0

        paper_bg = np.percentile(center, 90)
        dark_pixels = center < (paper_bg - 18)
        return float(np.mean(dark_pixels))
    except Exception:
        return 0.0


def resolve_page_selection_marks(
    page_elements: list,
    is_page_2: bool,
    page_width: float = 2483.0,
    page_height: float = 3508.0,
    raw_response: dict = None,
    page_img: np.ndarray = None
) -> tuple[dict[str, Any], str, dict[str, float], dict[str, list[float]]]:
    """
    Resolve checkbox selections directly from Azure's table model,
    falling back to pixel density classification if Azure missed the selection state.

    Returns:
      responses: dict of q_key -> selected_col (int or list of ints)
      consent_val: str ("Yes", "No", "Unanswered")
      confidences: dict of q_key -> confidence (float)
      polygons: dict of q_key -> [x0, y0, x1, y1, x2, y2, x3, y3]
    """
    responses = {}
    confidences = {}
    q_polygons = {}
    consent_val = "Unanswered"

    if not raw_response:
        return {}, "Unanswered", {}, {}

    page_num = 2 if is_page_2 else 1

    # Get raw page data
    page_raw = raw_response.get(f"page_{page_num}", {})
    if not page_raw or "pages" not in page_raw:
        page_raw = raw_response

    # Resize page_img to match Azure's coordinate space (page_width, page_height)
    if page_img is not None and page_width > 0 and page_height > 0:
        h_img, w_img = page_img.shape[:2]
        target_w = int(page_width)
        target_h = int(page_height)
        if h_img != target_h or w_img != target_w:
            page_img = cv2.resize(page_img, (target_w, target_h), interpolation=cv2.INTER_CUBIC)

    # Get page unit (inch or pixel) from the first page in page_raw
    unit = "pixel"
    pages_list = page_raw.get("pages", [])
    if pages_list:
        unit = pages_list[0].get("unit", "pixel")

    tables = page_raw.get("tables", [])
    if not tables and pages_list:
        tables = pages_list[0].get("tables", [])

    # Process consent
    if page_num == 1:
        consent_marks = [
            m for m in page_elements
            if m.element_type == "selection_mark" and polygon_bounds(m.polygon)[1] < page_height * 0.38
        ]
        # 1. Check if Azure detected selected state
        for mark in consent_marks:
            if mark.text == "\u2713":
                rel_cx = polygon_bounds(mark.polygon)[0] / page_width
                consent_val = "Yes" if rel_cx < 0.83 else "No"
                break
        # 2. Text-based detection
        if consent_val == "Unanswered":
            consent_words = [
                el for el in page_elements
                if el.element_type == "word"                  and polygon_bounds(el.polygon)[1] < page_height * 0.30
                and polygon_bounds(el.polygon)[0] > page_width * 0.70
            ]
            for w in consent_words:
                text = w.text.strip().lower()
                if text in ("\u0939\u093e\u0902", "\u0939\u093e\u0901"):
                    consent_val = "Yes"
                    break
                if text == "\u0928\u0939\u0940\u0902":
                    consent_val = "No"
                    break
        # 3. Density-based fallback
        if consent_val == "Unanswered" and page_img is not None:
            img_h, img_w = page_img.shape[:2]
            sx = img_w / 4500.0
            sy = img_h / 6000.0
            yes_x0, yes_y0 = int(3400 * sx), int(1380 * sy)
            yes_x1, yes_y1 = int(3570 * sx), int(1560 * sy)
            no_x0, no_y0 = int(3700 * sx), int(1380 * sy)
            no_x1, no_y1 = int(3820 * sx), int(1560 * sy)

            gray = cv2.cvtColor(page_img, cv2.COLOR_BGR2GRAY) if len(page_img.shape) == 3 else page_img
            _, binary = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)

            yes_region = binary[yes_y0:yes_y1, yes_x0:yes_x1]
            no_region = binary[no_y0:no_y1, no_x0:no_x1]

            yes_density = float(np.mean(yes_region) / 255.0) if yes_region.size > 0 else 0
            no_density = float(np.mean(no_region) / 255.0) if no_region.size > 0 else 0

            diff = abs(yes_density - no_density)
            if diff >= 0.025:
                consent_val = "Yes" if yes_density > no_density else "No"

    if not tables:
        return {}, consent_val, {}, {}

    table = tables[1] if (page_num == 1 and len(tables) >= 2) else tables[0]

    # Map cells by row index
    rows_cells = {}
    for cell in table.get("cells", []):
        r = cell.get("rowIndex")
        c = cell.get("columnIndex")
        if c in (1, 2, 3):
            if r not in rows_cells:
                rows_cells[r] = {}
            rows_cells[r][c] = cell

    max_rows = 13 if is_page_2 else 13
    start_row = 0 if is_page_2 else 1

    # For DPI conversion
    std_w = 595.0
    std_h = 842.0
    scale_x = page_width / std_w
    scale_y = page_height / std_h
    from app.image.roi import ROIS_P1_POINTS, ROIS_P2_POINTS

    for row_idx in range(start_row, max_rows):
        q_num = row_idx + 13 if is_page_2 else row_idx
        q_key = f"q{q_num}"

        cells = rows_cells.get(row_idx, {})
        selected_col = 0
        conf = 0.0

        # Determine bbox / polygon for the row
        row_polys = []
        for col in (1, 2, 3):
            c_cell = cells.get(col)
            if c_cell:
                for reg in c_cell.get("boundingRegions", []):
                    reg_poly = reg.get("polygon", [])
                    if reg_poly:
                        row_polys.extend(reg_poly)

        if row_polys:
            if unit == "inch":
                row_polys = [pt * 300.0 for pt in row_polys]
            xs = row_polys[0::2]
            ys = row_polys[1::2]
            xmin, xmax = min(xs), max(xs)
            ymin, ymax = min(ys), max(ys)
            bbox = [xmin, ymin, xmax, ymax]
            poly = [xmin, ymin, xmax, ymin, xmax, ymax, xmin, ymax]
        else:
            # Fallback to static template
            rect = ROIS_P2_POINTS.get(q_key) if is_page_2 else ROIS_P1_POINTS.get(q_key)
            if rect:
                x0, y0, x1, y1 = rect
                bbox = [x0 * scale_x, y0 * scale_y, x1 * scale_x, y1 * scale_y]
                poly = [bbox[0], bbox[1], bbox[2], bbox[1], bbox[2], bbox[3], bbox[0], bbox[3]]
            else:
                bbox, poly = None, None

        q_polygons[q_key] = poly

        # 1. Native pass: check ':selected:'
        selected_cols = []
        for col in (1, 2, 3):
            cell = cells.get(col)
            if cell and ":selected:" in cell.get("content", ""):
                selected_cols.append(col)

        if len(selected_cols) == 1:
            selected_col = selected_cols[0]
            conf = 0.98
        else:
            # 2. Pixel density fallback (triggered if Azure found NO selection OR if it found MULTIPLE selections)
            selected_col = 0
            conf = 0.0
            ratios = {}
            if page_img is not None:
                for col in (1, 2, 3):
                    cell = cells.get(col)
                    if cell:
                        regions = cell.get("boundingRegions", [])
                        if regions:
                            c_poly = regions[0].get("polygon", [])
                            if c_poly and len(c_poly) >= 8:
                                ratio = check_checkbox_density(page_img, c_poly, page_width, page_height, unit)
                                ratios[col] = ratio
            if len(ratios) == 3:
                r1, r2, r3 = ratios[1], ratios[2], ratios[3]
                max_r = max(r1, r2, r3)
                min_r = min(r1, r2, r3)
                diff = max_r - min_r

                # Check for multiple filled checkboxes based on density
                sorted_ratios = sorted(ratios.items(), key=lambda x: x[1], reverse=True)
                if sorted_ratios[0][1] - sorted_ratios[1][1] < 0.02 and sorted_ratios[0][1] - sorted_ratios[2][1] >= 0.035:
                    selected_col = [sorted_ratios[0][0], sorted_ratios[1][0]]
                    conf = 0.90  # Confidently resolved multiple ticks based on pixel density!
                elif diff >= 0.035:
                    selected_col = sorted_ratios[0][0]
                    conf = 0.95 if diff >= 0.06 else 0.85  # Clear single tick
                else:
                    selected_col = 0
                    conf = 0.0
            else:
                # If local density calculation is not possible (e.g. missing page_img), preserve Azure's native multi-selection state if any
                if len(selected_cols) > 1:
                    selected_col = selected_cols
                    conf = 0.95

        # 3. Pure local static template fallback (if Azure native and cell density both failed to detect any tick)
        if selected_col == 0 and page_img is not None:
            try:
                from app.image.pdf import P1_Y_RANGES, P2_Y_RANGES, COLS_X_PTS
                if not is_page_2:
                    y0, y1 = P1_Y_RANGES[row_idx - 1] if row_idx > 0 else P1_Y_RANGES[0]
                else:
                    y0, y1 = P2_Y_RANGES[row_idx]

                h_img, w_img = page_img.shape[:2]
                scale_x = w_img / 595.0
                scale_y = h_img / 842.0

                local_ratios = {}
                for col in (1, 2, 3):
                    col_x_pt = COLS_X_PTS[col-1]
                    x0_pt = col_x_pt - 18.0
                    x1_pt = col_x_pt + 18.0
                    y0_pt = y0 / (300.0 / 72.0)
                    y1_pt = y1 / (300.0 / 72.0)

                    cx0 = int(x0_pt * scale_x)
                    cx1 = int(x1_pt * scale_x)
                    cy0 = int(y0_pt * scale_y)
                    cy1 = int(y1_pt * scale_y)

                    crop = page_img[cy0:cy1, cx0:cx1]
                    if crop.size > 0:
                        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
                        w, h = gray.shape[1], gray.shape[0]
                        center = gray[int(h*0.30):int(h*0.70), int(w*0.30):int(w*0.70)]
                        if center.size > 0:
                            paper_bg = np.percentile(center, 90)
                            dark_pixels = center < (paper_bg - 18)
                            local_ratios[col] = float(np.mean(dark_pixels))

                if len(local_ratios) == 3:
                    lr1, lr2, lr3 = local_ratios[1], local_ratios[2], local_ratios[3]
                    max_lr = max(lr1, lr2, lr3)
                    min_lr = min(lr1, lr2, lr3)
                    diff_lr = max_lr - min_lr

                    sorted_lr = sorted(local_ratios.items(), key=lambda x: x[1], reverse=True)
                    if sorted_lr[0][1] - sorted_lr[1][1] < 0.02 and sorted_lr[0][1] - sorted_lr[2][1] >= 0.035:
                        selected_col = [sorted_lr[0][0], sorted_lr[1][0]]
                        conf = 0.90
                    elif diff_lr >= 0.035:
                        selected_col = sorted_lr[0][0]
                        conf = 0.95 if diff_lr >= 0.06 else 0.85
            except Exception:
                pass

        responses[q_key] = selected_col
        confidences[q_key] = conf

    return responses, consent_val, confidences, q_polygons
