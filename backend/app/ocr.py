import cv2
import re
import os
import numpy as np
import time
from datetime import datetime
from pathlib import Path
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeoutError
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent.parent.parent

ZOOM = 300 / 72

ROIS_P1 = {
    'roll_number': (330.0, 72.0, 558.0, 103.0),
    'class': (350.0, 103.0, 558.0, 134.0),
    'dob': (350.0, 134.0, 558.0, 166.0),
    'gender': (350.0, 166.0, 558.0, 196.0)
}

ROIS_P2 = {
    'math_pct': (140.0, 658.0, 240.0, 688.0),
    'science_pct': (140.0, 688.0, 240.0, 718.0),
    'language_pct': (140.0, 718.0, 240.0, 748.0),
    'rank': (25.0, 745.0, 140.0, 795.0)
}

ROIS_REMARKS = {
    'remarks': (28.0, 548.0, 552.0, 588.0)
}

DEVANAGARI_DIGITS_MAP = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
}

def convert_devanagari_digits(text):
    if not text:
        return ""
    return "".join(DEVANAGARI_DIGITS_MAP.get(c, c) for c in text)

def clean_ocr_text(text):
    if not text:
        return ""
    text = convert_devanagari_digits(text)
    return text.strip()

def normalize_roll_number(text):
    if not text:
        return "", False
    clean = text.replace(" ", "")
    clean = clean.replace("-", "").replace("+", "").replace("/", "").replace("l", "1").replace("I", "1").replace("|", "1")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("s", "5").replace("S", "5")
    clean = clean.replace("b", "6").replace("B", "8")
    clean = clean.replace("g", "9").replace("q", "9")
    clean = clean.replace("z", "2").replace("Z", "2")
    digits = re.sub(r"\D", "", clean)
    is_valid = 4 <= len(digits) <= 12
    return digits, is_valid

def normalize_class(text):
    if not text:
        return "", False
    clean = text.strip().replace(" ", "")
    clean = clean.replace("l", "1").replace("I", "1").replace("|", "1")
    clean = clean.replace("o", "0").replace("O", "0")
    digits = re.sub(r"\D", "", clean)
    is_valid = digits in ["9", "10", "11", "12"]
    return digits, is_valid

def normalize_dob(text):
    if not text:
        return "", False
    clean = text.replace(" ", "")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("J", "/").replace("I", "/").replace("l", "/").replace("|", "/")
    clean = re.sub(r"[-._]", "/", clean)
    match = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", clean)
    if match:
        day, month, year = match.groups()
        if _validate_date(day, month, year):
            return f"{day}/{month}/{year}", True
    nums = re.findall(r"\d+", clean)
    if len(nums) == 3:
        day, month, year = nums[0], nums[1], nums[2]
        if len(year) == 2:
            year = "20" + year
        if _validate_date(day, month, year):
            return f"{int(day):02d}/{int(month):02d}/{year}", True
    return clean, False

def _validate_date(day_str, month_str, year_str):
    try:
        d, m, y = int(day_str), int(month_str), int(year_str)
        if not (1950 <= y <= 2030):
            return False
        datetime(y, m, d)
        return True
    except (ValueError, TypeError):
        return False

def normalize_gender(text):
    if not text:
        return "", False
    clean = text.strip().upper()
    if "F" in clean or "FEMALE" in clean or "महिला" in clean or "स्त्री" in clean or "लड़की" in clean:
        return "F", True
    if "M" in clean or "MALE" in clean or "पुरुष" in clean or "लड़का" in clean:
        return "M", True
    if len(clean) == 1:
        if clean in ("W", "F"):
            return "F", True
        if clean in ("M", "N", "H"):
            return "M", True
    return clean, False

def normalize_score(text):
    if not text:
        return "", False
    clean = text.replace(" ", "")
    clean = clean.replace("o", "0").replace("O", "0")
    clean = clean.replace("l", "1").replace("I", "1").replace("|", "1")
    clean = clean.replace("s", "5").replace("S", "5")
    clean = clean.replace("b", "6").replace("B", "8")
    clean = clean.replace("g", "9").replace("q", "9")
    digits = re.sub(r"\D", "", clean)
    return digits, len(digits) > 0

