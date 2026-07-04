import os
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
import cv2
import numpy as np
import re
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Tuple
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import FieldType, FIELD_TYPE_MAP, RecognitionResult

# Unified OCR Engine Result
class OCREngineResult:
    __slots__ = ('text', 'confidence', 'engine_name', 'mode')
    def __init__(self, text: str, confidence: float, engine_name: str, mode: str = "standard"):
        self.text = text
        self.confidence = confidence
        self.engine_name = engine_name
        self.mode = mode

class OCREngine(ABC):
    @abstractmethod
    def recognize(self, crop: np.ndarray, field_name: str) -> Optional[OCREngineResult]:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass

# ---------------------------------------------------------------------------
# Engine Plugin: EasyOCR
# ---------------------------------------------------------------------------
class EasyOCRPlugin(OCREngine):
    def __init__(self, gpu: bool = True):
        self._reader = None
        self._gpu = gpu
        self._available = None

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            import easyocr
            self._available = True
        except ImportError:
            self._available = False
        return self._available

    def _init_reader(self):
        if self._reader is not None:
            return
        import easyocr
        # Load English + Hindi models
        self._reader = easyocr.Reader(['hi', 'en'], gpu=self._gpu)

    def name(self) -> str:
        return "easyocr"

    def recognize(self, crop: np.ndarray, field_name: str) -> Optional[OCREngineResult]:
        if not self.is_available():
            return None
        self._init_reader()
        
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
        
        try:
            results = self._reader.readtext(gray)
            if not results:
                return OCREngineResult("", 0.0, self.name())
            text = " ".join([r[1] for r in results])
            conf = float(np.mean([r[2] for r in results]))
            return OCREngineResult(text, conf, self.name())
        except Exception as e:
            print(f"EasyOCRPlugin Error on {field_name}: {e}")
            return None

# ---------------------------------------------------------------------------
# Engine Plugin: PaddleOCR
# ---------------------------------------------------------------------------
class PaddleOCRPlugin(OCREngine):
    def __init__(self, gpu: bool = True):
        self._ocr = None
        self._gpu = gpu
        self._available = None

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            from paddleocr import PaddleOCR
            import paddle
            self._available = True
        except Exception:
            self._available = False
        return self._available

    def _init_ocr(self):
        if self._ocr is not None:
            return
        from paddleocr import PaddleOCR
        import sys
        old_argv = sys.argv
        sys.argv = [sys.argv[0]]
        try:
            self._ocr = PaddleOCR(use_angle_cls=False, lang="hi", use_gpu=self._gpu, show_log=False)
        finally:
            sys.argv = old_argv

    def name(self) -> str:
        return "paddleocr"

    def recognize(self, crop: np.ndarray, field_name: str) -> Optional[OCREngineResult]:
        if not self.is_available():
            return None
        self._init_ocr()
        
        try:
            # PaddleOCR expects BGR image array
            result = self._ocr.ocr(crop, cls=False)
            if not result or not result[0]:
                return OCREngineResult("", 0.0, self.name())
            
            lines = result[0]
            texts = []
            confs = []
            for line in lines:
                text_info = line[1]
                texts.append(text_info[0])
                confs.append(float(text_info[1]))
                
            combined_text = " ".join(texts)
            avg_conf = float(np.mean(confs)) if confs else 0.0
            return OCREngineResult(combined_text, avg_conf, self.name())
        except Exception as e:
            print(f"PaddleOCRPlugin Error on {field_name}: {e}")
            return None

# ---------------------------------------------------------------------------
# Engine Plugin: SuryaOCR
# ---------------------------------------------------------------------------
class SuryaOCRPlugin(OCREngine):
    def __init__(self):
        self._predictor = None
        self._available = None

    def is_available(self) -> bool:
        if os.environ.get("SURYA_ENABLED") != "1":
            return False
        if self._available is not None:
            return self._available
        try:
            from surya.recognition import RecognitionPredictor
            self._available = True
        except ImportError:
            self._available = False
        return self._available

    def _init_predictor(self):
        if self._predictor is not None:
            return
        from surya.inference import SuryaInferenceManager
        from surya.recognition import RecognitionPredictor
        try:
            self._manager = SuryaInferenceManager()
            self._predictor = RecognitionPredictor(self._manager)
        except Exception:
            self._predictor = RecognitionPredictor()

    def name(self) -> str:
        return "surya"

    def recognize(self, crop: np.ndarray, field_name: str) -> Optional[OCREngineResult]:
        if not self.is_available():
            return None
        self._init_predictor()
        
        try:
            from PIL import Image
            rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB) if len(crop.shape) == 3 else cv2.cvtColor(crop, cv2.COLOR_GRAY2RGB)
            pil_img = Image.fromarray(rgb)
            # Use full_page=True to auto-detect text layout/lines in crop
            predictions = self._predictor([pil_img], full_page=True)
            if not predictions or len(predictions) == 0:
                return OCREngineResult("", 0.0, self.name())
                
            texts = []
            confs = []
            for page_result in predictions:
                if hasattr(page_result, 'text_lines'):
                    for line in page_result.text_lines:
                        texts.append(line.text)
                        confs.append(line.confidence)
            
            text = " ".join(texts).strip()
            conf = float(np.mean(confs)) if confs else 0.8
            return OCREngineResult(text, conf, self.name())
        except Exception as e:
            print(f"SuryaOCRPlugin Error on {field_name}: {e}")
            return None

