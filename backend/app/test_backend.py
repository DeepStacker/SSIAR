import unittest
import os
import sys
import numpy as np
import cv2
import tempfile
import json

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.pipeline import (
    split_pdf_to_images, detect_table_corners, align_page, 
    process_checkboxes, detect_consent, assess_quality, classify_document,
    _deskew_image, _detect_orientation, _normalize_to_a4,
    _compute_adaptive_threshold_params, _get_otsu_threshold,
    TEMPLATE_W, TEMPLATE_H
)
from app.ocr import (
    normalize_roll_number, normalize_class, normalize_dob, 
    normalize_gender, normalize_score, convert_devanagari_digits,
    clean_ocr_text
)
from app.database import init_db, insert_document, get_document, delete_document, get_edit_history, insert_or_update_form_data, get_all_documents

# Resolve paths relative to project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class TestSDQPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pdf_path = os.path.join(PROJECT_ROOT, "Dabohara CF_00Pre.pdf")
        cls.temp_dir = tempfile.mkdtemp(prefix="ssiar_test_")
        
        # Render pages
        cls.img_paths = split_pdf_to_images(cls.pdf_path, cls.temp_dir)

    @classmethod
    def tearDownClass(cls):
        import shutil
        if os.path.exists(cls.temp_dir):
            shutil.rmtree(cls.temp_dir)

    def test_pdf_split(self):
        """Test PDF is rendered into exactly 2 high-resolution images"""
        self.assertEqual(len(self.img_paths), 2)
        self.assertTrue(os.path.exists(self.img_paths[0]))
        self.assertTrue(os.path.exists(self.img_paths[1]))

    def test_corner_detection(self):
        """Test table corners are successfully detected (or use margin fallback)"""
        corners, bbox = detect_table_corners(self.img_paths[0])
        self.assertEqual(corners.shape, (4, 2))
        self.assertEqual(len(bbox), 4)
        # Bounding box should span most of the page
        self.assertGreater(bbox[2], 1000) # width > 1000px
        self.assertGreater(bbox[3], 1000) # height > 1000px

    def test_alignment_dimensions(self):
        """Test warped pages match standard A4 canvas size (2483 x 3508)"""
        aligned_p1 = align_page(self.img_paths[0], page_num=1)
        aligned_p2 = align_page(self.img_paths[1], page_num=2)
        
        self.assertEqual(aligned_p1.shape[:2], (3508, 2483))
        self.assertEqual(aligned_p2.shape[:2], (3508, 2483))

    def test_checkbox_extraction(self):
        """Test checkbox responses are extracted and match visual ground truths"""
        aligned_p1 = align_page(self.img_paths[0], page_num=1)
        aligned_p2 = align_page(self.img_paths[1], page_num=2)
        
        responses_p1, conf_p1, _ = process_checkboxes(aligned_p1, page_num=1)
        responses_p2, conf_p2, _ = process_checkboxes(aligned_p2, page_num=2)
        
        # Ground truths
        gt_p1 = [3, 2, 2, 3, 1, 1, 2, 2, 3, 2, 2, 1]
        gt_p2 = [1, 2, 3, 1, 3, 3, 1, 3, 3, 1, 1, 2, 3]
        
        for idx, expected in enumerate(gt_p1):
            q_num = idx + 1
            self.assertEqual(responses_p1[f"q{q_num}"], expected, f"Page 1 Q{q_num} misdetection")
            
        for idx, expected in enumerate(gt_p2):
            q_num = idx + 13
            self.assertEqual(responses_p2[f"q{q_num}"], expected, f"Page 2 Q{q_num} misdetection")

    def test_normalization_heuristics(self):
        """Test OCR cleaning and normalization rules"""
        # Roll Number normalization
        r1, v1 = normalize_roll_number("32 -073 698")
        self.assertEqual(r1, "32073698")
        self.assertTrue(v1)  # #9: Now valid because 8 digits is within 6-12 range
        
        r2, v2 = normalize_roll_number("32 -1073 698")
        self.assertEqual(r2, "321073698")
        self.assertTrue(v2)
        
        # Class normalization
        c1, v_c1 = normalize_class("11\"")
        self.assertEqual(c1, "11")
        self.assertTrue(v_c1)
        
        c2, v_c2 = normalize_class("5")
        self.assertEqual(c2, "5")
        self.assertFalse(v_c2)
        
        # DOB normalization
        d1, v_d1 = normalize_dob("26/o4 /2007")
        self.assertEqual(d1, "26/04/2007")
        self.assertTrue(v_d1)
        
        d2, v_d2 = normalize_dob("26.12.07")
        self.assertEqual(d2, "26/12/2007")
        self.assertTrue(v_d2)
        
        # #9: Calendar-aware validation - Feb 30 should fail
        d3, v_d3 = normalize_dob("30/02/2007")
        self.assertFalse(v_d3)
        
        # Gender normalization
        g1, v_g1 = normalize_gender("female")
        self.assertEqual(g1, "F")
        self.assertTrue(v_g1)
        
        g2, v_g2 = normalize_gender("M")
        self.assertEqual(g2, "M")
        self.assertTrue(v_g2)
        
        # #9: OCR misreads for gender
        g3, v_g3 = normalize_gender("W")
        self.assertEqual(g3, "F")
        self.assertTrue(v_g3)

    def test_consent_detection(self):
        """Test consent checkmark is correctly detected as Yes"""
        aligned_p1 = align_page(self.img_paths[0], page_num=1)
        consent = detect_consent(aligned_p1)
        self.assertEqual(consent, "Yes")

    def test_devanagari_digit_conversion(self):
        """Test Devanagari numeral to Western Arabic conversion"""
        self.assertEqual(convert_devanagari_digits("०९०"), "090")
        self.assertEqual(convert_devanagari_digits("५६"), "56")
        self.assertEqual(convert_devanagari_digits("१२३"), "123")
        self.assertEqual(convert_devanagari_digits("60"), "60")
        self.assertEqual(convert_devanagari_digits(""), "")

    def test_clean_ocr_text(self):
        """Test clean_ocr_text handles devanagari and whitespace"""
        self.assertEqual(clean_ocr_text("  ०९०  "), "090")
        self.assertEqual(clean_ocr_text(""), "")
        self.assertEqual(clean_ocr_text(None), "")


