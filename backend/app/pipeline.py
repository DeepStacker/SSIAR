import cv2
import fitz
import numpy as np
import os
from pathlib import Path

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

# Column center coordinates in A4 points
COLS_X_PTS = [384.8, 449.3, 516.0]

# Page 1 row cell vertical spans (y-coordinates in pixel space)
P1_Y_RANGES = [
    (1400, 1660), (1660, 1810), (1810, 1960), (1960, 2110),
    (2110, 2260), (2260, 2410), (2410, 2560), (2560, 2710),
    (2710, 2860), (2860, 3010), (3010, 3160), (3160, 3310)
]

# Page 2 row cell vertical spans (y-coordinates in pixel space)
P2_Y_RANGES = [
    (58, 187),     # Row 13
    (187, 316),    # Row 14
    (316, 521),    # Row 15
    (521, 746),    # Row 16
    (746, 875),    # Row 17
    (875, 1008),   # Row 18
    (1008, 1137),  # Row 19
    (1137, 1337),  # Row 20
    (1337, 1471),  # Row 21
    (1471, 1600),  # Row 22
    (1600, 1825),  # Row 23
    (1825, 1946),  # Row 24
    (1946, 2075)   # Row 25
]

def split_pdf_to_images(pdf_path, output_dir):
    """
    Renders PDF pages to 300 DPI images.
    Returns a list of image file paths.
    """
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

# ==========================================
# Step 1: Image Classification
# ==========================================
def classify_document(img_path):
    """
    Classifies the document based on aspect ratio, lighting variance, binarization signature.
    Returns: {"type": "mobile_photo"|"scanned"|"photocopy"|"fax_like", "dpi": int, "pages": int}
    """
    img = cv2.imread(img_path)
    if img is None:
        return {"type": "scanned", "dpi": 300, "pages": 1}
    
    h, w = img.shape[:2]
    pages = 1
    
    # Estimate DPI based on A4 dimensions (8.27 in x 11.69 in)
    est_dpi = int((w / 8.27 + h / 11.69) / 2)
    
    # Detect grayscale vs color
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    color_diff = 0
    if len(img.shape) == 3:
        b, g, r = cv2.split(img)
        color_diff = float(np.mean(cv2.absdiff(b, g)) + np.mean(cv2.absdiff(g, r)))
    
    # Check lighting uniformity
    grid_h, grid_w = h // 4, w // 4
    quadrant_means = []
    for r_idx in range(4):
        for c_idx in range(4):
            block = gray[r_idx*grid_h:(r_idx+1)*grid_h, c_idx*grid_w:(c_idx+1)*grid_w]
            if block.size > 0:
                quadrant_means.append(np.mean(block))
    lighting_std = np.std(quadrant_means) if quadrant_means else 0
    
    aspect = w / h
    is_standard_a4_ratio = 0.65 < aspect < 0.76
    
    # Detect photocopy / fax signature
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    peaks_at_extremes = float((hist[0][0] + hist[255][0]) / np.sum(hist))
    
    doc_type = "scanned"
    if lighting_std > 18 or not is_standard_a4_ratio:
        doc_type = "mobile_photo"
    elif peaks_at_extremes > 0.85:
        doc_type = "photocopy"
    elif est_dpi < 150:
        doc_type = "fax_like"
        
    return {
        "type": doc_type,
        "dpi": est_dpi,
        "pages": pages,
        "is_color": color_diff > 5
    }

