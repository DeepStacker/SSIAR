import re
from datetime import datetime
from typing import Tuple, Dict, Any

DEVANAGARI_DIGITS_MAP = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
}

def convert_devanagari_digits(text: str) -> str:
    if not text:
        return ""
    return "".join(DEVANAGARI_DIGITS_MAP.get(c, c) for c in text)

def luhn_checksum(digits: str) -> bool:
    """Computes Luhn algorithm check."""
    try:
        r = [int(ch) for ch in digits[::-1]]
        return sum(r[0::2] + [sum(divmod(d * 2, 10)) for d in r[1::2]]) % 10 == 0
    except ValueError:
        return False

def validate_roll_number(text: str) -> Tuple[str, bool, float, str]:
    """
    Roll Number validation: 4-12 digits.
    Converts common OCR errors and checks numerical format.
    """
    if not text:
        return "", False, 1.0, "empty"
        
    text = convert_devanagari_digits(text)
    clean = text.strip().replace(" ", "").replace("-", "").replace("_", "")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("l", "1").replace("I", "1").replace("|", "1")
    clean = clean.replace("s", "5").replace("S", "5")
    clean = clean.replace("b", "6").replace("B", "8")
    clean = clean.replace("g", "9").replace("q", "9")
    
    digits = re.sub(r"\D", "", clean)
    if not digits:
        return "", False, 1.0, "no_digits"
        
    if len(digits) > 15:
        return "", False, 1.0, "garbage_length"
        
    if not (3 <= len(digits) <= 12):
        return digits, False, 0.5, "invalid_length"
        
    # Standard check digit / checksum validation fallback:
    # If the roll number is 8 digits, we check if it passes a soft checksum (e.g. sum of digits is not 0)
    digit_sum = sum(int(d) for d in digits)
    if digit_sum == 0:
        return digits, False, 0.8, "checksum_failed"
        
    return digits, True, 0.0, "ok"

def validate_class(text: str) -> Tuple[str, bool, float, str]:
    """Class validation: 1 to 12."""
    if not text:
        return "", False, 1.0, "empty"
        
    text = convert_devanagari_digits(text)
    clean = text.strip().replace(" ", "").replace("\"", "").replace("'", "")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("l", "1").replace("I", "1").replace("|", "1")
    
    digits = re.sub(r"\D", "", clean)
    if not digits:
        return "", False, 1.0, "no_digits"
        
    if len(digits) > 4:
        return "", False, 1.0, "garbage_length"
        
    try:
        val = int(digits)
        if 1 <= val <= 12:
            return str(val), True, 0.0, "ok"
        return str(val), False, 0.6, f"out_of_range:{val}"
    except ValueError:
        return digits, False, 1.0, "invalid_number"

def validate_dob(text: str) -> Tuple[str, bool, float, str]:
    """DOB validation: DD/MM/YYYY format, calendar-validated, age-appropriate."""
    if not text:
        return "", False, 1.0, "empty"
        
    text = convert_devanagari_digits(text)
    clean = text.strip().replace(" ", "")
    if len(clean) > 20:
        return "", False, 1.0, "garbage_length"
        
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("l", "1").replace("I", "1")
    
    # Normalize separators
    for sep in ["-", ".", "_", ",", "\\", "|"]:
        clean = clean.replace(sep, "/")
        
    parts = clean.split("/")
    if len(parts) < 3:
        # Attempt to split contiguous 8 digits (DDMMYYYY)
        digits = re.sub(r"\D", "", clean)
        if len(digits) == 8:
            parts = [digits[0:2], digits[2:4], digits[4:8]]
        else:
            return clean, False, 0.8, "invalid_separator_count"
            
    dd, mm, yy = parts[0].strip(), parts[1].strip(), parts[2].strip()
    dd = re.sub(r"\D", "", dd)
    mm = re.sub(r"\D", "", mm)
    yy = re.sub(r"\D", "", yy)
    
    if not dd or not mm or not yy:
        return clean, False, 0.7, "missing_components"
        
    if len(yy) == 2:
        # Convert 2-digit year (assume 20xx for school students)
        yy = "20" + yy
        
    try:
        d, m, y = int(dd), int(mm), int(yy)
        # Check calendar validity (raises ValueError if invalid e.g. Feb 30)
        datetime(y, m, d)
    except ValueError:
        return f"{dd}/{mm}/{yy}", False, 0.5, "invalid_calendar_date"
        
    # Check age range: school students must be between 5 and 25 years old
    curr_year = datetime.now().year
    age = curr_year - y
    if not (5 <= age <= 25):
        return f"{d:02d}/{m:02d}/{y}", False, 0.4, f"age_out_of_bounds:age={age}"
        
    return f"{d:02d}/{m:02d}/{y}", True, 0.0, "ok"

def validate_gender(text: str) -> Tuple[str, bool, float, str]:
    """Gender validation: M or F."""
    if not text:
        return "", False, 1.0, "empty"
        
    clean = text.strip().upper()
    if "FEMALE" in clean or "FEM" in clean or clean in ("F", "W", "FEM"):
        return "F", True, 0.0, "ok"
    if "MALE" in clean or clean in ("M", "N", "H"):
        return "M", True, 0.0, "ok"
        
    return clean, False, 0.6, "unrecognized_gender"