def normalize_pct(text):
    value, is_valid = normalize_score(text)
    if not is_valid:
        return value, False
    try:
        num = int(value)
        if num < 0 or num > 100:
            return value, False
    except ValueError:
        return value, False
    return value, True

def normalize_rank_val(text):
    value, is_valid = normalize_score(text)
    if not is_valid:
        return value, False
    try:
        num = int(value)
        if num < 0 or num > 999:
            return value, False
    except ValueError:
        return value, False
    return value, True

def get_normalizer(field_name):
    norm_map = {
        'roll_number': (normalize_roll_number, '0123456789०१२३४५६७८९'),
        'class': (normalize_class, '0123456789०१२३४५६७८९'),
        'dob': (normalize_dob, '0123456789०१२३४५६७८९/'),
        'gender': (normalize_gender, 'MFmfMFmf'),
        'math_pct': (normalize_pct, '0123456789०१२३४५६७८९%'),
        'science_pct': (normalize_pct, '0123456789०१२३४५६७८९%'),
        'language_pct': (normalize_pct, '0123456789०१२३४५६७८९%'),
        'rank': (normalize_rank_val, '0123456789०१२३४५६७८९'),
    }
    return norm_map.get(field_name, (normalize_score, None))

def get_roi_quality(crop):
    if crop is None or crop.size == 0:
        return {"blur": 0.0, "contrast": 0.0, "is_good": False}
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    contrast_score = float(np.std(gray))
    is_good = blur_score >= 50.0 and contrast_score >= 25.0
    return {"blur": blur_score, "contrast": contrast_score, "is_good": is_good}

def preprocess_crop_for_ocr(crop, mode="standard"):
    if crop is None or crop.size == 0:
        return crop
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
    h, w = gray.shape[:2]
    gray = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    if mode == "standard":
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
    elif mode == "sharpen":
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
        gray = cv2.filter2D(gray, -1, kernel)
    elif mode == "sauvola":
        from app.pipeline import sauvola_threshold
        gray = sauvola_threshold(gray, window_size=19, k=0.15)
    elif mode == "high_contrast":
        gray = cv2.equalizeHist(gray)
        _, gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return gray

class OCREngineResult:
    __slots__ = ('text', 'confidence', 'engine_name', 'mode')
    def __init__(self, text: str, confidence: float, engine_name: str, mode: str = "standard"):
        self.text = text
        self.confidence = confidence
        self.engine_name = engine_name
        self.mode = mode

class OCREngine(ABC):
    @abstractmethod
    def recognize(self, crop, field_name: str) -> Optional[OCREngineResult]:
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...

# ==========================================
# PaddleOCR — Free, Hindi-first, best for printed Devanagari
# pip install paddleocr paddlepaddle
# ==========================================

class PaddleOCREngine(OCREngine):
    def __init__(self, gpu: bool = True):
        self._ocr = None
        self._gpu = gpu
        self._available = None

    def _lazy_init(self):
        if self._ocr is not None:
            return True
        try:
            from paddleocr import PaddleOCR
            kwargs: dict = dict(use_textline_orientation=True, lang='hi')
            for key in ('show_log', 'use_gpu'):
                try:
                    PaddleOCR(**kwargs, **{key: False})
                    kwargs[key] = False
                except (TypeError, ValueError):
                    pass
            self._ocr = PaddleOCR(**kwargs)
            self._available = True
        except ImportError:
            self._available = False
        except Exception as e:
            print(f"PaddleOCR init failed: {e}")
            self._available = False
        return self._available

    @property
    def name(self) -> str:
        return "paddleocr"

    def recognize(self, crop, field_name: str) -> Optional[OCREngineResult]:
        if not self._lazy_init():
            return None
        try:
            preprocessed = preprocess_crop_for_ocr(crop, "standard")
            result = self._ocr.ocr(preprocessed, cls=True)
            if not result or len(result) == 0 or result[0] is None:
                return OCREngineResult("", 0.0, self.name)
            boxes = result[0]
            texts = []
            confs = []
            for line in boxes:
                txt = line[1][0]
                conf = float(line[1][1])
                texts.append(txt)
                confs.append(conf)
            raw_text = " ".join(texts)
            avg_conf = float(np.mean(confs)) if confs else 0.0
            clean = clean_ocr_text(raw_text)
            return OCREngineResult(clean, avg_conf, self.name)
        except Exception as e:
            print(f"PaddleOCR error on {field_name}: {e}")
            return None