# ==========================================
# Step 2: Quality Assessment Suite
# ==========================================
def assess_quality(img_path):
    """
    Diagnoses scan quality parameters.
    Returns a comprehensive quality report dict.
    """
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"Could not read image: {img_path}")
        
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    h, w = gray.shape[:2]
    
    # 1. Blur detection (Laplacian variance)
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    
    # 2. Skew detection
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=150, maxLineGap=10)
    skew_angle = 0.0
    if lines is not None and len(lines) > 0:
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            if abs(angle) < 15:
                angles.append(angle)
        if angles:
            skew_angle = float(np.median(angles))
            
    # 3. Contrast detection
    contrast_score = float(np.std(gray))
    
    # 4. Shadow detection
    grid_h, grid_w = h // 4, w // 4
    quadrant_means = []
    for r_idx in range(4):
        for c_idx in range(4):
            block = gray[r_idx*grid_h:(r_idx+1)*grid_h, c_idx*grid_w:(c_idx+1)*grid_w]
            if block.size > 0:
                quadrant_means.append(np.mean(block))
    shadow_detected = np.std(quadrant_means) > 22 if quadrant_means else False
    
    # 5. Fold detection
    fold_detected = False
    if lines is not None:
        mid_region_lines = [l for l in lines if h*0.3 < l[0][1] < h*0.6]
        if len(mid_region_lines) > 25:
            fold_detected = True
            
    # 6. Noise detection
    noise_sigma = float(np.std(gray - cv2.GaussianBlur(gray, (3, 3), 0)))
    
    # 7. Page crop & missing corner detection
    corners, bbox = detect_table_corners(img_path)
    corners_missing = bbox[2] < w * 0.7 or bbox[3] < h * 0.7
    
    # Overall score mapping (0 to 100 scale)
    q_blur = min(100, max(0, int(blur_score * 0.8)))
    q_contrast = min(100, max(0, int(contrast_score * 2.0)))
    q_skew = max(0, 100 - int(abs(skew_angle) * 8))
    
    overall_quality = int(q_blur * 0.4 + q_contrast * 0.3 + q_skew * 0.3)
    if shadow_detected:
        overall_quality -= 15
    if fold_detected:
        overall_quality -= 10
    if corners_missing:
        overall_quality -= 30
        
    overall_quality = max(0, min(100, overall_quality))
    
    return {
        "blur": float(blur_score),
        "rotation": float(skew_angle),
        "contrast": float(contrast_score),
        "shadow": bool(shadow_detected),
        "fold": bool(fold_detected),
        "crop": bool(corners_missing),
        "noise": float(noise_sigma),
        "quality": int(overall_quality)
    }

# ==========================================
# Step 3: Auto Repair Suite
# ==========================================
def _compute_adaptive_threshold_params(gray):
    """Dynamically compute adaptive threshold parameters based on statistics."""
    mean_val = float(np.mean(gray))
    std_val = float(np.std(gray))
    
    if mean_val > 200:
        block_size = 21
        C = 8
    elif mean_val > 150:
        block_size = 15
        C = 5
    elif mean_val > 100:
        block_size = 15
        C = 3
    else:
        block_size = 11
        C = 2
    
    if std_val < 30:
        block_size = max(11, block_size - 4)
        C = max(2, C - 1)
    
    return block_size, C

def _remove_bleedthrough(binary_img):
    """Remove bleed-through artifacts using morphological operations."""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    cleaned = cv2.morphologyEx(binary_img, cv2.MORPH_OPEN, kernel)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel)
    return cleaned

def sauvola_threshold(img, window_size=25, k=0.2, R=128):
    """
    Fast implementation of Sauvola local adaptive binarization for handwriting.
    Formula: T = mean * (1 + k * (std / R - 1))
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    gray_f = gray.astype(np.float32)
    
    mean = cv2.boxFilter(gray_f, -1, (window_size, window_size))
    sq_mean = cv2.boxFilter(gray_f * gray_f, -1, (window_size, window_size))
    
    var = sq_mean - mean * mean
    var = np.clip(var, 0, None)
    std = np.sqrt(var)
    
    thresh = mean * (1.0 + k * (std / R - 1.0))
    
    binary = np.zeros_like(gray, dtype=np.uint8)
    binary[gray_f > thresh] = 255
    return binary

def repair_illumination(img):
    """Shadow removal via background estimation division."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (51, 51))
    bg = cv2.dilate(gray, kernel)
    bg = cv2.medianBlur(bg, 51)
    repaired = cv2.divide(gray, bg, scale=255)
    return cv2.cvtColor(repaired, cv2.COLOR_GRAY2BGR) if len(img.shape) == 3 else repaired

