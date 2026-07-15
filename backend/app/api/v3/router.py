"""
V3 API Router
==============
Clean V3 API under /api/v3/* that delegates to existing v1/v2 handlers.
"""
import logging
import hashlib
import json
from typing import Optional, List
from fastapi import APIRouter, Depends, Form, Query, Request, UploadFile, File, HTTPException
from fastapi.responses import Response
from app.auth import require_auth
from app.core.response import APIResponse
from app.models import RegisterRequest, LoginRequest, VerifyDataRequest, BulkRequest, BatchFolderRequest, UpdateRoleRequest, UpdateUserRequest, AdminResetPasswordRequest

logger = logging.getLogger("v3_router")

v3_router = APIRouter(prefix="/api/v3")
_Auth = Depends(require_auth)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _call(handler, *args, **kwargs):
    try:
        data = handler(*args, **kwargs)
        return APIResponse.success(data=data)
    except HTTPException as e:
        return APIResponse.error(status=e.status_code, message=e.detail)
    except Exception as e:
        logger.exception("Internal server error in %s", handler.__name__ if hasattr(handler, '__name__') else 'handler')
        return APIResponse.error(status=500, message="Internal server error")


async def _call_async(handler, *args, **kwargs):
    try:
        data = await handler(*args, **kwargs)
        return APIResponse.success(data=data)
    except HTTPException as e:
        return APIResponse.error(status=e.status_code, message=e.detail)
    except Exception as e:
        logger.exception("Internal server error in async handler")
        return APIResponse.error(status=500, message="Internal server error")


def _compute_etag(data) -> str:
    if isinstance(data, dict):
        timestamp = str(data.get("updated_at") or data.get("created_at") or "")
        data_str = json.dumps(data, sort_keys=True, default=str) + timestamp
    else:
        data_str = json.dumps(data, sort_keys=True, default=str)
    return hashlib.md5(data_str.encode()).hexdigest()


def _add_cache_headers(response, max_age: int):
    response.headers["Cache-Control"] = f"private, max-age={max_age}"


def _respond_with_etag(data, request: Request, max_age: int = 10):
    etag = _compute_etag(data)
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304, headers={"ETag": f'"{etag}"'})
    response = APIResponse.success(data=data)
    _add_cache_headers(response, max_age)
    response.headers["ETag"] = f'"{etag}"'
    return response


# ---------------------------------------------------------------------------
# Auth  (no auth required for register / login; refresh needs auth)
# ---------------------------------------------------------------------------
from app.api.v1.auth import (
    register as _auth_register,
    login as _auth_login,
    refresh_token as _auth_refresh,
    list_users as _auth_list_users,
    create_user as _auth_create_user,
    update_user as _auth_update_user,
    update_user_role as _auth_update_user_role,
    admin_reset_password as _auth_admin_reset_password,
    delete_user as _auth_delete_user,
)


@v3_router.post("/auth/register")
async def v3_auth_register(payload: RegisterRequest):
    return await _call_async(_auth_register, payload)


@v3_router.post("/auth/login")
async def v3_auth_login(payload: LoginRequest):
    return await _call_async(_auth_login, payload)


@v3_router.post("/auth/refresh", dependencies=[_Auth])
async def v3_auth_refresh(request: Request):
    return await _call_async(_auth_refresh, request)


@v3_router.get("/auth/users", dependencies=[_Auth])
async def v3_auth_list_users(request: Request):
    return await _call_async(_auth_list_users, request)


@v3_router.put("/auth/users/{user_id}/role", dependencies=[_Auth])
async def v3_auth_update_user_role(user_id: str, payload: UpdateRoleRequest, request: Request):
    return await _call_async(_auth_update_user_role, user_id, payload, request)


@v3_router.delete("/auth/users/{user_id}", dependencies=[_Auth])
async def v3_auth_delete_user(user_id: str, request: Request):
    return await _call_async(_auth_delete_user, user_id, request)


