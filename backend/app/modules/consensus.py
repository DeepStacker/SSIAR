from typing import Dict, List, Optional
from . import FieldType, RecognitionResult, ConsensusVote, FIELD_TYPE_MAP
from .validation import validate_field

# Weight matrix: [digit_cnn, easyocr, azure, validation]
WEIGHT_MATRIX = {
    FieldType.HANDWRITTEN_DIGITS: [0.55, 0.10, 0.20, 0.15],
    FieldType.PRINTED_TEXT:       [0.00, 0.35, 0.50, 0.15],
    FieldType.HANDWRITTEN_WORDS:  [0.00, 0.25, 0.60, 0.15],
    FieldType.CHECKBOX:           [0.00, 0.00, 0.60, 0.40],
    FieldType.BINARY:             [0.00, 0.40, 0.40, 0.20],
}

# Dictionary of valid values for specific fields to apply dictionary boosts
FIELD_DICTIONARIES = {
    "gender": ["M", "F"],
    "consent": ["Yes", "No", "Unanswered"],
    "class": [str(i) for i in range(1, 13)]
}

def compute_consensus(
    field_name: str,
    results: List[RecognitionResult],
    field_type: Optional[FieldType] = None
) -> ConsensusVote:
    """
    Weighted consensus voting across all OCR results.
    Applies validation boosts/penalties and dictionary matching.
    """
    if not results:
        return ConsensusVote(text="", weight=0.0, votes=0)

    if field_type is None:
        field_type = FIELD_TYPE_MAP.get(field_name, FieldType.PRINTED_TEXT)

    weights = WEIGHT_MATRIX.get(field_type, [0.0, 0.35, 0.50, 0.15])
    source_weights = {
        "digit_cnn":    weights[0],
        "easyocr":      weights[1],
        "paddleocr":    weights[1],  # Paddle gets same weight as EasyOCR
        "surya":        weights[1] * 1.2, # Surya gets slightly higher weight
        "azure":        weights[2],
        "azure_cached": weights[2]
    }

    votes: Dict[str, ConsensusVote] = {}
    
    for r in results:
        # Standardize empty/None text
        val = (r.normalized or r.text or "").strip()
        if not val:
            continue
            
        weight = source_weights.get(r.engine, 0.10)
        
        # 1. Base Score calculation
        score = weight * r.confidence
        
        # 2. Validation Boost / Penalty
        norm_val, is_valid, penalty, reason = validate_field(field_name, val)
        if is_valid:
            score *= 1.5  # Boost score by 50%
        else:
            score *= 0.2  # Slash score by 80%
            
        # 3. Dictionary Boost
        dict_words = FIELD_DICTIONARIES.get(field_name)
        if dict_words and norm_val in dict_words:
            score *= 1.3
            
        if norm_val not in votes:
            votes[norm_val] = ConsensusVote(
                text=norm_val,
                weight=0.0,
                votes=0,
                sources=[],
                per_char_confidences=[]
            )
            
        v = votes[norm_val]
        v.weight += score
        v.votes += 1
        v.sources.append(f"{r.engine}({r.confidence:.2f})")
        if r.per_char_confidences:
            if not v.per_char_confidences:
                v.per_char_confidences = r.per_char_confidences

    if not votes:
        # Fallback to the highest confidence original prediction
        highest = max(results, key=lambda r: r.confidence, default=None)
        if highest:
            return ConsensusVote(text=highest.text, weight=highest.confidence * 0.1, votes=1, sources=[highest.engine])
        return ConsensusVote(text="", weight=0.0, votes=0)

    # Pick candidate with highest consensus weight
    best_candidate = max(votes.values(), key=lambda v: v.weight)
    
    # Clamp final weight to 1.0
    best_candidate.weight = float(min(1.0, best_candidate.weight))
    return best_candidate
