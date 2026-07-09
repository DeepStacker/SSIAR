"""
Document Processing Jobs (Modules 1-2)
========================================
Defines the job queue types, worker pool, and orchestration for document processing.
Replaces synchronous `Upload → Wait → OCR → Wait → Result` with async:
    Upload → Return → Process in background → Notify user
"""
import os
import uuid
import json
import threading
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, Future
from enum import Enum
from typing import Optional, Callable

from app.config import MAX_WORKERS
from app.database import get_db_connection, put_conn
from app.sse import notify as notify_sse


# ── Job Types ────────────────────────────────────────────────────────────────

class JobType(str, Enum):
    DOCUMENT_PROCESSING = "document_processing"
    VALIDATION = "validation"
    REVIEW = "review"
    REPORT = "report"
    EXPORT = "export"


# ── Job Queue ────────────────────────────────────────────────────────────────

class JobQueue:
    """
    Simple in-process job queue with status tracking.
    In production, replace with Redis/Celery or RabbitMQ.
    """
    
    def __init__(self, max_workers: int = 4):
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._futures: dict[str, Future] = {}
        self._status: dict[str, str] = {}
        self._lock = threading.Lock()
    
    def enqueue(
        self,
        job_type: JobType,
        doc_id: str,
        handler: Callable,
        *args,
        **kwargs,
    ) -> str:
        """Submit a job to the queue."""
        jtype_str = job_type.value if hasattr(job_type, "value") else str(job_type)
        job_id = f"{jtype_str}_{doc_id}_{uuid.uuid4().hex[:8]}"
        
        with self._lock:
            self._status[job_id] = "queued"
        
        def _wrapped():
            with self._lock:
                self._status[job_id] = "processing"
            try:
                result = handler(*args, **kwargs)
                with self._lock:
                    self._status[job_id] = "completed"
                return result
            except Exception as e:
                with self._lock:
                    self._status[job_id] = "failed"
                raise e
        
        future = self._executor.submit(_wrapped)
        
        with self._lock:
            self._futures[job_id] = future
        
        return job_id
    
    def get_status(self, job_id: str) -> Optional[str]:
        """Get the current status of a job."""
        with self._lock:
            return self._status.get(job_id)
    
    def get_result(self, job_id: str, timeout: Optional[float] = None):
        """Get the result of a completed job."""
        with self._lock:
            future = self._futures.get(job_id)
        if not future:
            return None
        try:
            return future.result(timeout=timeout)
        except Exception:
            return None


# ── Global Queue Instance ────────────────────────────────────────────────────

_queue = None
_queue_lock = threading.Lock()


def get_job_queue() -> JobQueue:
    global _queue
    if _queue is None:
        with _queue_lock:
            if _queue is None:
                _queue = JobQueue(max_workers=min(8, os.cpu_count() or 4))
    return _queue


# ── Document Processing Orchestrator ─────────────────────────────────────────

def get_column_index(x_coord: float) -> int:
    # x_coord midpoints in pixels (300 DPI)
    # Midpoints: (1603 + 1872) / 2 = 1737.5, (1872 + 2150) / 2 = 2011
    if x_coord < 1737.5:
        return 1
    elif x_coord < 2011.0:
        return 2
    else:
        return 3


