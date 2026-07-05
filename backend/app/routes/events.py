import json
import asyncio
import os
import cv2
import numpy as np
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, FileResponse, StreamingResponse
from app.database import get_page_image
from app.image.crops import extract_crop, get_crop_page
from app.config import TEMP_DIR
from app.image.storage import PROCESSED_DIR, get_roi_file, get_page_image_file
from app.sse import subscribe, unsubscribe
from app.config import R2_PUBLIC_URL, use_r2

router = APIRouter()


@router.get("/api/crops/{doc_id}/{filename}")
def serve_crop(doc_id: str, filename: str):
    crop_name = filename.replace('.png', '')

    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/rois/{doc_id}/roi_{crop_name}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    roi_bytes = get_roi_file(doc_id, crop_name)
    if roi_bytes:
        return Response(content=roi_bytes, media_type="image/jpeg")

    page_num = get_crop_page(crop_name)
    img_bytes = get_page_image(doc_id, page_num)

    if not img_bytes:
        legacy_path = os.path.join(os.path.dirname(TEMP_DIR), "processed", doc_id, filename)
        if os.path.exists(legacy_path):
            return FileResponse(legacy_path)
        raise HTTPException(status_code=404, detail="Crop not found")

    nparr = np.frombuffer(img_bytes, np.uint8)
    aligned_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if aligned_img is None:
        raise HTTPException(status_code=500, detail="Failed to decode aligned page")

    crop = extract_crop(aligned_img, crop_name)
    if crop is None or crop.size == 0:
        legacy_path = os.path.join(os.path.dirname(TEMP_DIR), "processed", doc_id, filename)
        if os.path.exists(legacy_path):
            return FileResponse(legacy_path)
        raise HTTPException(status_code=404, detail="Crop region not found")

    _, buf = cv2.imencode('.png', crop)
    return Response(content=buf.tobytes(), media_type="image/png")


@router.get("/api/pages/{doc_id}/{page_num}")
def serve_page(doc_id: str, page_num: int):
    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/pages/{doc_id}/page_{page_num}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    page_path = PROCESSED_DIR / doc_id / f"page_{page_num}.jpg"
    if page_path.exists():
        return FileResponse(str(page_path), media_type="image/jpeg")

    img_bytes = get_page_image_file(doc_id, page_num)
    if img_bytes:
        return Response(content=img_bytes, media_type="image/jpeg")

    raise HTTPException(status_code=404, detail="Page not found")


@router.get("/api/events")
async def sse_events():
    queue = subscribe()

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
