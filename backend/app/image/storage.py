import os
import shutil
from pathlib import Path
import cv2
import numpy as np

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
UPLOADS_DIR = BASE_DIR / "shared" / "uploads"
PROCESSED_DIR = BASE_DIR / "shared" / "processed"

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

def store_pdf_disk(doc_id: str, pdf_bytes: bytes) -> str:
    """Store raw PDF file on disk and return the path."""
    dest = UPLOADS_DIR / f"{doc_id}.pdf"
    with open(dest, "wb") as f:
        f.write(pdf_bytes)
    return str(dest)

def get_pdf_disk(doc_id: str) -> bytes:
    """Retrieve raw PDF file bytes from disk."""
    src = UPLOADS_DIR / f"{doc_id}.pdf"
    if src.exists():
        with open(src, "rb") as f:
            return f.read()
    return b""

def store_aligned_page_disk(doc_id: str, page_num: int, image: np.ndarray) -> str:
    """Store aligned page image on disk as a compressed JPEG."""
    doc_dir = PROCESSED_DIR / doc_id
    os.makedirs(doc_dir, exist_ok=True)
    dest = doc_dir / f"page_{page_num}.jpg"
    # Compress as JPEG with quality 90
    cv2.imwrite(str(dest), image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return str(dest)

def get_aligned_page_disk(doc_id: str, page_num: int) -> bytes:
    """Retrieve aligned page image bytes from disk."""
    src = PROCESSED_DIR / doc_id / f"page_{page_num}.jpg"
    if src.exists():
        with open(src, "rb") as f:
            return f.read()
    # Check if a legacy PNG file exists (for backward compatibility)
    legacy_src = PROCESSED_DIR / doc_id / f"page_{page_num}.png"
    if legacy_src.exists():
        with open(legacy_src, "rb") as f:
            return f.read()
    return b""

def store_roi_disk(doc_id: str, field_name: str, image: np.ndarray) -> str:
    """Store extracted ROI crop image on disk as compressed JPEG."""
    doc_dir = PROCESSED_DIR / doc_id
    os.makedirs(doc_dir, exist_ok=True)
    dest = doc_dir / f"roi_{field_name}.jpg"
    cv2.imwrite(str(dest), image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return str(dest)

def get_roi_disk(doc_id: str, field_name: str) -> bytes:
    """Retrieve ROI crop bytes from disk."""
    src = PROCESSED_DIR / doc_id / f"roi_{field_name}.jpg"
    if src.exists():
        with open(src, "rb") as f:
            return f.read()
    return b""

def delete_document_disk(doc_id: str):
    """Delete all files (PDF, aligned pages, ROIs) associated with doc_id."""
    pdf_file = UPLOADS_DIR / f"{doc_id}.pdf"
    if pdf_file.exists():
        pdf_file.unlink()
    
    doc_dir = PROCESSED_DIR / doc_id
    if doc_dir.exists():
        shutil.rmtree(doc_dir, ignore_errors=True)
