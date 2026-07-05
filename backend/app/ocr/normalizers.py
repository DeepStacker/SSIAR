import cv2
import re
import numpy as np
from datetime import datetime

DEVANAGARI_DIGITS_MAP = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
}

def convert_devanagari_digits(text):
    if not text:
        return ""
    return "".join(DEVANAGARI_DIGITS_MAP.get(c, c) for c in text)

def clean_ocr_text(text):
    if not text:
        return ""
    text = convert_devanagari_digits(text)
    return text.strip()

def normalize_roll_number(text):
    if not text:
        return "", False
    clean = text.replace(" ", "")
    clean = clean.replace("-", "").replace("+", "").replace("/", "").replace("l", "1").replace("I", "1").replace("|", "1")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("s", "5").replace("S", "5")
    clean = clean.replace("b", "6").replace("B", "8")
    clean = clean.replace("g", "9").replace("q", "9")
    clean = clean.replace("z", "2").replace("Z", "2")
    digits = re.sub(r"\D", "", clean)
    is_valid = 3 <= len(digits) <= 12
    return digits, is_valid

def normalize_class(text):
    if not text:
        return "", False
    clean = text.strip().replace(" ", "")
    clean = clean.replace("l", "1").replace("I", "1").replace("|", "1")
    clean = clean.replace("o", "0").replace("O", "0")
    digits = re.sub(r"\D", "", clean)
    is_valid = digits in ["9", "10", "11", "12"]
    return digits, is_valid

def normalize_dob(text):
    if not text:
        return "", False
    clean = text.replace(" ", "")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("J", "/").replace("I", "/").replace("l", "/").replace("|", "/")
    clean = re.sub(r"[-._]", "/", clean)
    match = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", clean)
    if match:
        day, month, year = match.groups()
        if _validate_date(day, month, year):
            return f"{day}/{month}/{year}", True
    nums = re.findall(r"\d+", clean)
    if len(nums) == 3:
        day, month, year = nums[0], nums[1], nums[2]
        if len(year) == 2:
            year = "20" + year
        if _validate_date(day, month, year):
            return f"{int(day):02d}/{int(month):02d}/{year}", True
    return clean, False

def _validate_date(day_str, month_str, year_str):
    try:
        d, m, y = int(day_str), int(month_str), int(year_str)
        if not (1950 <= y <= 2030):
            return False
        datetime(y, m, d)
        return True
    except (ValueError, TypeError):
        return False

def normalize_gender(text):
    if not text:
        return "", False
    clean = text.strip().upper()
    if "F" in clean or "FEMALE" in clean or "महिला" in clean or "स्त्री" in clean or "लड़की" in clean:
        return "F", True
    if "M" in clean or "MALE" in clean or "पुरुष" in clean or "लड़का" in clean:
        return "M", True
    if len(clean) == 1:
        if clean in ("W", "F"):
            return "F", True
        if clean in ("M", "N", "H"):
            return "M", True
    return clean, False

def normalize_score(text):
    if not text:
        return "", False
    clean = text.replace(" ", "")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("l", "1").replace("I", "1").replace("|", "1")
    clean = clean.replace("s", "5").replace("S", "5")
    clean = clean.replace("b", "6").replace("B", "8")
    clean = clean.replace("g", "9").replace("q", "9")
    digits = re.sub(r"\D", "", clean)
    return digits, len(digits) > 0

def normalize_pct(text):
    value, is_valid = normalize_score(text)
    if not is_valid:
        return value, False
    try:
        num = int(value)
        if num < 0 or num > 100:
            return value, False
    except ValueError:
        return value, False
    return value, True

def normalize_rank_val(text):
    value, is_valid = normalize_score(text)
    if not is_valid:
        return value, False
    try:
        num = int(value)
        if num < 0 or num > 999:
            return value, False
    except ValueError:
        return value, False
    return value, True

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

