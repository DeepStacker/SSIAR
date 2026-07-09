"""
Document Processing Jobs (Modules 1-2)
========================================
Defines the job queue types, worker pool, and orchestration for document processing.
Replaces synchronous `Upload → Wait → OCR → Wait → Result` with async:
    Upload → Return → Process in background → Notify user
"""
import os
import numpy as np
import cv2
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

def _check_checkbox_density(page_img: np.ndarray, poly: list[float], page_w: float, page_h: float, unit: str = "pixel") -> float:
    try:
        if unit == "inch":
            poly = [pt * 300.0 for pt in poly]
            
        h_img, w_img = page_img.shape[:2]
        scale_x = w_img / page_w
        scale_y = h_img / page_h
        
        xs = poly[0::2]
        ys = poly[1::2]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
        
        x0 = int(x0 * scale_x)
        y0 = int(y0 * scale_y)
        x1 = int(x1 * scale_x)
        y1 = int(y1 * scale_y)
        
        crop = page_img[y0:y1, x0:x1]
        if crop.size == 0:
            return 0.0
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
        w, h = gray.shape[1], gray.shape[0]
        
        # Shave 30% to completely remove borders
        center = gray[int(h*0.30):int(h*0.70), int(w*0.30):int(w*0.70)]
        if center.size == 0:
            return 0.0
            
        paper_bg = np.percentile(center, 90)
        dark_pixels = center < (paper_bg - 18)
        return float(np.mean(dark_pixels))
    except Exception:
        return 0.0


