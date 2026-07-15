"""
Document Processing Jobs (Modules 1-2)
========================================
Defines the job queue types, worker pool, and orchestration for document processing.
Replaces synchronous `Upload → Wait → OCR → Wait → Result` with async:
    Upload → Return → Process in background → Notify user

Public API re-exports from sub-modules for backward compatibility:
  - JobType, JobQueue, get_job_queue, get_worker_count from job_queue
  - resolve_page_selection_marks, check_checkbox_density from page_processing
"""
import os
import json
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from app.database import get_db_connection, put_conn
from app.core.events import notify as notify_sse

# Re-export public API from extracted modules
from .job_queue import JobType, JobQueue, get_job_queue, get_worker_count
from .page_processing import resolve_page_selection_marks, check_checkbox_density


# ── Document Processing Orchestrator ─────────────────────────────────────────

def process_document_background(
    doc_id: str,
    pdf_bytes: bytes,
    filename: str,
    auto_verify: bool = False,
    user_id: Optional[str] = None,
):
    """
    Full document processing pipeline running in background.
    Orchestrates: upload → processing → validation → review decision.

    This is the V2 replacement for `process_pdf_background`.
    """
    try:
        import cv2
        # Delete existing ROI files from disk to force re-cropping
        from app.image.storage import PROCESSED_DIR
        doc_dir = PROCESSED_DIR / doc_id
        if doc_dir.exists():
            for f in doc_dir.iterdir():
                if f.name.startswith("roi_") and f.name.endswith(".jpg"):
                    try:
                        f.unlink()
                    except Exception:
                        pass

        # 1. Update status
        _update_doc_status(doc_id, "processing", user_id=user_id)
        notify_sse("document_updated", {
            "doc_id": doc_id, "status": "processing"
        }, user_id=user_id)

        # Clear any historical review tasks for this document before running reprocessing
        from app.database import get_db_connection, put_conn, USE_POSTGRES
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "DELETE FROM review_tasks WHERE document_id = %s" if USE_POSTGRES else
                "DELETE FROM review_tasks WHERE document_id = ?",
                (doc_id,)
            )
            conn.commit()
        finally:
            put_conn(conn)

        # 2. Render and process
        pages = []
        if pdf_bytes:
            from app.image.pdf import render_pdf_to_arrays
            raw_pages = render_pdf_to_arrays(pdf_bytes)

            # Apply morphological closing background normalization (shadow removal/contrast enhancement)
            # to make the page extremely clean and enhance detection without creating burned concrete marks.
            for img in raw_pages:
                try:
                    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (31, 31))
                    channels = cv2.split(img)
                    enhanced_channels = []
                    for ch in channels:
                        bg = cv2.morphologyEx(ch, cv2.MORPH_CLOSE, kernel)
                        norm = cv2.divide(ch, bg, scale=255)
                        enhanced_channels.append(norm)
                    enhanced_img = cv2.merge(enhanced_channels)
                    pages.append(enhanced_img)
                except Exception:
                    pages.append(img)

            # Release raw pages container immediately
            raw_pages = None
            import gc
            gc.collect()

            # Save page images to database
            from app.database import store_page_image
            for i, page_img in enumerate(pages):
                _, jpeg_buf = cv2.imencode('.jpg', page_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
                store_page_image(doc_id, i + 1, jpeg_buf.tobytes())
                jpeg_buf = None
            gc.collect()
        else:
            # Load existing page images from disk
            from app.image.storage import PROCESSED_DIR
            i = 1
            while True:
                page_path = PROCESSED_DIR / doc_id / f"page_{i}.jpg"
                if not page_path.exists():
                    page_path = PROCESSED_DIR / doc_id / f"page_{i}.png"
                if not page_path.exists():
                    break
                img = cv2.imread(str(page_path))
                if img is not None:
                    pages.append(img)
                i += 1

        # 3. Classify pages
        from app.image.pdf import classify_document
        temp_img_path = f"shared/temp/{doc_id}_first_page.png"
        os.makedirs("shared/temp", exist_ok=True)
        cv2.imwrite(temp_img_path, pages[0])
        try:
            classification = classify_document(temp_img_path)
            classification["pages"] = len(pages)
        except Exception:
            classification = {
                "type": "scanned", "dpi": 300, "pages": len(pages), "is_color": False
            }
        finally:
            if os.path.exists(temp_img_path):
                try:
                    os.remove(temp_img_path)
                except Exception:
                    pass

        # Update document classification in DB
        from app.database import get_db_connection, put_conn, USE_POSTGRES
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "UPDATE documents SET classification = %s WHERE id = %s" if USE_POSTGRES else
                "UPDATE documents SET classification = ? WHERE id = ?",
                (json.dumps(classification), doc_id)
            )
            conn.commit()
        finally:
            put_conn(conn)

        # 4. Check for cached Azure response (skip expensive API calls during re-processing)
        from app.processing.azure_processor import normalize_azure_response
        cached_raw = _load_cached_azure_response(doc_id)

        # Check if the cached response is complete for all physical pages
        is_cache_complete = False
        if cached_raw:
            is_cache_complete = True
            for idx in range(len(pages)):
                pg_key = f"page_{idx+1}"
                sub_res = cached_raw.get(pg_key, {})
                if not sub_res or not isinstance(sub_res, dict) or not sub_res.get("pages"):
                    is_cache_complete = False
                    break

        if is_cache_complete:
            print(f"[{doc_id}] Reusing cached Azure response (skipping API call)")
            raw_responses = cached_raw
            combined_normalized = normalize_azure_response(doc_id, cached_raw)
        else:
            if cached_raw:
                print(f"[{doc_id}] Cached Azure response is incomplete! Regenerating...")
            cached_raw = None

            # 4b. Send to Azure Document Intelligence (whole pages) in parallel
            from app.ocr.plugin import AzureOCRPlugin
            plugin = AzureOCRPlugin()
            azure_full_page_results = [None] * len(pages)

            if plugin.is_available():
                from concurrent.futures import ThreadPoolExecutor
                def analyze_single_page(idx, page_img):
                    try:
                        return idx, plugin.recognize_page(page_img)
                    except Exception as e:
                        print(f"Azure analysis failed for page {idx+1}: {e}")
                        return idx, None

                with ThreadPoolExecutor(max_workers=len(pages)) as executor:
                    futures = [
                        executor.submit(analyze_single_page, i, page_img)
                        for i, page_img in enumerate(pages)
                    ]
                    for fut in futures:
                        idx, result = fut.result()
                        azure_full_page_results[idx] = result

            # 5. Normalize Azure response
            raw_responses = {}
            use_detection = len(pages) != 2
            for i, (page_img, azure_res) in enumerate(
                zip(pages, azure_full_page_results or [None] * len(pages))
            ):
                if azure_res:
                    normalized = normalize_azure_response(doc_id, azure_res)

                    detected_page = i + 1
                    if use_detection:
                        page_text = ""
                        if normalized.pages:
                            page_text = " ".join(el.text for el in normalized.pages[0].elements)
                        detected_page = detect_form_page(page_text)

                    raw_responses[f"page_{detected_page}"] = normalized.raw_response

            # Store raw Azure response for future reuse
            _store_azure_response(doc_id, raw_responses)

            # 6. Normalize all pages together
            combined_normalized = _combine_normalized_responses(doc_id, azure_full_page_results)

        _update_doc_status(doc_id, "azure_completed", user_id=user_id)
        notify_sse("document_updated", {
            "doc_id": doc_id, "status": "azure_completed"
        }, user_id=user_id)

        # 7. Resolve selection marks and consent
        responses = {}
        consent = "Unanswered"
        cb_confidences = {}
        cb_polygons = {}
        cb_resolved_pages = {}
        if combined_normalized:
            for i in range(len(pages)):
                is_p2 = (i == 1)
                page_obj = None
                for p in combined_normalized.pages:
                    if p.page == (i + 1):
                        page_obj = p
                        break
                if page_obj:
                    p_resp, p_consent, p_conf, p_poly = resolve_page_selection_marks(
                        page_obj.elements, is_p2, page_obj.width, page_obj.height,
                        raw_response=raw_responses, page_img=pages[i]
                    )
                    responses.update(p_resp)
                    cb_confidences.update(p_conf)
                    cb_polygons.update(p_poly)
                    for qk in p_resp:
                        cb_resolved_pages[qk] = i + 1
                    if not is_p2:
                        consent = p_consent

        # 8. Resolve fields using template
        from app.processing.templates import get_template
        from app.processing.field_resolver import resolve_field, normalize_value
        from app.processing.validation_engine import validate_field
        from app.processing.trust_confidence import (
            calculate_trust,
            determine_review_priority,
        )
        from app.processing.validation_engine import check_cross_field_consistency_v2

        from app.processing.templates import init_templates_v2
        init_templates_v2()
        template = get_template("sdq_student_form_v1")
        extracted_fields = {}
        validation_results = {}
        trust_confidences = {}
        polygons = {}
        resolved_pages = {}

        for fd in template.fields:
            try:
                text, conf, found, _, poly, res_page = resolve_field(fd, combined_normalized)
                normalized_text = normalize_value(text, fd.type) if found else ""
            except Exception as e:
                print(f"[{doc_id}] Field resolution failed for {fd.name}: {e}")
                text, conf, found, _, poly, res_page = "", 0.0, False, None, None, 1
                normalized_text = ""

            extracted_fields[fd.name] = normalized_text
            polygons[fd.name] = poly
            resolved_pages[fd.name] = res_page

            # Validate
            try:
                vresult = validate_field(fd, normalized_text, extracted_fields)
            except Exception:
                from app.core.types import ValidationResult
                vresult = ValidationResult(
                    field_name=fd.name,
                    value=normalized_text,
                    is_valid=False,
                    reason="validation_error",
                )
            validation_results[fd.name] = vresult

            # Calculate trust
            try:
                trust = calculate_trust(
                    field_def=fd,
                    extracted_text=normalized_text,
                    azure_confidence=conf,
                    validation_result=vresult,
                )
            except Exception:
                from app.processing.trust_confidence import TrustConfidence
                trust = TrustConfidence()
            trust_confidences[fd.name] = trust

        # 9. Cross-field consistency check
        is_consistent, cross_penalty, cross_reason, inconsistent_fields = check_cross_field_consistency_v2(
            extracted_fields, validation_results
        )

        # Populate trust confidences for SDQ questions
        for q_num in range(1, 26):
            q_key = f"q{q_num}"
            q_conf = cb_confidences.get(q_key, 0.0)

            from app.processing.trust_confidence import TrustConfidence
            tc = TrustConfidence()
            tc.ocr_confidence = q_conf
            tc.validation_score = 1.0 if q_conf > 0.3 else 0.0
            tc.trust_confidence = q_conf
            tc.ambiguity_score = 0.0
            tc.cross_field_score = 1.0

            trust_confidences[q_key] = tc
            polygons[q_key] = cb_polygons.get(q_key)
            resolved_pages[q_key] = cb_resolved_pages.get(q_key, 2 if q_num >= 13 else 1)

        # Populate trust confidences for consent
        from app.processing.trust_confidence import TrustConfidence
        consent_tc = TrustConfidence()
        consent_tc.ocr_confidence = 1.0 if consent != "Unanswered" else 0.0
        consent_tc.validation_score = 1.0
        consent_tc.trust_confidence = 1.0 if consent != "Unanswered" else 0.5
        consent_tc.ambiguity_score = 0.0
        consent_tc.cross_field_score = 1.0
        trust_confidences["consent"] = consent_tc
        polygons["consent"] = cb_polygons.get("consent", [1550.0, 920.0, 2050.0, 920.0, 2050.0, 1070.0, 1550.0, 1070.0])
        resolved_pages["consent"] = 1

        if not is_consistent:
            for fn in inconsistent_fields:
                if fn in trust_confidences:
                    tc = trust_confidences[fn]
                    tc.cross_field_score = max(0.0, 1.0 - cross_penalty)
                    tc.trust_confidence = max(0.0, tc.trust_confidence - cross_penalty)

        _update_doc_status(doc_id, "validation_completed", user_id=user_id)

        # 10. Determine review needs and create review tasks
        review_fields = []
        from app.services.review_tasks import create_review_task
        for fd in template.fields:
            tc = trust_confidences.get(fd.name)
            if tc:
                priority = determine_review_priority(
                    tc.trust_confidence,
                    fd.review_priority.value == 1
                )
                if priority in ("critical", "low_trust"):
                    extracted_val = extracted_fields.get(fd.name, "")
                    if not fd.required and not extracted_val:
                        continue

                    review_fields.append(fd.name)
                    err_msg = ""
                    vresult = validation_results.get(fd.name)
                    if vresult and not getattr(vresult, "is_valid", True):
                        err_msg = getattr(vresult, "reason", "validation_failed")
                    create_review_task(
                        document_id=doc_id,
                        field_name=fd.name,
                        original_value=extracted_val,
                        priority=priority,
                        page_number=resolved_pages.get(fd.name, 1),
                        confidence_score=tc.trust_confidence,
                        error_details=err_msg
                    )
                    from app.database import log_issue
                    log_issue(
                        doc_id=doc_id,
                        issue_type="low_confidence" if priority == "low_trust" else "validation_error",
                        severity="warning",
                        field_name=fd.name,
                        description=err_msg or f"Trust confidence {tc.trust_confidence:.2f}",
                        details={"priority": priority, "confidence": tc.trust_confidence}
                    )

        # Create review tasks for SDQ questions if low trust
        for q_num in range(1, 26):
            q_key = f"q{q_num}"
            tc = trust_confidences.get(q_key)
            if tc:
                priority = determine_review_priority(
                    tc.trust_confidence,
                    is_critical=False
                )
                if priority in ("critical", "low_trust"):
                    review_fields.append(q_key)
                    q_val = responses.get(q_key, 0)
                    if isinstance(q_val, list):
                        err_msg = "multi_tick"
                        original_str = ",".join(map(str, q_val))
                    elif q_val == 0:
                        err_msg = "unanswered"
                        original_str = "0"
                    else:
                        err_msg = "low_confidence"
                        original_str = str(q_val)

                    create_review_task(
                        document_id=doc_id,
                        field_name=q_key,
                        original_value=original_str,
                        priority=priority,
                        page_number=resolved_pages.get(q_key, 2 if q_num >= 13 else 1),
                        confidence_score=tc.trust_confidence,
                        error_details=err_msg
                    )
                    from app.database import log_issue
                    log_issue(
                        doc_id=doc_id,
                        issue_type=err_msg if err_msg in ("multi_tick", "unanswered") else "low_confidence",
                        severity="warning",
                        field_name=q_key,
                        description=f"SDQ {q_key}: {err_msg}",
                        details={"priority": priority, "confidence": tc.trust_confidence}
                    )

        if review_fields:
            status = "needs_review"
            escalation = "level_2" if any(
                trust_confidences.get(f) and trust_confidences[f].trust_confidence < 0.5
                for f in review_fields
            ) else "level_1"
        else:
            status = "approved"
            escalation = "level_1"

        # 11. Store results
        _store_processed_results(
            doc_id, extracted_fields, validation_results,
            trust_confidences, cross_reason, review_fields,
            escalation, responses, consent, resolved_pages, polygons
        )

        _update_doc_status(doc_id, status, escalation, user_id=user_id)
        notify_sse("document_updated", {
            "doc_id": doc_id,
            "status": status,
            "escalation_level": escalation,
        }, user_id=user_id)

        from app.database import record_metric
        record_metric(doc_id, "processing_time_seconds", 0,
                      "seconds")  # TODO: track actual duration
        record_metric(doc_id, "review_fields_count", len(review_fields), "fields")
        if is_consistent is not None:
            record_metric(doc_id, "cross_field_consistent", 1.0 if is_consistent else 0.0)

        # Delete original uploaded PDF since we keep page images and can compile PDF on-the-fly
        from app.database import delete_pdf
        delete_pdf(doc_id)

    except Exception as e:
        import traceback
        traceback.print_exc()
        from app.database import update_document_error, log_issue
        update_document_error(doc_id, str(e)[:500])
        log_issue(doc_id, issue_type="pipeline_error", severity="error",
                  description=f"Pipeline failed: {str(e)[:200]}")
        _update_doc_status(doc_id, "failed", "level_4", user_id=user_id)
        notify_sse("document_updated", {
            "doc_id": doc_id, "status": "failed", "escalation_level": "level_4"
        }, user_id=user_id)


