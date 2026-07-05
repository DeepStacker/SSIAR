import os
import hashlib
import sqlite3
import time
import cv2
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import Tuple, Optional, Any, Dict
from concurrent.futures import ThreadPoolExecutor, Future
from app.database import get_db_connection

# Sentinel for failed Azure page analysis — prevents repeated retries for every field
_AZURE_PAGE_FAILED = object()

class AzureBillingManager:
    def __init__(self):
        self._init_cache_table()
        self.full_page_results: Dict[Tuple[str, int], Any] = {}
        self._page_futures: Dict[Tuple[str, int], Future] = {}
        self._page_executor = ThreadPoolExecutor(max_workers=2)

    def _init_cache_table(self):
        """Initializes the Azure crop cache table in SQLite."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS azure_crop_cache (
                crop_hash TEXT PRIMARY KEY,
                recognized_text TEXT,
                confidence REAL,
                saved_at TEXT
            )
        """)
        conn.commit()

    def _compute_crop_hash(self, crop: np.ndarray) -> str:
        """Computes SHA-256 hash of the cropped image bytes using fast JPEG encoding."""
        # JPEG at quality 95 is ~5× faster to encode than lossless PNG
        _, encoded = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return hashlib.sha256(encoded.tobytes()).hexdigest()

    def get_cached_result(self, crop: np.ndarray) -> Optional[Tuple[str, float]]:
        """Returns cached Azure result for the crop if it exists."""
        crop_hash = self._compute_crop_hash(crop)
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT recognized_text, confidence FROM azure_crop_cache WHERE crop_hash = ?",
            (crop_hash,)
        )
        row = cursor.fetchone()
        if row:
            print(f"AzureBillingManager: Cache HIT for hash {crop_hash[:10]}")
            return row["recognized_text"], row["confidence"]
        return None

    def save_to_cache(self, crop: np.ndarray, text: str, confidence: float):
        """Saves a new Azure result to the SQLite cache."""
        crop_hash = self._compute_crop_hash(crop)
        now_str = datetime.now().isoformat()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO azure_crop_cache (crop_hash, recognized_text, confidence, saved_at) VALUES (?, ?, ?, ?)",
            (crop_hash, text, confidence, now_str)
        )
        conn.commit()

    def _polygon_intersects_rect(self, polygon, rx0, ry0, rx1, ry1) -> bool:
        """Returns True if the word polygon overlaps with the ROI rectangle."""
        if not polygon or len(polygon) < 8:
            return False
        xs = polygon[0::2]
        ys = polygon[1::2]
        # Use 40% of polygon centroid + 60% from bounding box overlap
        cx = sum(xs) / 4.0
        cy = sum(ys) / 4.0
        if rx0 <= cx <= rx1 and ry0 <= cy <= ry1:
            return True
        # Polygon bounding box
        px0, px1 = min(xs), max(xs)
        py0, py1 = min(ys), max(ys)
        # Check rectangle overlap (at least 25% of polygon area must be inside ROI)
        ox0, ox1 = max(rx0, px0), min(rx1, px1)
        oy0, oy1 = max(ry0, py0), min(ry1, py1)
        if ox0 < ox1 and oy0 < oy1:
            overlap_area = (ox1 - ox0) * (oy1 - oy0)
            poly_area = (px1 - px0) * (py1 - py0)
            if poly_area > 0 and overlap_area / poly_area >= 0.25:
                return True
        return False

    def _extract_roi_text(self, azure_result, roi_rect, zoom: float = 300.0 / 72.0) -> Tuple[str, float]:
        x0, y0, x1, y1 = roi_rect
        px0, py0, px1, py1 = x0 * zoom, y0 * zoom, x1 * zoom, y1 * zoom
        
        pad_x = int(5.0 * zoom)
        pad_y = int(3.0 * zoom)
        rx0, ry0 = px0 - pad_x, py0 - pad_y
        rx1, ry1 = px1 + pad_x, py1 + pad_y
        
        matching_words = []
        for page in getattr(azure_result, "pages", []):
            for word in getattr(page, "words", []):
                if self._polygon_intersects_rect(word.polygon, rx0, ry0, rx1, ry1):
                    matching_words.append(word)
                    
        if not matching_words:
            return "", 0.0
            
        # Sort by y-then-x for reading order (top-to-bottom, left-to-right)
        matching_words.sort(key=lambda w: (sum(w.polygon[1::2]) / 4.0, sum(w.polygon[0::2]) / 4.0))
        
        text = " ".join([w.content for w in matching_words])
        conf = float(np.mean([w.confidence for w in matching_words])) if matching_words else 0.0
        return text, conf

    def get_page_rotation(self, azure_result) -> float:
        """Returns the page rotation angle detected by Azure DI (degrees)."""
        for page in getattr(azure_result, "pages", []):
            return getattr(page, "angle", 0.0)
        return 0.0

    def get_alignment_quality(self, azure_result, expected_rotation: float = 0.0) -> dict:
        """
        Uses Azure's page-level rotation + word polygon spread to validate alignment.
        Returns dict with rotation_angle, word_count, and alignment_score (0-1).
        """
        rotation = self.get_page_rotation(azure_result)
        word_count = 0
        for page in getattr(azure_result, "pages", []):
            word_count += len(getattr(page, "words", []) or [])
        # If Azure detected significant rotation, alignment may be wrong
        rotation_penalty = min(1.0, abs(rotation - expected_rotation) / 10.0)
        alignment_score = max(0.0, 1.0 - rotation_penalty)
        return {
            "rotation_angle": rotation,
            "word_count": word_count,
            "alignment_score": alignment_score
        }

    def _call_azure_page(self, aligned_page_img: np.ndarray, page_num: int, doc_id: str) -> Optional[Any]:
        """Internal: calls Azure DI on a full page with retry logic."""
        from app.ocr.plugin import AzureOCRPlugin
        plugin = AzureOCRPlugin()
        if not plugin.is_available():
            print("AzureBillingManager: Azure Plugin is not available/configured.")
            return None

        max_retries = 3
        backoff_sec = 2.0
        
        for attempt in range(max_retries):
            try:
                print(f"AzureBillingManager: Requesting full page {page_num} Azure analysis (Attempt {attempt+1}/{max_retries})")
                res = plugin.recognize_page(aligned_page_img)
                if res is not None:
                    # Log alignment quality from Azure's perspective
                    qual = self.get_alignment_quality(res)
                    if abs(qual["rotation_angle"]) > 3.0:
                        print(f"AzureBillingManager: Page {page_num} has significant rotation ({qual['rotation_angle']:.1f}°) — alignment may be off")
                    print(f"AzureBillingManager: Page {page_num} done — {qual['word_count']} words, rotation={qual['rotation_angle']:.1f}°, alignment={qual['alignment_score']:.2f}")
                    return res
            except Exception as e:
                print(f"AzureBillingManager: Attempt {attempt+1} failed: {e}")
                
            if attempt < max_retries - 1:
                sleep_time = backoff_sec * (2 ** attempt)
                print(f"AzureBillingManager: Retrying page analysis in {sleep_time:.2f}s...")
                time.sleep(sleep_time)
        
        return None

    def pre_analyze_pages(self, doc_id: str, aligned_p1: np.ndarray, aligned_p2: Optional[np.ndarray] = None, skip: bool = False):
        """
        Pre-fires Azure full-page analysis for both pages in parallel.
        If skip=True, does nothing (caller determined Azure is not needed).
        Results are cached in full_page_results and available for subsequent field lookups.
        BLOCKS until both pages finish — avoids race conditions from parallel field threads
        all trying to call Azure simultaneously.
        """
        if skip:
            return
        import sys
        if "pytest" in sys.modules:
            return

        futs = {}
        key1 = (doc_id, 1)
        if key1 not in self.full_page_results:
            futs[key1] = self._page_executor.submit(
                self._call_azure_page, aligned_p1, 1, doc_id
            )
        
        if aligned_p2 is not None:
            key2 = (doc_id, 2)
            if key2 not in self.full_page_results:
                futs[key2] = self._page_executor.submit(
                self._call_azure_page, aligned_p2, 2, doc_id
                )
        
        # Wait for both pages to complete and cache eagerly
        # This prevents race conditions where parallel field threads all call Azure
        for key, fut in futs.items():
            try:
                result = fut.result(timeout=40)
                self.full_page_results[key] = result if result is not None else _AZURE_PAGE_FAILED
            except Exception as e:
                print(f"AzureBillingManager: Page analysis for {key} failed: {e}")
                self.full_page_results[key] = _AZURE_PAGE_FAILED

    def _get_page_result(self, doc_id: str, page_num: int, aligned_page_img: np.ndarray, field_name: str) -> Optional[Any]:
        """Gets the Azure full-page result from cache. Falls back to a fresh call if uncached."""
        key = (doc_id, page_num)
        
        # Fast path: check in-memory cache (eagerly filled by pre_analyze_pages)
        if key in self.full_page_results:
            cached = self.full_page_results[key]
            if cached is _AZURE_PAGE_FAILED:
                return None
            return cached
        
        # Cold path: no pre-analyze was done — call Azure synchronously
        result = self._call_azure_page(aligned_page_img, page_num, doc_id)
        self.full_page_results[key] = result if result is not None else _AZURE_PAGE_FAILED
        return result

    def recognize_field_with_backoff(
        self,
        doc_id: str,
        field_name: str,
        aligned_page_img: np.ndarray,
        page_num: int,
        roi_rect: Tuple[float, float, float, float],
        crop: np.ndarray
    ) -> Optional[Tuple[str, float]]:
        """
        Retrieves OCR text and confidence for a specific ROI field from Azure.
        Uses crop-level SQLite cache first, then full-page memory cache.
        Calls Azure DI on the entire aligned page if a cache miss occurs.
        """
        import sys
        if "pytest" in sys.modules:
            return None

        # 1. Check local crop cache first
        cached = self.get_cached_result(crop)
        if cached is not None:
            return cached

        # 2. Get full page result (from pre-fired future or fresh call)
        azure_result = self._get_page_result(doc_id, page_num, aligned_page_img, field_name)

        if azure_result is None:
            return None

        # 3. Extract text from the full-page result
        text, confidence = self._extract_roi_text(azure_result, roi_rect)
        
        # 4. Save to crop cache for fast future lookups
        self.save_to_cache(crop, text, confidence)
        return text, confidence

_billing_manager = None

def get_billing_manager() -> AzureBillingManager:
    global _billing_manager
    if _billing_manager is None:
        _billing_manager = AzureBillingManager()
    return _billing_manager