def repair_noise(img, classification_type):
    """Remove noise depending on classifier profile."""
    if classification_type == "mobile_photo":
        return cv2.bilateralFilter(img, 9, 75, 75)
    elif classification_type in ("photocopy", "fax_like"):
        return cv2.medianBlur(img, 3)
    return img

def detect_table_corners(img_path):
    """
    Detects table intersection points using OpenCV morphological operations.
    Returns the bounding box (x, y, w, h) and corner coordinates.
    """
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
    horizontal = cv2.erode(thresh, horizontal_structure)
    horizontal = cv2.dilate(horizontal, horizontal_structure)
    
    rows = thresh.shape[0]
    vertical_size = rows // 40
    vertical_structure = cv2.getStructuringElement(cv2.MORPH_RECT, (1, vertical_size))
    vertical = cv2.erode(thresh, vertical_structure)
    vertical = cv2.dilate(vertical, vertical_structure)
    
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

def _deskew_image(img):
    """Correct image skew using Hough lines."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=200, maxLineGap=10)
    
    if lines is None or len(lines) < 5:
        return img
    
    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        dx = x2 - x1
        dy = y2 - y1
        angle = np.degrees(np.arctan2(dy, dx))
        if abs(angle) < 15:
            angles.append(angle)
            
    if len(angles) < 3:
        return img
        
    median_angle = float(np.median(angles))
    if abs(median_angle) < 0.3 or abs(median_angle) > 10:
        return img
        
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

def _detect_orientation(img):
    """Detect rotation orientation of the page."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    scale = 0.25
    small = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    edges = cv2.Canny(small, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=50, minLineLength=50, maxLineGap=10)
    
    if lines is None or len(lines) < 5:
        h, w = img.shape[:2]
        return 90 if w > h else 0
        
    horizontal_count = 0
    vertical_count = 0
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
        if angle < 15 or angle > 165:
            horizontal_count += 1
        elif 75 < angle < 105:
            vertical_count += 1
            
    h, w = img.shape[:2]
    if w > h:
        return 90
        
    top_region = gray[0:h//4, :]
    bottom_region = gray[3*h//4:, :]
    top_content = np.sum(top_region < 128)
    bottom_content = np.sum(bottom_region < 128)
    
    if bottom_content > top_content * 3 and vertical_count > horizontal_count * 2:
        return 180
    return 0

def _normalize_to_a4(img):
    """Resizes and pads non-standard canvas dimensions to template standard aspect ratio."""
    h, w = img.shape[:2]
    target_ratio = TEMPLATE_W / TEMPLATE_H
    actual_ratio = w / h
    
    if abs(actual_ratio - target_ratio) / target_ratio < 0.05:
        if (w, h) != (TEMPLATE_W, TEMPLATE_H):
            img = cv2.resize(img, (TEMPLATE_W, TEMPLATE_H), interpolation=cv2.INTER_CUBIC)
        return img
        
    scale = min(TEMPLATE_W / w, TEMPLATE_H / h)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
    
    canvas = np.full((TEMPLATE_H, TEMPLATE_W, 3), 255, dtype=np.uint8) if len(img.shape) == 3 else np.full((TEMPLATE_H, TEMPLATE_W), 255, dtype=np.uint8)
    x_offset = (TEMPLATE_W - new_w) // 2
    y_offset = (TEMPLATE_H - new_h) // 2
    canvas[y_offset:y_offset + new_h, x_offset:x_offset + new_w] = resized
    return canvas

# ==========================================
# Step 4: ORB Template Alignment
# ==========================================
def align_page_orb(img, page_num, templates_dir):
    """
    Aligns the scanned page against the template using ORB feature descriptor matching and RANSAC.
    """
    template_path = os.path.join(templates_dir, f"template_p{page_num}.png")
    if not os.path.exists(template_path):
        return None
        
    template = cv2.imread(template_path)
    if template is None:
        return None
        
    gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    gray_temp = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
    
    orb = cv2.ORB_create(nfeatures=2500)
    kp_img, des_img = orb.detectAndCompute(gray_img, None)
    kp_temp, des_temp = orb.detectAndCompute(gray_temp, None)
    
    if des_img is None or des_temp is None:
        return None
        
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = bf.match(des_img, des_temp)
    matches = sorted(matches, key=lambda x: x.distance)
    good_matches = matches[:80]
    
    if len(good_matches) < 15:
        return None
        
    src_pts = np.float32([kp_img[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp_temp[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    
    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    if H is None:
        return None
        
    aligned = cv2.warpPerspective(img, H, (TEMPLATE_W, TEMPLATE_H))
    return aligned

def align_page(img_path, page_num):
    """
    Wrapper for backward compatibility and fallback alignment logic.
    Attempts ORB matching first, falls back to morphology corner perspective warp.
    """
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"Could not load image: {img_path}")
        
    # Rotate first
    rotation = _detect_orientation(img)
    if rotation == 90:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    elif rotation == 180:
        img = cv2.rotate(img, cv2.ROTATE_180)
    elif rotation == 270:
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    if rotation != 0:
        cv2.imwrite(img_path, img)
        
    # Deskew skew before warping
    img = _deskew_image(img)
    
    # Try ORB alignment
    base_dir = Path(__file__).resolve().parent.parent.parent
    templates_dir = os.path.join(base_dir, "shared", "templates")
    aligned = align_page_orb(img, page_num, templates_dir)
    
    if aligned is not None:
        return aligned
        
    # Fallback: morph-based perspective align
    scan_corners, _ = detect_table_corners(img_path)
    temp_corners = PTS_TEMP_P1 if page_num == 1 else PTS_TEMP_P2
    H = cv2.getPerspectiveTransform(scan_corners, temp_corners)
    aligned_img = cv2.warpPerspective(img, H, (TEMPLATE_W, TEMPLATE_H))
    return aligned_img

def process_checkboxes(aligned_img, page_num, save_dir=None):
    """
    Scans row checkbox options in the aligned image.
    Returns (responses, confidences, multi_ticks):
      - responses: dict {q1: best_col, q2: best_col, ...} with best single answer
      - confidences: dict {q1: "high_confidence"|"low_confidence"|"unanswered", ...}
      - multi_ticks: dict {q1: [2], q2: [1, 3], ...} — ALL ticked columns (important
        when a respondent marks >1 option, revealing survey behavior)
    If save_dir is provided, saves the full row (question label + 3 columns) as q{n}.png.
    """
    gray = cv2.cvtColor(aligned_img, cv2.COLOR_BGR2GRAY)
    y_ranges = P1_Y_RANGES if page_num == 1 else P2_Y_RANGES
    start_q_idx = 1 if page_num == 1 else 13
    
    # Full-row x range: question label on left + all 3 checkbox columns
    cx1 = int((COLS_X_PTS[0] + 2.5) * ZOOM)
    cx3 = int((COLS_X_PTS[-1] + 2.5) * ZOOM)
    row_x_start = int(230 * ZOOM)          # includes question number label on form
    row_x_end = cx3 + 70
    
    responses = {}
    confidences = {}
    multi_ticks = {}
    
    for idx, (y0, y1) in enumerate(y_ranges):
        q_num = start_q_idx + idx
        row_darks = []
        
        for col_idx, x_temp in enumerate(COLS_X_PTS):
            cx = int((x_temp + 2.5) * ZOOM)
            crop = gray[y0+10:y1-10, cx-40:cx+40]
            
            if crop.size == 0:
                row_darks.append(0)
                continue
                
            otsu_thresh = _get_otsu_threshold(crop)
            effective_thresh = min(otsu_thresh, 180)
            
            _, binary = cv2.threshold(crop, effective_thresh, 255, cv2.THRESH_BINARY_INV)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
            binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            
            dark_pixels = int(np.sum(binary > 0))
            row_darks.append(dark_pixels)
            
        best_col = int(np.argmax(row_darks) + 1)
        max_darks = row_darks[best_col - 1]
        
        sorted_darks = sorted(row_darks)
        d1, d2, d3 = sorted_darks[2], sorted_darks[1], sorted_darks[0]
        margin = d1 - d2
        
        # Distinguish noise (all 3 columns similarly high) from genuine multi-tick
        # (2 high, 1 low). Noise = all 3 are close → treat as single tick only.
        best_ratio = d1 / max(d2, 1)
        second_ratio = d2 / max(d3, 1)
        is_noise_all_high = (d2 >= 120 and best_ratio < 1.4 and second_ratio < 1.4)
        
        if max_darks < 120:
            responses[f"q{q_num}"] = 0
            confidences[f"q{q_num}"] = "unanswered"
            multi_ticks[f"q{q_num}"] = [0]
        elif margin < 150:
            responses[f"q{q_num}"] = best_col
            confidences[f"q{q_num}"] = "low_confidence"
        else:
            responses[f"q{q_num}"] = best_col
            confidences[f"q{q_num}"] = "high_confidence"
            
        # Multi-tick detection (conservative to avoid false positives):
        # Only flag when 2 columns are high & close, AND 3rd is much lower
        if max_darks >= 120 and not is_noise_all_high:
            ticked_cols = [best_col]
            for col_idx, darks in enumerate(row_darks):
                ci = col_idx + 1
                if ci != best_col and darks >= 120 and d1 / max(darks, 1) < 1.4:
                    ticked_cols.append(ci)
            if len(ticked_cols) > 1:
                multi_ticks[f"q{q_num}"] = ticked_cols
                confidences[f"q{q_num}"] = "low_confidence"
            else:
                multi_ticks[f"q{q_num}"] = [best_col]
        else:
            multi_ticks[f"q{q_num}"] = [best_col] if max_darks >= 120 else [0]
            
        # Save full row showing question label + all 3 options
        if save_dir:
            row_crop = aligned_img[y0+10:y1-10, row_x_start:row_x_end]
            if row_crop.size > 0:
                cv2.imwrite(os.path.join(save_dir, f"q{q_num}.png"), row_crop)
            
    return responses, confidences, multi_ticks

def _get_otsu_threshold(crop_gray):
    if crop_gray.size == 0:
        return 155
    thresh_val, _ = cv2.threshold(crop_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return thresh_val

def detect_consent(aligned_img):
    """
    Detects if the user checked 'Yes' or 'No' for consent.
    """
    gray = cv2.cvtColor(aligned_img, cv2.COLOR_BGR2GRAY)
    
    py0, py1 = int(200 * ZOOM), int(235 * ZOOM)
    px0_left, px1_left = int(475 * ZOOM), int(495 * ZOOM)
    px0_right, px1_right = int(530 * ZOOM), int(550 * ZOOM)
    
    consent_region = gray[py0:py1, px0_left:px1_right]
    if consent_region.size > 0:
        thresh_val = _get_otsu_threshold(consent_region)
        effective_thresh = min(thresh_val, 180)
    else:
        effective_thresh = 155
        
    left_ink = int(np.sum(gray[py0:py1, px0_left:px1_left] < effective_thresh))
    right_ink = int(np.sum(gray[py0:py1, px0_right:px1_right] < effective_thresh))
    
    if left_ink > 100 and left_ink > right_ink:
        return "Yes"
    elif right_ink > 100 and right_ink > left_ink:
        return "No"
    else:
        return "Unanswered"
