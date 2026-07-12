import cv2
import numpy as np
from typing import Dict, Tuple, Optional

ZOOM = 300 / 72

ROIS_P1_POINTS = {
    'roll_number': (360.0, 72.0, 550.0, 103.0),
    'class': (360.0, 103.0, 550.0, 134.0),
    'dob': (360.0, 134.0, 550.0, 166.0),
    'gender': (360.0, 166.0, 550.0, 196.0)
}

ROIS_P2_POINTS = {
    'math_pct': (140.0, 658.0, 240.0, 688.0),
    'science_pct': (140.0, 688.0, 240.0, 718.0),
    'language_pct': (140.0, 718.0, 240.0, 748.0),
    'rank': (25.0, 745.0, 140.0, 795.0)
}

ROIS_REMARKS_POINTS = {
    'remarks': (48.0, 560.0, 552.0, 715.0)
}

def detect_table_lines(img: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Detects horizontal and vertical lines in the image using morphological filters.
    Returns: (horizontal_lines_mask, vertical_lines_mask)
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 3
    )
    
    # Detect horizontal lines
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    
    # Detect vertical lines
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)
    
    return horizontal, vertical

def get_refined_coordinates(
    rect: Tuple[float, float, float, float],
    h_mask: np.ndarray,
    v_mask: np.ndarray,
    zoom: float = ZOOM
) -> Tuple[int, int, int, int]:
    """
    Refines points-based template coordinates against actual horizontal/vertical
    table lines in the image.
    """
    x0, y0, x1, y1 = rect
    px0, py0, px1, py1 = int(x0 * zoom), int(y0 * zoom), int(x1 * zoom), int(y1 * zoom)
    
    h, w = h_mask.shape
    search_range = int(6 * zoom)
    
    # Refine horizontal edges (y0 and y1) using horizontal lines mask
    refined_y0 = py0
    refined_y1 = py1
    
    y0_search = h_mask[max(0, py0 - search_range):min(h, py0 + search_range), px0:px1]
    if y0_search.size > 0:
        y0_sums = y0_search.sum(axis=1)
        if y0_sums.max() > 0:
            refined_y0 = max(0, py0 - search_range) + int(np.argmax(y0_sums))
            
    y1_search = h_mask[max(0, py1 - search_range):min(h, py1 + search_range), px0:px1]
    if y1_search.size > 0:
        y1_sums = y1_search.sum(axis=1)
        if y1_sums.max() > 0:
            refined_y1 = max(0, py1 - search_range) + int(np.argmax(y1_sums))

    # Refine vertical edges (x0 and x1) using vertical lines mask
    refined_x0 = px0
    refined_x1 = px1
    
    x0_search = v_mask[py0:py1, max(0, px0 - search_range):min(w, px0 + search_range)]
    if x0_search.size > 0:
        x0_sums = x0_search.sum(axis=0)
        if x0_sums.max() > 0:
            refined_x0 = max(0, px0 - search_range) + int(np.argmax(x0_sums))
            
    x1_search = v_mask[py0:py1, max(0, px1 - search_range):min(w, px1 + search_range)]
    if x1_search.size > 0:
        x1_sums = x1_search.sum(axis=0)
        if x1_sums.max() > 0:
            refined_x1 = max(0, px1 - search_range) + int(np.argmax(x1_sums))

    # Return coordinates with ordering sanity checks
    return min(refined_x0, refined_x1), min(refined_y0, refined_y1), max(refined_x0, refined_x1), max(refined_y0, refined_y1)

def correct_crop_orientation(crop: np.ndarray) -> np.ndarray:
    """Deskews and normalizes a cropped text region for cleaner OCR."""
    if crop is None or crop.size == 0:
        return crop
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=30, minLineLength=15, maxLineGap=3)
    
    if lines is None or len(lines) == 0:
        return crop
        
    angles = []
    for line in lines:
        val = line.flatten()
        if len(val) != 4:
            continue
        x1, y1, x2, y2 = val
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(angle) < 15:
            angles.append(angle)
            
    if not angles:
        return crop
        
    median_angle = float(np.median(angles))
    if abs(median_angle) < 0.5:
        return crop
        
    h, w = crop.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    return cv2.warpAffine(crop, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

def get_padded_roi_crop(aligned_img: np.ndarray, refined_coords: Tuple[int, int, int, int], padding_pct: float = 0.20) -> np.ndarray:
    """
    Extracts the crop from the aligned image using refined coordinates and adds
    padding.
    """
    x0, y0, x1, y1 = refined_coords
    h_img, w_img = aligned_img.shape[:2]
    
    w = x1 - x0
    h = y1 - y0
    
    # 20% padding on each side
    pad_w = int(w * padding_pct)
    pad_h = int(h * padding_pct)
    
    px0 = max(0, x0 - pad_w)
    py0 = max(0, y0 - pad_h)
    px1 = min(w_img, x1 + pad_w)
    py1 = min(h_img, y1 + pad_h)
    
    crop = aligned_img[py0:py1, px0:px1]
    return correct_crop_orientation(crop)

def extract_dynamic_roi(
    aligned_img: np.ndarray,
    field_name: str,
    page_num: int,
    h_mask: Optional[np.ndarray] = None,
    v_mask: Optional[np.ndarray] = None
) -> Optional[np.ndarray]:
    """
    Extracts refined ROIs dynamically using line detection.
    Precomputed h_mask/v_mask can be passed to avoid redundant computation.
    """
    if h_mask is None or v_mask is None:
        h_mask, v_mask = detect_table_lines(aligned_img)
    
    # 1. Fetch template coordinates
    rect = None
    if page_num == 1:
        if field_name in ROIS_P1_POINTS:
            rect = ROIS_P1_POINTS[field_name]
        elif field_name == "consent":
            # Consent box coordinates in template points
            rect = (470.0, 190.0, 555.0, 240.0)
    else:
        if field_name in ROIS_P2_POINTS:
            rect = ROIS_P2_POINTS[field_name]
        elif field_name == "remarks":
            rect = ROIS_REMARKS_POINTS['remarks']

    # Question row routing: dynamic coordinates from row index
    h_img, w_img = aligned_img.shape[:2]
    dynamic_zoom = w_img / 595.0

    if field_name.startswith("q"):
        try:
            q_num = int(field_name[1:])
            from app.image.pdf import P1_Y_RANGES, P2_Y_RANGES, COLS_X_PTS
            if 1 <= q_num <= 12:
                idx = q_num - 1
                y0, y1 = P1_Y_RANGES[idx]
            elif 13 <= q_num <= 25:
                idx = q_num - 13
                y0, y1 = P2_Y_RANGES[idx]
            else:
                return None
            cx3_pt = COLS_X_PTS[-1] + 2.5
            px0_pt = 230.0
            px1_pt = cx3_pt + (70.0 / dynamic_zoom)
            base_zoom = 300.0 / 72.0
            y0_pt = y0 / base_zoom
            y1_pt = y1 / base_zoom
            rect = (px0_pt, y0_pt, px1_pt, y1_pt)
        except ValueError:
            return None

    if rect is None:
        return None
        
    # 2. Refine coordinates based on actual table borders in the image
    refined = get_refined_coordinates(rect, h_mask, v_mask, zoom=dynamic_zoom)
    
    # 3. Apply padding and orientation correction
    is_detail_field = (field_name in ROIS_P1_POINTS or field_name in ROIS_P2_POINTS)
    pad_pct = 0.12 if is_detail_field else 0.20
    return get_padded_roi_crop(aligned_img, refined, padding_pct=pad_pct)
