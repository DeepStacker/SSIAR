"""Tests for the confidence fusion and consensus modules."""
import unittest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.confidence import fuse_confidence_weighted_product


class TestConfidenceFusion(unittest.TestCase):
    """Test the Bayesian confidence fusion function."""

    def test_high_confidence_valid_field(self):
        """A valid field with high OCR confidence should produce high fused confidence."""
        conf = fuse_confidence_weighted_product(
            ocr_conf=0.95,
            is_valid=True,
            img_quality=85,
            alignment_method="orb",
            roi_refined=True
        )
        self.assertGreater(conf, 0.85, f"Expected >0.85, got {conf:.4f}")

    def test_azure_only_valid_field(self):
        """A single Azure result with high confidence should still produce good fused confidence."""
        conf = fuse_confidence_weighted_product(
            ocr_conf=0.95,
            is_valid=True,
            img_quality=80,
            alignment_method="orb",
            roi_refined=True
        )
        self.assertGreater(conf, 0.80, f"Expected >0.80, got {conf:.4f}")

    def test_invalid_field_still_has_some_confidence(self):
        """An invalid field should be penalized but not zeroed out."""
        conf = fuse_confidence_weighted_product(
            ocr_conf=0.90,
            is_valid=False,
            img_quality=85,
            alignment_method="orb",
            roi_refined=True
        )
        self.assertGreater(conf, 0.20, f"Expected >0.20, got {conf:.4f}")
        self.assertLessEqual(conf, 0.50, f"Expected <=0.50, got {conf:.4f}")

    def test_zero_ocr_confidence(self):
        """Zero OCR confidence should produce zero fused confidence."""
        conf = fuse_confidence_weighted_product(
            ocr_conf=0.0,
            is_valid=True,
            img_quality=85,
            alignment_method="orb",
            roi_refined=True
        )
        self.assertEqual(conf, 0.0)

    def test_poor_quality_penalizes(self):
        """Poor image quality should penalize confidence."""
        high_q = fuse_confidence_weighted_product(
            ocr_conf=0.90, is_valid=True, img_quality=90,
            alignment_method="orb", roi_refined=True
        )
        low_q = fuse_confidence_weighted_product(
            ocr_conf=0.90, is_valid=True, img_quality=30,
            alignment_method="orb", roi_refined=True
        )
        self.assertGreater(high_q, low_q, "High quality should produce higher confidence")

    def test_resize_fallback_penalizes(self):
        """resize_fallback alignment should penalize confidence vs orb."""
        orb = fuse_confidence_weighted_product(
            ocr_conf=0.90, is_valid=True, img_quality=85,
            alignment_method="orb", roi_refined=True
        )
        fallback = fuse_confidence_weighted_product(
            ocr_conf=0.90, is_valid=True, img_quality=85,
            alignment_method="resize_fallback", roi_refined=True
        )
        self.assertGreater(orb, fallback, "ORB alignment should produce higher confidence")


class TestGarbageFilters(unittest.TestCase):
    """Test validation garbage suppression rules."""

    def test_garbage_roll_number(self):
        from app.validation.fields import validate_roll_number
        norm, valid, penalty, reason = validate_roll_number("8838888288382388883883358832533885882333")
        self.assertEqual(norm, "")
        self.assertFalse(valid)
        self.assertEqual(reason, "garbage_length")

    def test_garbage_class(self):
        from app.validation.fields import validate_class
        norm, valid, penalty, reason = validate_class("8888883888")
        self.assertEqual(norm, "")
        self.assertFalse(valid)
        self.assertEqual(reason, "garbage_length")

    def test_garbage_dob(self):
        from app.validation.fields import validate_dob
        norm, valid, penalty, reason = validate_dob("88882833888388538888328828852288888382")
        self.assertEqual(norm, "")
        self.assertFalse(valid)
        self.assertEqual(reason, "garbage_length")


if __name__ == "__main__":
    unittest.main()
