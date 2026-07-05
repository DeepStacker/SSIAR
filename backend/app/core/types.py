from enum import Enum, auto
from dataclasses import dataclass, field


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
