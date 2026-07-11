"""
Validation Engine (Module 8)
==============================
Detects wrong but confident OCR.
Supports multiple validation types:
1. Format Validation (date, number, gender format)
2. Range Validation (marks 0-100, age bounds)
3. Logical Validation (age vs DOB consistency)
4. Cross-field Validation (gender vs other responses)
5. Statistical Validation (dataset-based anomaly detection)

Incorporates OCR character cleanup:
- Devanagari digit conversion (०→0, १→1, etc.)
- Common OCR confusion mapping (o→0, l→1, s→5, etc.)
"""
import re
from datetime import datetime
from typing import Optional
from app.processing.types import ValidationResult, FieldDefinition


# ── OCR Character Cleanup ─────────────────────────────────────────────────────

DEVANAGARI_DIGITS = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
}

# Common OCR confusion pairs for Hindi handwriting digit recognition
OCR_CONFUSIONS = {
    'o': '0', 'O': '0',
    'l': '1', 'I': '1', '|': '1',
    's': '5', 'S': '5',
    'b': '6', 'B': '8',
    'g': '9', 'q': '9',
}


def cleanup_ocr_text(text: str, field_type: str = "text") -> str:
    """Clean up OCR text by converting Devanagari digits and fixing common confusions."""
    if not text:
        return ""
    result = text.strip()
    # Convert Devanagari digits
    result = "".join(DEVANAGARI_DIGITS.get(c, c) for c in result)
    # For numeric fields, apply OCR confusion mapping
    if field_type in ("number", "date", "gender"):
        for wrong, correct in OCR_CONFUSIONS.items():
            result = result.replace(wrong, correct)
    return result


def extract_digits(text: str) -> str:
    """Extract only digits from text, after OCR cleanup."""
    cleaned = text.strip().replace(" ", "").replace("-", "").replace("_", "")
    cleaned = cleaned.replace("\"", "").replace("'", "")
    return re.sub(r"\D", "", cleaned)


# ── Main Validation Entry Point ──────────────────────────────────────────────

def validate_field(
    field_def: FieldDefinition,
    value: str,
    cross_field_data: Optional[dict[str, str]] = None,
) -> ValidationResult:
    """
    Validate a field value against its field definition rules.
    Returns a ValidationResult with detailed validation info.
    """
    if not value:
        return ValidationResult(
            field_name=field_def.name,
            value=value,
            is_valid=False,
            reason="empty",
        )
    
    rules = field_def.validation_rules
    
    for rule in rules:
        result = _apply_rule(rule, value, field_def, cross_field_data)
        if not result.is_valid:
            return result
    
    # Type-specific default validations
    type_result = _validate_by_type(field_def, value)
    if type_result:
        return type_result
    
    return ValidationResult(
        field_name=field_def.name,
        value=value,
        is_valid=True,
        reason="ok",
    )


def _apply_rule(
    rule: str,
    value: str,
    field_def: FieldDefinition,
    cross_field_data: Optional[dict[str, str]],
) -> ValidationResult:
    """Apply a single validation rule."""
    from app.validation.fields import VALIDATORS
    
    validator_key = rule
    if validator_key not in VALIDATORS and rule == "percentage":
        validator_key = "math_pct"
        
    validator = VALIDATORS.get(validator_key)
    if not validator:
        return ValidationResult(
            field_name=field_def.name,
            value=value,
            is_valid=True,
            reason=f"unknown_rule:{rule}",
        )
        
    norm_val, is_valid, penalty, reason = validator(value)
    return ValidationResult(
        field_name=field_def.name,
        value=norm_val,
        is_valid=is_valid,
        reason=reason,
        validation_details={"penalty": penalty}
    )


def _validate_by_type(
    field_def: FieldDefinition,
    value: str,
) -> Optional[ValidationResult]:
    """Validate value by field type."""
    if field_def.type == "number":
        if not re.match(r'^[\d./\-]+$', value.strip()):
            return ValidationResult(
                field_name=field_def.name,
                value=value,
                is_valid=False,
                reason="invalid_number_format",
            )
    elif field_def.type == "date":
        parts = value.split('/')
        if len(parts) != 3:
            return ValidationResult(
                field_name=field_def.name,
                value=value,
                is_valid=False,
                reason="invalid_date_format",
            )
        try:
            datetime(int(parts[2]), int(parts[1]), int(parts[0]))
        except ValueError:
            return ValidationResult(
                field_name=field_def.name,
                value=value,
                is_valid=False,
                reason="invalid_calendar_date",
            )
    
    return None


def check_cross_field_consistency_v2(
    fields: dict[str, str],
    validation_results: dict[str, ValidationResult],
) -> tuple[bool, float, str, list[str]]:
    """
    Check consistency across multiple fields.
    Returns: (is_consistent, penalty_score, reason, inconsistent_fields)
    """
    from app.validation.fields import check_cross_field_consistency
    return check_cross_field_consistency(fields)