"""Geometry transforms — scaling, rotation, coordinate conversion."""
import math

def rotate_point(x: float, y: float, angle_degrees: float, cx: float = 0.0, cy: float = 0.0) -> tuple[float, float]:
    """Rotate a point around center (cx, cy) by angle_degrees."""
    rad = math.radians(angle_degrees)
    dx, dy = x - cx, y - cy
    return (
        cx + dx * math.cos(rad) - dy * math.sin(rad),
        cy + dx * math.sin(rad) + dy * math.cos(rad)
    )

def rotate_polygon(polygon: list[float], angle_degrees: float, cx: float = 0.0, cy: float = 0.0) -> list[float]:
    """Rotate all vertices of polygon around center (cx, cy) by angle_degrees."""
    result = []
    for i in range(0, len(polygon), 2):
        rx, ry = rotate_point(polygon[i], polygon[i+1], angle_degrees, cx, cy)
        result.extend([rx, ry])
    return result

def scale_polygon(polygon: list[float], scale_x: float, scale_y: float) -> list[float]:
    """Scale polygon vertices."""
    result = []
    for i in range(0, len(polygon), 2):
        result.extend([polygon[i] * scale_x, polygon[i+1] * scale_y])
    return result
