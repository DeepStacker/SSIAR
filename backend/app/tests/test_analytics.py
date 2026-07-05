import json
import os
import unittest
from fastapi.testclient import TestClient

import app.database as db_module

# Capture the original DB_PATH at module load (before any test modifies it)
_TEST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "shared", "database")
os.makedirs(_TEST_DIR, exist_ok=True)
TEST_DB_PATH = os.path.join(_TEST_DIR, "test_analytics_ssiar.db")
_ORIGINAL_DB_PATH = db_module.DB_PATH  # read-only, don't mutate at module level

from app.main import app
from app.database import init_db

class TestSSIARAnalytics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db_module.DB_PATH = TEST_DB_PATH
        init_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        db_module.DB_PATH = _ORIGINAL_DB_PATH
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_summary_analytics(self):
        """Test GET /api/analytics/summary returns required KPIs"""
        response = self.client.get("/api/analytics/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("total_forms", data)
        self.assertIn("verified_forms", data)
        self.assertIn("pending_review", data)
        self.assertIn("average_confidence", data)
        self.assertIn("data_completeness", data)
        self.assertIn("processing_trend", data)

    def test_demographics_analytics(self):
        """Test GET /api/analytics/demographics returns distributions"""
        response = self.client.get("/api/analytics/demographics")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("class_distribution", data)
        self.assertIn("gender_distribution", data)
        self.assertIn("age_distribution", data)
        self.assertIn("age_gender_heatmap", data)

    def test_questionnaire_analytics(self):
        """Test GET /api/analytics/questionnaire returns SDQ metrics"""
        response = self.client.get("/api/analytics/questionnaire")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("questions", data)
        self.assertIn("domain_scores", data)
        self.assertIn("reliability", data)

    def test_academic_analytics(self):
        """Test GET /api/analytics/academic returns academic stats"""
        response = self.client.get("/api/analytics/academic")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("averages", data)
        self.assertIn("class_averages", data)
        self.assertIn("top_vs_bottom_difficulties", data)

    def test_correlations_analytics(self):
        """Test GET /api/analytics/correlations returns correlation matrix"""
        response = self.client.get("/api/analytics/correlations")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("correlation_matrix", data)

    def test_outliers_analytics(self):
        """Test GET /api/analytics/outliers returns outlier list"""
        response = self.client.get("/api/analytics/outliers")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("outliers", data)

    def test_export_analytics(self):
        """Test GET /api/analytics/export/{format} returns data files"""
        response = self.client.get("/api/analytics/export/csv")
        self.assertIn(response.status_code, [200, 400])
        if response.status_code == 200:
            self.assertTrue(response.headers["content-type"].startswith("text/csv"))
