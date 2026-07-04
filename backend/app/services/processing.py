import os
import signal
import time
import threading
import shutil
from concurrent.futures import ThreadPoolExecutor
import cv2
import fitz
from app.config import TEMPLATES_DIR, TEMP_DIR, TEMPLATE_PDF, PROCESSING_TIMEOUT, TEMP_TTL_HOURS
from app.database import (
    insert_document, update_document_status, insert_or_update_form_data,
    get_pdf, store_page_image
)
from app.pipeline import (
    split_pdf_to_images, align_page, align_page_orb, process_checkboxes, detect_consent,
    classify_document, assess_quality, repair_illumination, repair_noise,
    ZOOM
)
from app.ocr import run_ocr_on_fields, ocr_remarks
from app.sse import notify as notify_sse

_executor = ThreadPoolExecutor(max_workers=2)


def get_executor() -> ThreadPoolExecutor:
    return _executor


def init_templates():
    p1_path = os.path.join(TEMPLATES_DIR, "template_p1.png")
    p2_path = os.path.join(TEMPLATES_DIR, "template_p2.png")
    if not os.path.exists(p1_path) or not os.path.exists(p2_path):
        if os.path.exists(TEMPLATE_PDF):
            try:
                doc = fitz.open(TEMPLATE_PDF)
                for i in range(min(2, len(doc))):
                    page = doc[i]
                    mat = fitz.Matrix(ZOOM, ZOOM)
                    pix = page.get_pixmap(matrix=mat)
                    out_path = os.path.join(TEMPLATES_DIR, f"template_p{i+1}.png")
                    pix.save(out_path)
                print("Extracted template images successfully from blank PDF.")
            except Exception as e:
                print(f"Error extracting templates: {str(e)}")


def _cleanup_temp_dir():
    now = time.time()
    for item in os.listdir(TEMP_DIR):
        path = os.path.join(TEMP_DIR, item)
        try:
            if os.path.isfile(path):
                mtime = os.path.getmtime(path)
                if now - mtime > TEMP_TTL_HOURS * 3600:
                    os.remove(path)
            elif os.path.isdir(path):
                mtime = os.path.getmtime(path)
                if now - mtime > TEMP_TTL_HOURS * 3600:
                    shutil.rmtree(path, ignore_errors=True)
        except OSError:
            pass


def _cleanup_loop():
    while True:
        time.sleep(3600)
        try:
            _cleanup_temp_dir()
        except Exception as e:
            print(f"Temp cleanup error: {e}")


def start_cleanup_thread():
    thread = threading.Thread(target=_cleanup_loop, daemon=True)
    thread.start()


def process_pdf_background(doc_id: str, auto_verify: bool = False):
    temp_pdf = None
    proc_dir = None
    try:
        pdf_bytes = get_pdf(doc_id)
        if not pdf_bytes:
            raise ValueError("PDF data not found in database")

        is_main_thread = threading.current_thread() is threading.main_thread()
        has_alarm = hasattr(signal, 'SIGALRM') and is_main_thread

        def _timeout_handler(signum, frame):
            raise TimeoutError(f"Processing timed out after {PROCESSING_TIMEOUT}s")

        if has_alarm:
            old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(PROCESSING_TIMEOUT)

        temp_pdf = os.path.join(TEMP_DIR, f"{doc_id}.pdf")
        with open(temp_pdf, "wb") as f:
            f.write(pdf_bytes)

        proc_dir = os.path.join(TEMP_DIR, doc_id)
        os.makedirs(proc_dir, exist_ok=True)

        img_paths = split_pdf_to_images(temp_pdf, proc_dir)
        if len(img_paths) < 1:
            raise ValueError("PDF has no pages")

        has_page2 = len(img_paths) >= 2
        classification = classify_document(img_paths[0])
        quality_report = assess_quality(img_paths[0])

        p1_img = cv2.imread(img_paths[0])
        if quality_report["shadow"]:
            p1_img = repair_illumination(p1_img)
        p1_img = repair_noise(p1_img, classification["type"])
        cv2.imwrite(img_paths[0], p1_img)

        orb_failed_on_p2 = False
        if has_page2:
            p2_img = cv2.imread(img_paths[1])
            p2_quality = assess_quality(img_paths[1])
            if p2_quality["shadow"]:
                p2_img = repair_illumination(p2_img)
            p2_img = repair_noise(p2_img, classification["type"])
            cv2.imwrite(img_paths[1], p2_img)

        aligned_p1 = align_page(img_paths[0], page_num=1)

        aligned_p2 = None
        if has_page2:
            p2_raw = cv2.imread(img_paths[1])
            aligned_p2 = align_page_orb(p2_raw, page_num=2, templates_dir=TEMPLATES_DIR)
            if aligned_p2 is None:
                aligned_p2 = align_page(img_paths[1], page_num=2)
                orb_failed_on_p2 = True

        p1_res, p1_conf, p1_multi = process_checkboxes(aligned_p1, page_num=1)

        if has_page2:
            p2_res, p2_conf, p2_multi = process_checkboxes(aligned_p2, page_num=2)
            responses = {**p1_res, **p2_res}
            confidences = {**p1_conf, **p2_conf}
            multi_ticks = {**p1_multi, **p2_multi}
        else:
            responses = p1_res
            confidences = p1_conf
            multi_ticks = p1_multi

        consent_val = detect_consent(aligned_p1)

        remarks_text = ""
        if has_page2:
            remarks_text = ocr_remarks(aligned_p2)

        # Phase 1: EasyOCR on each field crop (fast, free baseline)
        from app.ocr import get_router, get_normalizer, ROIS_P1, ROIS_P2, AzureOCREngine
        from app.crops import extract_crop
        _router = get_router()
        _all_roi = list({**ROIS_P1, **ROIS_P2}.keys())
        ocr_results = {"data": {}, "validation": {}, "confidences": {}, "roi_qualities": {}, "preprocessing_modes": {}}
        _azure_full = {}  # will store Azure full-page results for ⟳ reprocess

        for _field in _all_roi:
            _page = aligned_p1 if _field in ROIS_P1 else aligned_p2
            _crop = extract_crop(_page, _field)
            _val, _conf, _valid = "", 0.0, False
            if _crop is not None and _crop.size > 0:
                h, w = _crop.shape[:2]
                if h > 10 and w > 10:
                    up = cv2.resize(_crop, (w * 4, h * 4), interpolation=cv2.INTER_CUBIC)
                    gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
                    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                    enhanced = clahe.apply(gray)
                    _crop = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
                _res = _router.recognize_field(_crop, _field, route_override=['easyocr'])
                if _res and _res.text:
                    _norm, _valid = get_normalizer(_field)[0](_res.text)
                    if _valid and _norm:
                        _val, _conf = _norm, _res.confidence
            ocr_results["data"][_field] = _val
            ocr_results["confidences"][_field] = _conf
            ocr_results["validation"][_field] = "valid" if _valid else "invalid"

        # Phase 2: Azure full-page OCR — ONE call per aligned page covers ALL fields
        _az = AzureOCREngine()
        if _az._lazy_init():
            import json as _json
            for _page_num, _page_img, _page_rois in [
                (1, aligned_p1, {k: ROIS_P1[k] for k in ROIS_P1 if k in _all_roi}),
                (2, aligned_p2, {k: ROIS_P2[k] for k in ROIS_P2 if k in _all_roi}),
            ]:
                if _page_img is None or not _page_rois:
                    continue
                _az_results = _az.recognize_full_page(_page_img, _page_rois)
                for _field, (_text, _conf, _ok) in _az_results.items():
                    if _ok and _text:
                        _norm, _valid = get_normalizer(_field)[0](_text)
                        if _valid and _norm:
                            ocr_results["data"][_field] = _norm
                            ocr_results["confidences"][_field] = _conf
                            ocr_results["validation"][_field] = "valid"
                            print(f"  azure full-page {_field}: '{_norm}' conf={_conf:.3f}")
                _azure_full[f"page_{_page_num}"] = _az_results

        # Store Azure full-page results for ⟳ reprocess (avoid repeat API calls)
        ocr_results["_azure_cache"] = _azure_full

        # Explicit sanity checks on extracted values (belt-and-suspenders)
        data = ocr_results["data"]
        data_has_impossible = False
        for pct_field in ["math_pct", "science_pct", "language_pct"]:
            val = data.get(pct_field, "").strip()
            if val:
                try:
                    if int(val) > 100:
                        data_has_impossible = True
                        break
                except ValueError:
                    data_has_impossible = True
                    break
        if not data_has_impossible:
            rank_val = data.get("rank", "").strip()
            if rank_val:
                try:
                    if int(rank_val) > 999:
                        data_has_impossible = True
                except ValueError:
                    data_has_impossible = True

        if quality_report["crop"] or quality_report["blur"] < 40:
            escalation_level = "level_4"
        elif orb_failed_on_p2 or quality_report["quality"] < 50:
            escalation_level = "level_3"
        elif (data_has_impossible or
              any(v == "invalid" for v in ocr_results["validation"].values()) or
              any(c == "low_confidence" for c in confidences.values()) or
              consent_val == "Unanswered" or
              any(score < 0.65 for score in ocr_results["confidences"].values())):
            escalation_level = "level_2"
        else:
            escalation_level = "level_1"

        if auto_verify and escalation_level == "level_1":
            status = "verified"
        else:
            status = "needs_review"

        # Clear impossible values so they don't pollute the database
        if data_has_impossible:
            for pct_field in ["math_pct", "science_pct", "language_pct", "rank"]:
                data[pct_field] = ""

        academic_scores = {
            "math_pct": ocr_results["data"].get("math_pct", ""),
            "science_pct": ocr_results["data"].get("science_pct", ""),
            "language_pct": ocr_results["data"].get("language_pct", ""),
            "rank": ocr_results["data"].get("rank", "")
        }

        sanitized_responses = {}
        for k, v in responses.items():
            if isinstance(v, list):
                sanitized_responses[k] = [max(0, min(3, int(x))) for x in v if isinstance(x, (int, float))]
            elif isinstance(v, (int, float)):
                sanitized_responses[k] = max(0, min(3, int(v)))
            else:
                sanitized_responses[k] = 0

        insert_or_update_form_data(
            doc_id=doc_id,
            roll_number=ocr_results["data"]["roll_number"],
            class_val=ocr_results["data"]["class"],
            dob=ocr_results["data"]["dob"],
            gender=ocr_results["data"]["gender"],
            consent=consent_val,
            responses=sanitized_responses,
            academic_scores=academic_scores,
            remarks=remarks_text,
            confidence_scores={
                "ocr": ocr_results["confidences"],
                "checkbox": confidences,
                "multi_ticks": multi_ticks,
                "roi_qualities": ocr_results.get("roi_qualities", {}),
                "preprocessing_modes": ocr_results.get("preprocessing_modes", {})
            },
            quality_report=quality_report,
            verified=1 if status == "verified" else 0
        )

        aligned_p1_bytes = cv2.imencode('.png', aligned_p1)[1].tobytes()
        store_page_image(doc_id, 1, aligned_p1_bytes)
        if aligned_p2 is not None:
            aligned_p2_bytes = cv2.imencode('.png', aligned_p2)[1].tobytes()
            store_page_image(doc_id, 2, aligned_p2_bytes)

        update_document_status(doc_id, status, escalation_level)
        print(f"Finished processing document: {doc_id} -> Status: {status} [Escalation: {escalation_level}]")
        notify_sse("document_updated", {"doc_id": doc_id, "status": status, "escalation_level": escalation_level})

        if has_alarm:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)

    except TimeoutError as e:
        import traceback
        traceback.print_exc()
        update_document_status(doc_id, "failed", "level_4")
        notify_sse("document_updated", {"doc_id": doc_id, "status": "failed", "escalation_level": "level_4"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        update_document_status(doc_id, "failed", "level_4")
        notify_sse("document_updated", {"doc_id": doc_id, "status": "failed", "escalation_level": "level_4"})
        if hasattr(signal, 'SIGALRM'):
            signal.alarm(0)
    finally:
        if temp_pdf and os.path.exists(temp_pdf):
            os.remove(temp_pdf)
        if proc_dir and os.path.exists(proc_dir):
            shutil.rmtree(proc_dir, ignore_errors=True)
