import json
import asyncio
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse
from app.database import get_page_image
from app.crops import extract_crop, get_crop_page
from app.sse import subscribe, unsubscribe

router = APIRouter()


@router.get("/api/crops/{doc_id}/{filename}")
def serve_crop(doc_id: str, filename: str):
    crop_name = filename.replace('.png', '')
    page_num = get_crop_page(crop_name)
    img_bytes = get_page_image(doc_id, page_num)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Aligned page not found in database")

    nparr = np.frombuffer(img_bytes, np.uint8)
    aligned_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if aligned_img is None:
        raise HTTPException(status_code=500, detail="Failed to decode aligned page")

    if crop_name in ("aligned_p1", "aligned_p2"):
        return Response(content=img_bytes, media_type="image/png")

    crop = extract_crop(aligned_img, crop_name)
    if crop is None or crop.size == 0:
        raise HTTPException(status_code=404, detail="Crop region not found")

    _, buf = cv2.imencode('.png', crop)
    return Response(content=buf.tobytes(), media_type="image/png")


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
