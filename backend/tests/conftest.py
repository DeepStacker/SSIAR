"""Test configuration and shared fixtures for SSIAR integration tests."""
import os
import sys
import tempfile

# Must be set BEFORE any app modules are imported
os.environ.setdefault("JWT_SECRET", "pytest-insecure-jwt-secret-for-testing")
os.environ.setdefault("SURYA_ENABLED", "0")

_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def db_path():
    """Create a temporary SQLite database file isolated to this test session."""
    fd, path = tempfile.mkstemp(suffix="_ssiar_test.db")
    os.environ["SQLITE_PATH"] = path
    yield path
    os.close(fd)
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture(scope="session")
def client(db_path):
    """Build a FastAPI TestClient with an isolated SQLite database.

    The app's startup event calls init_db() which creates all tables
    in the temporary database pointed to by SQLITE_PATH.
    """
    from app.main import app
    with TestClient(app) as c:
        yield c
