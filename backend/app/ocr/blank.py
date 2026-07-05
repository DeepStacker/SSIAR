import cv2
import numpy as np

BLANK_CROP_STD_THRESHOLD = 12.0
BLANK_CROP_INK_RATIO = 0.005

def is_blank_crop(crop) -> bool:
    if crop is None or crop.size == 0:
        return True
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
    h, w = gray.shape[:2]
    my, mx = int(h * 0.1), int(w * 0.1)
    inner = gray[my:h-my, mx:w-mx]
    if inner.size == 0:
        return True
    contrast = float(np.std(inner))
    if contrast < BLANK_CROP_STD_THRESHOLD:
        return True
    _, binary = cv2.threshold(inner, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink_ratio = float(np.sum(binary > 0)) / binary.size
    if ink_ratio < BLANK_CROP_INK_RATIO:
        return True
    return False