def resolve_page_selection_marks(page_elements: list, is_page_2: bool) -> tuple[dict[str, int], str]:
    # Extract all selection marks
    sel_marks = [el for el in page_elements if el.element_type == "selection_mark"]
    if not sel_marks:
        return {}, "Unanswered"
    
    # Group selection marks into rows by Y coordinate (Y tolerance of 50.0 pixels)
    rows = []
    for mark in sel_marks:
        my = mark.bbox[1]  # y_min
        found_row = False
        for r in rows:
            if abs(r[0].bbox[1] - my) < 50.0:
                r.append(mark)
                found_row = True
                break
        if not found_row:
            rows.append([mark])
            
    # Sort each row by X coordinate (left to right)
    for r in rows:
        r.sort(key=lambda m: m.bbox[0])
        
    # Sort rows by Y coordinate (top to bottom)
    rows.sort(key=lambda r: sum(m.bbox[1] for m in r) / len(r))
    
    responses = {}
    consent_val = "Unanswered"
    
    if not is_page_2:
        # Page 1: consent at Y < 1200, Q1-Q12 at Y >= 1200
        consent_rows = [r for r in rows if (sum(m.bbox[1] for m in r) / len(r)) < 1200.0]
        question_rows = [r for r in rows if (sum(m.bbox[1] for m in r) / len(r)) >= 1200.0]
        
        # Parse consent
        if consent_rows:
            c_marks = consent_rows[0]
            c_marks.sort(key=lambda m: m.bbox[0])
            if len(c_marks) >= 1 and c_marks[0].text == "✓":
                consent_val = "Yes"
            elif len(c_marks) >= 2 and c_marks[1].text == "✓":
                consent_val = "No"
                
        # Parse Q1-Q12
        for idx, r in enumerate(question_rows[:12]):
            q_num = idx + 1
            selected_col = 0
            for m in r:
                if m.text == "✓":
                    selected_col = get_column_index(m.bbox[0])
                    break
            responses[f"q{q_num}"] = selected_col
    else:
        # Page 2: Q13-Q25
        for idx, r in enumerate(rows[:13]):
            q_num = idx + 13
            selected_col = 0
            for m in r:
                if m.text == "✓":
                    selected_col = get_column_index(m.bbox[0])
                    break
            responses[f"q{q_num}"] = selected_col
            
    return responses, consent_val


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
        
        # 2. Render and process
        from app.image.pdf import render_pdf_to_arrays
        pages = render_pdf_to_arrays(pdf_bytes)
        
        # Save page images to database
        from app.database import store_page_image
        for i, page_img in enumerate(pages):
            _, jpeg_buf = cv2.imencode('.jpg', page_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            store_page_image(doc_id, i + 1, jpeg_buf.tobytes())
        
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
        from app.database import get_db_connection, put_conn
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "UPDATE documents SET classification = ? WHERE id = ?",
                (json.dumps(classification), doc_id)
            )
            conn.commit()
        finally:
            put_conn(conn)
        
        # 4. Send to Azure Document Intelligence (whole pages)
        from app.ocr.plugin import AzureOCRPlugin
        plugin = AzureOCRPlugin()
        azure_full_page_results = []
        
        if plugin.is_available():
            for i, page_img in enumerate(pages):
                try:
                    result = plugin.recognize_page(page_img)
                    azure_full_page_results.append(result)
                except Exception as e:
                    print(f"Azure analysis failed for page {i+1}: {e}")
                    azure_full_page_results.append(None)
        
        # 5. Normalize Azure response
        from app.processing.azure_processor import normalize_azure_response
        raw_responses = {}
        for i, (page_img, azure_res) in enumerate(
            zip(pages, azure_full_page_results or [None] * len(pages))
        ):
            if azure_res:
                normalized = normalize_azure_response(doc_id, azure_res)
                raw_responses[f"page_{i+1}"] = normalized.raw_response
        
        # Store raw Azure response
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
        if combined_normalized:
            for i in range(len(pages)):
                is_p2 = (i == 1)
                page_obj = None
                for p in combined_normalized.pages:
                    if p.page == (i + 1):
                        page_obj = p
                        break
                if page_obj:
                    p_resp, p_consent = resolve_page_selection_marks(page_obj.elements, is_p2)
                    responses.update(p_resp)
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
        
        template = get_template("sdq_student_form_v1")
        extracted_fields = {}
        validation_results = {}
        trust_confidences = {}
        bboxes = {}
        polygons = {}
        resolved_pages = {}
        
        for fd in template.fields:
            text, conf, found, bbox, poly, res_page = resolve_field(fd, combined_normalized)
            normalized_text = normalize_value(text, fd.type) if found else ""
            extracted_fields[fd.name] = normalized_text
            bboxes[fd.name] = bbox
            polygons[fd.name] = poly
            resolved_pages[fd.name] = res_page
            
            # Validate
            vresult = validate_field(fd, normalized_text, extracted_fields)
            validation_results[fd.name] = vresult
            
            # Calculate trust
            trust = calculate_trust(
                field_def=fd,
                extracted_text=normalized_text,
                azure_confidence=conf,
                validation_result=vresult,
            )
            trust_confidences[fd.name] = trust
        
        # 9. Cross-field consistency check
        is_consistent, cross_penalty, cross_reason = check_cross_field_consistency_v2(
            extracted_fields, validation_results
        )
        if not is_consistent:
            for fn in trust_confidences:
                tc = trust_confidences[fn]
                tc.cross_field_score = max(0.0, 1.0 - cross_penalty)
                tc.trust_confidence = max(0.0, tc.trust_confidence - cross_penalty)
        
        _update_doc_status(doc_id, "validation_completed", user_id=user_id)
        
        # 10. Determine review needs and create review tasks
        review_fields = []
        from app.processing.review import create_review_task
        for fd in template.fields:
            tc = trust_confidences.get(fd.name)
            if tc:
                priority = determine_review_priority(
                    tc.trust_confidence,
                    fd.review_priority.value == 1
                )
                if priority in ("critical", "low_trust"):
                    review_fields.append(fd.name)
                    create_review_task(
                        document_id=doc_id,
                        field_name=fd.name,
                        original_value=extracted_fields.get(fd.name, ""),
                        priority=priority
                    )
        
        if review_fields:
            status = "needs_review"
            escalation = "level_2" if any(
                trust_confidences.get(f) and trust_confidences[f].trust_confidence < 0.5
                for f in review_fields
            ) else "level_1"
        else:
            status = "approved" if auto_verify else "needs_review"
            escalation = "level_1"
        
        # 11. Store results
        _store_processed_results(
            doc_id, extracted_fields, validation_results,
            trust_confidences, cross_reason, review_fields,
            escalation, responses, consent, bboxes, resolved_pages, polygons
        )
        
        _update_doc_status(doc_id, status, escalation, user_id=user_id)
        notify_sse("document_updated", {
            "doc_id": doc_id,
            "status": status,
            "escalation_level": escalation,
        }, user_id=user_id)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        _update_doc_status(doc_id, "failed", "level_4", user_id=user_id)
        notify_sse("document_updated", {
            "doc_id": doc_id, "status": "failed", "escalation_level": "level_4"
        }, user_id=user_id)


