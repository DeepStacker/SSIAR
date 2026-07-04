# SSIAR Enterprise OCR Pipeline — Modular Architecture
#
# Field classification types used across all modules
from enum import Enum, auto
from dataclasses import dataclass, field
from typing import Optional


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


@dataclass
class RecognitionResult:
    text: str
    confidence: float
    engine: str
    field_name: str
    is_valid: bool = False
    normalized: str = ""
    alternatives: list = field(default_factory=list)
    per_char_confidences: list = field(default_factory=list)


@dataclass
class ConsensusVote:
    text: str
    weight: float
    votes: int
    sources: list = field(default_factory=list)
    per_char_confidences: list = field(default_factory=list)


FIELD_TYPE_MAP = {
    "roll_number": FieldType.PRINTED_TEXT,
    "class": FieldType.PRINTED_TEXT,
    "dob": FieldType.PRINTED_TEXT,
    "gender": FieldType.BINARY,
    "math_pct": FieldType.PRINTED_TEXT,
    "science_pct": FieldType.PRINTED_TEXT,
    "language_pct": FieldType.PRINTED_TEXT,
    "rank": FieldType.PRINTED_TEXT,
    "consent": FieldType.CHECKBOX,
    "remarks": FieldType.PRINTED_TEXT,
}

SDQ_FIELDS = [f"q{i}" for i in range(1, 26)]