class TestSyntheticScans(unittest.TestCase):
    """#37: Tests using synthetic images — no extra PDF fixtures needed."""
    
    def test_blank_form_detection(self):
        """Test that a blank white image produces unanswered responses"""
        blank = np.full((TEMPLATE_H, TEMPLATE_W, 3), 255, dtype=np.uint8)
        responses, confidences, _ = process_checkboxes(blank, page_num=1)
        # All should be unanswered on a blank form
        for q_num in range(1, 13):
            self.assertEqual(confidences[f"q{q_num}"], "unanswered", f"Q{q_num} should be unanswered on blank form")

    def test_scan_quality_clean(self):
        """Test that a high-contrast sharp image is evaluated correctly"""
        img = np.random.randint(0, 255, (500, 500), dtype=np.uint8)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            temp_path = f.name
        try:
            cv2.imwrite(temp_path, img)
            report = assess_quality(temp_path)
            self.assertIn("blur", report)
            self.assertIn("contrast", report)
            self.assertIn("quality", report)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_scan_quality_blurry(self):
        """Test that a heavily blurred image is flagged with low quality score"""
        img = np.full((500, 500), 128, dtype=np.uint8)  # Uniform gray
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            temp_path = f.name
        try:
            cv2.imwrite(temp_path, img)
            report = assess_quality(temp_path)
            self.assertLess(report["quality"], 60)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_adaptive_threshold_params(self):
        """#12: Test dynamic threshold parameter computation"""
        # Bright image
        bright = np.full((100, 100), 220, dtype=np.uint8)
        bs, c = _compute_adaptive_threshold_params(bright)
        # Uniform images have very low std, triggering the low-contrast path
        self.assertGreaterEqual(bs, 11)
        self.assertGreaterEqual(c, 2)
        
        # Dark image
        dark = np.full((100, 100), 80, dtype=np.uint8)
        bs, c = _compute_adaptive_threshold_params(dark)
        self.assertLessEqual(bs, 15)

    def test_otsu_threshold(self):
        """#13: Test Otsu threshold returns a reasonable value"""
        # Bimodal image (clear ink on white paper)
        img = np.full((100, 100), 240, dtype=np.uint8)
        img[30:70, 30:70] = 30  # Dark square
        thresh = _get_otsu_threshold(img)
        self.assertGreaterEqual(thresh, 30)
        self.assertLess(thresh, 240)

    def test_normalize_to_a4(self):
        """#3: Test non-A4 images are padded/scaled correctly"""
        # Letter size (different ratio)
        letter = np.full((2800, 2200, 3), 255, dtype=np.uint8)
        result = _normalize_to_a4(letter)
        self.assertEqual(result.shape[:2], (TEMPLATE_H, TEMPLATE_W))

    def test_orientation_detection_landscape(self):
        """#16: Test that landscape images are detected"""
        landscape = np.full((1000, 2000, 3), 255, dtype=np.uint8)
        rotation = _detect_orientation(landscape)
        self.assertEqual(rotation, 90)

    def test_orientation_detection_portrait(self):
        """#16: Test that portrait images return 0 rotation"""
        portrait = np.full((2000, 1000, 3), 255, dtype=np.uint8)
        rotation = _detect_orientation(portrait)
        self.assertEqual(rotation, 0)

    def test_deskew_no_rotation_needed(self):
        """#11: Test that a straight image is returned unchanged"""
        img = np.full((500, 500, 3), 255, dtype=np.uint8)
        result = _deskew_image(img)
        self.assertEqual(result.shape, img.shape)