@v3_router.post("/auth/users", dependencies=[_Auth])
async def v3_auth_create_user(payload: RegisterRequest, request: Request):
    return await _call_async(_auth_create_user, payload, request)


@v3_router.put("/auth/users/{user_id}", dependencies=[_Auth])
async def v3_auth_update_user(user_id: str, payload: UpdateUserRequest, request: Request):
    return await _call_async(_auth_update_user, user_id, payload, request)


@v3_router.post("/auth/users/{user_id}/reset-password", dependencies=[_Auth])
async def v3_auth_reset_password(user_id: str, payload: AdminResetPasswordRequest, request: Request):
    return await _call_async(_auth_admin_reset_password, user_id, payload, request)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------
from app.api.v2.documents import (
    list_documents as _doc_list,
    get_document_details as _doc_get,
    remove_document as _doc_delete,
    verify_document as _doc_verify,
    get_history as _doc_history,
    reprocess_document as _doc_reprocess,
    reprocess_field as _doc_reprocess_field,
    bulk_delete as _doc_bulk_delete,
    bulk_verify as _doc_bulk_verify,
    bulk_reprocess as _doc_bulk_reprocess,
    recover_stuck_documents as _doc_recover_stuck,
    serve_page as _doc_serve_page,
    serve_crop as _doc_serve_crop,
)


@v3_router.get("/documents", dependencies=[_Auth])
async def v3_documents_list(request: Request):
    try:
        data = await _doc_list()

        fields_param = request.query_params.get("fields", "")
        if fields_param:
            requested_fields = set(f.strip() for f in fields_param.split(",") if f.strip())
            data = [{k: v for k, v in doc.items() if k in requested_fields} for doc in data]

        etag = _compute_etag(data)
        if_none_match = request.headers.get("if-none-match")
        if if_none_match and if_none_match.strip('"') == etag:
            return Response(status_code=304, headers={"ETag": f'"{etag}"'})

        response = APIResponse.success(data=data)
        _add_cache_headers(response, 10)
        response.headers["ETag"] = f'"{etag}"'
        return response
    except HTTPException as e:
        return APIResponse.error(status=e.status_code, message=e.detail)
    except Exception:
        logger.exception("Internal server error in documents list")
        return APIResponse.error(status=500, message="Internal server error")


@v3_router.get("/documents/{doc_id}", dependencies=[_Auth])
async def v3_documents_get(doc_id: str, request: Request):
    try:
        data = await _doc_get(doc_id)

        etag = _compute_etag(data)
        if_none_match = request.headers.get("if-none-match")
        if if_none_match and if_none_match.strip('"') == etag:
            return Response(status_code=304, headers={"ETag": f'"{etag}"'})

        response = APIResponse.success(data=data)
        _add_cache_headers(response, 30)
        response.headers["ETag"] = f'"{etag}"'
        return response
    except HTTPException as e:
        return APIResponse.error(status=e.status_code, message=e.detail)
    except Exception:
        logger.exception("Internal server error in document detail")
        return APIResponse.error(status=500, message="Internal server error")


@v3_router.delete("/documents/{doc_id}", dependencies=[_Auth])
def v3_documents_delete(doc_id: str):
    return _call(_doc_delete, doc_id)


