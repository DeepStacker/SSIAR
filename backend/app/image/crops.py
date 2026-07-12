from app.image.pdf import P1_Y_RANGES, P2_Y_RANGES, COLS_X_PTS, ZOOM
from app.image.roi import ROIS_P1_POINTS as ROIS_P1, ROIS_P2_POINTS as ROIS_P2, ROIS_REMARKS_POINTS as ROIS_REMARKS

def extract_crop(aligned_img, crop_name):
    # Try dynamic ROI extraction first
    from app.image.roi import extract_dynamic_roi
    page_num = get_crop_page(crop_name)
    dynamic_crop = extract_dynamic_roi(aligned_img, crop_name, page_num)
    if dynamic_crop is not None and dynamic_crop.size > 0:
        return dynamic_crop

    # Fallback to static coordinates if dynamic extraction fails
    h_img, w_img = aligned_img.shape[:2]
    scale_x = w_img / 595.0
    scale_y = h_img / 842.0

    if crop_name in ROIS_P1 or crop_name in ROIS_P2:
        all_rois = {**ROIS_P1, **ROIS_P2}
        x0, y0, x1, y1 = all_rois[crop_name]
        px0, py0, px1, py1 = int(x0 * scale_x), int(y0 * scale_y), int(x1 * scale_x), int(y1 * scale_y)
        padding = int(5 * scale_y) if crop_name in ROIS_P1 else 0
        crop = aligned_img[py0+padding:py1-padding, px0:px1]
        return crop

    if crop_name == "consent":
        px0, py0, px1, py1 = int(470 * scale_x), int(190 * scale_y), int(555 * scale_x), int(240 * scale_y)
        return aligned_img[py0:py1, px0:px1]

    if crop_name == "remarks":
        rect = ROIS_REMARKS['remarks']
        x0, y0, x1, y1 = rect
        px0, py0, px1, py1 = int(x0 * scale_x), int(y0 * scale_y), int(x1 * scale_x), int(y1 * scale_y)
        return aligned_img[py0:py1, px0:px1]

    if crop_name.startswith("q"):
        try:
            q_num = int(crop_name[1:])
        except ValueError:
            return None
        if 1 <= q_num <= 12:
            idx = q_num - 1
            y0, y1 = P1_Y_RANGES[idx]
        elif 13 <= q_num <= 25:
            idx = q_num - 13
            y0, y1 = P2_Y_RANGES[idx]
        else:
            return None
        
        base_zoom = 300.0 / 72.0
        y0_pt = y0 / base_zoom
        y1_pt = y1 / base_zoom
        y0_scaled = int(y0_pt * scale_y)
        y1_scaled = int(y1_pt * scale_y)
        
        cx3 = int((COLS_X_PTS[-1] + 2.5) * scale_x)
        row_x_start = int(230 * scale_x)
        row_x_end = cx3 + int(70 * scale_x)
        
        pad_y = int(10 * scale_y)
        crop = aligned_img[y0_scaled+pad_y:y1_scaled-pad_y, row_x_start:row_x_end]
        return crop

    if crop_name == "aligned_p1":
        return aligned_img

    if crop_name == "aligned_p2":
        return aligned_img

    return None


def get_crop_page(crop_name):
    if crop_name in ("roll_number", "class", "dob", "gender", "consent", "aligned_p1"):
        return 1
    if crop_name in ("math_pct", "science_pct", "language_pct", "rank", "remarks", "aligned_p2"):
        return 2
    if crop_name.startswith("q"):
        try:
            q_num = int(crop_name[1:])
            if 1 <= q_num <= 12:
                return 1
            elif 13 <= q_num <= 25:
                return 2
        except ValueError:
            pass
    return None


def get_field_coordinates(field_name: str, img_w: float, img_h: float) -> tuple[list[float], int]:
    """
    Get the default coordinates (polygon) and page number for a given field name,
    scaled to the actual image width and height (img_w x img_h pixels).
    """
    from app.image.roi import ROIS_P1_POINTS as ROIS_P1, ROIS_P2_POINTS as ROIS_P2, ROIS_REMARKS_POINTS as ROIS_REMARKS
    from app.image.pdf import P1_Y_RANGES, P2_Y_RANGES, COLS_X_PTS
    
    scale_x = img_w / 595.0
    scale_y = img_h / 842.0
    
    all_rois = {**ROIS_P1, **ROIS_P2}
    if field_name in all_rois:
        x0, y0, x1, y1 = all_rois[field_name]
        page = 1 if field_name in ROIS_P1 else 2
        polygon = [
            x0 * scale_x, y0 * scale_y,
            x1 * scale_x, y0 * scale_y,
            x1 * scale_x, y1 * scale_y,
            x0 * scale_x, y1 * scale_y
        ]
        return polygon, page
        
    if field_name == "consent":
        x0, y0, x1, y1 = 470.0, 190.0, 555.0, 240.0
        polygon = [
            x0 * scale_x, y0 * scale_y,
            x1 * scale_x, y0 * scale_y,
            x1 * scale_x, y1 * scale_y,
            x0 * scale_x, y1 * scale_y
        ]
        return polygon, 1
        
    if field_name == "remarks":
        x0, y0, x1, y1 = ROIS_REMARKS['remarks']
        polygon = [
            x0 * scale_x, y0 * scale_y,
            x1 * scale_x, y0 * scale_y,
            x1 * scale_x, y1 * scale_y,
            x0 * scale_x, y1 * scale_y
        ]
        return polygon, 2
        
    if field_name.startswith("q"):
        try:
            q_num = int(field_name[1:])
        except ValueError:
            return [], 1
        
        page = 2 if q_num >= 13 else 1
        if 1 <= q_num <= 12:
            idx = q_num - 1
            y0, y1 = P1_Y_RANGES[idx]
        elif 13 <= q_num <= 25:
            idx = q_num - 13
            y0, y1 = P2_Y_RANGES[idx]
        else:
            return [], page
            
        base_zoom = 300.0 / 72.0
        y0_pt = y0 / base_zoom
        y1_pt = y1 / base_zoom
        y0_scaled = y0_pt * scale_y
        y1_scaled = y1_pt * scale_y
        
        # Calculate checkbox row x range
        cx3 = (COLS_X_PTS[-1] + 2.5) * scale_x
        row_x_start = 230.0 * scale_x
        row_x_end = cx3 + 70.0 * scale_x
        
        polygon = [
            row_x_start, y0_scaled,
            row_x_end, y0_scaled,
            row_x_end, y1_scaled,
            row_x_start, y1_scaled
        ]
        return polygon, page
        
    return [], 1