# ==========================================
# EasyOCR — Free, good fallback for Hindi + English
# pip install easyocr
# ==========================================

class EasyOCREngine(OCREngine):
    def __init__(self, gpu: bool = True):
        self._reader = None
        self._gpu = gpu

    def _lazy_init(self):
        if self._reader is not None:
            return True
        try:
            import easyocr
            self._reader = easyocr.Reader(['hi', 'en'], gpu=self._gpu)
            return True
        except ImportError:
            return False
        except Exception as e:
            print(f"EasyOCR init failed: {e}")
            return False

    @property
    def name(self) -> str:
        return "easyocr"

    def recognize(self, crop, field_name: str) -> Optional[OCREngineResult]:
        if not self._lazy_init():
            return None
        best_result = OCREngineResult("", 0.0, self.name)
        _, allowlist = get_normalizer(field_name)
        normalizer_fn = get_normalizer(field_name)[0]
        for mode in ("standard", "sharpen", "sauvola", "high_contrast"):
            try:
                preprocessed = preprocess_crop_for_ocr(crop, mode)
                result = self._reader.readtext(preprocessed, allowlist=allowlist)
                raw_text = ""
                avg_confidence = 0.0
                if len(result) > 0:
                    raw_text = " ".join([r[1] for r in result])
                    avg_confidence = float(np.mean([r[2] for r in result]))
                clean = clean_ocr_text(raw_text)
                norm_val, is_valid = normalizer_fn(clean)
                if avg_confidence > best_result.confidence:
                    best_result = OCREngineResult(norm_val, avg_confidence, self.name, mode)
                if is_valid and avg_confidence > 0.65:
                    break
            except Exception:
                continue
        return best_result

# ==========================================
# TrOCR — Free, best for handwritten digits/text
# pip install transformers torch
# ==========================================

class TrOCREngine(OCREngine):
    def __init__(self):
        self._processor = None
        self._model = None
        self._available = None
        self._runtime_failed = False

    def _lazy_init(self):
        if self._available is not None:
            return self._available
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel
            self._processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten")
            self._model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")
            self._available = True
        except ImportError:
            self._available = False
        except Exception as e:
            print(f"TrOCR init failed: {e}")
            self._available = False
        return self._available

    @property
    def name(self) -> str:
        return "trocr"

    def recognize(self, crop, field_name: str) -> Optional[OCREngineResult]:
        if not self._lazy_init() or self._runtime_failed:
            return None
        try:
            from PIL import Image
            rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB) if len(crop.shape) == 3 else cv2.cvtColor(crop, cv2.COLOR_GRAY2RGB)
            rgb = cv2.resize(rgb, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
            pil_image = Image.fromarray(rgb)
            pixel_values = self._processor(images=pil_image, return_tensors="pt").pixel_values
            generated_ids = self._model.generate(pixel_values, max_length=50)
            raw_text = self._processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
            clean = clean_ocr_text(raw_text)
            conf = 0.70 if len(clean) > 0 else 0.0
            return OCREngineResult(clean, conf, self.name)
        except Exception as e:
            if not self._runtime_failed:
                print(f"TrOCR error on {field_name}: {e}")
                self._runtime_failed = True
            return None

# ==========================================
# Surya OCR — Free, self-hosted, best accuracy for Hindi (9.6/10)
# pip install surya-ocr
# Requires llama-server: brew install llama.cpp
# ==========================================

class SuryaOCREngine(OCREngine):
    def __init__(self):
        self._predictor = None
        self._available = None
        self._runtime_failed = False

    def _lazy_init(self):
        if self._available is not None:
            return self._available
        try:
            from surya.inference import SuryaInferenceManager
            from surya.recognition import RecognitionPredictor
            self._manager = SuryaInferenceManager()
            self._predictor = RecognitionPredictor(self._manager)
            self._available = True
        except ImportError:
            self._available = False
        except Exception as e:
            print(f"Surya init failed: {e}")
            self._available = False
        return self._available

    @property
    def name(self) -> str:
        return "surya"

    def recognize(self, crop, field_name: str) -> Optional[OCREngineResult]:
        if not self._lazy_init() or self._runtime_failed:
            return None
        try:
            from PIL import Image
            rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB) if len(crop.shape) == 3 else cv2.cvtColor(crop, cv2.COLOR_GRAY2RGB)
            pil_image = Image.fromarray(rgb)
            results = self._predictor([pil_image], full_page=True)
            if not results or len(results) == 0:
                return OCREngineResult("", 0.0, self.name)
            texts = []
            confs = []
            for page_result in results:
                for line in page_result.text_lines:
                    texts.append(line.text)
                    confs.append(line.confidence)
            raw_text = " ".join(texts)
            avg_conf = float(np.mean(confs)) if confs else 0.0
            clean = clean_ocr_text(raw_text)
            return OCREngineResult(clean, avg_conf, self.name)
        except Exception as e:
            if not self._runtime_failed:
                print(f"Surya error on {field_name}: {e}")
                self._runtime_failed = True
            return None

