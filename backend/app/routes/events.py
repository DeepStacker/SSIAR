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
from app.image.storage import PROCESSED_DIR
from app.sse import subscribe, unsubscribe

router = APIRouter()


@router.get("/api/crops/{doc_id}/{filename}")
def serve_crop(doc_id: str, filename: str):
    crop_name = filename.replace('.png', '')
    
    # Fast path: serve pre-stored ROI crop directly (avoids full-page decode + re-extraction)
    roi_path = PROCESSED_DIR / doc_id / f"roi_{crop_name}.jpg"
    if roi_path.exists():
        return FileResponse(str(roi_path), media_type="image/jpeg")
    
    # Fast path: serve pre-stored aligned page directly
    if crop_name in ("aligned_p1", "aligned_p2"):
        page_num = 1 if crop_name == "aligned_p1" else 2
        page_path = PROCESSED_DIR / doc_id / f"page_{page_num}.jpg"
        if page_path.exists():
            return FileResponse(str(page_path), media_type="image/jpeg")
    
    page_num = get_crop_page(crop_name)
    img_bytes = get_page_image(doc_id, page_num)

    # Fallback: old documents may still have crops on filesystem
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
    """Serves the full aligned page image directly from disk."""
    page_path = PROCESSED_DIR / doc_id / f"page_{page_num}.jpg"
    if page_path.exists():
        return FileResponse(str(page_path), media_type="image/jpeg")
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