# ---------------------------------------------------------------------------
# Engine Plugin: Azure DI
# ---------------------------------------------------------------------------
class AzureOCRPlugin(OCREngine):
    def __init__(self):
        self._client = None
        self._available = None

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        endpoint = os.environ.get("AZURE_DOC_INTELLIGENCE_ENDPOINT")
        key = os.environ.get("AZURE_DOC_INTELLIGENCE_KEY")
        if not endpoint or not key:
            self._available = False
            return False
        try:
            from azure.ai.documentintelligence import DocumentIntelligenceClient
            self._available = True
        except ImportError:
            self._available = False
        return self._available

    def _init_client(self):
        if self._client is not None:
            return
        endpoint = os.environ.get("AZURE_DOC_INTELLIGENCE_ENDPOINT")
        key = os.environ.get("AZURE_DOC_INTELLIGENCE_KEY")
        from azure.ai.documentintelligence import DocumentIntelligenceClient
        from azure.core.credentials import AzureKeyCredential
        # Set client network timeout parameters
        self._client = DocumentIntelligenceClient(
            endpoint=endpoint, 
            credential=AzureKeyCredential(key),
            connection_timeout=5,
            read_timeout=5
        )

    def name(self) -> str:
        return "azure"

    def recognize(self, crop: np.ndarray, field_name: str) -> Optional[OCREngineResult]:
        if not self.is_available():
            return None
        self._init_client()
        
        try:
            import io
            from PIL import Image
            
            pil_img = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG")
            buf.seek(0)
            
            poller = self._client.begin_analyze_document(
                "prebuilt-read",
                body=buf,
                content_type="image/png"
            )
            # Enforce strict 10 second timeout on operation completion
            result = poller.result(timeout=10)
            
            texts = []
            confs = []
            for page in result.pages:
                for line in (page.lines or []):
                    texts.append(line.content)
                # Word-level confidences
                for word in (page.words or []):
                    confs.append(word.confidence)
                    
            combined_text = " ".join(texts)
            avg_conf = float(np.mean(confs)) if confs else 0.0
            return OCREngineResult(combined_text, avg_conf, self.name())
        except Exception as e:
            print(f"AzureOCRPlugin Error on {field_name}: {e}")
            return None

    def recognize_page(self, page_img: np.ndarray) -> Optional[Any]:
        """Sends the entire aligned page to Azure Document Intelligence Read model."""
        if not self.is_available():
            return None
        self._init_client()
        try:
            import io
            from PIL import Image
            
            pil_img = Image.fromarray(cv2.cvtColor(page_img, cv2.COLOR_BGR2RGB))
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG")
            buf.seek(0)
            
            poller = self._client.begin_analyze_document(
                "prebuilt-read",
                body=buf,
                content_type="image/png"
            )
            # Enforce 20 second timeout for the entire page
            result = poller.result(timeout=20)
            return result
        except Exception as e:
            print(f"AzureOCRPlugin recognize_page Error: {e}")
            return None

# ---------------------------------------------------------------------------
# Printed Text Routing & Benchmarking
# ---------------------------------------------------------------------------
class PrintedTextRouter:
    def __init__(self, gpu: bool = True):
        self._plugins: Dict[str, OCREngine] = {}
        self._init_plugins(gpu)

    def _init_plugins(self, gpu: bool):
        plugins = [
            PaddleOCRPlugin(gpu=gpu),
            EasyOCRPlugin(gpu=gpu),
            SuryaOCRPlugin(),
            AzureOCRPlugin()
        ]
        for p in plugins:
            if p.is_available():
                self._plugins[p.name()] = p
        print("PrintedTextRouter: Loaded plugins", list(self._plugins.keys()))

    def get_plugin(self, name: str) -> Optional[OCREngine]:
        return self._plugins.get(name)

    def recognize_benchmark(self, crop: np.ndarray, field_name: str, allowed_engines: List[str] = None) -> OCREngineResult:
        """
        Runs multiple engines sequentially and chooses the one returning the highest confidence.
        """
        engines_to_run = allowed_engines if allowed_engines is not None else list(self._plugins.keys())
        # Filter to available plugins and avoid Azure for general benchmarking (cost reduction)
        if allowed_engines is None and "azure" in engines_to_run:
            engines_to_run.remove("azure")  # Keep Azure as last resort
            
        best_res = OCREngineResult("", 0.0, "none")
        for name in engines_to_run:
            plugin = self._plugins.get(name)
            if plugin:
                try:
                    res = plugin.recognize(crop, field_name)
                    if res and res.confidence > best_res.confidence:
                        best_res = res
                except Exception as e:
                    print(f"Plugin {name} failed: {e}")
                    
        return best_res

_router = None

def get_recognition_router() -> PrintedTextRouter:
    global _router
    if _router is None:
        _router = PrintedTextRouter()
    return _router
