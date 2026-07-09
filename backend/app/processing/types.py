"""
V2 Type Definitions
====================
Shared data types for the V2 processing pipeline.
"""
from dataclasses import dataclass, field
from typing import Optional, Any
from enum import Enum


# ── Processing Statuses ──────────────────────────────────────────────────────

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
    CRITICAL = 1    # Core fields: ID, DOB, Name
    LOW_TRUST = 2   # Fields with low trust confidence
    RANDOM = 3      # Random sampling for QA


# ── Trust & Confidence ───────────────────────────────────────────────────────

@dataclass
class TrustConfidence:
    """Separates OCR confidence from business trust confidence."""
    ocr_confidence: float = 0.0          # Azure's raw confidence
    trust_confidence: float = 0.0         # Business trust score
    validation_score: float = 0.0         # 0-1, how well it validates
    ambiguity_score: float = 0.0          # 0-1, higher = more ambiguous
    cross_field_score: float = 0.0        # 0-1, cross-field consistency
    historical_score: float = 0.0          # 0-1, pattern match with history
    statistical_score: float = 0.0         # 0-1, statistical anomaly detection


# ── Azure Raw Response ───────────────────────────────────────────────────────

@dataclass
class NormalizedElement:
    """A single normalized element from Azure's response."""
    text: str
    bbox: list[float]            # [x0, y0, x1, y1] normalized
    confidence: float
    polygon: list[float] = field(default_factory=list)
    element_type: str = "word"    # word, line, selection_mark, table_cell


@dataclass
class NormalizedPage:
    """Normalized single page from Azure analysis."""
    page: int
    angle: float
    width: float
    height: float
    elements: list[NormalizedElement] = field(default_factory=list)


@dataclass
class NormalizedAzureResponse:
    """Complete normalized Azure response."""
    document_id: str
    pages: list[NormalizedPage] = field(default_factory=list)
    raw_response: dict = field(default_factory=dict)
    model_id: str = ""


# ── Template Configuration ───────────────────────────────────────────────────

@dataclass
class FieldDefinition:
    """Describes a single field in a template."""
    name: str
    label: str                              # Hindi/printed label on form
    type: str                               # text, number, date, gender, checkbox
    anchor: str                             # Text anchor to locate (e.g., "जन्म तिथि")
    relationship: str = "below"              # below, above, right, left, inside_region, nearest
    offset_x: float = 0                       # Additional x offset from anchor
    offset_y: float = 0                       # Additional y offset from anchor
    width: float = 0                          # Expected field width in points
    height: float = 0                         # Expected field height in points
    required: bool = True
    review_priority: int = ReviewPriority.CRITICAL
    validation_rules: list[str] = field(default_factory=list)
    options: list[str] = field(default_factory=list)  # For enum fields like gender


@dataclass
class TemplateConfig:
    """Complete template configuration for a form type."""
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
    """Holds all processing state for a single document through the pipeline."""
    document_id: str
    filename: str
    status: DocumentStatus = DocumentStatus.UPLOADED
    escalation_level: str = "level_1"
    
    # Azure
    azure_raw_response: Optional[dict] = None
    normalized_response: Optional[NormalizedAzureResponse] = None
    
    # Extracted and validated fields
    fields: dict[str, str] = field(default_factory=dict)
    field_confidence: dict[str, TrustConfidence] = field(default_factory=dict)
    validation_results: dict[str, ValidationResult] = field(default_factory=dict)
    
    # Review
    needs_review: bool = False
    review_fields: list[str] = field(default_factory=list)
    
    # Timing
    created_at: Optional[str] = None
    processing_started: Optional[str] = None
    azure_completed: Optional[str] = None
    validation_completed: Optional[str] = None
    reviewed_at: Optional[str] = None