# ── Internal Helpers ─────────────────────────────────────────────────────────

def _update_doc_status(
    doc_id: str,
    status: str,
    escalation_level: Optional[str] = None,
    user_id: Optional[str] = None,
):
    from app.database import update_document_status
    update_document_status(doc_id, status, escalation_level)


def _store_azure_response(doc_id: str, raw_responses: dict):
    """Store the complete Azure response in the database."""
    from app.database import USE_POSTGRES
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        now_str = datetime.now().isoformat()
        data = json.dumps(raw_responses)
        if USE_POSTGRES:
            cur.execute(
                "INSERT INTO azure_responses (document_id, raw_response, saved_at) VALUES (%s, %s, %s) ON CONFLICT (document_id) DO UPDATE SET raw_response = EXCLUDED.raw_response, saved_at = EXCLUDED.saved_at",
                (doc_id, data, now_str)
            )
        else:
            cur.execute(
                "INSERT OR REPLACE INTO azure_responses (document_id, raw_response, saved_at) VALUES (?, ?, ?)",
                (doc_id, data, now_str)
            )
        conn.commit()
    finally:
        put_conn(conn)


def _load_cached_azure_response(doc_id: str) -> Optional[dict]:
    """Load a previously stored Azure response from the database, if available."""
    from app.database import USE_POSTGRES
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = %s" if USE_POSTGRES else "SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
        row = cur.fetchone()
        if row and row[0]:
            res = json.loads(row[0])
            if isinstance(res, dict) and any(bool(v) for v in res.values()):
                return res
    except Exception:
        pass
    finally:
        put_conn(conn)
    return None


