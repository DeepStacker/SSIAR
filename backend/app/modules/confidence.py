import numpy as np

def fuse_confidence_bayesian(
    ocr_conf: float,
    is_valid: bool,
    img_quality: float,
    alignment_method: str,
    roi_refined: bool,
    consensus_weight: float
) -> float:
    """
    Computes a fused final confidence score using a penalized multiplier approach.
    """
    base_conf = max(0.0, min(1.0, ocr_conf))
    
    # If the field has virtually no OCR confidence, the fused confidence is 0
    if base_conf <= 0.01:
        return 0.0
        
    # Validation multiplier: heavily penalize if invalid
    val_mult = 1.0 if is_valid else 0.1
    
    # Quality multiplier: penalize poor quality
    q_mult = max(0.5, min(1.0, img_quality / 100.0))
    
    # Alignment multiplier
    align_probs = {
        "orb": 1.0,
        "akaze": 0.95,
        "sift": 0.95,
        "ecc": 0.85,
        "resize_fallback": 0.50
    }
    p_align = align_probs.get(alignment_method, 0.50)
    
    # ROI refinement multiplier
    p_roi = 1.0 if roi_refined else 0.8
    
    # Consensus multiplier
    p_cons = max(0.2, min(1.0, consensus_weight))
    
    fused_conf = base_conf * val_mult * q_mult * p_align * p_roi * p_cons
    return float(max(0.0, min(1.0, fused_conf)))