# ==========================================
# Azure Document Intelligence — Cloud fallback (paid, highest accuracy)
# pip install azure-ai-documentintelligence
# Set AZURE_DOC_INTELLIGENCE_ENDPOINT and AZURE_DOC_INTELLIGENCE_KEY env vars
# ==========================================

class AzureOCREngine(OCREngine):
    def __init__(self):
        self._client = None
        self._available = None

    def _lazy_init(self):
        if self._available is not None:
            return self._available
        endpoint = os.environ.get("AZURE_DOC_INTELLIGENCE_ENDPOINT")
        key = os.environ.get("AZURE_DOC_INTELLIGENCE_KEY")
        if not endpoint or not key:
            self._available = False
            return False
        try:
            from azure.ai.documentintelligence import DocumentIntelligenceClient
            from azure.core.credentials import AzureKeyCredential
            self._client = DocumentIntelligenceClient(endpoint=endpoint, credential=AzureKeyCredential(key))
            self._available = True
        except ImportError:
            print("Azure Document Intelligence not installed. Install with: pip install azure-ai-documentintelligence")
            self._available = False
        except Exception as e:
            print(f"Azure init failed: {e}")
            self._available = False
        return self._available

    @property
    def name(self) -> str:
        return "azure"

    def recognize(self, crop, field_name: str) -> Optional[OCREngineResult]:
        if not self._lazy_init():
            return None
        try:
            import io
            from PIL import Image
            rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB) if len(crop.shape) == 3 else cv2.cvtColor(crop, cv2.COLOR_GRAY2RGB)
            pil_image = Image.fromarray(rgb)
            buf = io.BytesIO()
            pil_image.save(buf, format="PNG")
            buf.seek(0)

            poller = self._client.begin_analyze_document("prebuilt-read", body=buf, content_type="image/png")
            result = poller.result()

            texts = []
            confs = []
            for page in result.pages:
                words = list(page.words or [])
                for line in list(page.lines or []):
                    texts.append(line.content)
                    line_start = line.spans[0].offset if line.spans else None
                    line_end = (line_start + line.spans[0].length) if line_start is not None else None
                    if line_start is not None:
                        for w in words:
                            ws, wl = w.span.offset, w.span.length
                            if ws >= line_start and ws + wl <= line_end:
                                confs.append(w.confidence)
            raw_text = " ".join(texts)
            avg_conf = float(np.mean(confs)) if confs else 0.0
            clean = clean_ocr_text(raw_text)
            print(f"  azure {field_name}: raw='{raw_text}' clean='{clean}' avg_conf={avg_conf:.3f} n_words={len(confs)}")
            return OCREngineResult(clean, avg_conf, self.name)
        except Exception as e:
            print(f"Azure error on {field_name}: {e}")
            return None

    def recognize_full_page(self, page_img, rois: dict) -> dict:
        """
        Process a full aligned page with Azure DI once, extract fields by ROI position.
        rois: {field_name: (x0_pts, y0_pts, x1_pts, y1_pts)} in points (template coords)
        Returns: {field_name: (text, confidence, is_valid)} or empty for not found
        """
        if not self._lazy_init():
            return {}
        try:
            import io
            from PIL import Image
            rgb = cv2.cvtColor(page_img, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb)
            buf = io.BytesIO()
            pil_image.save(buf, format="PNG")
            buf.seek(0)

            poller = self._client.begin_analyze_document("prebuilt-read", body=buf, content_type="image/png")
            result = poller.result()

            page_h = float(result.pages[0].height)
            page_w = float(result.pages[0].width)
            results = {}

            # Build word list with positions
            words_with_pos = []
            for page in result.pages:
                for word in list(page.words or []):
                    xs = [word.polygon[i] for i in range(0, len(word.polygon), 2)]
                    ys = [word.polygon[i+1] for i in range(0, len(word.polygon), 2)]
                    cx = sum(xs) / len(xs)
                    cy = sum(ys) / len(ys)
                    words_with_pos.append((cx, cy, word.content, word.confidence))

            for field_name, (x0, y0, x1, y1) in rois.items():
                px0 = int(x0 * (page_w / 2484))
                px1 = int(x1 * (page_w / 2484))
                py0 = int(y0 * (page_h / 3509))
                py1 = int(y1 * (page_h / 3509))
                field_words = [w for w in words_with_pos if px0 <= w[0] <= px1 and py0 <= w[1] <= py1]
                if field_words:
                    text = " ".join(w[2] for w in field_words)
                    conf = float(np.mean([w[3] for w in field_words]))
                    clean = clean_ocr_text(text)
                    results[field_name] = (clean, conf, True)
            return results
        except Exception as e:
            print(f"Azure full-page error: {e}")
            return {}

