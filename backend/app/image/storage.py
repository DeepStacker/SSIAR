"""File storage abstraction supporting local disk and S3-compatible (R2) backends."""
import os
import io
import shutil
import cv2
import numpy as np
from pathlib import Path

from app.config import (
    R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, use_r2,
    BASE_DIR as CFG_BASE_DIR,
)

UPLOADS_DIR = CFG_BASE_DIR / "shared" / "uploads"
PROCESSED_DIR = CFG_BASE_DIR / "shared" / "processed"

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

_S3_CLIENT = None

def _get_s3():
    global _S3_CLIENT
    if _S3_CLIENT is None and use_r2():
        import boto3
        _S3_CLIENT = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            region_name="auto",
        )
    return _S3_CLIENT

def _key(doc_id: str, kind: str, *parts: str) -> str:
    return f"{kind}/{doc_id}/{'/'.join(parts)}"

def _read_file(path: Path) -> bytes:
    if path.exists():
        with open(path, "rb") as f:
            return f.read()
    return b""

def _write_file(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)

def _delete_file(path: Path):
    if path.exists():
        path.unlink()

def store_pdf_file(doc_id: str, pdf_bytes: bytes) -> str:
    s3 = _get_s3()
    if s3:
        s3.put_object(Bucket=R2_BUCKET, Key=_key(doc_id, "pdfs", f"{doc_id}.pdf"), Body=pdf_bytes)
        return f"s3://{R2_BUCKET}/pdfs/{doc_id}/{doc_id}.pdf"
    dest = UPLOADS_DIR / f"{doc_id}.pdf"
    _write_file(dest, pdf_bytes)
    return str(dest)

def get_pdf_file(doc_id: str) -> bytes:
    s3 = _get_s3()
    if s3:
        try:
            obj = s3.get_object(Bucket=R2_BUCKET, Key=_key(doc_id, "pdfs", f"{doc_id}.pdf"))
            return obj["Body"].read()
        except Exception:
            return b""
    return _read_file(UPLOADS_DIR / f"{doc_id}.pdf")

def delete_pdf_file(doc_id: str):
    s3 = _get_s3()
    if s3:
        try:
            s3.delete_object(Bucket=R2_BUCKET, Key=_key(doc_id, "pdfs", f"{doc_id}.pdf"))
        except Exception:
            pass
    else:
        dest = UPLOADS_DIR / f"{doc_id}.pdf"
        _delete_file(dest)

def store_page_image_file(doc_id: str, page_num: int, image_bytes: bytes):
    s3 = _get_s3()
    if s3:
        s3.put_object(
            Bucket=R2_BUCKET,
            Key=_key(doc_id, "pages", f"page_{page_num}.jpg"),
            Body=image_bytes,
            ContentType="image/jpeg",
        )
        return
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is not None:
        doc_dir = PROCESSED_DIR / doc_id
        doc_dir.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(doc_dir / f"page_{page_num}.jpg"), image, [cv2.IMWRITE_JPEG_QUALITY, 90])

def get_page_image_file(doc_id: str, page_num: int) -> bytes:
    s3 = _get_s3()
    if s3:
        try:
            obj = s3.get_object(Bucket=R2_BUCKET, Key=_key(doc_id, "pages", f"page_{page_num}.jpg"))
            return obj["Body"].read()
        except Exception:
            pass
        try:
            obj = s3.get_object(Bucket=R2_BUCKET, Key=_key(doc_id, "pages", f"page_{page_num}.png"))
            return obj["Body"].read()
        except Exception:
            return b""
    return _read_file(PROCESSED_DIR / doc_id / f"page_{page_num}.jpg") or _read_file(PROCESSED_DIR / doc_id / f"page_{page_num}.png")

def store_roi_file(doc_id: str, field_name: str, image: np.ndarray) -> str:
    s3 = _get_s3()
    success, buf = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        return ""
    image_bytes = buf.tobytes()
    if s3:
        s3.put_object(
            Bucket=R2_BUCKET,
            Key=_key(doc_id, "rois", f"roi_{field_name}.jpg"),
            Body=image_bytes,
            ContentType="image/jpeg",
        )
        return f"s3://{R2_BUCKET}/rois/{doc_id}/roi_{field_name}.jpg"
    doc_dir = PROCESSED_DIR / doc_id
    doc_dir.mkdir(parents=True, exist_ok=True)
    dest = doc_dir / f"roi_{field_name}.jpg"
    cv2.imwrite(str(dest), image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return str(dest)

def get_roi_file(doc_id: str, field_name: str) -> bytes:
    s3 = _get_s3()
    if s3:
        try:
            obj = s3.get_object(Bucket=R2_BUCKET, Key=_key(doc_id, "rois", f"roi_{field_name}.jpg"))
            return obj["Body"].read()
        except Exception:
            return b""
    return _read_file(PROCESSED_DIR / doc_id / f"roi_{field_name}.jpg")

def get_aligned_page_disk(doc_id: str, page_num: int) -> bytes:
    return get_page_image_file(doc_id, page_num)

def store_aligned_page_disk(doc_id: str, page_num: int, image: np.ndarray) -> str:
    success, buf = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if success:
        store_page_image_file(doc_id, page_num, buf.tobytes())
    return ""

def store_roi_disk(doc_id: str, field_name: str, image: np.ndarray) -> str:
    return store_roi_file(doc_id, field_name, image)

def get_pdf_disk(doc_id: str) -> bytes:
    return get_pdf_file(doc_id)

def store_pdf_disk(doc_id: str, pdf_bytes: bytes) -> str:
    return store_pdf_file(doc_id, pdf_bytes)

def delete_document_files(doc_id: str):
    s3 = _get_s3()
    if s3:
        prefix = f"pdfs/{doc_id}/"
        try:
            objects = s3.list_objects_v2(Bucket=R2_BUCKET, Prefix=prefix)
            if "Contents" in objects:
                s3.delete_objects(Bucket=R2_BUCKET, Delete={"Objects": [{"Key": o["Key"]} for o in objects["Contents"]]})
        except Exception:
            pass
        for kind in ("pages", "rois"):
            prefix = f"{kind}/{doc_id}/"
            try:
                objects = s3.list_objects_v2(Bucket=R2_BUCKET, Prefix=prefix)
                if "Contents" in objects:
                    s3.delete_objects(Bucket=R2_BUCKET, Delete={"Objects": [{"Key": o["Key"]} for o in objects["Contents"]]})
            except Exception:
                pass
    pdf_file = UPLOADS_DIR / f"{doc_id}.pdf"
    if pdf_file.exists():
        pdf_file.unlink()
    doc_dir = PROCESSED_DIR / doc_id
    if doc_dir.exists():
        shutil.rmtree(doc_dir, ignore_errors=True)

# Legacy aliases for code that imports from storage.py directly
delete_document_disk = delete_document_files
