from app.pipeline import P1_Y_RANGES, P2_Y_RANGES, COLS_X_PTS, ZOOM
from app.ocr import ROIS_P1, ROIS_P2, ROIS_REMARKS


def extract_crop(aligned_img, crop_name):
    if crop_name in ROIS_P1 or crop_name in ROIS_P2:
        all_rois = {**ROIS_P1, **ROIS_P2}
        x0, y0, x1, y1 = all_rois[crop_name]
        px0, py0, px1, py1 = int(x0 * ZOOM), int(y0 * ZOOM), int(x1 * ZOOM), int(y1 * ZOOM)
        padding = 5 if crop_name in ROIS_P1 else 0
        crop = aligned_img[py0+padding:py1-padding, px0:px1]
        return crop

    if crop_name == "consent":
        px0, py0, px1, py1 = int(470 * ZOOM), int(190 * ZOOM), int(555 * ZOOM), int(240 * ZOOM)
        return aligned_img[py0:py1, px0:px1]

    if crop_name == "remarks":
        rect = ROIS_REMARKS['remarks']
        x0, y0, x1, y1 = rect
        px0, py0, px1, py1 = int(x0 * ZOOM), int(y0 * ZOOM), int(x1 * ZOOM), int(y1 * ZOOM)
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
        cx1 = int((COLS_X_PTS[0] + 2.5) * ZOOM)
        cx3 = int((COLS_X_PTS[-1] + 2.5) * ZOOM)
        row_x_start = int(230 * ZOOM)
        row_x_end = cx3 + 70
        crop = aligned_img[y0+10:y1-10, row_x_start:row_x_end]
        return crop

    if crop_name == "aligned_p1":
        return aligned_img

    if crop_name == "aligned_p2":
        return aligned_img

    return None


def get_crop_page(crop_name):
    if crop_name in ROIS_P1 or crop_name == "consent":
        return 1
    if crop_name in ROIS_P2 or crop_name == "remarks":
        return 2
    if crop_name.startswith("q"):
        try:
            q_num = int(crop_name[1:])
        except ValueError:
            return 1
        return 2 if q_num >= 13 else 1
    if crop_name == "aligned_p1":
        return 1
    if crop_name == "aligned_p2":
        return 2
    return 1