# ==========================================
# OCR Router
# Free first → paid last
# PaddleOCR → Surya → EasyOCR → TrOCR → Azure
# ==========================================

ENGINE_TIMEOUT = 15

# Per-field reprocess uses Azure-first sequential mode (route_override in reprocess_field endpoint)
# Main pipeline: PaddleOCR (best general) → EasyOCR (printed) → TrOCR (handwriting)
# Engines that fail init (e.g. PaddleOCR on macOS, Surya without llama-server) are skipped automatically
FIELD_ENGINE_ROUTES = {
    'roll_number': ['paddleocr', 'easyocr', 'trocr'],
    'class':       ['paddleocr', 'easyocr', 'trocr'],
    'dob':         ['paddleocr', 'easyocr', 'trocr'],
    'gender':      ['paddleocr', 'easyocr'],
    'math_pct':    ['paddleocr', 'easyocr', 'trocr'],
    'science_pct': ['paddleocr', 'easyocr', 'trocr'],
    'language_pct':['paddleocr', 'easyocr', 'trocr'],
    'rank':        ['paddleocr', 'easyocr', 'trocr'],
    'remarks':     ['paddleocr', 'easyocr'],
}

DEFAULT_ENGINE_ROUTE = ['paddleocr', 'easyocr', 'trocr']

