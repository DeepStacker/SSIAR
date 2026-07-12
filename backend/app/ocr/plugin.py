import os
import cv2
import numpy as np
from abc import ABC, abstractmethod
from typing import Optional, Any

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
        self._client = DocumentIntelligenceClient(
            endpoint=endpoint,
            credential=AzureKeyCredential(key),
            connection_timeout=15,
            read_timeout=30
        )

    def name(self) -> str:
        return "azure"

    def recognize(self, crop: np.ndarray, field_name: str) -> Optional[OCREngineResult]:
        if not self.is_available():
            return None
        self._init_client()
        import io
        import time
        _, jpeg_buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
        
        max_retries = 3
        backoff = 1.0
        for attempt in range(max_retries):
            try:
                buf = io.BytesIO(jpeg_buf.tobytes())
                poller = self._client.begin_analyze_document(
                    "prebuilt-read",
                    body=buf,
                    content_type="image/jpeg"
                )
                result = poller.result(timeout=20)
                texts = []
                confs = []
                for page in result.pages:
                    for line in (page.lines or []):
                        texts.append(line.content)
                    for word in (page.words or []):
                        confs.append(word.confidence)
                combined_text = " ".join(texts)
                avg_conf = float(np.mean(confs)) if confs else 0.0
                return OCREngineResult(combined_text, avg_conf, self.name())
            except Exception as e:
                print(f"AzureOCRPlugin Error on {field_name} (attempt {attempt+1}/{max_retries}): {e}")
                if attempt == max_retries - 1:
                    return None
                time.sleep(backoff * (2 ** attempt))

    def recognize_page(self, page_img: np.ndarray) -> Optional[Any]:
        if not self.is_available():
            return None
        self._init_client()
        import io
        import time
        _, jpeg_buf = cv2.imencode('.jpg', page_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        
        max_retries = 4
        backoff = 2.0
        for attempt in range(max_retries):
            try:
                buf = io.BytesIO(jpeg_buf.tobytes())
                poller = self._client.begin_analyze_document(
                    "prebuilt-layout",
                    body=buf,
                    content_type="image/jpeg"
                )
                result = poller.result(timeout=45)
                return result
            except Exception as e:
                print(f"AzureOCRPlugin recognize_page Error (attempt {attempt+1}/{max_retries}): {e}")
                if attempt == max_retries - 1:
                    return None
                time.sleep(backoff * (2 ** attempt))

_azure_plugin = None

def get_azure_plugin() -> AzureOCRPlugin:
    global _azure_plugin
    if _azure_plugin is None:
        _azure_plugin = AzureOCRPlugin()
    return _azure_plugin