def _store_processed_results(
    doc_id: str,
    fields: dict,
    validation_results: dict,
    trust_confidences: dict,
    cross_reason: str,
    review_fields: list[str],
    escalation: str,
    responses: dict,
    consent: str,
    resolved_pages: dict,
    polygons: dict
):
    """Store processing results in the database."""
    from app.database import insert_or_update_form_data

    mapped_fields = {
        "roll_number": fields.get("roll_number", ""),
        "class": fields.get("class", ""),
        "dob": fields.get("dob", ""),
        "gender": fields.get("gender", ""),
        "consent": consent,
        "academic_scores": {
            "math_pct": fields.get("math_pct", ""),
            "science_pct": fields.get("science_pct", ""),
            "language_pct": fields.get("language_pct", ""),
            "rank": fields.get("rank", ""),
        },
        "responses": responses,
        "remarks": fields.get("remarks", ""),
    }

    # Build confidence_scores structure
    confidence_data = {}
    for fn, tc in trust_confidences.items():
        confidence_data[fn] = {
            "ocr_confidence": tc.ocr_confidence,
            "trust_confidence": tc.trust_confidence,
            "validation_score": tc.validation_score,
            "ambiguity_score": tc.ambiguity_score,
            "cross_field_score": tc.cross_field_score,
            "polygon": polygons.get(fn),
            "page": resolved_pages.get(fn),
        }

    cb_conf = {}
    for q_num in range(1, 26):
        q_key = f"q{q_num}"
        tc = trust_confidences.get(q_key)
        if tc:
            if tc.trust_confidence >= 0.85:
                cb_conf[q_key] = "high_confidence"
            elif tc.trust_confidence >= 0.40:
                cb_conf[q_key] = "low_confidence"
            else:
                cb_conf[q_key] = "unanswered"
        else:
            cb_conf[q_key] = "unanswered"

    ocr_map = {}
    for fn, tc in trust_confidences.items():
        ocr_map[fn] = "high_confidence" if tc.trust_confidence >= 0.85 else "low_confidence"

    confidence_scores = {
        "v2_trust": confidence_data,
        "ocr": ocr_map,
        "cross_field_penalty": 0,
        "cross_field_reason": cross_reason,
        "review_fields": review_fields,
        "checkbox": cb_conf,
    }

    insert_or_update_form_data(
        doc_id=doc_id,
        roll_number=mapped_fields["roll_number"],
        class_val=mapped_fields["class"],
        dob=mapped_fields["dob"],
        gender=mapped_fields["gender"],
        consent=mapped_fields["consent"],
        responses=mapped_fields.get("responses", {}),
        academic_scores=mapped_fields["academic_scores"],
        remarks=mapped_fields.get("remarks", ""),
        confidence_scores=confidence_scores,
        quality_report=None,
        verified=1 if escalation == "level_1" and not review_fields else 0,
    )


