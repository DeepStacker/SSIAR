import os
os.environ.setdefault("HF_HUB_OFFLINE", "1")
import signal
import time
import threading
import shutil
import cv2
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from app.config import TEMPLATES_DIR, TEMP_DIR, TEMPLATE_PDF, PROCESSING_TIMEOUT, TEMP_TTL_HOURS, MAX_WORKERS
from app.database import (
    update_document_status, insert_or_update_form_data, get_pdf, store_page_image
)
from app.image.pdf import (
    render_pdf_to_arrays, detect_consent, ZOOM
)
from app.image.storage import store_roi_disk
from app.image.preprocessing import assess_image_quality, select_and_apply_preprocessing
from app.image.alignment import align_page_hierarchical
from app.image.roi import extract_dynamic_roi, detect_table_lines, ROIS_P1_POINTS, ROIS_P2_POINTS, ROIS_REMARKS_POINTS
from app.image.checkbox import detect_checkboxes, CheckboxState

from app.validation.fields import validate_field, check_cross_field_consistency
from app.confidence import fuse_confidence_weighted_product
from app.ocr.plugin import AzureOCRPlugin
from app.services.azure import get_billing_manager
from app.ocr.blank import is_blank_crop
from app.sse import notify as notify_sse

_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)

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

        local_zones_p1 = {}
        if p1_temp is None:
            aligned_p1_raw = cv2.resize(p1_raw, (2483, 3508))
            align_method_p1 = "resize_fallback"
        else:
            aligned_p1_raw, local_zones_p1, align_method_p1 = align_page_hierarchical(p1_raw, p1_temp)

        aligned_p2_raw = None
        align_method_p2 = "none"
        local_zones_p2 = {}
        if has_page2:
            if p2_temp is None:
                aligned_p2_raw = cv2.resize(p2_raw, (2483, 3508))
                align_method_p2 = "resize_fallback"
            else:
                aligned_p2_raw, local_zones_p2, align_method_p2 = align_page_hierarchical(p2_raw, p2_temp)

        # 4. Adaptive Preprocessing (applied on aligned raw images)
        aligned_p1 = select_and_apply_preprocessing(aligned_p1_raw, q_report_p1)
        aligned_p2 = select_and_apply_preprocessing(aligned_p2_raw, q_report_p2) if has_page2 else None

        # 5. Extract Checkboxes (consent and q1..q25)
        # Checkboxes are processed using dynamic contour and stroke patterns
        from app.image.pdf import P1_Y_RANGES, P2_Y_RANGES, COLS_X_PTS
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

        billing_manager = get_billing_manager()

        # Precompute table lines once per page (avoids 18+ redundant detect_table_lines calls)
        from app.image.roi import detect_table_lines as _detect_table_lines
        h_mask_p1, v_mask_p1 = _detect_table_lines(aligned_p1)
        h_mask_p2 = v_mask_p2 = None
        if has_page2 and aligned_p2 is not None:
            h_mask_p2, v_mask_p2 = _detect_table_lines(aligned_p2)

        # Pre-analyze pages with Azure (once per page, then cached — 2 API calls per doc total)
        if AzureOCRPlugin().is_available():
            billing_manager.pre_analyze_pages(doc_id, aligned_p1_raw, aligned_p2_raw)

        FIELD_WORKERS = min(4, len(all_text_fields)) if len(all_text_fields) > 1 else 1

        def _get_roi_rect(field_name: str):
            if field_name in ROIS_P1_POINTS:
                return ROIS_P1_POINTS[field_name], 1
            if field_name in ROIS_P2_POINTS:
                return ROIS_P2_POINTS[field_name], 2
            if field_name == "remarks":
                return ROIS_REMARKS_POINTS["remarks"], 2
            return None, 0

        def _process_one_field(field_name: str) -> tuple:
            is_p1 = field_name in rois_p1
            page = aligned_p1 if is_p1 else aligned_p2
            page_num = 1 if is_p1 else 2
            h_mask = h_mask_p1 if is_p1 else h_mask_p2
            v_mask = v_mask_p1 if is_p1 else v_mask_p2
            raw_page = aligned_p1_raw if is_p1 else aligned_p2_raw

            crop = extract_dynamic_roi(page, field_name, page_num, h_mask, v_mask)
            if crop is None or crop.size == 0 or is_blank_crop(crop):
                return field_name, "", 1.0, "blank"

            raw_crop = extract_dynamic_roi(raw_page, field_name, page_num, h_mask, v_mask)
            store_roi_disk(doc_id, field_name, raw_crop if (raw_crop is not None and raw_crop.size > 0) else crop)

            # Azure-only extraction from cached full-page result (ZERO additional API calls)
            roi_rect, az_page_num = _get_roi_rect(field_name)
            az_text = ""
            az_conf = 0.0
            az_valid = False
            if roi_rect is not None:
                azure_res = billing_manager.recognize_field_with_backoff(
                    doc_id=doc_id,
                    field_name=field_name,
                    aligned_page_img=raw_page,
                    page_num=az_page_num,
                    roi_rect=roi_rect,
                    crop=crop
                )
                if azure_res:
                    az_text, az_conf = azure_res
                    norm_val, az_valid = validate_field(field_name, az_text)[0:2]
                    az_text = norm_val

            align_method = align_method_p1 if is_p1 else align_method_p2
            img_quality = q_report_p1["quality"] if is_p1 else q_report_p2["quality"]
            fused_conf = fuse_confidence_weighted_product(
                ocr_conf=az_conf,
                is_valid=az_valid,
                img_quality=img_quality,
                alignment_method=align_method,
                roi_refined=True
            )
            return field_name, az_text, fused_conf, "valid" if az_valid else "invalid"

        with ThreadPoolExecutor(max_workers=FIELD_WORKERS) as field_executor:
            field_futures = {field_executor.submit(_process_one_field, fn): fn for fn in all_text_fields}
            for future in as_completed(field_futures):
                fn = field_futures[future]
                try:
                    field_name, norm_val, fused_conf, valid_str = future.result(timeout=60)
                    fields_data[field_name] = norm_val
                    fields_confidence[field_name] = fused_conf
                    fields_validation[field_name] = valid_str
                except (TimeoutError, Exception) as e:
                    print(f"Field {fn} timed out or failed: {e}")
                    fields_data[fn] = ""
                    fields_confidence[fn] = 0.01
                    fields_validation[fn] = "invalid"

        # 9. Cross-Field Consistency Checks
        cross_ok, cross_penalty, cross_reason = check_cross_field_consistency(fields_data)
        if not cross_ok:
            print(f"Cross-field check failed: {cross_reason}. Applying penalty: -{cross_penalty}")
            for fn in fields_confidence:
                fields_confidence[fn] = float(max(0.01, fields_confidence[fn] - cross_penalty))

        # 10. Escalation Level Assignment
        # Core fields gate auto-verify; checkbox flags are informational only
        CORE_FIELDS = {"roll_number", "class", "dob", "gender"}
        any_invalid = any(fields_validation.get(f) == "invalid" for f in CORE_FIELDS)
        any_core_low_conf = any(fields_confidence.get(f, 1) < 0.50 for f in CORE_FIELDS)
        any_cb_ambiguous = any(s in ("partial", "double_mark") for s in cb_confidences.values())
        low_quality = q_report_p1["quality"] < 50 or (has_page2 and q_report_p2["quality"] < 50)
        
        if low_quality:
            escalation_level = "level_4"  # Poor quality scan
        elif align_method_p1 == "resize_fallback" or (has_page2 and align_method_p2 == "resize_fallback"):
            escalation_level = "level_3"  # Alignment issue
        elif any_invalid or any_core_low_conf:
            escalation_level = "level_2"  # Core field validation warning
        else:
            escalation_level = "level_1"  # All core fields valid with acceptable confidence

        # Auto-verify if core fields are solid (checkbox flags don't block verification)
        status = "verified" if auto_verify and escalation_level == "level_1" else "needs_review"

        # 11. Write results and images to storage (avoiding SQLite blobs!)
        # Save aligned pages as compressed JPEGs to disk
        aligned_p1_bytes = cv2.imencode('.jpg', aligned_p1_raw)[1].tobytes()
        store_page_image(doc_id, 1, aligned_p1_bytes)
        if has_page2:
            aligned_p2_bytes = cv2.imencode('.jpg', aligned_p2_raw)[1].tobytes()
            store_page_image(doc_id, 2, aligned_p2_bytes)

        # Structure form data JSONs
        # Note: Only math_pct, science_pct, language_pct are extracted because
        # the SDQ form only has Math, Science, and Language subjects (no Hindi).
        # The ROI coordinates in roi.py define exactly 3 subject percentage fields.
        # If a Hindi field is added to the form in the future, a new ROI point,
        # a validation entry, and extraction logic here would be needed.
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