@v3_router.post("/documents/{doc_id}/verify", dependencies=[_Auth])
async def v3_documents_verify(doc_id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        return APIResponse.error(400, "VALIDATION_ERROR", "Invalid or missing request body")
    try:
        data = VerifyDataRequest(**body)
    except Exception as e:
        return APIResponse.error(422, "VALIDATION_ERROR", str(e))
    return _call(_doc_verify, doc_id, data)


@v3_router.get("/documents/{doc_id}/history", dependencies=[_Auth])
def v3_documents_history(doc_id: str):
    return _call(_doc_history, doc_id)


@v3_router.post("/documents/{doc_id}/reprocess", dependencies=[_Auth])
def v3_documents_reprocess(doc_id: str):
    return _call(_doc_reprocess, doc_id)


@v3_router.post("/documents/{doc_id}/reprocess-field/{field_name}", dependencies=[_Auth])
def v3_documents_reprocess_field(doc_id: str, field_name: str):
    return _call(_doc_reprocess_field, doc_id, field_name)


@v3_router.post("/documents/bulk-delete", dependencies=[_Auth])
def v3_documents_bulk_delete(payload: BulkRequest):
    return _call(_doc_bulk_delete, payload)


@v3_router.post("/documents/bulk-verify", dependencies=[_Auth])
def v3_documents_bulk_verify(payload: BulkRequest):
    return _call(_doc_bulk_verify, payload)


@v3_router.post("/documents/bulk-reprocess", dependencies=[_Auth])
def v3_documents_bulk_reprocess(payload: BulkRequest):
    return _call(_doc_bulk_reprocess, payload)


@v3_router.post("/documents/recover-stuck", dependencies=[_Auth])
def v3_documents_recover_stuck():
    return _call(_doc_recover_stuck)


# ---------------------------------------------------------------------------
# Pages / Crops  (pass-through — return FileResponse / Response)
# ---------------------------------------------------------------------------
@v3_router.get("/pages/{doc_id}/{page_num}", dependencies=[_Auth])
def v3_pages(doc_id: str, page_num: int):
    return _doc_serve_page(doc_id, page_num)


@v3_router.get("/crops/{doc_id}/{filename}", dependencies=[_Auth])
def v3_crops(doc_id: str, filename: str):
    return _doc_serve_crop(doc_id, filename)


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------
from app.api.v2.upload import (
    upload_files as _upload_files,
    batch_process_folder as _upload_batch,
)


@v3_router.post("/upload", dependencies=[_Auth])
async def v3_upload(
    request: Request,
    files: List[UploadFile] = File(...),
    auto_verify: bool = Query(False),
    split: bool = Query(False),
):
    return await _call_async(_upload_files, request, files, auto_verify, split)


@v3_router.post("/upload/batch", dependencies=[_Auth])
async def v3_upload_batch(payload: BatchFolderRequest):
    return await _call_async(_upload_batch, payload)


# ---------------------------------------------------------------------------
# Export  (pass-through — returns StreamingResponse)
# ---------------------------------------------------------------------------
from app.api.v2.export import export_results as _export_results
from app.api.v1.analytics import export_research_data as _analytics_export


@v3_router.get("/export", dependencies=[_Auth])
async def v3_export(
    format: str = Query("excel", pattern="^(excel|csv)$"),
    lang: str = Query("en", pattern="^(en|hi)$"),
    status_filter: Optional[str] = Query(None, alias="status"),
    class_filter: Optional[str] = Query(None, alias="class"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    roll_prefix: Optional[str] = Query(None),
    columns: Optional[str] = Query(None),
    doc_ids: Optional[str] = Query(None),
):
    if not any([status_filter, class_filter, date_from, date_to, roll_prefix, doc_ids]):
        return APIResponse.error(400, "VALIDATION_ERROR", "At least one filter parameter is required (status, class, date_from, date_to, roll_prefix, or doc_ids)")
    return await _export_results(
        format=format, lang=lang, status_filter=status_filter,
        class_filter=class_filter, date_from=date_from, date_to=date_to,
        roll_prefix=roll_prefix, columns=columns, doc_ids=doc_ids,
    )


@v3_router.get("/export/analytics/{format_type}", dependencies=[_Auth])
def v3_export_analytics(
    format_type: str,
    class_filter: str = Query(None, alias="class"),
    gender: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    columns: str = Query(None),
    include_needs_review: bool = Query(False),
):
    return _analytics_export(
        format_type=format_type, class_filter=class_filter, gender=gender,
        date_from=date_from, date_to=date_to, columns=columns,
        include_needs_review=include_needs_review,
    )


# ---------------------------------------------------------------------------
# Review
# ---------------------------------------------------------------------------
from app.api.v2.review import list_review_tasks as _review_tasks, submit_review_task as _review_submit


@v3_router.get("/review/tasks", dependencies=[_Auth])
async def v3_review_tasks(
    request: Request,
    priority: Optional[str] = Query(None),
    limit: int = Query(50),
    document_id: Optional[str] = Query(None),
    field_type: Optional[str] = Query(None),
    error_type: Optional[str] = Query(None),
    sort_by: str = Query("priority"),
    sort_dir: str = Query("asc"),
):
    try:
        data = await _review_tasks(
            priority=priority, limit=limit,
            document_id=document_id, field_type=field_type,
            error_type=error_type, sort_by=sort_by, sort_dir=sort_dir,
        )
        return _respond_with_etag(data, request, max_age=5)
    except HTTPException as e:
        return APIResponse.error(status=e.status_code, message=e.detail)
    except Exception:
        logger.exception("Internal server error in review/tasks")
        return APIResponse.error(status=500, message="Internal server error")


@v3_router.post("/review/tasks/{task_id}/submit", dependencies=[_Auth])
async def v3_review_submit(task_id: int, corrected_value: str = Query("")):
    return await _call_async(_review_submit, task_id, corrected_value)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
from app.api.v1.analytics import (
    get_summary_stats as _analytics_summary,
    get_demographics_analytics as _analytics_demographics,
    get_questionnaire_analytics as _analytics_questionnaire,
    get_academic_analytics as _analytics_academic,
    get_processing_analytics as _analytics_processing,
    get_data_quality as _analytics_data_quality,
    get_per_field_confidence as _analytics_per_field_confidence,
)


@v3_router.get("/analytics/summary", dependencies=[_Auth])
def v3_analytics_summary(
    class_filter: str = Query(None, alias="class"),
    gender: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
):
    response = _call(_analytics_summary, class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    _add_cache_headers(response, 120)
    return response


@v3_router.get("/analytics/demographics", dependencies=[_Auth])
def v3_analytics_demographics(
    class_filter: str = Query(None, alias="class"),
    gender: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
):
    response = _call(_analytics_demographics, class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    _add_cache_headers(response, 120)
    return response


@v3_router.get("/analytics/questionnaire", dependencies=[_Auth])
def v3_analytics_questionnaire(
    class_filter: str = Query(None, alias="class"),
    gender: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
):
    response = _call(_analytics_questionnaire, class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    _add_cache_headers(response, 120)
    return response


@v3_router.get("/analytics/academic", dependencies=[_Auth])
def v3_analytics_academic(
    class_filter: str = Query(None, alias="class"),
    gender: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
):
    response = _call(_analytics_academic, class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    _add_cache_headers(response, 120)
    return response


@v3_router.get("/analytics/processing", dependencies=[_Auth])
def v3_analytics_processing(
    class_filter: str = Query(None, alias="class"),
    gender: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
):
    response = _call(_analytics_processing, class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    _add_cache_headers(response, 120)
    return response


@v3_router.get("/analytics/data-quality", dependencies=[_Auth])
def v3_analytics_data_quality(
    class_filter: str = Query(None, alias="class"),
    gender: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
):
    response = _call(_analytics_data_quality, class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    _add_cache_headers(response, 120)
    return response


@v3_router.get("/analytics/per-field-confidence", dependencies=[_Auth])
def v3_analytics_per_field_confidence(
    class_filter: str = Query(None, alias="class"),
    gender: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
):
    response = _call(_analytics_per_field_confidence, class_filter=class_filter, gender=gender, date_from=date_from, date_to=date_to)
    _add_cache_headers(response, 120)
    return response


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------
from app.api.v1.feedback import (
    create_feedback as _feedback_create,
    list_feedback as _feedback_list,
    get_feedback as _feedback_get,
    update_feedback_status as _feedback_status,
    list_messages as _feedback_messages_list,
    add_message as _feedback_messages_add,
    serve_attachment as _feedback_attachment,
)


@v3_router.post("/feedback", dependencies=[_Auth])
async def v3_feedback_create(
    request: Request,
    subject: str = Form(...),
    message: str = Form(...),
    attachment: Optional[UploadFile] = File(None),
):
    return await _call_async(_feedback_create, request, subject=subject, message=message, attachment=attachment)


@v3_router.get("/feedback", dependencies=[_Auth])
async def v3_feedback_list(
    request: Request,
    status: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
):
    return await _call_async(_feedback_list, request, status=status, limit=limit, offset=offset)


@v3_router.get("/feedback/{feedback_id}", dependencies=[_Auth])
async def v3_feedback_get(feedback_id: int, request: Request):
    return await _call_async(_feedback_get, feedback_id, request)


@v3_router.put("/feedback/{feedback_id}/status", dependencies=[_Auth])
async def v3_feedback_status(feedback_id: int, request: Request, status: str = Query(...)):
    return await _call_async(_feedback_status, feedback_id, request, status=status)


@v3_router.get("/feedback/{feedback_id}/messages", dependencies=[_Auth])
async def v3_feedback_messages_list(feedback_id: int, request: Request):
    return await _call_async(_feedback_messages_list, feedback_id, request)


@v3_router.post("/feedback/{feedback_id}/messages", dependencies=[_Auth])
async def v3_feedback_messages_add(
    feedback_id: int,
    request: Request,
    message: str = Form(...),
    attachment: Optional[UploadFile] = File(None),
):
    return await _call_async(_feedback_messages_add, feedback_id, request, message=message, attachment=attachment)


@v3_router.get("/feedback/attachments/{filename}", dependencies=[_Auth])
async def v3_feedback_attachment(filename: str, request: Request):
    return await _feedback_attachment(filename, request)


# ---------------------------------------------------------------------------
# Tracking & Stats
# ---------------------------------------------------------------------------
from app.api.v2.tracking import (
    get_document_stats as _get_document_stats,
    list_dlq as _list_dlq,
    retry_from_dlq as _retry_from_dlq,
    get_tracking_summary as _get_tracking_summary,
    list_issues as _list_issues,
    resolve_issue as _resolve_issue,
)


@v3_router.get("/stats/document/{doc_id}", dependencies=[_Auth])
def v3_stats_document(doc_id: str):
    return _call(_get_document_stats, doc_id)


@v3_router.get("/stats/dlq", dependencies=[_Auth])
def v3_stats_dlq(status: Optional[str] = Query(None)):
    return _call(_list_dlq, status)


@v3_router.post("/stats/dlq/{doc_id}/retry", dependencies=[_Auth])
def v3_stats_dlq_retry(doc_id: str):
    return _call(_retry_from_dlq, doc_id)


@v3_router.get("/stats/summary", dependencies=[_Auth])
def v3_stats_summary():
    return _call(_get_tracking_summary)


@v3_router.get("/stats/issues", dependencies=[_Auth])
def v3_stats_issues(
    severity: Optional[str] = Query(None),
    issue_type: Optional[str] = Query(None),
    resolved: Optional[bool] = Query(None),
    doc_id: Optional[str] = Query(None, alias="document_id"),
    limit: int = Query(100, le=500),
):
    return _call(_list_issues, severity, issue_type, resolved, doc_id, limit)


@v3_router.post("/stats/issues/{issue_id}/resolve", dependencies=[_Auth])
def v3_stats_resolve_issue(issue_id: int, resolution: str = "manual"):
    return _call(_resolve_issue, issue_id, resolution)


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------
from app.api.v2.documents import queue_status as _queue_status, event_stream as _event_stream


@v3_router.get("/system/health")
def v3_system_health():
    response = APIResponse.success(data={"status": "healthy", "service": "SSIAR Document Intelligence Platform V3"})
    response.headers["Cache-Control"] = "no-store"
    return response


@v3_router.get("/system/queue-status", dependencies=[_Auth])
def v3_system_queue_status():
    return _call(_queue_status)


@v3_router.get("/system/events", dependencies=[_Auth])
async def v3_system_events(request: Request):
    return await _event_stream(request)
