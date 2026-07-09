"""
Trust Confidence Engine (Module 7)
====================================
Separates OCR confidence from business trust confidence.
Calculates a holistic trust score using:
- Azure OCR confidence
- Field validation results
- Character ambiguity analysis
- Cross-field consistency
- Historical correction patterns
- Statistical anomaly detection
"""
from typing import Optional
from app.processing.types import (
    TrustConfidence,
    ValidationResult,
    FieldDefinition,
)
from app.processing.field_resolver import normalize_value


def calculate_trust(
    field_def: FieldDefinition,
    extracted_text: str,
    azure_confidence: float,
    validation_result: Optional[ValidationResult] = None,
    cross_field_score: float = 1.0,
    historical_score: float = 1.0,
    statistical_score: float = 1.0,
) -> TrustConfidence:
    """
    Calculate the trust confidence for a field value.
    
    Trust = f(azure_confidence, validation, ambiguity, cross_field, historical, statistical)
    """
    trust = TrustConfidence()
    trust.ocr_confidence = azure_confidence
    
    if not extracted_text:
        trust.trust_confidence = 0.0
        return trust
    
    # 1. Validation Score
    if validation_result:
        trust.validation_score = 1.0 if validation_result.is_valid else 0.3
    else:
        trust.validation_score = 1.0
    
    # 2. Character Ambiguity Score
    trust.ambiguity_score = _calculate_ambiguity(extracted_text, field_def.type)
    
    # 3. Composite trust score
    trust.cross_field_score = cross_field_score
    trust.historical_score = historical_score
    trust.statistical_score = statistical_score
    
    trust.trust_confidence = _fuse_trust(
        ocr_confidence=azure_confidence,
        validation_score=trust.validation_score,
        ambiguity_score=trust.ambiguity_score,
        cross_field_score=cross_field_score,
        historical_score=historical_score,
        statistical_score=statistical_score,
    )
    
    return trust


def _calculate_ambiguity(text: str, field_type: str) -> float:
    """
    Calculate character ambiguity score (0 = not ambiguous, 1 = very ambiguous).
    Based on common OCR confusion patterns in Hindi handwriting.
    """
    if not text:
        return 1.0
    
    ambiguity = 0.0
    factors = 0
    
    # Length-based ambiguity: very short values are more ambiguous
    if len(text) <= 1:
        ambiguity += 0.4
        factors += 1
    
    # Digit ambiguity: presence of commonly confused characters
    ambiguous_chars = {
        '0': ['8', '6', '9', 'b'],
        '1': ['7', 'l', 'I', '|'],
        '2': ['7', '3'],
        '5': ['6', 's', 'S'],
        '6': ['5', 'b', '0'],
        '8': ['0', '6', '9', 'b', 'B'],
        '9': ['8', 'g', 'q'],
    }
    
    for ch in text:
        if ch in ambiguous_chars:
            ambiguity += 0.15
            factors += 1
    
    # Type-specific ambiguity
    if field_type == "date":
        # Dates with ambiguous day/month boundaries (e.g., 01/02/2025)
        try:
            parts = text.split('/')
            if len(parts) >= 2:
                d, m = parts[0], parts[1]
                if (int(d) <= 12 and int(m) <= 12):
                    ambiguity += 0.2  # Day and month both <= 12, could be confused
                    factors += 1
        except (ValueError, IndexError):
            pass
    elif field_type == "gender":
        # Single character gender values are highly ambiguous
        ambiguity += 0.3
        factors += 1
    
    if factors == 0:
        return 0.0
    
    score = min(1.0, ambiguity / factors)
    return score


def _fuse_trust(
    ocr_confidence: float,
    validation_score: float,
    ambiguity_score: float,
    cross_field_score: float,
    historical_score: float,
    statistical_score: float,
) -> float:
    """
    Fuse all trust factors into a single trust confidence score.
    Weighted formula: Azure (40%) + Validation (25%) + Cross-field (15%)
    + Historical (10%) + Statistical (5%) + Ambiguity penalty (5%)
    """
    # Base weights
    weights = {
        "ocr": 0.40,
        "validation": 0.25,
        "cross_field": 0.15,
        "historical": 0.10,
        "statistical": 0.05,
        "ambiguity": 0.05,  # Penalty weight
    }
    
    # Ambiguity is a penalty (inverted)
    clarity_score = 1.0 - ambiguity_score
    
    trust = (
        weights["ocr"] * ocr_confidence
        + weights["validation"] * validation_score
        + weights["cross_field"] * cross_field_score
        + weights["historical"] * historical_score
        + weights["statistical"] * statistical_score
        - weights["ambiguity"] * ambiguity_score
    )
    
    # Clamp
    trust = max(0.0, min(1.0, trust))
    
    # Hard floor: if validation fails, trust cannot exceed 50%
    if validation_score < 0.5:
        trust = min(trust, 0.50)
    
    return trust


def determine_review_priority(
    trust_confidence: float,
    is_critical: bool,
) -> str:
    """
    Determine the review priority for a field based on its trust confidence.
    
    Returns: "critical", "low_trust", or "none"
    """
    if is_critical and trust_confidence < 0.90:
        return "critical"
    elif trust_confidence < 0.60:
        return "low_trust"
    return "none"