# ── Internal Helpers ────────────────────────────────────────────────────────────────

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
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        now_str = datetime.now().isoformat()
        data = json.dumps(raw_responses)
        cur.execute(
            "INSERT OR REPLACE INTO azure_responses (document_id, raw_response, saved_at) VALUES (?, ?, ?)",
            (doc_id, data, now_str)
        )
        conn.commit()
    finally:
        put_conn(conn)


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
    bboxes: dict,
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
            "bbox": bboxes.get(fn),
            "polygon": polygons.get(fn),
            "page": resolved_pages.get(fn),
        }
    
    cb_conf = {}
    for q_num in range(1, 26):
        q_key = f"q{q_num}"
        val = responses.get(q_key, 0)
        cb_conf[q_key] = "high_confidence" if val > 0 else "unanswered"
        
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


def _combine_normalized_responses(doc_id: str, azure_results: list) -> Optional[object]:
    """Combine multiple page-level Azure responses into a single normalized response."""
    from app.processing.azure_processor import normalize_azure_response
    from app.processing.types import NormalizedAzureResponse
    
    if not azure_results:
        return None
    
    combined = NormalizedAzureResponse(document_id=doc_id)
    
    for i, result in enumerate(azure_results):
        if result is None:
            continue
        normalized = normalize_azure_response(f"{doc_id}_p{i+1}", result)
        combined.pages.extend(normalized.pages)
        combined.raw_response.update(normalized.raw_response)
    
    return combined


def get_worker_count() -> int:
    """Public accessor for the processing worker pool size."""
    q = get_job_queue()
    return q._executor._max_workers