def resolve_page_selection_marks(
    page_elements: list,
    is_page_2: bool,
    page_width: float = 2483.0,
    page_height: float = 3508.0,
    raw_response: dict = None,
    page_img: np.ndarray = None
) -> tuple[dict[str, int], str]:
    """
    Resolve checkbox selections directly from Azure's table model,
    falling back to pixel density classification if Azure missed the selection state.
    """
    responses = {}
    consent_val = "Unanswered"
    
    if not raw_response:
        return {}, "Unanswered"
        
    page_num = 2 if is_page_2 else 1
    
    # Get raw page data
    page_raw = raw_response.get(f"page_{page_num}", {})
    if not page_raw or "pages" not in page_raw:
        page_raw = raw_response
        
    # Resize page_img to match Azure's coordinate space (page_width, page_height)
    if page_img is not None and page_width > 0 and page_height > 0:
        h_img, w_img = page_img.shape[:2]
        target_w = int(page_width)
        target_h = int(page_height)
        if h_img != target_h or w_img != target_w:
            import cv2
            page_img = cv2.resize(page_img, (target_w, target_h), interpolation=cv2.INTER_CUBIC)
        
    # Get page unit (inch or pixel) from the first page in page_raw
    unit = "pixel"
    pages_list = page_raw.get("pages", [])
    if pages_list:
        unit = pages_list[0].get("unit", "pixel")
        
    tables = page_raw.get("tables", [])
    if not tables and pages_list:
        tables = pages_list[0].get("tables", [])
                
    if not tables:
        return {}, "Unanswered"
        
    # Page 1 Table 1 is checkbox table. Page 2 Table 0 is checkbox table.
    if page_num == 1:
        table = tables[1] if len(tables) >= 2 else tables[0]
        # Parse consent from page 1 elements
        for mark in page_elements:
            if mark.element_type == "selection_mark" and mark.bbox[1] < page_height * 0.38:
                if mark.text == "✓":
                    rel_cx = mark.bbox[0] / page_width
                    consent_val = "Yes" if rel_cx < 0.83 else "No"
                    break
    else:
        table = tables[0]
        
    # Map cells by row index
    rows_cells = {}
    for cell in table.get("cells", []):
        r = cell.get("rowIndex")
        c = cell.get("columnIndex")
        if c in (1, 2, 3):
            if r not in rows_cells:
                rows_cells[r] = {}
            rows_cells[r][c] = cell
            
    # Process each row (Q1-Q12 on Page 1, Q13-Q25 on Page 2)
    max_rows = 13 if is_page_2 else 13
    start_row = 0 if is_page_2 else 1
    
    for row_idx in range(start_row, max_rows):
        q_num = row_idx + 13 if is_page_2 else row_idx
        q_key = f"q{q_num}"
        
        cells = rows_cells.get(row_idx, {})
        selected_col = 0
        
        # 1. First pass: check if any cell contains ':selected:'
        for col in (1, 2, 3):
            cell = cells.get(col)
            if cell and ":selected:" in cell.get("content", ""):
                selected_col = col
                break
                
        # 2. Second pass: fallback to relative pixel density if no cell was detected as selected
        if selected_col == 0 and page_img is not None:
            ratios = {}
            for col in (1, 2, 3):
                cell = cells.get(col)
                if cell:
                    regions = cell.get("boundingRegions", [])
                    if regions:
                        poly = regions[0].get("polygon", [])
                        if poly and len(poly) >= 8:
                            ratio = _check_checkbox_density(page_img, poly, page_width, page_height, unit)
                            ratios[col] = ratio
            if len(ratios) == 3:
                r1 = ratios[1]
                r2 = ratios[2]
                r3 = ratios[3]
                max_r = max(r1, r2, r3)
                min_r = min(r1, r2, r3)
                # If the darkest checkbox is at least 3.5% darker than the lightest checkbox,
                # we classify it as selected!
                if max_r - min_r >= 0.035:
                    for col, ratio in ratios.items():
                        if ratio == max_r:
                            selected_col = col
                            break
                
        responses[q_key] = selected_col
        
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
        raw_pages = render_pdf_to_arrays(pdf_bytes)
        
        # Apply CLAHE contrast enhancement and sharpening to improve checkbox/pen stroke detection for Azure DI and local density check
        pages = []
        for img in raw_pages:
            try:
                # Convert to LAB color space to equalize luminosity channel
                lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
                l, a, b = cv2.split(lab)
                clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                cl = clahe.apply(l)
                limg = cv2.merge((cl, a, b))
                enhanced = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
                
                # Apply sharpening filter to emphasize thin pen strokes (like checkmarks)
                kernel = np.array([[0, -0.5, 0], [-0.5, 3.0, -0.5], [0, -0.5, 0]], dtype=np.float32)
                sharpened = cv2.filter2D(enhanced, -1, kernel)
                pages.append(sharpened)
            except Exception:
                pages.append(img)
        
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
        
        # 4. Check for cached Azure response (skip expensive API calls during re-processing)
        from app.processing.azure_processor import normalize_azure_response
        cached_raw = _load_cached_azure_response(doc_id)
        
        if cached_raw:
            print(f"[{doc_id}] Reusing cached Azure response (skipping API call)")
            raw_responses = cached_raw
            combined_normalized = normalize_azure_response(doc_id, cached_raw)
        else:
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
            for i, (page_img, azure_res) in enumerate(
                zip(pages, azure_full_page_results or [None] * len(pages))
            ):
                if azure_res:
                    normalized = normalize_azure_response(doc_id, azure_res)
                    raw_responses[f"page_{i+1}"] = normalized.raw_response
            
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
        if combined_normalized:
            for i in range(len(pages)):
                is_p2 = (i == 1)
                page_obj = None
                for p in combined_normalized.pages:
                    if p.page == (i + 1):
                        page_obj = p
                        break
                if page_obj:
                    p_resp, p_consent = resolve_page_selection_marks(
                        page_obj.elements, is_p2, page_obj.width, page_obj.height,
                        raw_response=raw_responses, page_img=pages[i]
                    )
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
            try:
                text, conf, found, bbox, poly, res_page = resolve_field(fd, combined_normalized)
                normalized_text = normalize_value(text, fd.type) if found else ""
            except Exception as e:
                print(f"[{doc_id}] Field resolution failed for {fd.name}: {e}")
                text, conf, found, bbox, poly, res_page = "", 0.0, False, None, None, 1
                normalized_text = ""
            
            extracted_fields[fd.name] = normalized_text
            bboxes[fd.name] = bbox
            polygons[fd.name] = poly
            resolved_pages[fd.name] = res_page
            
            # Validate
            try:
                vresult = validate_field(fd, normalized_text, extracted_fields)
            except Exception:
                vresult = {"valid": False, "issues": ["validation_error"]}
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


def _load_cached_azure_response(doc_id: str) -> Optional[dict]:
    """Load a previously stored Azure response from the database, if available."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
        row = cur.fetchone()
        if row and row[0]:
            return json.loads(row[0])
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