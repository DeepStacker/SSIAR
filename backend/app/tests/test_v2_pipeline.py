import unittest
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.processing.azure_processor import normalize_azure_response
from app.processing.field_resolver import resolve_field
from app.core.types import FieldDefinition, ReviewPriority
from app.processing.jobs.document_jobs import resolve_page_selection_marks
from app.processing.trust_confidence import calculate_trust
from app.services.review_tasks import create_review_task, submit_review
from app.database import init_db, insert_document, get_document, get_db_connection, put_conn

class TestV2Pipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Initialize test DB
        os.environ["SQLITE_PATH"] = ":memory:"
        init_db()

    def test_normalize_and_resolve(self):
        # 1. Mock Azure response
        raw = {
            "model_id": "prebuilt-read",
            "pages": [
                {
                    "page_number": 1,
                    "angle": 0.0,
                    "width": 1000.0,
                    "height": 1000.0,
                    "unit": "pixel",
                    "words": [
                        {"content": "अनुक्रमांक", "polygon": [100, 100, 200, 100, 200, 120, 100, 120], "confidence": 0.99},
                        {"content": "123456", "polygon": [100, 130, 200, 130, 200, 150, 100, 150], "confidence": 0.95},
                    ],
                    "lines": [
                        {"content": "अनुक्रमांक", "polygon": [100, 100, 200, 100, 200, 120, 100, 120], "confidence": 0.99},
                        {"content": "123456", "polygon": [100, 130, 200, 130, 200, 150, 100, 150], "confidence": 0.95},
                    ]
                }
            ]
        }
        
        normalized = normalize_azure_response("doc_test", raw)
        self.assertEqual(len(normalized.pages), 1)
        self.assertEqual(normalized.pages[0].elements[0].text, "अनुक्रमांक")
        
        # 2. Test resolve_field
        fd = FieldDefinition(
            name="roll_number",
            label="अनुक्रमांक",
            type="number",
            anchor="अनुक्रमांक",
            relationship="below",
            width=100, height=20,
            required=True,
            review_priority=ReviewPriority.CRITICAL,
            validation_rules=["roll_number"]
        )
        
        text, conf, found, bbox, poly, page_num = resolve_field(fd, normalized)
        self.assertTrue(found)
        self.assertEqual(text, "123456")
        self.assertAlmostEqual(conf, 0.95)
        self.assertEqual(page_num, 1)
        self.assertEqual(bbox, [100.0, 130.0, 200.0, 150.0])
 
    def test_resolve_selection_marks(self):
        raw = {
            "model_id": "prebuilt-read",
            "pages": [
                {
                    "page_number": 1,
                    "angle": 0.0,
                    "width": 2500.0,
                    "height": 3500.0,
                    "unit": "pixel",
                    "selection_marks": [
                        {"state": "selected", "polygon": [1600, 2000, 1620, 2000, 1620, 2020, 1600, 2020], "confidence": 0.9}, # Yes for Q1 (Y >= 1200)
                        {"state": "unselected", "polygon": [1860, 2000, 1880, 2000, 1880, 2020, 1860, 2020], "confidence": 0.9},
                        {"state": "unselected", "polygon": [2140, 2000, 2160, 2000, 2160, 2020, 2140, 2020], "confidence": 0.9},
                        
                        {"state": "unselected", "polygon": [1800, 800, 1820, 800, 1820, 820, 1800, 820], "confidence": 0.9}, # Yes (unselected)
                        {"state": "selected", "polygon": [2100, 800, 2120, 800, 2120, 820, 2100, 820], "confidence": 0.9}, # No (selected, relative x >= 0.83)
                    ],
                    "tables": [
                        {
                            "cells": [
                                {
                                    "rowIndex": 1,
                                    "columnIndex": 1,
                                    "content": ":selected:",
                                    "boundingRegions": [
                                        {
                                            "polygon": [1600, 2000, 1620, 2000, 1620, 2020, 1600, 2020]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        
        normalized = normalize_azure_response("doc_test2", raw)
        responses, consent, conf, polys = resolve_page_selection_marks(
            normalized.pages[0].elements, is_page_2=False,
            page_width=normalized.pages[0].width,
            page_height=normalized.pages[0].height,
            raw_response=raw
        )
        
        self.assertEqual(consent, "No") # Consent Yes is index 0, No is index 1. Index 1 selected -> "No"
        self.assertEqual(responses.get("q1"), 1) # Yes is Column 1

    def test_trust_confidence(self):
        fd = FieldDefinition(
            name="class",
            label="कक्षा",
            type="number",
            anchor="कक्षा",
            review_priority=ReviewPriority.CRITICAL
        )
        trust = calculate_trust(
            field_def=fd,
            extracted_text="10",
            azure_confidence=0.95,
        )
        self.assertGreater(trust.trust_confidence, 0.70)

    def test_review_task_integration(self):
        doc_id = "doc_review_test"
        insert_document(doc_id, "test_file.pdf", "processing")
        
        # Insert raw form data first
        from app.database import insert_or_update_form_data
        insert_or_update_form_data(
            doc_id=doc_id,
            roll_number="",
            class_val="",
            dob="",
            gender="",
            consent="Unanswered",
            responses={},
            academic_scores={},
            remarks="",
            confidence_scores={},
            verified=0
        )
        
        # Create a task
        task_id = create_review_task(
            document_id=doc_id,
            field_name="roll_number",
            original_value="",
            priority="critical"
        )
        self.assertTrue(task_id.isdigit())
        
        # Verify task is pending
        doc = get_document(doc_id)
        self.assertEqual(doc["status"], "processing")
        
        # Submit review correction
        success = submit_review(int(task_id), "999999", "admin")
        self.assertTrue(success)
        
        # Verify form data is updated and document is approved (since no pending tasks left)
        updated_doc = get_document(doc_id)
        self.assertEqual(updated_doc["roll_number"], "999999")
        self.assertEqual(updated_doc["status"], "verified")

if __name__ == "__main__":
    unittest.main()
