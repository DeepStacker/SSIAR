"""
Template Configuration System (Module 6)
=========================================
Makes forms configurable via template definitions instead of hardcoded coordinates.
Supports semantic field resolution using anchors and relationships.
"""
import json
import os
from pathlib import Path
from typing import Optional
from app.processing.types import (
    FieldDefinition,
    TemplateConfig,
    ReviewPriority,
)

# Default templates directory — resolves to <project_root>/shared/templates
# From: /app/app/processing/templates.py → .parent³ = /app → shared/templates
_TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "shared" / "templates"
_TEMPLATES_CONFIG_DIR = _TEMPLATES_DIR / "config"

# In-memory template cache
_loaded_templates: dict[str, TemplateConfig] = {}
_default_template: Optional[TemplateConfig] = None


# ── Built-in Template: SDQ Student Form ──────────────────────────────────────

def _build_sdq_config() -> TemplateConfig:
    """Build the SDQ (Strengths and Difficulties Questionnaire) template."""
    
    p1_fields = [
        FieldDefinition(
            name="roll_number",
            label="रोल नंबर (Roll Number)",
            type="number",
            anchor="रोल नंबर",
            relationship="right",
            width=190, height=31,
            required=True,
            review_priority=ReviewPriority.CRITICAL,
            validation_rules=["roll_number"],
        ),
        FieldDefinition(
            name="class",
            label="कक्षा (Class)",
            type="number",
            anchor="कक्षा",
            relationship="right",
            width=190, height=31,
            required=True,
            review_priority=ReviewPriority.CRITICAL,
            validation_rules=["class"],
        ),
        FieldDefinition(
            name="dob",
            label="जन्म तिथि (DOB)",
            type="date",
            anchor="जन्म तिथि",
            relationship="right",
            width=190, height=32,
            required=True,
            review_priority=ReviewPriority.CRITICAL,
            validation_rules=["dob"],
        ),
        FieldDefinition(
            name="gender",
            label="लिंग (Gender)",
            type="gender",
            anchor="लिंग",
            relationship="right",
            width=190, height=30,
            required=True,
            review_priority=ReviewPriority.CRITICAL,
            validation_rules=["gender"],
            options=["M", "F"],
        ),
    ]
    
    p2_fields = [
        FieldDefinition(
            name="math_pct",
            label="Math Percentage",
            type="number",
            anchor="गणित/जीव",
            relationship="right",
            width=100, height=30,
            required=False,
            review_priority=ReviewPriority.LOW_TRUST,
            validation_rules=["percentage"],
        ),
        FieldDefinition(
            name="science_pct",
            label="Science Percentage",
            type="number",
            anchor="विज्ञान/रासायन",
            relationship="right",
            width=100, height=30,
            required=False,
            review_priority=ReviewPriority.LOW_TRUST,
            validation_rules=["percentage"],
        ),
        FieldDefinition(
            name="language_pct",
            label="Language Percentage",
            type="number",
            anchor="हिंदी",
            relationship="right",
            width=100, height=30,
            required=False,
            review_priority=ReviewPriority.LOW_TRUST,
            validation_rules=["language_pct"],
        ),
        FieldDefinition(
            name="rank",
            label="Rank",
            type="number",
            anchor="रैंक",
            relationship="right",
            width=115, height=50,
            required=False,
            review_priority=ReviewPriority.LOW_TRUST,
            validation_rules=["rank"],
        ),
        FieldDefinition(
            name="remarks",
            label="Remarks",
            type="text",
            anchor="टिप्पणी",
            relationship="below",
            width=600, height=150,
            required=False,
            review_priority=ReviewPriority.LOW_TRUST,
            validation_rules=[],
        ),
    ]
    
    return TemplateConfig(
        template_id="sdq_student_form_v1",
        name="SDQ Student Hindi Form",
        version="1.0",
        pages=2,
        fields=p1_fields + p2_fields,
        metadata={"form_type": "sdq", "language": "hi", "country": "IN"},
    )


# ── File-based Template Loading ───────────────────────────────────────────────

def _ensure_config_dir():
    """Ensure the templates config directory exists."""
    os.makedirs(str(_TEMPLATES_CONFIG_DIR), exist_ok=True)


