import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
TEMPLATES_DIR = str(BASE_DIR / "shared" / "templates")
TEMP_DIR = str(BASE_DIR / "shared" / "temp")
TEMPLATE_PDF = str(BASE_DIR / "Research Questionnaire Pre HINDI.docx.pdf")

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
PROCESSING_TIMEOUT = 300
TEMP_TTL_HOURS = 24

os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
