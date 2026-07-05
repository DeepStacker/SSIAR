import cv2
import fitz
import numpy as np
import os
from typing import Tuple, List, Dict, Any

from app.image.preprocessing import assess_image_quality, select_and_apply_preprocessing
from app.image.alignment import align_page_hierarchical
from app.image.checkbox import detect_checkboxes as checkbox_detector, CheckboxState

TEMPLATE_W = 2483
TEMPLATE_H = 3508
ZOOM = 300 / 72

# Page 1 Table Corners (in pixel space at 300 DPI)
PTS_TEMP_P1 = np.float32([
    [138, 280],
    [2388, 280],
    [138, 3325],
    [2388, 3325]
])

# Page 2 Table Corners (in pixel space at 300 DPI)
PTS_TEMP_P2 = np.float32([
    [117, 59],
    [2300, 59],
    [117, 3125],
    [2300, 3125]
])

COLS_X_PTS = [384.8, 449.3, 516.0]

P1_Y_RANGES = [
    (1400, 1660), (1660, 1810), (1810, 1960), (1960, 2110),
    (2110, 2260), (2260, 2410), (2410, 2560), (2560, 2710),
    (2710, 2860), (2860, 3010), (3010, 3160), (3160, 3310)
]

P2_Y_RANGES = [
    (58, 187), (187, 316), (316, 521), (521, 746), (746, 875),
    (875, 1008), (1008, 1137), (1137, 1337), (1337, 1471),
    (1471, 1600), (1600, 1825), (1825, 1946), (1946, 2075)
]

def split_pdf_to_images(pdf_path, output_dir):
    """Renders PDF pages to 300 DPI images on disk."""
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    img_paths = []
    
    for i in range(len(doc)):
        page = doc[i]
        mat = fitz.Matrix(ZOOM, ZOOM)
        pix = page.get_pixmap(matrix=mat)
        out_path = os.path.join(output_dir, f"page_{i+1}_300dpi.png")
        pix.save(out_path)
        img_paths.append(out_path)
        
    return img_paths

