import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend/ directory (alongside this file: backend/app/config.py -> backend/.env)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=True)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
TEMPLATES_DIR = str(BASE_DIR / "shared" / "templates")
TEMP_DIR = str(BASE_DIR / "shared" / "temp")
TEMPLATE_PDF = str(BASE_DIR / "Research Questionnaire Pre HINDI.docx.pdf")

MAX_UPLOAD_SIZE = 200 * 1024 * 1024  # 200 MB (for merged PDFs with many pages)
PROCESSING_TIMEOUT = 300
TEMP_TTL_HOURS = 24
MAX_WORKERS = int(os.environ.get("MAX_WORKERS", str(min(16, os.cpu_count() or 4))))

os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