class OCRRouter:
    def __init__(self, gpu: bool = True):
        self._engines: dict = {}
        self._engine_order: list = []
        self._executor = ThreadPoolExecutor(max_workers=4)
        self._init_engines(gpu)

    def _init_engines(self, gpu: bool):
        order = ['paddleocr', 'surya', 'easyocr', 'trocr', 'azure']
        engines: list[OCREngine] = [
            PaddleOCREngine(gpu=gpu),
            SuryaOCREngine(),
            EasyOCREngine(gpu=gpu),
            TrOCREngine(),
            AzureOCREngine(),
        ]
        for name, eng in zip(order, engines):
            try:
                if eng._lazy_init():
                    self._engines[name] = eng
            except Exception as e:
                print(f"Engine {name} init failed: {e}")
        self._engine_order = [e for e in order if e in self._engines]
        print(f"OCRRouter: {self._engine_order}")

    def get_available_engines(self) -> list:
        return list(self._engine_order)

    def recognize_field(self, crop, field_name: str, route_override: list = None, sequential: bool = False) -> OCREngineResult:
        from app.modules import FieldType, FIELD_TYPE_MAP, RecognitionResult
        from app.modules.digit_engine import get_digit_engine
        from app.modules.recognition import get_recognition_router
        from app.modules.consensus import compute_consensus
        from app.modules.validation import validate_field
        
        field_type = FIELD_TYPE_MAP.get(field_name, FieldType.PRINTED_TEXT)
        rec_results = []
        
        # 1. Run local Digit CNN if handwritten digits
        if field_type == FieldType.HANDWRITTEN_DIGITS:
            digit_engine = get_digit_engine()
            cnn_res = digit_engine.predict_number(crop)
            norm_val, is_valid = validate_field(field_name, cnn_res.text)[0:2]
            rec_results.append(RecognitionResult(
                text=cnn_res.text,
                confidence=cnn_res.confidence,
                engine="digit_cnn",
                field_name=field_name,
                is_valid=is_valid,
                normalized=norm_val
            ))
            
        # 2. Run EasyOCR / other routers
        router = get_recognition_router()
        # If route_override is provided, filter allowed engines, otherwise use defaults
        allowed = route_override if route_override is not None else ['easyocr']
        for name in allowed:
            plugin = router.get_plugin(name)
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
                    
        # 3. Vote consensus
        consensus = compute_consensus(field_name, rec_results, field_type)
        
        # Return converted OCREngineResult
        return OCREngineResult(
            text=consensus.text,
            confidence=consensus.weight,
            engine_name="consensus"
        )

_router = None

def get_router():
    global _router
    if _router is None:
        _router = OCRRouter(gpu=True)
    return _router

def run_ocr_with_retry(reader, crop, field_name):
    router = get_router()
    normalizer_fn = get_normalizer(field_name)[0]
    result = router.recognize_field(crop, field_name)
    _, is_valid = normalizer_fn(result.text)
    return result.text, result.confidence, is_valid, result.mode

def ocr_remarks(aligned_p2):
    rect = ROIS_REMARKS['remarks']
    x0, y0, x1, y1 = rect
    px0, py0, px1, py1 = int(x0 * ZOOM), int(y0 * ZOOM), int(x1 * ZOOM), int(y1 * ZOOM)
    crop = aligned_p2[py0:py1, px0:px1]
    if crop is None or crop.size == 0:
        return ""
    router = get_router()
    result = router.recognize_field(crop, 'remarks')
    return result.text

def run_ocr_on_fields(aligned_p1, aligned_p2):
    extracted_data = {}
    validation_status = {}
    confidence_scores = {}
    roi_qualities = {}
    preprocessing_modes = {}

    router = get_router()
    all_rois = {**ROIS_P1, **ROIS_P2}

    for field_name, rect in all_rois.items():
        x0, y0, x1, y1 = rect
        px0, py0, px1, py1 = int(x0 * ZOOM), int(y0 * ZOOM), int(x1 * ZOOM), int(y1 * ZOOM)
        page = aligned_p1 if field_name in ROIS_P1 else aligned_p2
        crop = page[py0+5:py1-5, px0:px1] if field_name in ROIS_P1 else page[py0:py1, px0:px1]

        # 4x upscale + CLAHE for small P2 fields (marks, rank) to improve OCR
        if field_name in ROIS_P2:
            h, w = crop.shape[:2]
            if h > 10 and w > 10:
                up = cv2.resize(crop, (w * 4, h * 4), interpolation=cv2.INTER_CUBIC)
                gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
                clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                enhanced = clahe.apply(gray)
                crop = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

        roi_quality = get_roi_quality(crop)
        roi_qualities[field_name] = roi_quality

        result = router.recognize_field(crop, field_name)
        normalizer_fn = get_normalizer(field_name)[0]
        _, is_valid = normalizer_fn(result.text)

        extracted_data[field_name] = result.text
        confidence_scores[field_name] = result.confidence
        validation_status[field_name] = "valid" if is_valid else "invalid"
        preprocessing_modes[field_name] = result.mode if result.engine_name != 'none' else "failed"

    return {
        "data": extracted_data,
        "validation": validation_status,
        "confidences": confidence_scores,
        "roi_qualities": roi_qualities,
        "preprocessing_modes": preprocessing_modes
    }
