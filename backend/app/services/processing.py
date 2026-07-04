import os
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
import signal
import time
import threading
import shutil
import cv2
import numpy as np
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.config import TEMPLATES_DIR, TEMP_DIR, TEMPLATE_PDF, PROCESSING_TIMEOUT, TEMP_TTL_HOURS
from app.database import (
    update_document_status, insert_or_update_form_data, get_pdf, store_page_image
)
from app.pipeline import (
    render_pdf_to_arrays, detect_consent, ZOOM
)
from app.modules.storage import store_roi_disk
from app.modules.preprocessing import assess_image_quality, select_and_apply_preprocessing
from app.modules.alignment import align_page_hierarchical
from app.modules.roi import extract_dynamic_roi, ROIS_P1_POINTS, ROIS_P2_POINTS, ROIS_REMARKS_POINTS
from app.modules.checkbox import detect_checkboxes, CheckboxState
from app.modules import FieldType, FIELD_TYPE_MAP, RecognitionResult, SDQ_FIELDS
from app.modules.digit_engine import get_digit_engine
from app.modules.recognition import get_recognition_router
from app.modules.consensus import compute_consensus
from app.modules.validation import validate_field, check_cross_field_consistency
from app.modules.confidence import fuse_confidence_bayesian
from app.modules.azure_billing import get_billing_manager
from app.sse import notify as notify_sse

_executor = ThreadPoolExecutor(max_workers=2)

def get_executor() -> ThreadPoolExecutor:
    return _executor

def init_templates():
    p1_path = os.path.join(TEMPLATES_DIR, "template_p1.png")
    p2_path = os.path.join(TEMPLATES_DIR, "template_p2.png")
    
    # Generate templates if they do not exist
    if not os.path.exists(p1_path) or not os.path.exists(p2_path):
        if os.path.exists(TEMPLATE_PDF):
            try:
                import fitz
                doc = fitz.open(TEMPLATE_PDF)
                for i in range(min(2, len(doc))):
                    page = doc[i]
                    mat = fitz.Matrix(ZOOM, ZOOM)
                    pix = page.get_pixmap(matrix=mat)
                    out_path = os.path.join(TEMPLATES_DIR, f"template_p{i+1}.png")
                    pix.save(out_path)
                print("Extracted template images successfully.")
            except Exception as e:
                print(f"Error extracting templates: {str(e)}")

def is_crop_empty(crop: np.ndarray) -> bool:
    """Checks if the inner 80% region of the crop is blank (excluding cell borders)."""
    if crop is None or crop.size == 0:
        return True
    h, w = crop.shape[:2]
    margin_y = int(h * 0.1)
    margin_x = int(w * 0.1)
    inner = crop[margin_y:h-margin_y, margin_x:w-margin_x]
    if inner.size == 0:
        return True
    gray = cv2.cvtColor(inner, cv2.COLOR_BGR2GRAY) if len(inner.shape) == 3 else inner.copy()
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    ink_ratio = np.sum(binary > 0) / max(binary.size, 1)
    return ink_ratio < 0.012

def start_cleanup_thread():
    pass  # We don't write intermediate temp files anymore, so cleanup is not strictly necessary but we can keep it as a no-op

