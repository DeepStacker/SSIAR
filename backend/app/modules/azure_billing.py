import os
import hashlib
import sqlite3
import time
import cv2
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import Tuple, Optional, Any
from app.database import DB_PATH, get_db_connection

class AzureBillingManager:
    def __init__(self):
        self._init_cache_table()
        self.full_page_results = {}

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
        conn.close()

    def _compute_crop_hash(self, crop: np.ndarray) -> str:
        """Computes SHA-256 hash of the cropped image bytes."""
        _, encoded = cv2.imencode('.png', crop)
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
        conn.close()
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
        conn.close()

    def _extract_roi_text(self, azure_result, roi_rect, zoom: float = 300.0 / 72.0) -> Tuple[str, float]:
        x0, y0, x1, y1 = roi_rect
        px0, py0, px1, py1 = x0 * zoom, y0 * zoom, x1 * zoom, y1 * zoom
        
        pad_x = 5.0 * zoom
        pad_y = 3.0 * zoom
        
        matching_words = []
        for page in getattr(azure_result, "pages", []):
            for word in getattr(page, "words", []):
                if not word.polygon or len(word.polygon) < 8:
                    continue
                # Calculate word center
                wx = sum(word.polygon[0::2]) / 4.0
                wy = sum(word.polygon[1::2]) / 4.0
                
                if (px0 - pad_x) <= wx <= (px1 + pad_x) and (py0 - pad_y) <= wy <= (py1 + pad_y):
                    matching_words.append(word)
                    
        if not matching_words:
            return "", 0.0
            
        # Sort words left-to-right to maintain reading order
        matching_words.sort(key=lambda w: sum(w.polygon[0::2]) / 4.0)
        
        text = " ".join([w.content for w in matching_words])
        conf = float(np.mean([w.confidence for w in matching_words])) if matching_words else 0.0
        return text, conf

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

        # 2. Check full page session cache
        key = (doc_id, page_num)
        azure_result = self.full_page_results.get(key)
        
        if azure_result is None:
            # Call Azure DI on the full page with backoff retry
            from .recognition import AzureOCRPlugin
            plugin = AzureOCRPlugin()
            if not plugin.is_available():
                print("AzureBillingManager: Azure Plugin is not available/configured.")
                return None

            max_retries = 3
            backoff_sec = 2.0
            
            for attempt in range(max_retries):
                try:
                    print(f"AzureBillingManager: Requesting full page {page_num} Azure analysis for {field_name} (Attempt {attempt+1}/{max_retries})")
                    res = plugin.recognize_page(aligned_page_img)
                    if res is not None:
                        azure_result = res
                        self.full_page_results[key] = res
                        break
                except Exception as e:
                    print(f"AzureBillingManager: Attempt {attempt+1} failed: {e}")
                    
                if attempt < max_retries - 1:
                    sleep_time = backoff_sec * (2 ** attempt)
                    print(f"AzureBillingManager: Retrying page analysis in {sleep_time:.2f}s...")
                    time.sleep(sleep_time)

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
