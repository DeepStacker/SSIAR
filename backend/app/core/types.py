from enum import Enum, auto
from dataclasses import dataclass, field
from typing import Optional, Any


# ── V1 Types ─────────────────────────────────────────────────────────────────

class FieldType(Enum):
    PRINTED_TEXT = auto()
    HANDWRITTEN_DIGITS = auto()
    HANDWRITTEN_WORDS = auto()
    CHECKBOX = auto()
    BINARY = auto()


class ImageQualityGrade(Enum):
    EXCELLENT = auto()
    GOOD = auto()
    FAIR = auto()
    POOR = auto()
    UNUSABLE = auto()


@dataclass
class QualityReport:
    blur: float = 0.0
    noise: float = 0.0
    brightness: float = 0.0
    contrast: float = 0.0
    skew_angle: float = 0.0
    shadow_score: float = 0.0
    glare_score: float = 0.0
    fold_score: float = 0.0
    overall_score: float = 0.0
    grade: ImageQualityGrade = ImageQualityGrade.GOOD


@dataclass
class FieldROI:
    name: str
    page: int
    x0: float
    y0: float
    x1: float
    y1: float
    field_type: FieldType = FieldType.PRINTED_TEXT
    padding_px: int = 0
    confidence: float = 1.0

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0


FIELD_TYPE_MAP = {
    "roll_number": FieldType.HANDWRITTEN_DIGITS,
    "class": FieldType.HANDWRITTEN_DIGITS,
    "dob": FieldType.HANDWRITTEN_DIGITS,
    "gender": FieldType.BINARY,
    "math_pct": FieldType.HANDWRITTEN_DIGITS,
    "science_pct": FieldType.HANDWRITTEN_DIGITS,
    "language_pct": FieldType.HANDWRITTEN_DIGITS,
    "rank": FieldType.HANDWRITTEN_DIGITS,
    "consent": FieldType.CHECKBOX,
    "remarks": FieldType.PRINTED_TEXT,
}

SDQ_FIELDS = [f"q{i}" for i in range(1, 26)]


# ── V2 Processing Statuses ───────────────────────────────────────────────────

class DocumentStatus(str, Enum):
    UPLOADED = "uploaded"
    QUEUED = "queued"
    PROCESSING = "processing"
    AZURE_COMPLETED = "azure_completed"
    VALIDATION_COMPLETED = "validation_completed"
    REVIEW_REQUIRED = "review_required"
    APPROVED = "approved"
    EXPORTED = "exported"
    FAILED = "failed"


class ReviewPriority(int, Enum):
    CRITICAL = 1
    LOW_TRUST = 2
    RANDOM = 3


# ── Trust & Confidence ───────────────────────────────────────────────────────

@dataclass
class TrustConfidence:
    ocr_confidence: float = 0.0
    trust_confidence: float = 0.0
    validation_score: float = 0.0
    ambiguity_score: float = 0.0
    cross_field_score: float = 0.0
    historical_score: float = 0.0
    statistical_score: float = 0.0


# ── Azure Raw Response ───────────────────────────────────────────────────────

@dataclass
class NormalizedElement:
    text: str
    polygon: list[float]
    confidence: float
    element_type: str = "word"


@dataclass
class NormalizedParagraph:
    content: str
    polygon: list[float]  # from boundingRegions
    role: str             # "title", "pageFooter", "none"


@dataclass
class NormalizedTableCell:
    row_index: int
    col_index: int
    content: str
    polygon: list[float]  # from boundingRegions
    is_header: bool       # from kind="columnHeader"


@dataclass
class NormalizedTable:
    row_count: int
    col_count: int
    cells: list[NormalizedTableCell]


@dataclass
class NormalizedPage:
    page: int
    angle: float
    width: float
    height: float
    elements: list[NormalizedElement] = field(default_factory=list)
    lines: list[NormalizedElement] = field(default_factory=list)
    paragraphs: list[NormalizedParagraph] = field(default_factory=list)
    tables: list[NormalizedTable] = field(default_factory=list)


@dataclass
class NormalizedAzureResponse:
    document_id: str
    pages: list[NormalizedPage] = field(default_factory=list)
    raw_response: dict = field(default_factory=dict)
    model_id: str = ""


# ── Template Configuration ───────────────────────────────────────────────────

@dataclass
class FieldDefinition:
    name: str
    label: str
    type: str
    anchor: str
    relationship: str = "below"
    offset_x: float = 0
    offset_y: float = 0
    width: float = 0
    height: float = 0
    required: bool = True
    review_priority: int = ReviewPriority.CRITICAL
    validation_rules: list[str] = field(default_factory=list)
    options: list[str] = field(default_factory=list)


@dataclass
class TemplateConfig:
    template_id: str
    name: str
    version: str
    pages: int = 2
    fields: list[FieldDefinition] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


# ── Validation Results ───────────────────────────────────────────────────────

@dataclass
class ValidationResult:
    field_name: str
    value: str
    is_valid: bool
    reason: str = "ok"
    validation_details: dict = field(default_factory=dict)


# ── Processing Context ───────────────────────────────────────────────────────

@dataclass
class DocumentContext:
    document_id: str
    filename: str
    status: DocumentStatus = DocumentStatus.UPLOADED
    escalation_level: str = "level_1"

    azure_raw_response: Optional[dict] = None
    normalized_response: Optional[NormalizedAzureResponse] = None

    fields: dict[str, str] = field(default_factory=dict)
    field_confidence: dict[str, TrustConfidence] = field(default_factory=dict)
    validation_results: dict[str, ValidationResult] = field(default_factory=dict)

    needs_review: bool = False
    review_fields: list[str] = field(default_factory=list)

    created_at: Optional[str] = None
    processing_started: Optional[str] = None
    azure_completed: Optional[str] = None
    validation_completed: Optional[str] = None
    reviewed_at: Optional[str] = None
