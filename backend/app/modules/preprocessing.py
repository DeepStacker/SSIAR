import cv2
import numpy as np
from typing import Tuple, Dict, Any

def correct_lens_distortion(img: np.ndarray, k1: float = -1e-6, k2: float = 0.0) -> np.ndarray:
    """
    Corrects radial lens distortion (barrel/pincushion) using a division/polynomial model.
    k1: radial distortion parameter (negative for barrel, positive for pincushion).
    """
    h, w = img.shape[:2]
    distCoeffs = np.zeros((5, 1), dtype=np.float32)
    # Convert parameters to standard OpenCV camera calibration format if non-zero
    # For a simple radial correction, we can set k1, k2:
    distCoeffs[0, 0] = k1
    distCoeffs[1, 0] = k2
    
    # Intrinsic camera matrix approximation
    f = max(h, w)
    cx, cy = w / 2.0, h / 2.0
    cameraMatrix = np.array([
        [f, 0, cx],
        [0, f, cy],
        [0, 0, 1]
    ], dtype=np.float32)
    
    newCameraMatrix, _ = cv2.getOptimalNewCameraMatrix(cameraMatrix, distCoeffs, (w, h), 0, (w, h))
    undistorted = cv2.undistort(img, cameraMatrix, distCoeffs, None, newCameraMatrix)
    return undistorted

def correct_white_balance(img: np.ndarray) -> np.ndarray:
    """Normalizes color balance using the gray-world assumption."""
    if len(img.shape) != 3:
        return img.copy()
    b, g, r = cv2.split(img)
    avg_b = np.mean(b)
    avg_g = np.mean(g)
    avg_r = np.mean(r)
    avg_all = (avg_b + avg_g + avg_r) / 3.0
    
    if avg_b == 0 or avg_g == 0 or avg_r == 0:
        return img.copy()
        
    b = np.clip(b * (avg_all / avg_b), 0, 255).astype(np.uint8)
    g = np.clip(g * (avg_all / avg_g), 0, 255).astype(np.uint8)
    r = np.clip(r * (avg_all / avg_r), 0, 255).astype(np.uint8)
    return cv2.merge([b, g, r])

def remove_shadows(img: np.ndarray) -> np.ndarray:
    """Removes uneven illumination and shadows using morphological background estimation."""
    is_color = len(img.shape) == 3
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if is_color else img.copy()
    
    # Morphological background estimation: dilate with a large structural element, then median blur
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (41, 41))
    dilated = cv2.dilate(gray, kernel)
    bg = cv2.medianBlur(dilated, 41)
    
    # Division to neutralize illumination gradient
    diff = cv2.divide(gray, bg, scale=255)
    
    if is_color:
        # Reconstruct color image by applying illumination correction to each channel
        channels = cv2.split(img)
        corrected_channels = []
        for ch in channels:
            ch_dilated = cv2.dilate(ch, kernel)
            ch_bg = cv2.medianBlur(ch_dilated, 41)
            corrected_channels.append(cv2.divide(ch, ch_bg, scale=255))
        return cv2.merge(corrected_channels)
    return diff

