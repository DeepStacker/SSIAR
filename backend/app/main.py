import os
import gzip
import io
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.middleware import MaxBodySizeMiddleware
from app.database import init_db, get_db_connection, put_conn, USE_POSTGRES

import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi import Request


class CompressionMiddleware(BaseHTTPMiddleware):
    """Brotli/Gzip response compression for JSON and text responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        content_type = response.headers.get("content-type", "")
        if not any(t in content_type for t in ("application/json", "text/plain", "text/html")):
            return response

        accept_encoding = request.headers.get("accept-encoding", "")
        supports_br = "br" in accept_encoding
        supports_gzip = "gzip" in accept_encoding
        if not supports_br and not supports_gzip:
            return response

        body = b""
        if hasattr(response, "body"):
            body = response.body
        elif hasattr(response, "body_iterator"):
            async for chunk in response.body_iterator:
                if isinstance(chunk, bytes):
                    body += chunk

        if len(body) <= 500:
            return Response(
                content=body,
                status_code=response.status_code,
                headers=response.headers,
                media_type=content_type,
            )

        if supports_br:
            try:
                import brotli
                compressed = brotli.compress(body, quality=4)
                headers = dict(response.headers)
                headers["content-encoding"] = "br"
                headers["content-length"] = str(len(compressed))
                return Response(content=compressed, status_code=response.status_code, headers=headers, media_type=content_type)
            except ImportError:
                pass

        if supports_gzip:
            try:
                buf = io.BytesIO()
                with gzip.GzipFile(fileobj=buf, mode='wb') as f:
                    f.write(body)
                compressed = buf.getvalue()
                headers = dict(response.headers)
                headers["content-encoding"] = "gzip"
                headers["content-length"] = str(len(compressed))
                return Response(content=compressed, status_code=response.status_code, headers=headers, media_type=content_type)
            except Exception:
                pass

        return Response(
            content=body,
            status_code=response.status_code,
            headers=response.headers,
            media_type=content_type,
        )

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 200):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.client_records = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        records = self.client_records[client_ip]
        self.client_records[client_ip] = [t for t in records if now - t < 60]
        if not self.client_records[client_ip]:
            del self.client_records[client_ip]

        if len(self.client_records.get(client_ip, [])) >= self.requests_per_minute:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."}
            )

        self.client_records[client_ip].append(now)
        return await call_next(request)


class LoginRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, attempts_per_minute: int = 10):
        super().__init__(app)
        self.attempts_per_minute = attempts_per_minute
        self.client_records = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not (path.endswith("/auth/login") or path.endswith("/auth/register")):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        records = self.client_records[client_ip]
        self.client_records[client_ip] = [t for t in records if now - t < 60]
        if not self.client_records[client_ip]:
            del self.client_records[client_ip]

        if len(self.client_records.get(client_ip, [])) >= self.attempts_per_minute:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many login attempts. Please try again later."}
            )

        self.client_records[client_ip].append(now)
        return await call_next(request)


app = FastAPI(title="SSIAR Document Intelligence Platform V2")

_allowed_origins = os.environ.get("CORS_ORIGINS", "").split(",") if os.environ.get("CORS_ORIGINS") else ["http://localhost:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(CompressionMiddleware)
app.add_middleware(LoginRateLimitMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=250)
app.add_middleware(MaxBodySizeMiddleware)

from app.api.v1.auth import router as auth_router
from app.api.v2.documents import router as documents_router
from app.api.v2.upload import router as upload_router
from app.api.v2.export import router as export_router
from app.api.v2.review import router as review_router
from app.api.v1.analytics import router as domain_analytics_router
from app.api.v3.router import v3_router
from app.core.response import APIResponse
from fastapi import HTTPException
from fastapi.responses import JSONResponse

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return APIResponse.error(status=exc.status_code, message=exc.detail)

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(upload_router)
app.include_router(export_router)
app.include_router(review_router)
app.include_router(domain_analytics_router)
app.include_router(v3_router)


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "SSIAR Document Intelligence Platform V2"}


@app.on_event("startup")
def startup_event():
    init_db()
    from app.processing.templates import init_templates_v2
    init_templates_v2()

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE documents SET status = 'failed', escalation_level = 'level_4' WHERE status = 'processing'"
        )
        stalled = cur.rowcount
        conn.commit()
        if stalled:
            print(f"Marked {stalled} stalled document(s) as failed (server restarted while processing)")
    finally:
        put_conn(conn)


@app.on_event("shutdown")
def shutdown_event():
    if USE_POSTGRES:
        from app.database.connection import _pool
        if _pool:
            _pool.closeall()