def render_pdf_to_arrays(pdf_bytes):
    """Renders PDF pages to 300 DPI numpy arrays."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    results = []
    for i in range(len(doc)):
        page = doc[i]
        mat = fitz.Matrix(ZOOM, ZOOM)
        pix = page.get_pixmap(matrix=mat)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        arr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        results.append(arr)
    doc.close()
    return results

def classify_document(img_path):
    """
    Classifies document. Kept for backward compatibility with upload endpoints.
    """
    img = cv2.imread(img_path)
    if img is None:
        return {"type": "scanned", "dpi": 300, "pages": 1, "is_color": False}
        
    h, w = img.shape[:2]
    est_dpi = int((w / 8.27 + h / 11.69) / 2)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Simple color check
    color_diff = 0
    if len(img.shape) == 3:
        b, g, r = cv2.split(img)
        color_diff = float(np.mean(cv2.absdiff(b, g)) + np.mean(cv2.absdiff(g, r)))
        
    # Check lighting uniformity
    grid_h, grid_w = h // 4, w // 4
    means = []
    for r_idx in range(4):
        for c_idx in range(4):
            block = gray[r_idx*grid_h:(r_idx+1)*grid_h, c_idx*grid_w:(c_idx+1)*grid_w]
            if block.size > 0:
                means.append(np.mean(block))
    lighting_std = np.std(means) if means else 0
    
    doc_type = "scanned"
    if lighting_std > 18:
        doc_type = "mobile_photo"
    elif est_dpi < 150:
        doc_type = "fax_like"
        
    return {
        "type": doc_type,
        "dpi": est_dpi,
        "pages": 1,
        "is_color": color_diff > 5
    }

def assess_quality(img_path):
    """Diagnoses scan quality parameters. Integrates with the new preprocessing module."""
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"Could not read image: {img_path}")
    return assess_image_quality(img)

def align_page(img_path, page_num):
    """Aligns page to template using the new global-local alignment engine."""
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"Could not load image: {img_path}")
        
    # Load template image
    from app.config import BASE_DIR as CFG_BASE_DIR
    templates_dir = os.path.join(str(CFG_BASE_DIR), "shared", "templates")
    template_path = os.path.join(templates_dir, f"template_p{page_num}.png")
    
    template = cv2.imread(template_path)
    if template is None:
        # Fallback if templates do not exist yet
        return cv2.resize(img, (TEMPLATE_W, TEMPLATE_H))
        
    aligned, _, _ = align_page_hierarchical(img, template)
    return aligned

def align_page_orb(img, page_num, templates_dir):
    """Legacy ORB alignment wrapper."""
    template_path = os.path.join(templates_dir, f"template_p{page_num}.png")
    template = cv2.imread(template_path)
    if template is None:
        return cv2.resize(img, (TEMPLATE_W, TEMPLATE_H))
        
    from app.image.alignment import align_images_fallback
    aligned, _ = align_images_fallback(img, template)
    return aligned if aligned is not None else cv2.resize(img, (TEMPLATE_W, TEMPLATE_H))

def process_checkboxes(aligned_img, page_num, save_dir=None):
    """
    Scans row checkbox options in the aligned image.
    Converts CheckboxResult into the expected three-tuple format.
    """
    raw_results = checkbox_detector(aligned_img, page_num, P1_Y_RANGES if page_num == 1 else P2_Y_RANGES, COLS_X_PTS, ZOOM)
    
    responses = {}
    confidences = {}
    multi_ticks = {}
    
    for q_num, (col, state, conf, all_states, is_multi) in raw_results.items():
        q_key = f"q{q_num}"
        responses[q_key] = col
        
        # Format confidence string for API compatibility
        if state == CheckboxState.EMPTY:
            conf_str = "unanswered"
        elif state in (CheckboxState.DOUBLE, CheckboxState.PARTIAL) or conf < 0.70:
            conf_str = "low_confidence"
        else:
            conf_str = "high_confidence"
            
        confidences[q_key] = conf_str
        multi_ticks[q_key] = col if is_multi else [col]
        
    return responses, confidences, multi_ticks

def detect_consent(aligned_img):
    """Detects if the user checked 'Yes' or 'No' for consent using dynamic ROI."""
    from app.image.roi import extract_dynamic_roi
    crop = extract_dynamic_roi(aligned_img, "consent", page_num=1)
    if crop is None or crop.size == 0:
        return "Unanswered"
        
    # Analyze crop using new Checkbox analysis engine
    from app.image.checkbox import _analyze_checkbox
    # Crop is split into left half (Yes) and right half (No)
    h, w = crop.shape[:2]
    left_half = crop[:, 0:w//2]
    right_half = crop[:, w//2:]
    
    state_l, conf_l, _ = _analyze_checkbox(left_half)
    state_r, conf_r, _ = _analyze_checkbox(right_half)
    
    if state_l != CheckboxState.EMPTY and state_r == CheckboxState.EMPTY:
        return "Yes"
    elif state_r != CheckboxState.EMPTY and state_l == CheckboxState.EMPTY:
        return "No"
    elif state_l != CheckboxState.EMPTY and state_r != CheckboxState.EMPTY:
        return "Yes" if conf_l > conf_r else "No"
        
    return "Unanswered"

# Keep helper functions for compatibility
def _compute_adaptive_threshold_params(gray):
    mean_val = float(np.mean(gray))
    std_val = float(np.std(gray))
    block_size = 15 if mean_val > 150 else 11
    C = 5 if mean_val > 150 else 2
    return block_size, C

def _get_otsu_threshold(crop_gray):
    if crop_gray.size == 0:
        return 155
    thresh_val, _ = cv2.threshold(crop_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return thresh_val

def _deskew_image(img):
    from app.image.preprocessing import detect_skew_angle, deskew_image
    angle = detect_skew_angle(img)
    return deskew_image(img, angle)

def _detect_orientation(img):
    h, w = img.shape[:2]
    if w > h:
        return 90
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=w//4, maxLineGap=20)
    if lines is not None and len(lines) > 5:
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            angles.append(angle)
        median_angle = float(np.median(angles))
        if abs(median_angle) > 45:
            return 90
    return 0

def _normalize_to_a4(img):
    h, w = img.shape[:2]
    target_ratio = TEMPLATE_W / TEMPLATE_H
    actual_ratio = w / h
    if abs(actual_ratio - target_ratio) < 0.05:
        return cv2.resize(img, (TEMPLATE_W, TEMPLATE_H))
    scale = min(TEMPLATE_W / w, TEMPLATE_H / h)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cv2.resize(img, (new_w, new_h))
    canvas = np.full((TEMPLATE_H, TEMPLATE_W, 3), 255, dtype=np.uint8) if len(img.shape) == 3 else np.full((TEMPLATE_H, TEMPLATE_W), 255, dtype=np.uint8)
    canvas[(TEMPLATE_H-new_h)//2:(TEMPLATE_H-new_h)//2+new_h, (TEMPLATE_W-new_w)//2:(TEMPLATE_W-new_w)//2+new_w] = resized
    return canvas

def repair_illumination(img):
    from app.image.preprocessing import remove_shadows
    return remove_shadows(img)

def repair_noise(img, classification_type):
    from app.image.preprocessing import apply_denoising
    return apply_denoising(img)

def _remove_bleedthrough(binary_img):
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    return cv2.morphologyEx(cv2.morphologyEx(binary_img, cv2.MORPH_OPEN, kernel), cv2.MORPH_CLOSE, kernel)

def detect_table_corners(img_path):
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"Could not load image: {img_path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    block_size, C = _compute_adaptive_threshold_params(gray)
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, block_size, C)
    thresh = _remove_bleedthrough(thresh)
    
    cols = thresh.shape[1]
    horizontal_size = cols // 40
    horizontal_structure = cv2.getStructuringElement(cv2.MORPH_RECT, (horizontal_size, 1))
    horizontal = cv2.dilate(cv2.erode(thresh, horizontal_structure), horizontal_structure)
    
    rows = thresh.shape[0]
    vertical_size = rows // 40
    vertical_structure = cv2.getStructuringElement(cv2.MORPH_RECT, (1, vertical_size))
    vertical = cv2.dilate(cv2.erode(thresh, vertical_structure), vertical_structure)
    
    intersections = cv2.bitwise_and(horizontal, vertical)
    pts = np.argwhere(intersections > 0)
    if len(pts) > 0:
        pts = pts[:, [1, 0]]
        x, y, w, h = cv2.boundingRect(pts)
        corners = np.float32([[x, y], [x + w, y], [x, y + h], [x + w, y + h]])
        return corners, (x, y, w, h)
    else:
        h_img, w_img = gray.shape
        margin_x, margin_y = int(w_img * 0.05), int(h_img * 0.05)
        corners = np.float32([
            [margin_x, margin_y],
            [w_img - margin_x, margin_y],
            [margin_x, h_img - margin_y],
            [w_img - margin_x, h_img - margin_y]
        ])
        return corners, (margin_x, margin_y, w_img - 2*margin_x, h_img - 2*margin_y)

