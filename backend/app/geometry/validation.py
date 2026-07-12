"""Geometry validation — precision checks for OCR polygons."""
from app.geometry.polygon import polygon_is_valid

def validate_azure_polygon(polygon: list[float], tolerance: float = 0.001) -> bool:
    """Verify polygon matches Azure OCR source format (4+ vertices, float coordinates)."""
    if not polygon_is_valid(polygon):
        return False
    if any(not isinstance(v, (int, float)) for v in polygon):
        return False
    return True

def polygon_precision_delta(original: list[float], stored: list[float]) -> float:
    """Measure max deviation between two polygons."""
    if len(original) != len(stored):
        return float('inf')
    return max(abs(a - b) for a, b in zip(original, stored))
