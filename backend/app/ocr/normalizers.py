import cv2
import re
import numpy as np
from datetime import datetime
from app.validation.fields import (
    convert_devanagari_digits as _cdd,
    validate_roll_number as _vrn,
    validate_class as _vc,
    validate_dob as _vd,
    validate_gender as _vg,
    validate_percentage as _vp,
    validate_rank as _vr,
)

def convert_devanagari_digits(text):
    return _cdd(text)

def clean_ocr_text(text):
    if not text:
        return ""
    return _cdd(text).strip()

def normalize_roll_number(text):
    norm, is_valid, _, _ = _vrn(text)
    return norm, is_valid

def normalize_class(text):
    norm, is_valid, _, _ = _vc(text)
    return norm, is_valid

def normalize_dob(text):
    norm, is_valid, _, _ = _vd(text)
    return norm, is_valid

def normalize_gender(text):
    norm, is_valid, _, _ = _vg(text)
    return norm, is_valid

def normalize_score(text):
    if not text:
        return "", False
    clean = _cdd(text).strip().replace(" ", "")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("l", "1").replace("I", "1").replace("|", "1")
    clean = clean.replace("s", "5").replace("S", "5")
    clean = clean.replace("b", "6").replace("B", "8")
    clean = clean.replace("g", "9").replace("q", "9")
    digits = re.sub(r"\D", "", clean)
    return digits, len(digits) > 0

def normalize_pct(text):
    norm, is_valid, _, _ = _vp(text)
    return norm, is_valid

def normalize_rank_val(text):
    norm, is_valid, _, _ = _vr(text)
    return norm, is_valid

def get_normalizer(field_name):
    norm_map = {
        'roll_number': (normalize_roll_number, '0123456789०१२३४५६७८९'),
        'class': (normalize_class, '0123456789०१२३४५६७८९'),
        'dob': (normalize_dob, '0123456789०१२३४५६७८९/'),
        'gender': (normalize_gender, 'MFmfMFmf'),
        'math_pct': (normalize_pct, '0123456789०१२३४५६७८९%'),
        'science_pct': (normalize_pct, '0123456789०१२३४५६७८९%'),
        'language_pct': (normalize_pct, '0123456789०१२३४५६७८९%'),
        'rank': (normalize_rank_val, '0123456789०१२३४५६७८९'),
    }
    return norm_map.get(field_name, (normalize_score, None))
