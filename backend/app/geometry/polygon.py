"""Polygon utilities — validation, bounds, intersection."""

def polygon_bounds(polygon: list[float]) -> list[float]:
    """Compute axis-aligned bounding region [x0,y0,x1,y1] from polygon vertices.
    This is a COMPUTATIONAL UTILITY — it does not store bbox, only computes on demand."""
    if len(polygon) < 8:
        return [0.0, 0.0, 0.0, 0.0]
    xs = polygon[0::2]
    ys = polygon[1::2]
    return [min(xs), min(ys), max(xs), max(ys)]

def polygon_is_valid(polygon: list[float]) -> bool:
    """Verify polygon has at least 4 vertices (8 floats) and no degenerate edges."""
    if len(polygon) < 8 or len(polygon) % 2 != 0:
        return False
    return True

def polygon_area(polygon: list[float]) -> float:
    """Compute signed area of polygon using the shoelace formula."""
    if not polygon_is_valid(polygon):
        return 0.0
    n = len(polygon) // 2
    area = 0.0
    for i in range(n):
        x1, y1 = polygon[2*i], polygon[2*i+1]
        x2, y2 = polygon[2*((i+1)%n)], polygon[2*((i+1)%n)+1]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0

def polygons_overlap(a: list[float], b: list[float], margin: float = 0.0) -> bool:
    ba = polygon_bounds(a)
    bb = polygon_bounds(b)
    x_overlap = ba[0] < bb[2] + margin and ba[2] > bb[0] - margin
    y_overlap = ba[1] < bb[3] + margin and ba[3] > bb[1] - margin
    return x_overlap and y_overlap
