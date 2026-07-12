"""Shared page image and Azure coordinate utilities.

Extracted from app.api.v2.documents to break the circular dependency
services → api that existed when review_tasks.py imported _get_page / _get_azure_scale
from the API router module.
"""
import cv2
import json
import numpy as np
from typing import Optional
from app.database import get_page_image, get_db_connection, put_conn


# ── Page image cache (LRU, max 4 pages) ──────────────────────────────────

_cache_page: dict[tuple[str, int], np.ndarray] = {}
_page_order: list[tuple[str, int]] = []


def get_page(doc_id: str, page_num: int) -> np.ndarray | None:
    """Load a page image with an LRU cache (shared across the process)."""
    key = (doc_id, page_num)
    if key in _cache_page:
        return _cache_page[key]
    img_bytes = get_page_image(doc_id, page_num)
    if not img_bytes:
        return None
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if len(_cache_page) >= 4:
        oldest = _page_order.pop(0)
        _cache_page.pop(oldest, None)
    _cache_page[key] = img
    _page_order.append(key)
    return img


# ── Crop image cache (LRU, max 256 crops) ────────────────────────────────

_cache_crop: dict[tuple[str, str], bytes] = {}
_crop_order: list[tuple[str, str]] = []


def cache_crop_set(key: tuple[str, str], value: bytes):
    if len(_cache_crop) >= 256:
        oldest = _crop_order.pop(0)
        _cache_crop.pop(oldest, None)
    _cache_crop[key] = value
    _crop_order.append(key)


# ── Azure coordinate scaling ────────────────────────────────────────────


def get_azure_scale(doc_id: str, page_num: int, img_w: int, img_h: int) -> tuple[float, float]:
    """Compute scale factors from Azure coordinate space → actual image pixel space.

    Handles both flat (*{"pages": [...]}*) and per-page
    (*{"page_1": {…}, "page_2": {…}}*) Azure response storage formats.
    """
    scaled_azure_w = 2483.0   # A4 @ 300 DPI fallback
    scaled_azure_h = 3508.0

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        from app.database import USE_POSTGRES
        cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = %s" if USE_POSTGRES else "SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
        row = cur.fetchone()
        if row and row[0]:
            try:
                raw_dict = json.loads(row[0])
                pages_list = raw_dict.get("pages", [])
                if not pages_list:
                    pg_key = f"page_{page_num}"
                    sub_result = raw_dict.get(pg_key, {})
                    if isinstance(sub_result, dict):
                        pages_list = sub_result.get("pages", [])
                for p in pages_list:
                    p_num = p.get("pageNumber", p.get("page", 1))
                    if p_num == page_num or len(pages_list) == 1:
                        w_val = p.get("width", 0.0)
                        h_val = p.get("height", 0.0)
                        unit_val = p.get("unit", "inch")
                        scale_val = 300.0 if unit_val == "inch" else 1.0
                        scaled_azure_w = w_val * scale_val
                        scaled_azure_h = h_val * scale_val
                        break
            except Exception:
                pass
    finally:
        put_conn(conn)

    scaled_azure_w = max(1.0, scaled_azure_w)
    scaled_azure_h = max(1.0, scaled_azure_h)
    return img_w / scaled_azure_w, img_h / scaled_azure_h
