import os
from pathlib import Path
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

# In Docker (WORKDIR=/app): __file__ = /app/app/config.py → parent.parent = /app
# Locally:  __file__ = .../backend/app/config.py → parent.parent.parent = project root
_docker_candidate = Path(__file__).resolve().parent.parent
_local_candidate = Path(__file__).resolve().parent.parent.parent
if (_local_candidate / "shared" / "templates" / "template_p1.png").exists():
    BASE_DIR = _local_candidate
elif (_docker_candidate / "shared" / "templates" / "template_p1.png").exists():
    BASE_DIR = _docker_candidate
else:
    BASE_DIR = _docker_candidate

TEMPLATES_DIR = str(BASE_DIR / "shared" / "templates")
TEMP_DIR = str(BASE_DIR / "shared" / "temp")
TEMPLATE_PDF = str(BASE_DIR / "Research Questionnaire Pre HINDI.docx.pdf")

MAX_UPLOAD_SIZE = 300 * 1024 * 1024
PROCESSING_TIMEOUT = 300
TEMP_TTL_HOURS = 24
MAX_WORKERS = int(os.environ.get("MAX_WORKERS", str(min(16, os.cpu_count() or 4))))

# Database
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'shared' / 'database' / 'ssiar.db'}"
)

# R2 / S3-compatible object storage (optional — falls back to local disk if not set)
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "ssiar-files")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")

def use_r2() -> bool:
    return bool(R2_ENDPOINT and R2_ACCESS_KEY and R2_SECRET_KEY)

os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