def save_template_config(config: TemplateConfig):
    """Save a template configuration to disk as JSON."""
    _ensure_config_dir()
    path = _TEMPLATES_CONFIG_DIR / f"{config.template_id}.json"
    
    def _field_to_dict(f: FieldDefinition) -> dict:
        return {
            "name": f.name,
            "label": f.label,
            "type": f.type,
            "anchor": f.anchor,
            "relationship": f.relationship,
            "offset_x": f.offset_x,
            "offset_y": f.offset_y,
            "width": f.width,
            "height": f.height,
            "required": f.required,
            "review_priority": f.review_priority.value,
            "validation_rules": f.validation_rules,
            "options": f.options,
        }
    
    data = {
        "template_id": config.template_id,
        "name": config.name,
        "version": config.version,
        "pages": config.pages,
        "fields": [_field_to_dict(f) for f in config.fields],
        "metadata": config.metadata,
    }
    
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    # Update cache
    _loaded_templates[config.template_id] = config
    print(f"Template saved: {path}")


def _field_from_dict(data: dict) -> FieldDefinition:
    return FieldDefinition(
        name=data["name"],
        label=data.get("label", data["name"]),
        type=data.get("type", "text"),
        anchor=data.get("anchor", data["name"]),
        relationship=data.get("relationship", "below"),
        offset_x=data.get("offset_x", 0),
        offset_y=data.get("offset_y", 0),
        width=data.get("width", 0),
        height=data.get("height", 0),
        required=data.get("required", True),
        review_priority=ReviewPriority(data.get("review_priority", 1)),
        validation_rules=data.get("validation_rules", []),
        options=data.get("options", []),
    )


def load_template_config(template_id: str) -> Optional[TemplateConfig]:
    """Load a template configuration from disk or cache."""
    if template_id in _loaded_templates:
        return _loaded_templates[template_id]
    
    path = _TEMPLATES_CONFIG_DIR / f"{template_id}.json"
    if not path.exists():
        return None
    
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    config = TemplateConfig(
        template_id=data["template_id"],
        name=data["name"],
        version=data.get("version", "1.0"),
        pages=data.get("pages", 1),
        fields=[_field_from_dict(fd) for fd in data.get("fields", [])],
        metadata=data.get("metadata", {}),
    )
    _loaded_templates[template_id] = config
    return config


def list_templates() -> list[str]:
    """List all available template IDs."""
    _ensure_config_dir()
    return sorted(
        p.stem for p in _TEMPLATES_CONFIG_DIR.glob("*.json")
    )


# ── Initialization ────────────────────────────────────────────────────────────

def init_templates_v2():
    """Initialize the template system, creating default templates if absent."""
    _ensure_config_dir()
    
    # Always register the built-in SDQ template
    sdq = _build_sdq_config()
    _loaded_templates[sdq.template_id] = sdq
    
    # Save to disk if not already present
    path = _TEMPLATES_CONFIG_DIR / f"{sdq.template_id}.json"
    if not path.exists():
        save_template_config(sdq)
    
    # Load any custom templates from disk
    for p in sorted(_TEMPLATES_CONFIG_DIR.glob("*.json")):
        tid = p.stem
        if tid not in _loaded_templates:
            load_template_config(tid)


def get_template(template_id: str = "sdq_student_form_v1") -> Optional[TemplateConfig]:
    """Get a template by ID, falling back to default SDQ template."""
    t = _loaded_templates.get(template_id)
    if t:
        return t
    return _loaded_templates.get("sdq_student_form_v1")


def get_field_definition(template_id: str, field_name: str) -> Optional[FieldDefinition]:
    """Get a field definition from a template."""
    tmpl = get_template(template_id)
    if not tmpl:
        return None
    for f in tmpl.fields:
        if f.name == field_name:
            return f
    return None


def init_templates():
    """Extract printed form template images from the default PDF if they do not exist."""
    from app.config import TEMPLATES_DIR, TEMPLATE_PDF
    from app.image.pdf import ZOOM
    import os
    p1_path = os.path.join(TEMPLATES_DIR, "template_p1.png")
    p2_path = os.path.join(TEMPLATES_DIR, "template_p2.png")
    
    if not os.path.exists(p1_path) or not os.path.exists(p2_path):
        if os.path.exists(TEMPLATE_PDF):
            try:
                import fitz
                doc = fitz.open(TEMPLATE_PDF)
                for i in range(min(2, len(doc))):
                    page = doc[i]
                    mat = fitz.Matrix(ZOOM, ZOOM)
                    pix = page.get_pixmap(matrix=mat)
                    out_path = os.path.join(TEMPLATES_DIR, f"template_p{i+1}.png")
                    pix.save(out_path)
                print("Extracted template images successfully.")
            except Exception as e:
                print(f"Error extracting templates: {str(e)}")