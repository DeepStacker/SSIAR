"""
Geometry utilities for OCR polygon operations.

All geometry calculations for OCR coordinates belong here.
No database layer, API layer, or frontend should calculate geometry independently.
"""
from app.geometry.polygon import polygon_bounds, polygon_area, polygon_is_valid, polygons_overlap
from app.geometry.transforms import scale_polygon, rotate_point, rotate_polygon