def detect_form_page(page_text: str) -> int:
    """Detect if a physical page text corresponds to Form Page 1 or Form Page 2."""
    p1_indicators = ["\u0930\u094b\u0932 \u0928\u0902\u092c\u0930", "\u091c\u0928\u094d\u092e \u0924\u093f\u0925\u093f", "\u0932\u093f\u0902\u0917", "\u0938\u0939\u092e\u0924"]
    p2_indicators = ["\u0936\u0948\u0915\u094d\u0937\u0923\u093f\u0915", "\u091f\u093f\u092a\u094d\u092a\u0923\u0940", "\u0930\u0948\u0902\u0915", "\u092f\u0942\u0928\u093f\u091f \u091f\u0947\u0938\u094d\u091f", "\u0909\u0926\u093e\u0938", "\u0930\u094b\u0924\u093e"]

    p1_score = sum(1 for ind in p1_indicators if ind in page_text)
    p2_score = sum(1 for ind in p2_indicators if ind in page_text)

    if p2_score > p1_score:
        return 2
    return 1


def _combine_normalized_responses(doc_id: str, azure_results: list) -> Optional[object]:
    """Combine multiple page-level Azure responses into a single normalized response."""
    from app.processing.azure_processor import normalize_azure_response
    from app.core.types import NormalizedAzureResponse

    if not azure_results:
        return None

    combined = NormalizedAzureResponse(document_id=doc_id)
    use_detection = len(azure_results) != 2

    for i, result in enumerate(azure_results):
        if result is None:
            continue
        normalized = normalize_azure_response(f"{doc_id}_p{i+1}", result)

        detected_page = i + 1
        if use_detection:
            page_text = ""
            if normalized.pages:
                page_text = " ".join(el.text for el in normalized.pages[0].elements)
            detected_page = detect_form_page(page_text)
            print(f"[{doc_id}] Detected physical page {i+1} as Form Page {detected_page}")

        for page_obj in normalized.pages:
            page_obj.page = detected_page
        combined.pages.extend(normalized.pages)
        # Store page-level raw response under page_N keys to match cache format
        combined.raw_response[f"page_{detected_page}"] = normalized.raw_response

    return combined
