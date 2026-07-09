import os
import sys
import unittest
from fastapi.testclient import TestClient

# Disable Surya OCR during tests — it's too slow for CI (VLM inference via llama-server)
os.environ["SURYA_ENABLED"] = "0"

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set test environment paths BEFORE importing app.main
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
TEST_DB_DIR = os.path.join(PROJECT_ROOT, "shared", "database")
os.makedirs(TEST_DB_DIR, exist_ok=True)
TEST_DB_PATH = os.path.join(TEST_DB_DIR, "test_api_ssiar.db")

import app.database as db_module
_ORIGINAL_DB_PATH = db_module.DB_PATH

from app.main import app
from app.processing.templates import init_templates
from app.database import init_db, get_db_connection, get_corrections_log

class TestSSIARApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Set up isolated test database
        db_module.DB_PATH = TEST_DB_PATH
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        init_db()
        init_templates()
        cls.client = TestClient(app)
        cls.sample_pdf = os.path.join(PROJECT_ROOT, "Dabohara CF_00Pre.pdf")

    @classmethod
    def tearDownClass(cls):
        db_module.DB_PATH = _ORIGINAL_DB_PATH
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_upload_and_verify_flow(self):
        """Tests the end-to-end flow: Ingestion -> Classification -> Quality -> Correction Loop"""
        # 1. Upload sample PDF
        with open(self.sample_pdf, "rb") as f:
            response = self.client.post(
                "/api/upload",
                files={"files": ("Dabohara CF_00Pre.pdf", f, "application/pdf")}
            )
        
        self.assertEqual(response.status_code, 200)
        resp_data = response.json()
        self.assertIn("document_ids", resp_data)
        doc_id = resp_data["document_ids"][0]
        
        # 2. Get document details (will block slightly as it was processed in background or wait for threadpool to finish)
        # Note: TestClient calls running in-memory processes immediately on the threadpool.
        # Let's poll for status changes from processing to needs_review/verified.
        import time
        status = "processing"
        details = {}
        for _ in range(30):
            details_response = self.client.get(f"/api/documents/{doc_id}")
            self.assertEqual(details_response.status_code, 200)
            details = details_response.json()
            status = details["status"]
            if status != "processing":
                break
            time.sleep(1)
            
        self.assertIn(status, ["needs_review", "verified"])
        
        # 3. Verify classification & quality metadata
        self.assertIn("classification", details)
        self.assertIn("escalation_level", details)
        self.assertEqual(details["classification"]["type"], "scanned")
        self.assertGreater(details["quality_report"]["quality"], 50)
        
        # 4. Verify human correction triggers training log write
        # Modify the roll number (e.g. correct it from prediction to actual)
        original_roll = details["roll_number"]
        corrected_roll = "987654321"
        
        payload = {
            "roll_number": corrected_roll,
            "class_val": details["class"] or "11",
            "dob": details["dob"] or "26/04/2007",
            "gender": details["gender"] or "F",
            "consent": details["consent"] or "Yes",
            "responses": details["responses"],
            "academic_scores": details["academic_scores"],
            "remarks": "Human check verified correction"
        }
        
        verify_response = self.client.post(f"/api/documents/{doc_id}/verify", json=payload)
        self.assertEqual(verify_response.status_code, 200)
        
        # 5. Fetch the corrections log and verify it captured the edit
        corrections = get_corrections_log()
        self.assertGreater(len(corrections), 0)
        matching_corrections = [c for c in corrections if c["document_id"] == doc_id and c["field_name"] == "roll_number"]
        self.assertEqual(len(matching_corrections), 1)
        self.assertEqual(matching_corrections[0]["ocr_prediction"], original_roll)
        self.assertEqual(matching_corrections[0]["corrected_text"], corrected_roll)
        
        # Cleanup
        self.client.delete(f"/api/documents/{doc_id}")

if __name__ == "__main__":
    unittest.main()