def normalize_local_contrast(img: np.ndarray) -> np.ndarray:
    """Normalizes local contrast by dividing by local standard deviation."""
    is_color = len(img.shape) == 3
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if is_color else img.copy()
    
    gray_f = gray.astype(np.float32)
    mean = cv2.GaussianBlur(gray_f, (25, 25), 0)
    sq_mean = cv2.GaussianBlur(gray_f ** 2, (25, 25), 0)
    var = sq_mean - mean ** 2
    var = np.clip(var, 0, None)
    std = np.sqrt(var)
    
    # Avoid division by zero
    std = np.clip(std, 1.0, None)
    normalized = (gray_f - mean) / std
    normalized = cv2.normalize(normalized, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    
    if is_color:
        # Apply local contrast normalization to luminance in YCrCb
        ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
        y, cr, cb = cv2.split(ycrcb)
        y_f = y.astype(np.float32)
        y_mean = cv2.GaussianBlur(y_f, (25, 25), 0)
        y_sq_mean = cv2.GaussianBlur(y_f ** 2, (25, 25), 0)
        y_var = np.clip(y_sq_mean - y_mean ** 2, 0, None)
        y_std = np.clip(np.sqrt(y_var), 1.0, None)
        y_norm = (y_f - y_mean) / y_std
        y_norm = cv2.normalize(y_norm, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        return cv2.cvtColor(cv2.merge([y_norm, cr, cb]), cv2.COLOR_YCrCb2BGR)
        
    return normalized

def apply_clahe(img: np.ndarray, clip_limit: float = 2.0, tile_grid: Tuple[int, int] = (8, 8)) -> np.ndarray:
    """Applies Contrast Limited Adaptive Histogram Equalization."""
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid)
    if len(img.shape) == 3:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l_clahe = clahe.apply(l)
        return cv2.cvtColor(cv2.merge([l_clahe, a, b]), cv2.COLOR_LAB2BGR)
    return clahe.apply(img)

def apply_gamma_correction(img: np.ndarray, gamma: float = 1.0) -> np.ndarray:
    """Applies gamma correction (intensity adjustment)."""
    if gamma == 1.0:
        return img.copy()
    inv_gamma = 1.0 / gamma
    table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
    return cv2.LUT(img, table)

def apply_sharpening(img: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """Sharpen the image using an unsharp mask."""
    if strength <= 0.0:
        return img.copy()
    gaussian = cv2.GaussianBlur(img, (9, 9), 10.0)
    sharpened = cv2.addWeighted(img, 1.0 + strength, gaussian, -strength, 0)
    return sharpened

def apply_denoising(img: np.ndarray, h: float = 3.0) -> np.ndarray:
    """Applies bilateral/adaptive denoising."""
    if len(img.shape) == 3:
        return cv2.bilateralFilter(img, 9, h * 10, h * 10)
    else:
        return cv2.bilateralFilter(img, 9, h * 10, h * 10)

def detect_skew_angle(img: np.ndarray) -> float:
    """Estimates skew angle of text blocks or form boundaries."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=100, maxLineGap=10)
    if lines is None or len(lines) == 0:
        return 0.0
    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(angle) < 45:
            angles.append(angle)
    return float(np.median(angles)) if angles else 0.0

def deskew_image(img: np.ndarray, angle: float) -> np.ndarray:
    """Rotates the image by the given angle to deskew it."""
    if abs(angle) < 0.1:
        return img.copy()
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

def detect_paper_edges(img: np.ndarray) -> np.ndarray:
    """Finds paper edge boundaries. Returns coordinates of 4 corners if found, or None."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    
    # Dilate edges to bridge gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel)
    
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
        
    # Find the largest contour by area (likely the page boundary)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(c) > (img.shape[0] * img.shape[1] * 0.3):
            # Sort corners: top-left, top-right, bottom-left, bottom-right
            pts = approx.reshape(4, 2)
            rect = np.zeros((4, 2), dtype=np.float32)
            s = pts.sum(axis=1)
            rect[0] = pts[np.argmin(s)]
            rect[3] = pts[np.argmax(s)]
            diff = np.diff(pts, axis=1)
            rect[1] = pts[np.argmin(diff)]
            rect[2] = pts[np.argmax(diff)]
            return rect
    return None

def assess_image_quality(img: np.ndarray) -> Dict[str, Any]:
    """
    Computes a comprehensive quality report dictionary containing scores for:
    blur, noise, brightness, contrast, perspective, shadow, glare, fold, and overall_score.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    h, w = gray.shape[:2]
    
    # 1. Blur Detection (Laplacian variance)
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    blur_score = float(lap.var())
    
    # 2. Noise Detection (High frequency variance)
    g_blur = cv2.GaussianBlur(gray, (3, 3), 0)
    noise_sigma = float(np.std(gray - g_blur))
    
    # 3. Brightness
    brightness_score = float(np.mean(gray))
    
    # 4. Contrast (standard deviation)
    contrast_score = float(np.std(gray))
    
    # 5. Skew angle (perspective skewness check)
    skew = detect_skew_angle(img)
    
    # 6. Shadow Detection (intensity variations across quadrants)
    qh, qw = h // 2, w // 2
    quads = [
        gray[0:qh, 0:qw], gray[0:qh, qw:w],
        gray[qh:h, 0:qw], gray[qh:h, qw:w]
    ]
    quad_means = [float(np.mean(q)) for q in quads]
    shadow_score = float(np.std(quad_means))
    
    # 7. Glare Detection (percentage of oversaturated regions)
    glare_pixels = np.sum(gray > 250)
    glare_score = float((glare_pixels / gray.size) * 100.0)
    
    # 8. Fold Detection (horizontal & vertical lines crossing page center)
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=80, minLineLength=100, maxLineGap=10)
    fold_lines = 0
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            # Lines passing through the middle third of the page
            if (w * 0.3 < (x1 + x2)/2 < w * 0.7) and (h * 0.3 < (y1 + y2)/2 < h * 0.7):
                angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
                # Folds are usually vertical/horizontal but not table lines
                if (angle < 5 or 85 < angle < 95):
                    fold_lines += 1
    fold_score = float(fold_lines)
    
    # Normalize to [0, 100] overall quality score
    q_blur = min(100, max(0, int(blur_score * 0.5)))
    q_contrast = min(100, max(0, int(contrast_score * 2.0)))
    q_skew = max(0, 100 - int(abs(skew) * 10))
    q_shadow = max(0, 100 - int(shadow_score * 2.0))
    q_glare = max(0, 100 - int(glare_score * 5))
    q_noise = max(0, 100 - int(noise_sigma * 0.2))
    
    overall = int(q_blur * 0.3 + q_contrast * 0.2 + q_skew * 0.15 + q_shadow * 0.15 + q_glare * 0.1 + q_noise * 0.1)
    if fold_score > 50:
        overall = max(0, overall - 10)
        
    overall = max(0, min(100, overall))
    
    return {
        "blur": blur_score,
        "noise": noise_sigma,
        "brightness": brightness_score,
        "contrast": contrast_score,
        "perspective": skew,
        "shadow": shadow_score,
        "glare": glare_score,
        "fold": fold_score,
        "quality": overall
    }

def select_and_apply_preprocessing(img: np.ndarray, q: Dict[str, Any]) -> np.ndarray:
    """
    Selects different preprocessing configurations based on the image quality score.
    """
    out = img.copy()
    
    # 1. Lens distortion correction
    # Apply standard lens distortion correction if perspective/skew is detected
    if abs(q["perspective"]) > 1.0 or q["quality"] < 70:
        out = correct_lens_distortion(out, k1=-1e-5)
        
    # 2. White balance
    if q["contrast"] < 35 or q["quality"] < 60:
        out = correct_white_balance(out)
        
    # 3. Denoising
    if q["noise"] > 8.0:
        out = apply_denoising(out, h=q["noise"]/3.0)
        
    # 4. Shadow removal (Illumination Correction)
    if q["shadow"] > 15.0 or q["quality"] < 75:
        out = remove_shadows(out)
        
    # 5. Local Contrast Normalization & CLAHE
    if q["contrast"] < 45 or q["quality"] < 80:
        out = apply_clahe(out, clip_limit=3.0)
        out = normalize_local_contrast(out)
    else:
        out = apply_clahe(out, clip_limit=2.0)
        
    # 6. Gamma correction
    # Dark scans (brightness < 120) -> gamma correction to brighten, bright scans -> darken
    if q["brightness"] < 120:
        out = apply_gamma_correction(out, gamma=1.4)
    elif q["brightness"] > 210:
        out = apply_gamma_correction(out, gamma=0.8)
        
    # 7. Local Sharpening
    if q["blur"] < 80.0:
        out = apply_sharpening(out, strength=1.5)
    elif q["blur"] < 200.0:
        out = apply_sharpening(out, strength=0.8)
        
    # 8. Deskew
    if abs(q["perspective"]) > 0.5:
        out = deskew_image(out, q["perspective"])
        
    return out
