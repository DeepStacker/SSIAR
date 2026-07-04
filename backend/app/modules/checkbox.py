import cv2
import numpy as np
from typing import List, Tuple, Dict, Any
from dataclasses import dataclass, field

class CheckboxState:
    EMPTY = "empty"
    TICK = "tick"
    CROSS = "cross"
    FILLED = "filled"
    DOUBLE = "double_mark"
    PARTIAL = "partial"

@dataclass
class CheckboxResult:
    question: str
    selected_column: int
    state: str
    confidence: float
    all_columns: List[int] = field(default_factory=list)
    fill_ratios: List[float] = field(default_factory=list)
    is_multi: bool = False

def _get_neighbors(img: np.ndarray, i: int, j: int) -> List[int]:
    return [
        int(img[i-1, j]), int(img[i-1, j+1]), int(img[i, j+1]), int(img[i+1, j+1]),
        int(img[i+1, j]), int(img[i+1, j-1]), int(img[i, j-1]), int(img[i-1, j-1])
    ]

def _transitions(p: List[int]) -> int:
    return sum(1 for i in range(8) if p[i] == 0 and p[(i + 1) % 8] == 1)

def _skeletonize(binary: np.ndarray) -> np.ndarray:
    try:
        import cv2.ximgproc
        return cv2.ximgproc.thinning(binary)
    except (ImportError, AttributeError):
        pass

    temp = (binary.copy() // 255).astype(np.uint8)
    changed = True
    while changed:
        changed = False
        marking = np.zeros_like(temp)
        for i in range(1, temp.shape[0] - 1):
            for j in range(1, temp.shape[1] - 1):
                if temp[i, j] != 1:
                    continue
                p = _get_neighbors(temp, i, j)
                if 2 <= sum(p) <= 6 and p[0]*p[2]*p[4] == 0 and p[2]*p[4]*p[6] == 0:
                    if _transitions(p) == 1:
                        marking[i, j] = 1
        if marking.sum() > 0:
            changed = True
            temp[marking == 1] = 0

        marking = np.zeros_like(temp)
        for i in range(1, temp.shape[0] - 1):
            for j in range(1, temp.shape[1] - 1):
                if temp[i, j] != 1:
                    continue
                p = _get_neighbors(temp, i, j)
                if 2 <= sum(p) <= 6 and p[0]*p[2]*p[6] == 0 and p[0]*p[4]*p[6] == 0:
                    if _transitions(p) == 1:
                        marking[i, j] = 1
        if marking.sum() > 0:
            changed = True
            temp[marking == 1] = 0

    return (temp * 255).astype(np.uint8)

def _count_endpoints(skeleton: np.ndarray) -> int:
    sk = skeleton // 255
    count = 0
    for i in range(1, sk.shape[0] - 1):
        for j in range(1, sk.shape[1] - 1):
            if sk[i, j] == 1:
                neighbors = sum(sk[i-1:i+2, j-1:j+2].flatten()) - 1
                if neighbors == 1:
                    count += 1
    return count

def _get_otsu_threshold(crop_gray: np.ndarray) -> int:
    if crop_gray.size == 0:
        return 155
    thresh_val, _ = cv2.threshold(crop_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return int(thresh_val)

def _analyze_checkbox(crop: np.ndarray) -> Tuple[str, float, float]:
    """
    Analyzes a single checkbox crop by locating the printed box border
    and examining the inner region for markings.
    """
    h, w = crop.shape[:2]
    if h < 5 or w < 5:
        return CheckboxState.EMPTY, 1.0, 0.0

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
    
    otsu_val = _get_otsu_threshold(gray)
    effective_thresh = min(otsu_val, 180)
    _, binary = cv2.threshold(gray, effective_thresh, 255, cv2.THRESH_BINARY_INV)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    
    total_pixels = binary.size
    ink_pixels = int(np.sum(binary > 0))
    fill_ratio = ink_pixels / max(total_pixels, 1)
    
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours or fill_ratio < 0.015:
        return CheckboxState.EMPTY, 1.0, fill_ratio

    # Find checkbox outline contour
    checkbox_contour = None
    for c in contours:
        cx, cy, cw, ch = cv2.boundingRect(c)
        aspect = cw / max(ch, 1)
        if 13 <= cw <= 35 and 13 <= ch <= 35 and 0.65 <= aspect <= 1.5:
            checkbox_contour = c
            break
            
    if checkbox_contour is not None:
        cx, cy, cw, ch = cv2.boundingRect(checkbox_contour)
        margin = 3
        if cw > 2 * margin and ch > 2 * margin:
            inner = binary[cy+margin:cy+ch-margin, cx+margin:cx+cw-margin]
            inner_ink = int(np.sum(inner > 0))
            inner_total = inner.size
            inner_fill = inner_ink / max(inner_total, 1)
            
            if inner_fill > 0.06 or inner_ink > 6:
                skeleton = _skeletonize(inner)
                endpoints = _count_endpoints(skeleton)
                
                if inner_fill > 0.45:
                    return CheckboxState.FILLED, float(min(1.0, inner_fill * 1.5)), inner_fill
                elif endpoints >= 2:
                    if endpoints >= 4:
                        return CheckboxState.CROSS, float(min(0.98, inner_fill * 2.5)), inner_fill
                    return CheckboxState.TICK, float(min(0.98, inner_fill * 3.0)), inner_fill
                else:
                    return CheckboxState.PARTIAL, float(min(0.85, inner_fill * 2.0)), inner_fill
            else:
                return CheckboxState.EMPTY, 0.98, inner_fill
                
    # Fallback: analyze central region of the crop
    mid_x, mid_y = w // 2, h // 2
    cw_box, ch_box = 24, 24
    rx0 = max(0, mid_x - cw_box // 2)
    ry0 = max(0, mid_y - ch_box // 2)
    rx1 = min(w, mid_x + cw_box // 2)
    ry1 = min(h, mid_y + ch_box // 2)
    
    center_patch = binary[ry0:ry1, rx0:rx1]
    ink_pixels = int(np.sum(center_patch > 0))
    fill_ratio = ink_pixels / max(center_patch.size, 1)
    
    if fill_ratio > 0.08 or ink_pixels > 6:
        skeleton = _skeletonize(center_patch)
        endpoints = _count_endpoints(skeleton)
        if fill_ratio > 0.40:
            return CheckboxState.FILLED, float(min(1.0, fill_ratio * 1.5)), fill_ratio
        elif endpoints >= 2:
            if endpoints >= 4:
                return CheckboxState.CROSS, float(min(0.95, fill_ratio * 2.5)), fill_ratio
            return CheckboxState.TICK, float(min(0.95, fill_ratio * 3.0)), fill_ratio
        else:
            return CheckboxState.PARTIAL, float(min(0.80, fill_ratio * 2.0)), fill_ratio
            
    return CheckboxState.EMPTY, 1.0 - fill_ratio * 3, fill_ratio

def detect_checkboxes(
    aligned_img: np.ndarray,
    page_num: int,
    y_ranges: List[Tuple[int, int]],
    col_x_centers: List[float],
    zoom: float
) -> Dict[int, Tuple[int, str, float, List[str], bool]]:
    """
    Detects checkbox states for all questions on a page.
    Returns: { q_num: (best_col_1_indexed, state, confidence, all_column_states, is_multi) }
    """
    gray = cv2.cvtColor(aligned_img, cv2.COLOR_BGR2GRAY) if len(aligned_img.shape) == 3 else aligned_img.copy()
    start_q = 1 if page_num == 1 else 13
    results = {}
    
    for idx, (y0, y1) in enumerate(y_ranges):
        q_num = start_q + idx
        col_crops = []
        col_binaries = []
        col_ink_counts = []
        
        y_start = y0 + 12
        y_end = y1 - 12
        
        # 1. Gather crops and binarize
        for col_idx, x_pt in enumerate(col_x_centers):
            cx = int((x_pt + 2.5) * zoom)
            x_start = cx - int(40 * zoom / 4.16)
            x_end = cx + int(40 * zoom / 4.16)
            
            crop = gray[y_start:y_end, x_start:x_end]
            col_crops.append(crop)
            
            # Otsu binarization clamped to 180 to filter paper texture noise
            otsu_val = _get_otsu_threshold(crop)
            effective_thresh = min(otsu_val, 180)
            _, binary = cv2.threshold(crop, effective_thresh, 255, cv2.THRESH_BINARY_INV)
            
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
            binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            col_binaries.append(binary)
            
            # Count ink pixels in the crop
            col_ink_counts.append(int(np.sum(binary > 0)))
            
        # 2. Determine state of each column individually using _analyze_checkbox
        col_states = []
        col_confs = []
        for col_idx, crop in enumerate(col_crops):
            state, confidence, _ = _analyze_checkbox(crop)
            col_states.append(state)
            col_confs.append(confidence)
            
        # 3. Compare ink counts across columns differentially
        min_ink = min(col_ink_counts)
        active_cols = []
        threshold_diff = 15
        
        for c_idx, ink_val in enumerate(col_ink_counts):
            if ink_val > min_ink + threshold_diff:
                active_cols.append(c_idx)
                
        is_multi = len(active_cols) > 1
        
        if not active_cols:
            results[q_num] = (0, CheckboxState.EMPTY, 1.0, col_states, False)
        else:
            best_col = active_cols[0] if len(active_cols) == 1 else int(np.argmax(col_ink_counts))
            best_state = col_states[best_col]
            if best_state == CheckboxState.EMPTY:
                best_state = CheckboxState.TICK  # Force marked state
            
            final_state = CheckboxState.DOUBLE if is_multi else best_state
            results[q_num] = (
                best_col + 1,
                final_state,
                col_confs[best_col] if not is_multi else 0.50,
                col_states,
                is_multi
            )
            
    return results
