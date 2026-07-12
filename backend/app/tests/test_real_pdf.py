import os
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
import sys
import uuid
import json
import pprint
from pathlib import Path

# Add backend directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import init_db, insert_document, store_pdf, get_document
from app.processing.jobs.document_jobs import process_document_background

def _classify_pdf(pdf_bytes: bytes) -> dict:
    from app.config import TEMP_DIR
    from app.image.pdf import classify_document
    did = str(uuid.uuid4())
    temp_pdf = os.path.join(TEMP_DIR, f"{did}_classify.pdf")
    os.makedirs(TEMP_DIR, exist_ok=True)
    with open(temp_pdf, "wb") as f:
        f.write(pdf_bytes)
    try:
        classification = classify_document(temp_pdf)
    except Exception:
        classification = {"type": "scanned", "dpi": 300, "pages": 1, "is_color": False}
    finally:
        if os.path.exists(temp_pdf):
            try:
                os.remove(temp_pdf)
            except Exception:
                pass
    return classification

PDF_PATH = "/Users/deepstacker/WorkSpace/dupcq/SSIAR/Dabohara CF_00Pre.pdf"

def main():
    print("======================================================================")
    print("End-to-End Processing Test for Dabohara CF_00Pre.pdf")
    print("======================================================================")

    if not os.path.exists(PDF_PATH):
        print(f"Error: PDF not found at {PDF_PATH}")
        sys.exit(1)

    # 1. Initialize Database
    init_db()

    # 2. Read PDF Bytes
    with open(PDF_PATH, "rb") as f:
        pdf_bytes = f.read()

    # 3. Create Document Record
    doc_id = str(uuid.uuid4())
    print(f"Ingesting document... ID: {doc_id}")
    
    # Classify PDF layout/metadata
    classification = _classify_pdf(pdf_bytes)
    print(f"Classification metadata: {classification}")
    
    # Insert document metadata and save PDF on disk via store_pdf
    insert_document(doc_id, "Dabohara CF_00Pre.pdf", "processing", classification=classification, escalation_level="level_1")
    store_pdf(doc_id, pdf_bytes)

    # 4. Process PDF Synchronously (auto_verify=True to test the auto-verification logic)
    print("Processing document (Alignment -> Preprocessing -> OCR -> Consensus -> Validation)...")
    process_document_background(doc_id, pdf_bytes, "Dabohara CF_00Pre.pdf", auto_verify=True)

    # 5. Fetch and Print Results
    doc = get_document(doc_id)
    print("\n======================================================================")
    print("EXTRACTED DOCUMENT RESULTS:")
    print("======================================================================")
    pprint.pprint(doc)

if __name__ == "__main__":
    main()