class TestDatabaseOperations(unittest.TestCase):
    """Test database CRUD and audit trail."""
    
    @classmethod
    def setUpClass(cls):
        # Use a temporary database
        import app.database as db_module
        cls.original_db_path = db_module.DB_PATH
        cls.temp_db = os.path.join(PROJECT_ROOT, "shared", "database", "test_ssiar.db")
        db_module.DB_PATH = cls.temp_db
        init_db()

    @classmethod
    def tearDownClass(cls):
        import app.database as db_module
        db_module.DB_PATH = cls.original_db_path
        if os.path.exists(cls.temp_db):
            os.remove(cls.temp_db)

    def test_insert_and_get_document(self):
        """Test document insert and retrieval"""
        doc_id = "test-doc-001"
        insert_document(doc_id, "test.pdf", "processing")
        docs = get_all_documents()
        found = [d for d in docs if d["id"] == doc_id]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["filename"], "test.pdf")
        
        # Cleanup
        delete_document(doc_id)

    def test_audit_trail(self):
        """#26: Test that human edits are logged"""
        doc_id = "test-audit-001"
        insert_document(doc_id, "audit_test.pdf", "needs_review")
        
        # Initial OCR insert
        insert_or_update_form_data(
            doc_id=doc_id, roll_number="123456789", class_val="11",
            dob="01/01/2000", gender="M", consent="Yes",
            responses={"q1": 1}, academic_scores={"math_pct": "80"},
            remarks="", confidence_scores={}, verified=0
        )
        
        # Human correction (verified=1 triggers audit logging)
        insert_or_update_form_data(
            doc_id=doc_id, roll_number="987654321", class_val="12",
            dob="02/02/2001", gender="F", consent="No",
            responses={"q1": 2}, academic_scores={"math_pct": "90"},
            remarks="corrected", confidence_scores={}, verified=1
        )
        
        history = get_edit_history(doc_id)
        self.assertGreater(len(history), 0)
        
        # Check that roll_number change was logged
        roll_edits = [h for h in history if h["field_name"] == "roll_number"]
        self.assertGreater(len(roll_edits), 0)
        self.assertEqual(roll_edits[0]["old_value"], "123456789")
        self.assertEqual(roll_edits[0]["new_value"], "987654321")
        
        # Cleanup
        delete_document(doc_id)


if __name__ == "__main__":
    unittest.main()