def process_pdf_background(doc_id: str, auto_verify: bool = False):
    try:
        # 1. Fetch PDF bytes from database (originally stored)
        pdf_bytes = get_pdf(doc_id)
        if not pdf_bytes:
            raise ValueError("PDF data not found")

        # 2. Render PDF to images in-memory (stay in RAM, no temp PNGs written!)
        pages = render_pdf_to_arrays(pdf_bytes)
        if len(pages) < 1:
            raise ValueError("PDF has no pages")

        has_page2 = len(pages) >= 2
        p1_raw = pages[0]
        p2_raw = pages[1] if has_page2 else None

        # 3. Quality Assessment & Hierarchical Alignment (on raw images)
        q_report_p1 = assess_image_quality(p1_raw)
        q_report_p2 = assess_image_quality(p2_raw) if has_page2 else None

        # Load template images
        p1_temp = cv2.imread(os.path.join(TEMPLATES_DIR, "template_p1.png"))
        p2_temp = cv2.imread(os.path.join(TEMPLATES_DIR, "template_p2.png")) if has_page2 else None

        if p1_temp is None:
            aligned_p1_raw = cv2.resize(p1_raw, (2483, 3508))
            align_method_p1 = "resize_fallback"
        else:
            aligned_p1_raw, _, align_method_p1 = align_page_hierarchical(p1_raw, p1_temp)

        aligned_p2_raw = None
        align_method_p2 = "none"
        if has_page2:
            if p2_temp is None:
                aligned_p2_raw = cv2.resize(p2_raw, (2483, 3508))
                align_method_p2 = "resize_fallback"
            else:
                aligned_p2_raw, _, align_method_p2 = align_page_hierarchical(p2_raw, p2_temp)

        # 4. Adaptive Preprocessing (applied on aligned raw images)
        aligned_p1 = select_and_apply_preprocessing(aligned_p1_raw, q_report_p1)
        aligned_p2 = select_and_apply_preprocessing(aligned_p2_raw, q_report_p2) if has_page2 else None

        # 5. Extract Checkboxes (consent and q1..q25)
        # Checkboxes are processed using dynamic contour and stroke patterns
        from app.pipeline import P1_Y_RANGES, P2_Y_RANGES, COLS_X_PTS
        cb_results_p1 = detect_checkboxes(aligned_p1_raw, 1, P1_Y_RANGES, COLS_X_PTS, ZOOM)
        cb_results_p2 = detect_checkboxes(aligned_p2_raw, 2, P2_Y_RANGES, COLS_X_PTS, ZOOM) if has_page2 else {}

        responses = {}
        cb_confidences = {}
        multi_ticks = {}
        
        all_cb_results = {**cb_results_p1, **cb_results_p2}
        for q_num, (col, state, conf, all_cols, is_multi) in all_cb_results.items():
            responses[f"q{q_num}"] = col
            cb_confidences[f"q{q_num}"] = state
            multi_ticks[f"q{q_num}"] = col if is_multi else [col]

        consent_val = detect_consent(aligned_p1_raw)

        # 6. Extract and Classify Text Fields
        fields_data = {}
        fields_validation = {}
        fields_confidence = {}
        
        # Fields list
        rois_p1 = ["roll_number", "class", "dob", "gender"]
        rois_p2 = ["math_pct", "science_pct", "language_pct", "rank", "remarks"] if has_page2 else []
        all_text_fields = rois_p1 + rois_p2

        # Initialize engines
        digit_engine = get_digit_engine()
        text_router = get_recognition_router()
        billing_manager = get_billing_manager()

        for field_name in all_text_fields:
            page = aligned_p1 if field_name in rois_p1 else aligned_p2
            page_num = 1 if field_name in rois_p1 else 2
            
            # Dynamic ROI Extraction with 20% padding
            crop = extract_dynamic_roi(page, field_name, page_num)
            if crop is None or crop.size == 0:
                fields_data[field_name] = ""
                fields_confidence[field_name] = 0.0
                fields_validation[field_name] = "invalid"
                continue

            # Save ROI crop separately on disk (extract from raw page for human readability)
            raw_page = aligned_p1_raw if field_name in rois_p1 else aligned_p2_raw
            raw_crop = extract_dynamic_roi(raw_page, field_name, page_num)
            if raw_crop is not None and raw_crop.size > 0:
                store_roi_disk(doc_id, field_name, raw_crop)
            else:
                store_roi_disk(doc_id, field_name, crop)

            field_type = FIELD_TYPE_MAP.get(field_name, FieldType.PRINTED_TEXT)
            rec_results = []

            # Routing based on field classification
            if field_type == FieldType.HANDWRITTEN_DIGITS:
                # 1. Run local Digit CNN
                cnn_res = digit_engine.predict_number(crop)
                norm_val, is_valid = validate_field(field_name, cnn_res.text)[0:2]
                rec_results.append(RecognitionResult(
                    text=cnn_res.text,
                    confidence=cnn_res.confidence,
                    engine="digit_cnn",
                    field_name=field_name,
                    is_valid=is_valid,
                    normalized=norm_val,
                    per_char_confidences=[d.confidence for d in cnn_res.per_digit]
                ))

                # 2. Run EasyOCR as fallback
                easy_plugin = text_router.get_plugin("easyocr")
                if easy_plugin:
                    easy_res = easy_plugin.recognize(crop, field_name)
                    if easy_res:
                        norm_val, is_valid = validate_field(field_name, easy_res.text)[0:2]
                        rec_results.append(RecognitionResult(
                            text=easy_res.text,
                            confidence=easy_res.confidence,
                            engine="easyocr",
                            field_name=field_name,
                            is_valid=is_valid,
                            normalized=norm_val
                        ))

            elif field_type == FieldType.PRINTED_TEXT or field_type == FieldType.BINARY:
                # Layer 1: Fast local OCR plugins (EasyOCR, PaddleOCR)
                fast_engines = ["easyocr", "paddleocr"]
                for name in fast_engines:
                    plugin = text_router.get_plugin(name)
                    if plugin:
                        res = plugin.recognize(crop, field_name)
                        if res:
                            norm_val, is_valid = validate_field(field_name, res.text)[0:2]
                            rec_results.append(RecognitionResult(
                                text=res.text,
                                confidence=res.confidence,
                                engine=name,
                                field_name=field_name,
                                is_valid=is_valid,
                                normalized=norm_val
                            ))
                
                # Compute fast local consensus to check if fallback is needed
                consensus = compute_consensus(field_name, rec_results, field_type)
                norm_val, is_valid = validate_field(field_name, consensus.text)[0:2]
                
                # Layer 2: Heavy local OCR (Surya) only if fast engines failed or returned low confidence
                if consensus.weight < 0.70 or not is_valid:
                    surya_plugin = text_router.get_plugin("surya")
                    if surya_plugin:
                        surya_res = surya_plugin.recognize(crop, field_name)
                        if surya_res:
                            s_norm, s_valid = validate_field(field_name, surya_res.text)[0:2]
                            rec_results.append(RecognitionResult(
                                text=surya_res.text,
                                confidence=surya_res.confidence,
                                engine="surya",
                                field_name=field_name,
                                is_valid=s_valid,
                                normalized=s_norm
                            ))

            elif field_type == FieldType.HANDWRITTEN_WORDS:  # remarks
                # Use local engine or EasyOCR
                easy_plugin = text_router.get_plugin("easyocr")
                if easy_plugin:
                    easy_res = easy_plugin.recognize(crop, field_name)
                    if easy_res:
                        rec_results.append(RecognitionResult(
                            text=easy_res.text,
                            confidence=easy_res.confidence,
                            engine="easyocr",
                            field_name=field_name,
                            is_valid=True,
                            normalized=easy_res.text
                        ))

            # Compute local consensus voting
            consensus = compute_consensus(field_name, rec_results, field_type)
            norm_val, is_valid = validate_field(field_name, consensus.text)[0:2]
            
            # 7. Azure Cost Reduction - Cloud Fallback Last Resort
            # If local recognition failed, has low confidence (< 0.60), or is invalid, call Azure crop DI
            if (consensus.weight < 0.60 or not is_valid) and not is_crop_empty(crop):
                if field_name in ROIS_P1_POINTS:
                    page_num = 1
                    aligned_page_img = aligned_p1_raw
                    roi_rect = ROIS_P1_POINTS[field_name]
                elif field_name in ROIS_P2_POINTS:
                    page_num = 2
                    aligned_page_img = aligned_p2_raw
                    roi_rect = ROIS_P2_POINTS[field_name]
                elif field_name in ROIS_REMARKS_POINTS:
                    page_num = 2
                    aligned_page_img = aligned_p2_raw
                    roi_rect = ROIS_REMARKS_POINTS[field_name]
                else:
                    page_num = 1
                    aligned_page_img = aligned_p1_raw
                    roi_rect = (0.0, 0.0, 0.0, 0.0)

                azure_res = billing_manager.recognize_field_with_backoff(
                    doc_id=doc_id,
                    field_name=field_name,
                    aligned_page_img=aligned_page_img,
                    page_num=page_num,
                    roi_rect=roi_rect,
                    crop=crop
                )
                if azure_res:
                    az_text, az_conf = azure_res
                    az_norm, az_valid = validate_field(field_name, az_text)[0:2]
                    
                    # Add Azure result to consensus candidates and recompute
                    rec_results.append(RecognitionResult(
                        text=az_text,
                        confidence=az_conf,
                        engine="azure",
                        field_name=field_name,
                        is_valid=az_valid,
                        normalized=az_norm
                    ))
                    consensus = compute_consensus(field_name, rec_results, field_type)
                    norm_val, is_valid = validate_field(field_name, consensus.text)[0:2]

            # 8. Bayesian Confidence Fusion
            align_method = align_method_p1 if field_name in rois_p1 else align_method_p2
            img_quality = q_report_p1["quality"] if field_name in rois_p1 else q_report_p2["quality"]
            
            fused_conf = fuse_confidence_bayesian(
                ocr_conf=consensus.weight,
                is_valid=is_valid,
                img_quality=img_quality,
                alignment_method=align_method,
                roi_refined=True,
                consensus_weight=consensus.weight
            )

            fields_data[field_name] = norm_val
            fields_confidence[field_name] = fused_conf
            fields_validation[field_name] = "valid" if is_valid else "invalid"

        # 9. Cross-Field Consistency Checks
        cross_ok, cross_penalty, cross_reason = check_cross_field_consistency(fields_data)
        if not cross_ok:
            print(f"Cross-field check failed: {cross_reason}. Applying penalty: -{cross_penalty}")
            for fn in fields_confidence:
                fields_confidence[fn] = float(max(0.01, fields_confidence[fn] - cross_penalty))

        # 10. Escalation Level Assignment
        any_invalid = any(v == "invalid" for v in fields_validation.values())
        any_low_conf = any(c < 0.70 for c in fields_confidence.values())
        any_cb_ambiguous = any(s in ("partial", "double_mark") for s in cb_confidences.values())
        low_quality = q_report_p1["quality"] < 50 or (has_page2 and q_report_p2["quality"] < 50)
        
        if low_quality:
            escalation_level = "level_4"  # Poor quality scan
        elif align_method_p1 == "resize_fallback" or (has_page2 and align_method_p2 == "resize_fallback"):
            escalation_level = "level_3"  # Alignment issue
        elif any_invalid or any_low_conf or any_cb_ambiguous or consent_val == "Unanswered":
            escalation_level = "level_2"  # Data validation warning
        else:
            escalation_level = "level_1"  # Perfectly clean

        status = "verified" if (auto_verify and escalation_level == "level_1") else "needs_review"

        # 11. Write results and images to storage (avoiding SQLite blobs!)
        # Save aligned pages as compressed JPEGs to disk
        aligned_p1_bytes = cv2.imencode('.jpg', aligned_p1_raw)[1].tobytes()
        store_page_image(doc_id, 1, aligned_p1_bytes)
        if has_page2:
            aligned_p2_bytes = cv2.imencode('.jpg', aligned_p2_raw)[1].tobytes()
            store_page_image(doc_id, 2, aligned_p2_bytes)

        # Structure form data JSONs
        academic_scores = {
            "math_pct": fields_data.get("math_pct", ""),
            "science_pct": fields_data.get("science_pct", ""),
            "language_pct": fields_data.get("language_pct", ""),
            "rank": fields_data.get("rank", "")
        }

        # Clear remarks if empty
        remarks_val = fields_data.get("remarks", "")

        insert_or_update_form_data(
            doc_id=doc_id,
            roll_number=fields_data.get("roll_number", ""),
            class_val=fields_data.get("class", ""),
            dob=fields_data.get("dob", ""),
            gender=fields_data.get("gender", ""),
            consent=consent_val,
            responses=responses,
            academic_scores=academic_scores,
            remarks=remarks_val,
            confidence_scores={
                "ocr": fields_confidence,
                "checkbox": cb_confidences,
                "multi_ticks": multi_ticks,
            },
            quality_report=q_report_p1,
            verified=1 if status == "verified" else 0
        )

        update_document_status(doc_id, status, escalation_level)
        print(f"Finished processing document: {doc_id} -> Status: {status} [Escalation: {escalation_level}]")
        notify_sse("document_updated", {"doc_id": doc_id, "status": status, "escalation_level": escalation_level})

    except Exception as e:
        import traceback
        traceback.print_exc()
        update_document_status(doc_id, "failed", "level_4")
        notify_sse("document_updated", {"doc_id": doc_id, "status": "failed", "escalation_level": "level_4"})
