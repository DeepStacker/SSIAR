import cv2
import numpy as np
import os
from pathlib import Path
from typing import Tuple, Optional

# Standard Template Dimensions
TEMPLATE_W = 2483
TEMPLATE_H = 3508

# Define bounding boxes of local zones in template space (A4 300 DPI)
# 1. Top Information Table (Roll Number, Class, DOB, Gender)
ZONE_TOP_RECT = (130, 200, 2400, 900)  # (x0, y0, x1, y1) in pixels
# 2. Checkbox Grid (q1 to q25 rows)
ZONE_CHECKBOX_RECT = (130, 900, 2400, 3100)
# 3. Bottom Marks Table (Math %, Science %, Language %, Rank)
ZONE_MARKS_RECT = (130, 3100, 2400, 3450)

def is_valid_homography(H: np.ndarray) -> bool:
    """Validates homography matrix to ensure it is not highly distorted."""
    if H is None or H.shape != (3, 3):
        return False
    # Check perspective terms (should be close to 0 for standard alignments)
    if abs(H[2, 0]) > 0.002 or abs(H[2, 1]) > 0.002:
        return False
    # Check diagonal scaling terms
    if H[0, 0] < 0.2 or H[0, 0] > 5.0 or H[1, 1] < 0.2 or H[1, 1] > 5.0:
        return False
    # Check off-diagonal shear/rotation terms
    if abs(H[0, 1]) > 1.0 or abs(H[1, 0]) > 1.0:
        return False
    return True

def match_features_homography(src_gray: np.ndarray, dst_gray: np.ndarray, method: str = "orb") -> Optional[np.ndarray]:
    """Matches features between src and dst using specified method, returns Homography matrix H."""
    if method == "orb":
        detector = cv2.ORB_create(nfeatures=3000)
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    elif method == "akaze":
        detector = cv2.AKAZE_create()
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    elif method == "sift":
        detector = cv2.SIFT_create()
        matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=True)
    else:
        return None
        
    kp1, des1 = detector.detectAndCompute(src_gray, None)
    kp2, des2 = detector.detectAndCompute(dst_gray, None)
    
    if des1 is None or des2 is None or len(kp1) < 10 or len(kp2) < 10:
        return None
        
    matches = matcher.match(des1, des2)
    matches = sorted(matches, key=lambda x: x.distance)
    good_matches = matches[:100]
    
    if len(good_matches) < 10:
        return None
        
    src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    
    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    if H is not None and is_valid_homography(H):
        return H
    return None

def match_ecc_homography(src_gray: np.ndarray, dst_gray: np.ndarray) -> Optional[np.ndarray]:
    """Aligns images using Enhanced Correlation Coefficient (ECC) maximization."""
    warp_matrix = np.eye(3, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 50, 1e-4)
    
    try:
        # FindTransformECC computes transformation to align src to dst
        _, H = cv2.findTransformECC(src_gray, dst_gray, warp_matrix, cv2.MOTION_HOMOGRAPHY, criteria, None, 5)
        if H is not None and is_valid_homography(H):
            return H
        return None
    except cv2.error:
        return None

def align_images_fallback(src: np.ndarray, dst: np.ndarray) -> Tuple[Optional[np.ndarray], str]:
    """
    Attempts to align src to dst using automatic fallback:
    ORB -> AKAZE -> SIFT -> ECC
    Returns: (aligned_image, method_used)
    """
    src_gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY) if len(src.shape) == 3 else src
    dst_gray = cv2.cvtColor(dst, cv2.COLOR_BGR2GRAY) if len(dst.shape) == 3 else dst
    
    # Resize src_gray if shape doesn't match for ECC
    if src_gray.shape != dst_gray.shape:
        # We warp to dst dimensions
        pass

    methods = ["orb", "akaze", "sift", "ecc"]
    for method in methods:
        if method == "ecc":
            # ECC requires identical shape, resize src to match dst first
            src_resized = cv2.resize(src_gray, (dst_gray.shape[1], dst_gray.shape[0]))
            H = match_ecc_homography(src_resized, dst_gray)
            if H is not None:
                aligned = cv2.warpPerspective(src, H, (dst.shape[1], dst.shape[0]))
                return aligned, "ecc"
        else:
            H = match_features_homography(src_gray, dst_gray, method=method)
            if H is not None:
                aligned = cv2.warpPerspective(src, H, (dst.shape[1], dst.shape[0]))
                return aligned, method
                
    return None, "failed"

def align_page_hierarchical(img: np.ndarray, template: np.ndarray) -> Tuple[np.ndarray, Dict[str, np.ndarray], str]:
    """
    Performs global alignment first, then refines alignment locally for
    specific regions of interest using local homographies.
    
    Returns:
      - globally_aligned: full globally aligned image
      - local_aligned_zones: dict mapping zone name to its locally-aligned image
      - global_method: alignment method that succeeded globally
    """
    # 1. Global Alignment
    globally_aligned, global_method = align_images_fallback(img, template)
    if globally_aligned is None:
        # Fallback to simple resizing if all alignment methods fail
        globally_aligned = cv2.resize(img, (TEMPLATE_W, TEMPLATE_H))
        global_method = "resize_fallback"
    else:
        globally_aligned = cv2.resize(globally_aligned, (TEMPLATE_W, TEMPLATE_H))
        
    local_aligned_zones = {}
    zones = {
        "top_info": ZONE_TOP_RECT,
        "checkbox_grid": ZONE_CHECKBOX_RECT,
        "marks_table": ZONE_MARKS_RECT
    }
    
    # 2. Local Alignment Refinements
    for name, rect in zones.items():
        x0, y0, x1, y1 = rect
        
        # Crop from template
        temp_crop = template[y0:y1, x0:x1]
        
        # Crop from globally aligned image
        glob_crop = globally_aligned[y0:y1, x0:x1]
        
        # Attempt local realignment (keep in local_aligned_zones but don't distort global canvas)
        local_aligned, local_method = align_images_fallback(glob_crop, temp_crop)
        if local_aligned is not None:
            local_aligned_zones[name] = local_aligned
        else:
            # Fallback to global crop
            local_aligned_zones[name] = glob_crop
            
    return globally_aligned, local_aligned_zones, global_method
