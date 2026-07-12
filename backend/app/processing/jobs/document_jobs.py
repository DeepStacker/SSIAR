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
from typing import Optional, Callable, Any

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
                # Run up to 4 document processes in parallel safely due to 180 DPI memory optimizations
                _queue = JobQueue(max_workers=4)
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
) -> tuple[dict[str, Any], str, dict[str, float], dict[str, list[float]], dict[str, list[float]]]:
    """
    Resolve checkbox selections directly from Azure's table model,
    falling back to pixel density classification if Azure missed the selection state.
    
    Returns:
      responses: dict of q_key -> selected_col (int or list of ints)
      consent_val: str ("Yes", "No", "Unanswered")
      confidences: dict of q_key -> confidence (float)
      bboxes: dict of q_key -> [x0, y0, x1, y1]
      polygons: dict of q_key -> [x0, y0, x1, y1, x2, y2, x3, y3]
    """
    responses = {}
    confidences = {}
    q_bboxes = {}
    q_polygons = {}
    consent_val = "Unanswered"
    
    if not raw_response:
        return {}, "Unanswered", {}, {}, {}
        
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
        
    # Process consent
    if page_num == 1:
        consent_marks = [
            m for m in page_elements
            if m.element_type == "selection_mark" and m.bbox[1] < page_height * 0.38
        ]
        # 1. Check if Azure detected selected state
        for mark in consent_marks:
            if mark.text == "✓":
                rel_cx = mark.bbox[0] / page_width
                consent_val = "Yes" if rel_cx < 0.83 else "No"
                break
        # 2. Text-based detection
        if consent_val == "Unanswered":
            consent_words = [
                el for el in page_elements
                if el.element_type == "word" and el.bbox[1] < page_height * 0.30
                and el.bbox[0] > page_width * 0.70
            ]
            for w in consent_words:
                text = w.text.strip().lower()
                if text in ("हां", "हाँ"):
                    consent_val = "Yes"
                    break
                if text == "नहीं":
                    consent_val = "No"
                    break
        # 3. Density-based fallback
        if consent_val == "Unanswered" and page_img is not None:
            import cv2 as _cv2
            img_h, img_w = page_img.shape[:2]
            sx = img_w / 4500.0
            sy = img_h / 6000.0
            yes_x0, yes_y0 = int(3400 * sx), int(1380 * sy)
            yes_x1, yes_y1 = int(3570 * sx), int(1560 * sy)
            no_x0, no_y0 = int(3700 * sx), int(1380 * sy)
            no_x1, no_y1 = int(3820 * sx), int(1560 * sy)
            
            gray = _cv2.cvtColor(page_img, _cv2.COLOR_BGR2GRAY) if len(page_img.shape) == 3 else page_img
            _, binary = _cv2.threshold(gray, 150, 255, _cv2.THRESH_BINARY_INV)
            
            yes_region = binary[yes_y0:yes_y1, yes_x0:yes_x1]
            no_region = binary[no_y0:no_y1, no_x0:no_x1]
            
            yes_density = float(np.mean(yes_region) / 255.0) if yes_region.size > 0 else 0
            no_density = float(np.mean(no_region) / 255.0) if no_region.size > 0 else 0
            
            diff = abs(yes_density - no_density)
            if diff >= 0.025:
                consent_val = "Yes" if yes_density > no_density else "No"

    if not tables:
        return {}, consent_val, {}, {}, {}
        
    table = tables[1] if (page_num == 1 and len(tables) >= 2) else tables[0]
    
    # Map cells by row index
    rows_cells = {}
    for cell in table.get("cells", []):
        r = cell.get("rowIndex")
        c = cell.get("columnIndex")
        if c in (1, 2, 3):
            if r not in rows_cells:
                rows_cells[r] = {}
            rows_cells[r][c] = cell
            
    max_rows = 13 if is_page_2 else 13
    start_row = 0 if is_page_2 else 1
    
    # For DPI conversion
    std_w = 595.0
    std_h = 842.0
    scale_x = page_width / std_w
    scale_y = page_height / std_h
    from app.image.roi import ROIS_P1_POINTS, ROIS_P2_POINTS
    
    for row_idx in range(start_row, max_rows):
        q_num = row_idx + 13 if is_page_2 else row_idx
        q_key = f"q{q_num}"
        
        cells = rows_cells.get(row_idx, {})
        selected_col = 0
        conf = 0.0
        
        # Determine bbox / polygon for the row
        row_polys = []
        for col in (1, 2, 3):
            c_cell = cells.get(col)
            if c_cell:
                for reg in c_cell.get("boundingRegions", []):
                    reg_poly = reg.get("polygon", [])
                    if reg_poly:
                        row_polys.extend(reg_poly)
                        
        if row_polys:
            if unit == "inch":
                row_polys = [pt * 300.0 for pt in row_polys]
            xs = row_polys[0::2]
            ys = row_polys[1::2]
            xmin, xmax = min(xs), max(xs)
            ymin, ymax = min(ys), max(ys)
            bbox = [xmin, ymin, xmax, ymax]
            poly = [xmin, ymin, xmax, ymin, xmax, ymax, xmin, ymax]
        else:
            # Fallback to static template
            rect = ROIS_P2_POINTS.get(q_key) if is_page_2 else ROIS_P1_POINTS.get(q_key)
            if rect:
                x0, y0, x1, y1 = rect
                bbox = [x0 * scale_x, y0 * scale_y, x1 * scale_x, y1 * scale_y]
                poly = [bbox[0], bbox[1], bbox[2], bbox[1], bbox[2], bbox[3], bbox[0], bbox[3]]
            else:
                bbox, poly = None, None
                
        q_bboxes[q_key] = bbox
        q_polygons[q_key] = poly
        
        # 1. Native pass: check ':selected:'
        selected_cols = []
        for col in (1, 2, 3):
            cell = cells.get(col)
            if cell and ":selected:" in cell.get("content", ""):
                selected_cols.append(col)
                
        if len(selected_cols) == 1:
            selected_col = selected_cols[0]
            conf = 0.98
        else:
            # 2. Pixel density fallback (triggered if Azure found NO selection OR if it found MULTIPLE selections)
            selected_col = 0
            conf = 0.0
            ratios = {}
            if page_img is not None:
                for col in (1, 2, 3):
                    cell = cells.get(col)
                    if cell:
                        regions = cell.get("boundingRegions", [])
                        if regions:
                            c_poly = regions[0].get("polygon", [])
                            if c_poly and len(c_poly) >= 8:
                                ratio = _check_checkbox_density(page_img, c_poly, page_width, page_height, unit)
                                ratios[col] = ratio
            if len(ratios) == 3:
                r1, r2, r3 = ratios[1], ratios[2], ratios[3]
                max_r = max(r1, r2, r3)
                min_r = min(r1, r2, r3)
                diff = max_r - min_r
                
                # Check for multiple filled checkboxes based on density
                sorted_ratios = sorted(ratios.items(), key=lambda x: x[1], reverse=True)
                if sorted_ratios[0][1] - sorted_ratios[1][1] < 0.02 and sorted_ratios[0][1] - sorted_ratios[2][1] >= 0.035:
                    selected_col = [sorted_ratios[0][0], sorted_ratios[1][0]]
                    conf = 0.90  # Confidently resolved multiple ticks based on pixel density!
                elif diff >= 0.035:
                    selected_col = sorted_ratios[0][0]
                    conf = 0.95 if diff >= 0.06 else 0.85  # Clear single tick
                else:
                    selected_col = 0
                    conf = 0.0
            else:
                # If local density calculation is not possible (e.g. missing page_img), preserve Azure's native multi-selection state if any
                if len(selected_cols) > 1:
                    selected_col = selected_cols
                    conf = 0.95
                    
        # 3. Pure local static template fallback (if Azure native and cell density both failed to detect any tick)
        if selected_col == 0 and page_img is not None:
            try:
                from app.image.pdf import P1_Y_RANGES, P2_Y_RANGES, COLS_X_PTS
                if not is_page_2:
                    y0, y1 = P1_Y_RANGES[row_idx - 1] if row_idx > 0 else P1_Y_RANGES[0]
                else:
                    y0, y1 = P2_Y_RANGES[row_idx]
                
                h_img, w_img = page_img.shape[:2]
                scale_x = w_img / 595.0
                scale_y = h_img / 842.0
                
                local_ratios = {}
                for col in (1, 2, 3):
                    col_x_pt = COLS_X_PTS[col-1]
                    x0_pt = col_x_pt - 18.0
                    x1_pt = col_x_pt + 18.0
                    y0_pt = y0 / (300.0 / 72.0)
                    y1_pt = y1 / (300.0 / 72.0)
                    
                    cx0 = int(x0_pt * scale_x)
                    cx1 = int(x1_pt * scale_x)
                    cy0 = int(y0_pt * scale_y)
                    cy1 = int(y1_pt * scale_y)
                    
                    crop = page_img[cy0:cy1, cx0:cx1]
                    if crop.size > 0:
                        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
                        w, h = gray.shape[1], gray.shape[0]
                        center = gray[int(h*0.30):int(h*0.70), int(w*0.30):int(w*0.70)]
                        if center.size > 0:
                            paper_bg = np.percentile(center, 90)
                            dark_pixels = center < (paper_bg - 18)
                            local_ratios[col] = float(np.mean(dark_pixels))
                            
                if len(local_ratios) == 3:
                    lr1, lr2, lr3 = local_ratios[1], local_ratios[2], local_ratios[3]
                    max_lr = max(lr1, lr2, lr3)
                    min_lr = min(lr1, lr2, lr3)
                    diff_lr = max_lr - min_lr
                    
                    sorted_lr = sorted(local_ratios.items(), key=lambda x: x[1], reverse=True)
                    if sorted_lr[0][1] - sorted_lr[1][1] < 0.02 and sorted_lr[0][1] - sorted_lr[2][1] >= 0.035:
                        selected_col = [sorted_lr[0][0], sorted_lr[1][0]]
                        conf = 0.90
                    elif diff_lr >= 0.035:
                        selected_col = sorted_lr[0][0]
                        conf = 0.95 if diff_lr >= 0.06 else 0.85
            except Exception as le:
                pass
                    
        responses[q_key] = selected_col
        confidences[q_key] = conf
        
    return responses, consent_val, confidences, q_bboxes, q_polygons



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
        cb_bboxes = {}
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
                    p_resp, p_consent, p_conf, p_bbox, p_poly = resolve_page_selection_marks(
                        page_obj.elements, is_p2, page_obj.width, page_obj.height,
                        raw_response=raw_responses, page_img=pages[i]
                    )
                    responses.update(p_resp)
                    cb_confidences.update(p_conf)
                    cb_bboxes.update(p_bbox)
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
            bboxes[q_key] = cb_bboxes.get(q_key)
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
        bboxes["consent"] = cb_bboxes.get("consent", [1550.0, 920.0, 2050.0, 1070.0])
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
        from app.processing.review import create_review_task
        for fd in template.fields:
            tc = trust_confidences.get(fd.name)
            if tc:
                priority = determine_review_priority(
                    tc.trust_confidence,
                    fd.review_priority.value == 1
                )
                if priority in ("critical", "low_trust"):
                    # Check if the field is optional and has been extracted as empty.
                    # If it's optional and empty, it's NOT an extraction error (the user left it blank).
                    # We only create a review task if it is a required field or if there is actually extracted text.
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
            escalation, responses, consent, bboxes, resolved_pages, polygons
        )
        
        _update_doc_status(doc_id, status, escalation, user_id=user_id)
        notify_sse("document_updated", {
            "doc_id": doc_id,
            "status": status,
            "escalation_level": escalation,
        }, user_id=user_id)
        
        # Delete original uploaded PDF since we keep page images and can compile PDF on-the-fly
        from app.database import delete_pdf
        delete_pdf(doc_id)
        
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
    p1_indicators = ["रोल नंबर", "जन्म तिथि", "लिंग", "सहमत"]
    p2_indicators = ["शैक्षणिक", "टिप्पणी", "रैंक", "यूनिट टेस्ट", "उदास", "रोता"]
    
    p1_score = sum(1 for ind in p1_indicators if ind in page_text)
    p2_score = sum(1 for ind in p2_indicators if ind in page_text)
    
    if p2_score > p1_score:
        return 2
    return 1


def _combine_normalized_responses(doc_id: str, azure_results: list) -> Optional[object]:
    """Combine multiple page-level Azure responses into a single normalized response."""
    from app.processing.azure_processor import normalize_azure_response
    from app.processing.types import NormalizedAzureResponse
    
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


def get_worker_count() -> int:
    """Public accessor for the processing worker pool size."""
    q = get_job_queue()
    return q._executor._max_workers