import json
import asyncio
import os
import cv2
import numpy as np
from functools import lru_cache
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response, FileResponse, StreamingResponse
from app.database import get_page_image
from app.image.crops import extract_crop, get_crop_page
from app.config import TEMP_DIR
from app.image.storage import PROCESSED_DIR, get_roi_file, store_roi_file, get_page_image_file
from app.sse import subscribe, unsubscribe
from app.config import R2_PUBLIC_URL, use_r2
from app.auth import require_auth, get_current_user_id

router = APIRouter()


_cache_page = {}
_page_order: list = []


def _get_page(doc_id: str, page_num: int) -> np.ndarray | None:
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


_cache_crop: dict[tuple[str, str], bytes] = {}
_crop_order: list = []


def _cache_crop_set(key: tuple[str, str], value: bytes):
    if len(_cache_crop) >= 256:
        oldest = _crop_order.pop(0)
        _cache_crop.pop(oldest, None)
    _cache_crop[key] = value
    _crop_order.append(key)


@router.get("/api/crops/{doc_id}/{filename}", dependencies=[Depends(require_auth)])
def serve_crop(doc_id: str, filename: str):
    crop_name = filename.replace('.png', '')
    cache_key = (doc_id, crop_name)

    if cache_key in _cache_crop:
        return Response(content=_cache_crop[cache_key], media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=3600"})

    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/rois/{doc_id}/roi_{crop_name}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    roi_bytes = get_roi_file(doc_id, crop_name)
    if roi_bytes:
        _cache_crop_set(cache_key, roi_bytes)
        return Response(content=roi_bytes, media_type="image/jpeg",
                        headers={"Cache-Control": "private, max-age=86400"})

    page_num = get_crop_page(crop_name)
    aligned_img = _get_page(doc_id, page_num)

    if aligned_img is None:
        legacy_path = os.path.join(os.path.dirname(TEMP_DIR), "processed", doc_id, filename)
        if os.path.exists(legacy_path):
            return FileResponse(legacy_path)
        raise HTTPException(status_code=404, detail="Crop not found")

    crop = extract_crop(aligned_img, crop_name)
    if crop is None or crop.size == 0:
        legacy_path = os.path.join(os.path.dirname(TEMP_DIR), "processed", doc_id, filename)
        if os.path.exists(legacy_path):
            return FileResponse(legacy_path)
        raise HTTPException(status_code=404, detail="Crop region not found")

    _, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
    crop_bytes = buf.tobytes()
    _cache_crop_set(cache_key, crop_bytes)
    store_roi_file(doc_id, crop_name, crop)
    return Response(content=crop_bytes, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=3600"})


@router.get("/api/pages/{doc_id}/{page_num}", dependencies=[Depends(require_auth)])
def serve_page(doc_id: str, page_num: int):
    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/pages/{doc_id}/page_{page_num}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    page_path = PROCESSED_DIR / doc_id / f"page_{page_num}.jpg"
    if page_path.exists():
        return FileResponse(str(page_path), media_type="image/jpeg",
                            headers={"Cache-Control": "public, max-age=86400"})

    img_bytes = get_page_image_file(doc_id, page_num)
    if img_bytes:
        return Response(content=img_bytes, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})

    raise HTTPException(status_code=404, detail="Page not found")


@router.get("/api/events", dependencies=[Depends(require_auth)])
async def sse_events(request: Request):
    user_id = request.state.user_id
    queue = subscribe(user_id=user_id)

    async def event_generator():
        try:
            yield "data: {\"event\": \"connected\"}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )
