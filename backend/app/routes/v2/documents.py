"""
Documents API (V2)
====================
Clean V2 implementation — no backward compatibility.
"""
import asyncio
from typing import Optional
import cv2
import numpy as np
import os
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response, FileResponse, StreamingResponse
from app.auth import require_auth, get_current_user_id
from app.database import (
    get_document, get_all_documents, delete_document as db_delete,
    bulk_delete_documents, update_document_status, insert_or_update_form_data,
    log_correction_data, get_edit_history, get_page_image,
)
from app.schemas import VerifyDataRequest, BulkRequest
from app.sse import notify as SSE
from app.image.crops import extract_crop, get_crop_page
from app.config import TEMP_DIR, R2_PUBLIC_URL, use_r2
from app.image.storage import PROCESSED_DIR, get_roi_file, store_roi_file, get_page_image_file

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

router = APIRouter(dependencies=[Depends(require_auth)])


@router.get("/api/documents")
async def list_documents():
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, get_all_documents)


@router.get("/api/documents/{doc_id}")
async def get_document_details(doc_id: str):
    loop = asyncio.get_running_loop()
    doc = await loop.run_in_executor(None, get_document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    try:
        # Dynamically inject coordinates for all fields (including questions) to allow client-side canvas cropping
        if "confidence_scores" in doc and isinstance(doc["confidence_scores"], dict):
            cs = doc["confidence_scores"]
            if "v2_trust" not in cs or not isinstance(cs["v2_trust"], dict):
                cs["v2_trust"] = {}
            v2 = cs["v2_trust"]
            
            # Load raw response for tables if needed
            from app.database import get_db_connection, put_conn
            import json
            conn = get_db_connection()
            raw_dict = None
            try:
                cur = conn.cursor()
                cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
                row = cur.fetchone()
                if row and row[0]:
                    raw_dict = json.loads(row[0])
            finally:
                put_conn(conn)
                           # 1. Enrich Q1 - Q25 coordinates
            if raw_dict:
                for q_num in range(1, 26):
                    q_key = f"q{q_num}"
                    expected_page = 2 if q_num >= 13 else 1
                    
                    if q_key not in v2 or not v2[q_key].get("bbox"):
                        tbl_res = get_sdq_row_bbox_from_table(raw_dict, q_num)
                        if tbl_res:
                            poly, bbox, page_num = tbl_res
                            v2[q_key] = {
                                "page": page_num,
                                "bbox": bbox,
                                "polygon": poly
                            }
                    elif q_key in v2:
                        # Enforce correct page number even if coordinates exist in database
                        v2[q_key]["page"] = expected_page
                            
                # 1b. Enrich demographics and academic coordinates
                field_pages = {
                    "roll_number": 1, "class": 1, "dob": 1, "gender": 1,
                    "math_pct": 2, "science_pct": 2, "language_pct": 2
                }
                for field_name, expected_page in field_pages.items():
                    if field_name not in v2 or not v2[field_name].get("bbox"):
                        res = get_field_bbox_from_table(raw_dict, field_name)
                        if res:
                            poly, bbox, page_num = res
                            v2[field_name] = {
                                "page": page_num,
                                "bbox": bbox,
                                "polygon": poly
                            }
                    elif field_name in v2:
                        v2[field_name]["page"] = expected_page
                            
                # 1c. Enrich rank coordinates
                if "rank" not in v2 or not v2["rank"].get("bbox"):
                    res = get_rank_bbox(raw_dict)
                    if res:
                        poly, bbox, page_num = res
                        v2["rank"] = {
                            "page": page_num,
                            "bbox": bbox,
                            "polygon": poly
                        }
                elif "rank" in v2:
                    v2["rank"]["page"] = 2
                    
            # 1d. Fill remaining empty coordinates with static template fallbacks
            all_enrich_fields = [
                "roll_number", "class", "dob", "gender",
                "math_pct", "science_pct", "language_pct", "rank",
                "consent", "remarks"
            ]
            for field_name in all_enrich_fields:
                if field_name not in v2 or not v2[field_name].get("bbox"):
                    fallback = get_static_fallback_bbox(field_name)
                    if fallback:
                        poly, bbox, page_num = fallback
                        v2[field_name] = {
                            "page": page_num,
                            "bbox": bbox,
                            "polygon": poly
                        }
                            
            # 2. Enrich consent coordinates (page 1, standard relative region)
            #    Tick mark appears ~100px left of "हां" text (x≈3566), so start at 3400
            if "consent" not in v2 or not v2["consent"].get("bbox"):
                v2["consent"] = {
                    "page": 1,
                    "bbox": [3400, 1380, 3960, 1560],
                    "polygon": [3400, 1380, 3960, 1380, 3960, 1560, 3400, 1560]
                }
            else:
                v2["consent"]["page"] = 1
            
            # 3. Enrich remarks coordinates (page 2)
            #    Question "क्या आपकी कोई अन्य टिप्पणी..." at y≈3631
            #    Answer lines extend from y≈3700 to y≈4200
            if "remarks" not in v2 or not v2["remarks"].get("bbox"):
                v2["remarks"] = {
                    "page": 2,
                    "bbox": [100, 3550, 4400, 4200],
                    "polygon": [100, 3550, 4400, 3550, 4400, 4200, 100, 4200]
                }
            else:
                v2["remarks"]["page"] = 2
                
            # 4. Scale all coordinates from 300 DPI space to physical page image pixels
            scale_coordinates_to_image_size(doc_id, v2)
    except Exception as e:
        print(f"Error during coordinate enrichment: {e}")
        
    return doc


@router.get("/api/documents/{doc_id}/status")
def get_status(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    cs = doc.get("confidence_scores", {}) or {}
    return {
        "document_id": doc_id,
        "status": doc.get("status"),
        "escalation_level": doc.get("escalation_level"),
        "created_at": doc.get("created_at"),
        "has_confidence_scores": bool(cs),
        "verified": doc.get("verified_by_human", 0),
    }


@router.get("/api/documents/{doc_id}/confidence")
def get_confidence(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    cs = doc.get("confidence_scores", {}) or {}
    return {
        "document_id": doc_id,
        "trust_confidence": cs.get("v2_trust", {}),
        "cross_field_penalty": cs.get("cross_field_penalty", 0),
        "cross_field_reason": cs.get("cross_field_reason", ""),
        "review_fields": cs.get("review_fields", []),
    }


@router.get("/api/pages/{doc_id}/{page_num}")
@router.get("/api/documents/{doc_id}/page/{page_num}")
def serve_page(doc_id: str, page_num: int):
    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/pages/{doc_id}/page_{page_num}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    # 1. Try file system for exact requested page, fallback to page 1 if page 2 not found
    page_path = PROCESSED_DIR / doc_id / f"page_{page_num}.jpg"
    if not page_path.exists() and page_num == 2:
        page_path = PROCESSED_DIR / doc_id / "page_1.jpg"
        
    if page_path.exists():
        return FileResponse(str(page_path), media_type="image/jpeg",
                            headers={
                                "Cache-Control": "public, max-age=86400",
                                "Access-Control-Allow-Origin": "*",
                                "Access-Control-Allow-Methods": "GET"
                            })

    # 2. Try database files
    img_bytes = get_page_image_file(doc_id, page_num)
    if not img_bytes and page_num == 2:
        img_bytes = get_page_image_file(doc_id, 1)
    if img_bytes:
        return Response(content=img_bytes, media_type="image/jpeg",
                        headers={
                            "Cache-Control": "public, max-age=86400",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "GET"
                        })

    # 3. Try database page_images
    img = get_page_image(doc_id, page_num)
    if not img and page_num == 2:
        img = get_page_image(doc_id, 1)
    if img:
        return Response(content=img, media_type="image/jpeg",
                        headers={
                            "Cache-Control": "public, max-age=86400",
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "GET"
                        })

    raise HTTPException(status_code=404, detail="Page not found")


def _get_azure_scale(doc_id: str, page_num: int, img_w: int, img_h: int) -> tuple[float, float]:
    """Compute scale factors from Azure coordinate space to actual image pixel space.
    
    Handles two storage formats:
    1. Flat: {"pages": [...]}
    2. Per-page: {"page_1": {analyzeResult}, "page_2": {analyzeResult}}
    """
    from app.database import get_db_connection, put_conn
    import json
    
    scaled_azure_w = 2483.0  # default fallback (A4 at 300 DPI)
    scaled_azure_h = 3508.0
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
        row = cur.fetchone()
        if row and row[0]:
            try:
                raw_dict = json.loads(row[0])
                
                # Try flat format first: {"pages": [...]}
                pages_list = raw_dict.get("pages", [])
                
                # Try per-page storage format: {"page_1": {...}, "page_2": {...}}
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
    
    # Prevent division by zero
    scaled_azure_w = max(1.0, scaled_azure_w)
    scaled_azure_h = max(1.0, scaled_azure_h)
    
    return img_w / scaled_azure_w, img_h / scaled_azure_h


def get_sdq_row_bbox_from_table(raw_dict: dict, q_num: int) -> Optional[tuple[list[float], list[float], int]]:
    """Determine the bounding box and polygon of the three checkbox cells for a specific question using Azure's table model."""
    page_num = 2 if q_num >= 13 else 1
    
    # Get raw page data
    page_raw = raw_dict.get(f"page_{page_num}", {})
    if not page_raw or "pages" not in page_raw:
        page_raw = raw_dict
        
    tables = page_raw.get("tables", [])
    if not tables:
        for p in page_raw.get("pages", []):
            p_num = p.get("pageNumber", p.get("page", 1))
            if p_num == page_num:
                tables = p.get("tables", [])
                break
                
    if not tables:
        return None
        
    if page_num == 1:
        # Table 1 is the checkbox table on Page 1
        table = tables[1] if len(tables) >= 2 else tables[0]
        row_idx = q_num
    else:
        # Table 0 is the checkbox table on Page 2
        table = tables[0]
        row_idx = q_num - 13
        
    # Get cells in columns 1, 2, 3 (checkboxes) of the target row
    target_cells = []
    for cell in table.get("cells", []):
        if cell.get("rowIndex") == row_idx and cell.get("columnIndex") in (1, 2, 3):
            target_cells.append(cell)
            
    if not target_cells:
        return None
        
    polys = []
    unit = "pixel"
    for p in page_raw.get("pages", []):
        p_num = p.get("pageNumber", p.get("page", 1))
        if p_num == page_num:
            unit = p.get("unit", "pixel")
            break
            
    for cell in target_cells:
        regions = cell.get("boundingRegions", [])
        if regions:
            poly = regions[0].get("polygon", [])
            if unit == "inch":
                poly = [pt * 300.0 for pt in poly]
            if poly and len(poly) >= 8:
                polys.append(poly)
                
    if not polys:
        return None
        
    # Combine coordinate limits
    all_xs = []
    all_ys = []
    for poly in polys:
        all_xs.extend(poly[0::2])
        all_ys.extend(poly[1::2])
        
    x0 = min(all_xs)
    x1 = max(all_xs)
    y0 = min(all_ys)
    y1 = max(all_ys)
    
    # We want a very clean crop showing only the checkboxes.
    # Minimal vertical padding so they aren't vertically squeezed,
    # and minimal horizontal padding to prevent clipping checkmarks.
    pad_x = (x1 - x0) * 0.02
    pad_y = (y1 - y0) * 0.10
    
    bbox = [x0 - pad_x, y0 - pad_y, x1 + pad_x, y1 + pad_y]
    polygon = [
        x0 - pad_x, y0 - pad_y,
        x1 + pad_x, y0 - pad_y,
        x1 + pad_x, y1 + pad_y,
        x0 - pad_x, y1 + pad_y
    ]
    return polygon, bbox, page_num


@router.get("/api/crops/{doc_id}/{filename}")
def serve_crop(doc_id: str, filename: str):
    crop_name = filename.replace('.png', '')
    cache_key = (doc_id, crop_name)

    if cache_key in _cache_crop:
        return Response(content=_cache_crop[cache_key], media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

    if use_r2() and R2_PUBLIC_URL:
        redirect_url = f"{R2_PUBLIC_URL}/rois/{doc_id}/roi_{crop_name}.jpg"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url)

    roi_bytes = get_roi_file(doc_id, crop_name)
    if roi_bytes:
        _cache_crop_set(cache_key, roi_bytes)
        return Response(content=roi_bytes, media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

    # Check if a dynamic V2 bounding box/polygon and page exist in form_data
    doc = get_document(doc_id)
    if doc:
        confidence_scores = doc.get("confidence_scores", {})
        v2_trust = confidence_scores.get("v2_trust", {}) if isinstance(confidence_scores, dict) else {}
        field_info = v2_trust.get(crop_name, {}) if isinstance(v2_trust, dict) else {}
        polygon = field_info.get("polygon")
        bbox = field_info.get("bbox")
        res_page = field_info.get("page")
        
        # For checkbox questions, dynamically compute row bbox from Azure selection marks / tables
        if not bbox and not polygon and crop_name.startswith("q"):
            from app.database import get_db_connection, put_conn
            conn = get_db_connection()
            raw_responses_str = None
            try:
                cur = conn.cursor()
                cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
                row = cur.fetchone()
                if row:
                    raw_responses_str = row[0]
            finally:
                put_conn(conn)
                
            if raw_responses_str:
                try:
                    import json
                    raw_dict = json.loads(raw_responses_str)
                    q_num = int(crop_name[1:])
                    tbl_res = get_sdq_row_bbox_from_table(raw_dict, q_num)
                    if tbl_res:
                        polygon, bbox, res_page = tbl_res
                except Exception:
                    pass
                    
        if (polygon or bbox) and res_page:
            aligned_img = _get_page(doc_id, res_page)
            if aligned_img is not None:
                h_img, w_img = aligned_img.shape[:2]
                
                # Compute scale factors from Azure coordinate space to actual image pixels
                scale_x, scale_y = _get_azure_scale(doc_id, res_page, w_img, h_img)
                
                crop = None
                
                # === PRIMARY: Polygon-based perspective crop ===
                if polygon and len(polygon) >= 8:
                    try:
                        import numpy as np
                        # polygon is [x0,y0, x1,y1, x2,y2, x3,y3] — 4 corners
                        pts = []
                        for i in range(0, 8, 2):
                            px = polygon[i] * scale_x
                            py = polygon[i+1] * scale_y
                            pts.append([px, py])
                        pts = np.array(pts, dtype=np.float32)
                        
                        # Determine output width/height from the polygon edges
                        w1 = np.linalg.norm(pts[1] - pts[0])
                        w2 = np.linalg.norm(pts[2] - pts[3])
                        h1 = np.linalg.norm(pts[3] - pts[0])
                        h2 = np.linalg.norm(pts[2] - pts[1])
                        out_w = int(max(w1, w2))
                        out_h = int(max(h1, h2))
                        
                        if out_w > 5 and out_h > 5:
                            # 1. Determine direction vectors along the cell edges to handle rotation perfectly
                            # dir_x points from left to right, dir_y points from top to bottom
                            dir_x = (pts[1] - pts[0]) / out_w
                            dir_y = (pts[3] - pts[0]) / out_h
                            
                            # 2. Determine shaving/padding based on the field type
                            if crop_name in {"math_pct", "science_pct", "language_pct"}:
                                # Pad outward horizontally and vertically to keep starting handwriting and digits fully visible
                                shave_l = -int(out_w * 0.05)
                                shave_r = -int(out_w * 0.05)
                                shave_t = -int(out_h * 0.05)
                                shave_b = -int(out_h * 0.05)
                            elif crop_name in {"roll_number", "class", "dob", "gender"}:
                                # Metadata fields: pad outward to prevent any clipping on start/end
                                shave_l = -int(out_w * 0.05)
                                shave_r = -int(out_w * 0.05)
                                shave_t = -int(out_h * 0.05)
                                shave_b = -int(out_h * 0.05)
                            elif crop_name.startswith("q"):
                                # Checkbox questions
                                shave_l = int(out_w * 0.01)
                                shave_r = int(out_w * 0.01)
                                shave_t = int(out_h * 0.05)
                                shave_b = int(out_h * 0.05)
                            else:
                                # Non-table fields: use negative shave (i.e. expand/pad outward)
                                shave_l = -int(out_w * 0.05)
                                shave_r = -int(out_w * 0.05)
                                shave_t = -int(out_h * 0.08)
                                shave_b = -int(out_h * 0.08)
                                
                            # 3. Apply shaving/padding to relocate the 4 corners inward/outward
                            padded_pts = pts.copy()
                            padded_pts[0] = pts[0] + dir_x * shave_l + dir_y * shave_t
                            padded_pts[1] = pts[1] - dir_x * shave_r + dir_y * shave_t
                            padded_pts[2] = pts[2] - dir_x * shave_r - dir_y * shave_b
                            padded_pts[3] = pts[3] + dir_x * shave_l - dir_y * shave_b
                            
                            # 4. Clamp corners to image bounds
                            padded_pts[:, 0] = np.clip(padded_pts[:, 0], 0, w_img - 1)
                            padded_pts[:, 1] = np.clip(padded_pts[:, 1], 0, h_img - 1)
                            
                            # 5. Compute the new width and height of the cropped region
                            out_w_padded = max(2, out_w - shave_l - shave_r)
                            out_h_padded = max(2, out_h - shave_t - shave_b)
                            
                            dst = np.array([
                                [0, 0],
                                [out_w_padded - 1, 0],
                                [out_w_padded - 1, out_h_padded - 1],
                                [0, out_h_padded - 1]
                            ], dtype=np.float32)
                            
                            M = cv2.getPerspectiveTransform(padded_pts, dst)
                            crop = cv2.warpPerspective(aligned_img, M, (out_w_padded, out_h_padded),
                                                       flags=cv2.INTER_CUBIC,
                                                       borderMode=cv2.BORDER_REPLICATE)
                    except Exception:
                        crop = None  # Fall through to bbox fallback
                
                # === FALLBACK: Axis-aligned bbox crop ===
                if crop is None and bbox:
                    x0, y0, x1, y1 = [int(val) for val in bbox]
                    x0 = int(x0 * scale_x)
                    y0 = int(y0 * scale_y)
                    x1 = int(x1 * scale_x)
                    y1 = int(y1 * scale_y)
                    
                    is_tight = crop_name.startswith("q") or crop_name in {"roll_number", "class", "dob", "gender", "math_pct", "science_pct", "language_pct", "rank"}
                    if is_tight:
                        pad_x = int(5 * scale_x)
                        pad_y = int(4 * scale_y)
                    else:
                        pad_x = int(35 * scale_x)
                        pad_y = int(20 * scale_y)
                        
                    x0 = max(0, x0 - pad_x)
                    y0 = max(0, y0 - pad_y)
                    x1 = min(w_img, x1 + pad_x)
                    y1 = min(h_img, y1 + pad_y)
                    crop = aligned_img[y0:y1, x0:x1]
                
                if crop is not None and crop.size > 0:
                    _, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
                    crop_bytes = buf.tobytes()
                    _cache_crop_set(cache_key, crop_bytes)
                    return Response(content=crop_bytes, media_type="image/jpeg",
                                    headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

    # Fallback to legacy coordinate-based cropping
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
    return Response(content=crop_bytes, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=3600"})


@router.post("/api/documents/{doc_id}/verify")
def verify_document(doc_id: str, payload: VerifyDataRequest):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    cs = doc.get("confidence_scores", {}) or {}
    ocr_conf = cs.get("ocr", {})
    fields_to_compare = {
        "roll_number": payload.roll_number,
        "class": payload.class_val,
        "dob": payload.dob,
        "gender": payload.gender,
        "math_pct": payload.academic_scores.get("math_pct", ""),
        "science_pct": payload.academic_scores.get("science_pct", ""),
        "language_pct": payload.academic_scores.get("language_pct", ""),
        "rank": payload.academic_scores.get("rank", ""),
    }
    for fn, cv in fields_to_compare.items():
        orig = doc.get(fn) or doc.get("academic_scores", {}).get(fn, "")
        if orig != cv:
            log_correction_data(doc_id, fn, f"db://{doc_id}/{fn}", orig, cv, ocr_conf.get(fn, 1.0), "human_review_v2")
    
    insert_or_update_form_data(
        doc_id=doc_id, roll_number=payload.roll_number, class_val=payload.class_val,
        dob=payload.dob, gender=payload.gender, consent=payload.consent,
        responses=payload.responses, academic_scores=payload.academic_scores,
        remarks=payload.remarks, confidence_scores=cs, verified=1,
    )
    update_document_status(doc_id, "verified", doc.get("escalation_level", "level_1"))
    
    # Automatically complete any pending review tasks for this document
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, field_name FROM review_tasks WHERE document_id = ? AND status = 'pending'", (doc_id,))
        pending_tasks = cur.fetchall()
        now_str = datetime.now().isoformat()
        reviewer_id = get_current_user_id() or "system"
        
        for task in pending_tasks:
            task_id = task["id"]
            field_name = task["field_name"]
            
            # Map corrected value from the verification payload
            val = None
            if field_name == "roll_number":
                val = payload.roll_number
            elif field_name == "class":
                val = payload.class_val
            elif field_name == "dob":
                val = payload.dob
            elif field_name == "gender":
                val = payload.gender
            elif field_name == "consent":
                val = payload.consent
            elif field_name == "remarks":
                val = payload.remarks
            elif field_name in ("math_pct", "science_pct", "language_pct", "rank"):
                val = payload.academic_scores.get(field_name, "")
            elif field_name.startswith("q") and field_name[1:].isdigit():
                q_val = payload.responses.get(field_name, 0)
                if isinstance(q_val, list):
                    val = ",".join(map(str, q_val))
                else:
                    val = str(q_val)
                    
            if val is not None:
                cur.execute(
                    "UPDATE review_tasks SET corrected_value = ?, status = 'completed', reviewer_id = ?, reviewed_at = ? WHERE id = ?",
                    (val, reviewer_id, now_str, task_id)
                )
        conn.commit()
    except Exception as e:
        print(f"Failed to auto-resolve review tasks for {doc_id}: {e}")
    finally:
        put_conn(conn)

    SSE("document_updated", {"doc_id": doc_id, "status": "verified"}, user_id=get_current_user_id())
    return {"message": "Form successfully verified"}


@router.get("/api/documents/{doc_id}/history")
def get_history(doc_id: str):
    return {"document_id": doc_id, "history": get_edit_history(doc_id)}


@router.delete("/api/documents/{doc_id}")
def remove_document(doc_id: str):
    if not get_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    db_delete(doc_id)
    SSE("document_deleted", {"doc_id": doc_id}, user_id=get_current_user_id())
    return {"message": "Document deleted"}


@router.post("/api/documents/bulk-delete")
def bulk_delete(payload: BulkRequest):
    count = bulk_delete_documents(payload.doc_ids)
    SSE("documents_bulk_deleted", {"count": count}, user_id=get_current_user_id())
    return {"message": f"Deleted {count} document(s)"}


@router.post("/api/documents/bulk-verify")
def bulk_verify(payload: BulkRequest):
    count = 0
    for doc_id in payload.doc_ids:
        doc = get_document(doc_id)
        if doc and doc["status"] != "verified":
            update_document_status(doc_id, "verified", "level_1")
            count += 1
    SSE("documents_bulk_verified", {"count": count}, user_id=get_current_user_id())
    return {"message": f"Verified {count} document(s)"}


@router.post("/api/documents/{doc_id}/reprocess")
def reprocess_document(doc_id: str):
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    from app.database import get_pdf
    pdf_bytes = get_pdf(doc_id)
    
    # Check if page images exist in the file system
    has_page_images = False
    from app.image.storage import PROCESSED_DIR
    page_1_path = PROCESSED_DIR / doc_id / "page_1.jpg"
    if page_1_path.exists():
        has_page_images = True
        
    if not pdf_bytes and not has_page_images:
        raise HTTPException(status_code=400, detail="Original PDF data or processed page images not found")
        
    update_document_status(doc_id, "processing")
    
    from app.processing.jobs.document_jobs import get_job_queue, process_document_background
    get_job_queue().enqueue(
        "document_processing",
        doc_id,
        process_document_background,
        doc_id,
        pdf_bytes,
        doc["filename"],
        auto_verify=False,
        user_id=get_current_user_id()
    )
    SSE("document_updated", {"doc_id": doc_id, "status": "processing"}, user_id=get_current_user_id())
    return {"message": "Reprocessing started", "doc_id": doc_id}


@router.post("/api/documents/bulk-reprocess")
def bulk_reprocess(payload: BulkRequest):
    from app.database import get_pdf
    from app.processing.jobs.document_jobs import get_job_queue, process_document_background
    count = 0
    for doc_id in payload.doc_ids:
        doc = get_document(doc_id)
        if doc:
            pdf_bytes = get_pdf(doc_id)
            if pdf_bytes:
                update_document_status(doc_id, "processing")
                get_job_queue().enqueue(
                    "document_processing",
                    doc_id,
                    process_document_background,
                    doc_id,
                    pdf_bytes,
                    doc["filename"],
                    auto_verify=False,
                    user_id=get_current_user_id()
                )
                count += 1
    return {"message": f"Reprocessing {count} document(s)"}


@router.post("/api/documents/{doc_id}/reprocess-field/{field_name}")
def reprocess_field(doc_id: str, field_name: str):
    from app.database import get_db_connection, put_conn
    from app.processing.templates import get_field_definition
    from app.processing.field_resolver import resolve_field, normalize_value
    
    doc = get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    fd = get_field_definition("sdq_student_form_v1", field_name)
    if not fd:
        raise HTTPException(status_code=400, detail=f"Invalid field: {field_name}")
        
    # Get raw responses from database
    conn = get_db_connection()
    raw_responses_str = None
    try:
        cur = conn.cursor()
        cur.execute("SELECT raw_response FROM azure_responses WHERE document_id = ?", (doc_id,))
        row = cur.fetchone()
        if row:
            raw_responses_str = row[0]
    finally:
        put_conn(conn)
        
    if not raw_responses_str:
        # Fallback: reprocess the whole document
        from app.database import get_pdf
        pdf_bytes = get_pdf(doc_id)
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Raw PDF data not found to reprocess")
        from app.processing.jobs.document_jobs import get_job_queue, process_document_background
        get_job_queue().enqueue(
            "document_processing",
            doc_id,
            process_document_background,
            doc_id,
            pdf_bytes,
            doc["filename"],
            auto_verify=False,
            user_id=get_current_user_id()
        )
        return {
            "field_name": field_name,
            "value": "",
            "engine": "azure",
            "confidence": 0.0,
            "valid": False,
            "updated": True,
            "message": "Enqueued full document reprocessing task"
        }
        
    # Re-normalize/re-combine raw response and resolve the single field
    import json
    from app.processing.azure_processor import normalize_azure_response
    from app.processing.types import NormalizedAzureResponse
    
    raw_responses = json.loads(raw_responses_str)
    combined = NormalizedAzureResponse(document_id=doc_id)
    for k, v in raw_responses.items():
        if v:
            # Recreate normalized page elements
            normalized = normalize_azure_response(f"{doc_id}_{k}", v)
            combined.pages.extend(normalized.pages)
            
    text, conf, found, bbox, page_num = resolve_field(fd, combined)
    if not found:
        return {
            "field_name": field_name,
            "value": "",
            "engine": "azure",
            "confidence": 0.0,
            "valid": False,
            "updated": False,
            "message": "Field not found in OCR elements"
        }
        
    normalized_text = normalize_value(text, fd.type)
    
    # Save the updated field value back to form_data table
    from app.database import insert_or_update_form_data
    roll_number = doc.get("roll_number") or ""
    class_val = doc.get("class") or ""
    dob = doc.get("dob") or ""
    gender = doc.get("gender") or ""
    consent = doc.get("consent") or "Unanswered"
    remarks = doc.get("remarks") or ""
    academic_scores = doc.get("academic_scores") or {}
    responses = doc.get("responses") or {}
    confidence_scores = doc.get("confidence_scores") or {}
    
    # Map resolved value to the correct field
    if field_name == "roll_number":
        roll_number = normalized_text
    elif field_name == "class":
        class_val = normalized_text
    elif field_name == "dob":
        dob = normalized_text
    elif field_name == "gender":
        gender = normalized_text
    elif field_name == "consent":
        consent = normalized_text
    elif field_name == "remarks":
        remarks = normalized_text
    elif field_name in ("math_pct", "science_pct", "language_pct", "rank"):
        academic_scores[field_name] = normalized_text
        
    insert_or_update_form_data(
        doc_id=doc_id,
        roll_number=roll_number,
        class_val=class_val,
        dob=dob,
        gender=gender,
        consent=consent,
        responses=responses,
        academic_scores=academic_scores,
        remarks=remarks,
        confidence_scores=confidence_scores,
        verified=doc.get("verified_by_human", 0)
    )
    
    SSE("document_updated", {"doc_id": doc_id, "status": doc["status"]}, user_id=get_current_user_id())
    
    return {
        "field_name": field_name,
        "value": normalized_text,
        "engine": "azure",
        "confidence": conf,
        "valid": True,
        "updated": True
    }


@router.get("/api/queue-status")
def queue_status():
    from app.processing.jobs.document_jobs import get_worker_count
    from app.database import get_all_documents
    docs = get_all_documents()
    levels = {"level_1": 0, "level_2": 0, "level_3": 0, "level_4": 0}
    for d in docs:
        lev = d.get("escalation_level", "level_1")
        if lev in levels:
            levels[lev] += 1
            
    return {
        "total": len(docs),
        "processing": len([d for d in docs if d["status"] == "processing"]),
        "needs_review": len([d for d in docs if d["status"] in ("needs_review", "review_required")]),
        "verified": len([d for d in docs if d["status"] in ("verified", "approved")]),
        "failed": len([d for d in docs if d["status"] == "failed"]),
        "workers": get_worker_count(),
        "by_escalation": levels,
    }


@router.get("/api/events")
async def event_stream(request: Request):
    import json
    from app.sse import subscribe, unsubscribe
    uid = request.state.user_id if hasattr(request.state, "user_id") else None
    if not uid:
        uid = get_current_user_id()
    queue = subscribe(user_id=uid)
    try:
        from fastapi.responses import StreamingResponse
        async def gen():
            # Send initial connection verification message
            yield f"data: {json.dumps({'event': 'connected', 'data': {}})}\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(msg)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Content-Encoding": "none",
            }
        )
    finally:
        unsubscribe(queue)


def get_field_bbox_from_table(raw_dict: dict, field_name: str) -> Optional[tuple[list[float], list[float], int]]:
    """Resolve demographics and academic field coordinates directly from raw Azure tables."""
    # Map field name to page and anchor search text
    field_mappings = {
        "roll_number": (1, "रोल नंबर"),
        "class": (1, "कक्षा"),
        "dob": (1, "जन्म तिथि"),
        "gender": (1, "लिंग"),
        "math_pct": (2, "गणित/जीव"),
        "science_pct": (2, "विज्ञान/रासायन"),
        "language_pct": (2, "हिंदी"),
    }
    
    if field_name not in field_mappings:
        return None
        
    page_num, anchor = field_mappings[field_name]
    
    # Get raw page data
    page_raw = raw_dict.get(f"page_{page_num}", {})
    if not page_raw or "pages" not in page_raw:
        page_raw = raw_dict
        
    tables = page_raw.get("tables", [])
    if not tables:
        for p in page_raw.get("pages", []):
            p_num = p.get("pageNumber", p.get("page", 1))
            if p_num == page_num:
                tables = p.get("tables", [])
                break
                
    if not tables:
        return None
        
    # Search for anchor in column 0 of all tables on that page
    for table in tables:
        row_cells = {}
        for cell in table.get("cells", []):
            r_idx = cell.get("rowIndex")
            c_idx = cell.get("columnIndex")
            if r_idx is not None and c_idx is not None:
                row_cells.setdefault(r_idx, {})[c_idx] = cell
                
        for r_idx, cols in row_cells.items():
            if 0 in cols and 1 in cols:
                label_cell = cols[0]
                val_cell = cols[1]
                
                label_content = label_cell.get("content", "")
                if anchor.lower() in label_content.lower():
                    # Found it! Extract polygon from val_cell
                    regions = val_cell.get("boundingRegions", [])
                    if regions:
                        poly = regions[0].get("polygon", [])
                        unit = "pixel"
                        for p in page_raw.get("pages", []):
                            p_num = p.get("pageNumber", p.get("page", 1))
                            if p_num == page_num:
                                unit = p.get("unit", "pixel")
                                break
                        if unit == "inch":
                            poly = [pt * 300.0 for pt in poly]
                        if poly and len(poly) >= 8:
                            xs = poly[0::2]
                            ys = poly[1::2]
                            bbox = [min(xs), min(ys), max(xs), max(ys)]
                            return poly, bbox, page_num
                            
    return None


def get_rank_bbox(raw_dict: dict) -> Optional[tuple[list[float], list[float], int]]:
    """Resolve rank coordinates from page 2 lines."""
    page_num = 2
    page_raw = raw_dict.get(f"page_{page_num}", {})
    if not page_raw or "pages" not in page_raw:
        page_raw = raw_dict
        
    pages = page_raw.get("pages", [])
    if not pages:
        return None
        
    p = pages[0]
    lines = p.get("lines", [])
    for line in lines:
        content = line.get("content", "")
        if "रैंक" in content:
            poly = line.get("polygon", [])
            unit = p.get("unit", "pixel")
            if unit == "inch":
                poly = [pt * 300.0 for pt in poly]
            if poly and len(poly) >= 8:
                xs = poly[0::2]
                ys = poly[1::2]
                bbox = [min(xs), min(ys), max(xs), max(ys)]
                return poly, bbox, page_num
    return None


def get_static_fallback_bbox(field_name: str) -> Optional[tuple[list[float], list[float], int]]:
    """Get standard static template coordinate coordinates for a field."""
    from app.image.roi import ROIS_P1_POINTS, ROIS_P2_POINTS, ROIS_REMARKS_POINTS
    scale = 300.0 / 72.0
    
    p2_keys = {'math_pct', 'science_pct', 'language_pct', 'rank', 'remarks'}
    
    page_num = 1
    if field_name in p2_keys:
        page_num = 2
    elif field_name.startswith("q"):
        try:
            q_num = int(field_name[1:])
            if q_num >= 21:
                page_num = 2
        except ValueError:
            pass
            
    rect = None
    if page_num == 1:
        if field_name in ROIS_P1_POINTS:
            rect = ROIS_P1_POINTS[field_name]
        elif field_name == "consent":
            rect = (470.0, 190.0, 555.0, 240.0)
    else:
        if field_name in ROIS_P2_POINTS:
            rect = ROIS_P2_POINTS[field_name]
        elif field_name == "remarks":
            rect = ROIS_REMARKS_POINTS['remarks']
            
    if rect:
        x0, y0, x1, y1 = rect
        bbox = [x0 * scale, y0 * scale, x1 * scale, y1 * scale]
        polygon = [
            bbox[0], bbox[1],
            bbox[2], bbox[1],
            bbox[2], bbox[3],
            bbox[0], bbox[3]
        ]
        return polygon, bbox, page_num
        
    return None


def scale_coordinates_to_image_size(doc_id: str, v2: dict):
    """Scale all coordinates in v2_trust from 300 DPI to physical page image dimensions."""
    page_dims = {}
    
    for field_name, val in v2.items():
        if not isinstance(val, dict):
            continue
            
        page_num = val.get("page", 1)
        
        # Load page dimensions if not cached
        if page_num not in page_dims:
            img = _get_page(doc_id, page_num)
            if img is not None:
                h, w = img.shape[:2]
                page_dims[page_num] = (w, h)
            else:
                page_dims[page_num] = None
                
        dims = page_dims[page_num]
        if not dims:
            continue
            
        img_w, img_h = dims
        scale_x, scale_y = _get_azure_scale(doc_id, page_num, img_w, img_h)
        
        # Scale bbox
        bbox = val.get("bbox")
        if bbox and len(bbox) >= 4:
            val["bbox"] = [
                bbox[0] * scale_x,
                bbox[1] * scale_y,
                bbox[2] * scale_x,
                bbox[3] * scale_y
            ]
            
        # Scale polygon
        poly = val.get("polygon")
        if poly and len(poly) >= 8:
            val["polygon"] = [
                pt * scale_x if i % 2 == 0 else pt * scale_y
                for i, pt in enumerate(poly)
            ]