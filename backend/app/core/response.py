from typing import Any, Optional
from fastapi.responses import JSONResponse


class APIResponse:
    @staticmethod
    def success(data: Any = None, message: str = "OK", meta: Optional[dict] = None):
        return JSONResponse({
            "success": True,
            "data": data,
            "message": message,
            "meta": meta or {}
        })

    _status_code_to_code = {
        400: "VALIDATION_ERROR",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
    }

    @staticmethod
    def error(status: int = 400, code: str = None, message: str = "", details: dict = None):
        if code is None:
            code = APIResponse._status_code_to_code.get(status, "BAD_REQUEST")
        return JSONResponse(
            status_code=status,
            content={
                "success": False,
                "error": {
                    "code": code,
                    "message": message,
                    "details": details or {}
                }
            }
        )