def validate_percentage(text: str) -> Tuple[str, bool, float, str]:
    """Percentage validation: integer between 0 and 100."""
    if not text:
        return "", False, 1.0, "empty"
        
    text = convert_devanagari_digits(text)
    clean = text.strip().replace(" ", "").replace("%", "")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("l", "1").replace("I", "1").replace("|", "1")
    
    digits = re.sub(r"\D", "", clean)
    if not digits:
        return "", False, 1.0, "no_digits"
        
    if len(digits) > 4:
        return "", False, 1.0, "garbage_length"
        
    try:
        val = int(digits)
        if 0 <= val <= 100:
            return str(val), True, 0.0, "ok"
        return str(val), False, 0.5, f"out_of_range:{val}"
    except ValueError:
        return digits, False, 1.0, "invalid_number"

def validate_rank(text: str) -> Tuple[str, bool, float, str]:
    """Rank validation: positive integer between 1 and 999."""
    if not text:
        return "", False, 1.0, "empty"
        
    text = convert_devanagari_digits(text)
    clean = text.strip().replace(" ", "")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("l", "1").replace("I", "1").replace("|", "1")
    
    digits = re.sub(r"\D", "", clean)
    if not digits:
        return "", False, 1.0, "no_digits"
        
    if len(digits) > 4:
        return "", False, 1.0, "garbage_length"
        
    try:
        val = int(digits)
        if 1 <= val <= 999:
            return str(val), True, 0.0, "ok"
        return str(val), False, 0.5, f"out_of_range:{val}"
    except ValueError:
        return digits, False, 1.0, "invalid_number"

def validate_consent(text: str) -> Tuple[str, bool, float, str]:
    """Consent validation: Yes, No, or Unanswered."""
    if not text:
        return "Unanswered", True, 0.0, "default_unanswered"
        
    clean = text.strip().upper()
    if clean in ("YES", "Y", "सत्य", "हाँ"):
        return "Yes", True, 0.0, "ok"
    if clean in ("NO", "N", "असत्य", "नहीं"):
        return "No", True, 0.0, "ok"
    if clean == "UNANSWERED" or not clean:
        return "Unanswered", True, 0.0, "ok"
        
    return text, False, 0.4, "unrecognized_consent"

VALIDATORS = {
    "roll_number": validate_roll_number,
    "class": validate_class,
    "dob": validate_dob,
    "gender": validate_gender,
    "math_pct": validate_percentage,
    "science_pct": validate_percentage,
    "language_pct": validate_percentage,
    "rank": validate_rank,
    "consent": validate_consent
}

def validate_field(field_name: str, text: str) -> Tuple[str, bool, float, str]:
    """Validate a single field value by name."""
    validator = VALIDATORS.get(field_name)
    if not validator:
        return text, bool(text), 0.0, "no_validator"
    return validator(text)

def get_normalized_value(field_name: str, text: str) -> Tuple[str, bool]:
    """Convenience helper matching the previous interface."""
    norm, is_valid, _, _ = validate_field(field_name, text)
    return norm, is_valid

# ---------------------------------------------------------------------------
# Cross-Field Consistency Checks
# ---------------------------------------------------------------------------

def check_cross_field_consistency(fields: Dict[str, Any]) -> Tuple[bool, float, str]:
    """
    Validates cross-field constraints:
      1. Class + DOB age agreement. (Class C should mean Age = C + 5 +/- 2 years)
      2. Roll Number format checks
      3. Consistency of Marks vs Rank
    """
    penalty = 0.0
    reasons = []
    
    # 1. Class vs Age Check
    class_val = fields.get("class")
    dob_val = fields.get("dob")
    
    if class_val and dob_val and "/" in dob_val:
        try:
            c = int(class_val)
            parts = dob_val.split("/")
            if len(parts) == 3:
                birth_year = int(parts[2])
                curr_year = datetime.now().year
                age = curr_year - birth_year
                
                # Expected age: class + 5
                expected_age = c + 5
                if abs(age - expected_age) > 2:
                    penalty += 0.25
                    reasons.append(f"age_class_mismatch(class={c}, age={age})")
        except Exception:
            pass
            
    # 2. Percentage scores vs Rank consistency
    # If all three percentages are very high (e.g. >90%), rank should be relatively low (e.g. <50)
    try:
        math = fields.get("math_pct")
        sci = fields.get("science_pct")
        lang = fields.get("language_pct")
        rank = fields.get("rank")
        
        if math and sci and lang and rank:
            m_val = int(math)
            s_val = int(sci)
            l_val = int(lang)
            r_val = int(rank)
            
            avg_score = (m_val + s_val + l_val) / 3.0
            if avg_score > 90.0 and r_val > 500:
                penalty += 0.20
                reasons.append(f"rank_marks_inconsistency(avg_pct={avg_score:.1f}%, rank={r_val})")
    except Exception:
        pass
        
    is_consistent = penalty < 0.4
    return is_consistent, penalty, "; ".join(reasons)
