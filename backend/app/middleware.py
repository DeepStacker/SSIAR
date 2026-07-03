from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import MAX_UPLOAD_SIZE


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"Request body exceeds maximum upload size of {MAX_UPLOAD_SIZE // (1024*1024)} MB"
            )
        return await call_next(request)
