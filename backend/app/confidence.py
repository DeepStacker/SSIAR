def fuse_confidence_weighted_product(
    ocr_conf: float,
    is_valid: bool,
    img_quality: float,
    alignment_method: str,
    roi_refined: bool = True,
    consensus_weight: float = 1.0
) -> float:
    base_conf = max(0.0, min(1.0, ocr_conf))

    if base_conf <= 0.01:
        return 0.0

    val_score = 1.0 if is_valid else 0.4

    if img_quality >= 50:
        q_score = 1.0
    else:
        q_score = max(0.7, img_quality / 100.0)

    align_score = 0.6 if alignment_method == "resize_fallback" else 1.0
    roi_score = 1.0 if roi_refined else 0.9

    fused_conf = (
        0.55 * base_conf
        + 0.20 * val_score
        + 0.10 * q_score
        + 0.10 * align_score
        + 0.05 * roi_score
    )

    if not is_valid:
        fused_conf = min(fused_conf, 0.5)

    return float(max(0.0, min(1.0, fused_conf)))
