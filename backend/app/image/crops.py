import cv2
import json
import numpy as np
from typing import Optional
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


def resolve_crop_polygon(doc_id: str, crop_name: str) -> tuple[Optional[list[float]], int, bool]:
    """Resolve polygon + page number for *crop_name* in *doc_id*.

    Resolution priority:
    1. Azure table model (dynamic)
    2. Stored v2_trust database coordinates
    3. Static template fallback

    Returns ``(polygon, res_page, is_fallback)``.
    """
    from app.image.coordinate_resolver import get_sdq_row_polygon_from_table, get_field_polygon_from_table, get_rank_polygon, get_static_fallback_polygon
    from app.image.page_utils import get_page, get_azure_scale

    polygon = None
    res_page = None
    is_fallback = False

    conn = get_db_connection()
    raw_responses_str = None
    try:
        cur = conn.cursor()
        from app.database import USE_POSTGRES
        cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = %s" if USE_POSTGRES else "SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
        row = cur.fetchone()
        if row:
            raw_responses_str = row[0]
    finally:
        put_conn(conn)

    if raw_responses_str:
        try:
            raw_dict = json.loads(raw_responses_str)
            if crop_name.startswith("q"):
                try:
                    q_num = int(crop_name[1:])
                    tbl_res = get_sdq_row_polygon_from_table(raw_dict, q_num)
                    if tbl_res:
                        polygon, res_page = tbl_res
                except Exception:
                    pass
            else:
                from app.processing.field_resolver import resolve_field
                from app.core.types import NormalizedAzureResponse
                from app.processing.templates import get_template

                normalized = NormalizedAzureResponse(raw_dict)
                template = get_template("sdq_student_form_v1")

                field_def = None
                for fd in template.fields:
                    if fd.name == crop_name:
                        field_def = fd
                        break

                if field_def:
                    _, _, found, _, poly, page_num = resolve_field(field_def, normalized)
                    if found and poly:
                        polygon = poly
                        res_page = page_num
        except Exception:
            pass

    if not polygon:
        doc = get_document(doc_id)
        if doc:
            confidence_scores = doc.get("confidence_scores", {})
            v2_trust = confidence_scores.get("v2_trust", {}) if isinstance(confidence_scores, dict) else {}
            field_info = v2_trust.get(crop_name, {}) if isinstance(v2_trust, dict) else {}
            polygon = field_info.get("polygon")
            res_page = field_info.get("page")

    if not polygon or len(polygon) < 8:
        res_page = res_page or get_crop_page(crop_name) or 1
        aligned_img = get_page(doc_id, res_page)
        if aligned_img is not None:
            h_img, w_img = aligned_img.shape[:2]
            polygon, res_page = get_field_coordinates(crop_name, w_img, h_img)
            is_fallback = True

    return polygon, res_page or 1, is_fallback


def perspective_crop(
    img: np.ndarray,
    polygon: list[float],
    scale_x: float,
    scale_y: float,
    field_name: str,
) -> Optional[np.ndarray]:
    """Apply perspective transform to extract a crop from *img* using *polygon*.

    The padding/shave strategy varies by *field_name* (checkbox rows get
    tighter padding, metadata / scores get looser padding).
    """
    if not polygon or len(polygon) < 8:
        return None

    pts = []
    for i in range(0, 8, 2):
        px = polygon[i] * scale_x
        py = polygon[i + 1] * scale_y
        pts.append([px, py])
    pts = np.array(pts, dtype=np.float32)

    w1 = np.linalg.norm(pts[1] - pts[0])
    w2 = np.linalg.norm(pts[2] - pts[3])
    h1 = np.linalg.norm(pts[3] - pts[0])
    h2 = np.linalg.norm(pts[2] - pts[1])
    out_w = int(max(w1, w2))
    out_h = int(max(h1, h2))

    if out_w <= 5 or out_h <= 5:
        return None

    dir_x = (pts[1] - pts[0]) / out_w
    dir_y = (pts[3] - pts[0]) / out_h

    if field_name in {"math_pct", "science_pct", "language_pct"}:
        shave_l = -int(out_w * 0.15) - 10
        shave_r = -int(out_w * 0.15) - 10
        shave_t = -int(out_h * 0.15) - 5
        shave_b = -int(out_h * 0.15) - 5
    elif field_name in {"roll_number", "class", "dob", "gender"}:
        shave_l = -int(out_w * 0.15) - 15
        shave_r = -int(out_w * 0.15) - 15
        shave_t = -int(out_h * 0.15) - 8
        shave_b = -int(out_h * 0.15) - 8
    elif field_name.startswith("q"):
        shave_l = -int(out_w * 0.10) - 10
        shave_r = -int(out_w * 0.10) - 10
        shave_t = -int(out_h * 0.10) - 5
        shave_b = -int(out_h * 0.10) - 5
    else:
        shave_l = -int(out_w * 0.15) - 15
        shave_r = -int(out_w * 0.15) - 15
        shave_t = -int(out_h * 0.15) - 10
        shave_b = -int(out_h * 0.15) - 10

    padded_pts = pts.copy()
    padded_pts[0] = pts[0] + dir_x * shave_l + dir_y * shave_t
    padded_pts[1] = pts[1] - dir_x * shave_r + dir_y * shave_t
    padded_pts[2] = pts[2] - dir_x * shave_r - dir_y * shave_b
    padded_pts[3] = pts[3] + dir_x * shave_l - dir_y * shave_b

    h_img, w_img = img.shape[:2]
    padded_pts[:, 0] = np.clip(padded_pts[:, 0], 0, w_img - 1)
    padded_pts[:, 1] = np.clip(padded_pts[:, 1], 0, h_img - 1)

    out_w_padded = max(2, out_w - shave_l - shave_r)
    out_h_padded = max(2, out_h - shave_t - shave_b)

    dst = np.array([
        [0, 0],
        [out_w_padded - 1, 0],
        [out_w_padded - 1, out_h_padded - 1],
        [0, out_h_padded - 1]
    ], dtype=np.float32)

    M = cv2.getPerspectiveTransform(padded_pts, dst)
    return cv2.warpPerspective(
        img, M, (out_w_padded, out_h_padded),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def generate_crop_jpeg(doc_id: str, crop_name: str) -> Optional[bytes]:
    """Generate a JPEG crop for *crop_name* in *doc_id* using the full
    coordinate resolution pipeline.

    Returns ``None`` if the crop cannot be generated.
    """
    from app.image.page_utils import get_page, get_azure_scale
    from app.database import get_document

    polygon, res_page, is_fallback = resolve_crop_polygon(doc_id, crop_name)
    if not polygon:
        return None

    aligned_img = get_page(doc_id, res_page)
    if aligned_img is None:
        return None

    h_img, w_img = aligned_img.shape[:2]

    if not is_fallback:
        scale_x, scale_y = get_azure_scale(doc_id, res_page, w_img, h_img)
    else:
        scale_x, scale_y = 1.0, 1.0

    crop = perspective_crop(aligned_img, polygon, scale_x, scale_y, crop_name)

    if crop is None or crop.size == 0:
        return None

    _, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return buf.tobytes()


def get_db_connection():
    from app.database import get_db_connection as _get
    return _get()


def put_conn(conn):
    from app.database import put_conn as _put
    _put(conn)


def get_document(doc_id):
    from app.database import get_document as _get
    return _get(doc_id)


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

