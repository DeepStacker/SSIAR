import cv2
import fitz
import numpy as np
import os

TEMPLATE_W = 1490
TEMPLATE_H = 2104
ZOOM = 180 / 72

COLS_X_PTS = [384.8, 449.3, 516.0]

P1_Y_RANGES = [
    (1400, 1660), (1660, 1810), (1810, 1960), (1960, 2110),
    (2110, 2260), (2260, 2410), (2410, 2560), (2560, 2710),
    (2710, 2860), (2860, 3010), (3010, 3160), (3160, 3310)
]

P2_Y_RANGES = [
    (58, 187), (187, 316), (316, 521), (521, 746), (746, 875),
    (875, 1008), (1008, 1137), (1137, 1337), (1337, 1471),
    (1471, 1600), (1600, 1825), (1825, 1946), (1946, 2075)
]

def split_pdf_to_images(pdf_path, output_dir):
    """Renders PDF pages to 300 DPI images on disk."""
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    img_paths = []
    
    for i in range(len(doc)):
        page = doc[i]
        mat = fitz.Matrix(ZOOM, ZOOM)
        pix = page.get_pixmap(matrix=mat)
        out_path = os.path.join(output_dir, f"page_{i+1}_300dpi.png")
        pix.save(out_path)
        img_paths.append(out_path)
    doc.close()
    return img_paths

def render_pdf_to_arrays(pdf_bytes):
    """Renders PDF pages to 180 DPI numpy arrays, with dynamic fallback for large/complex sheets."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    results = []
    
    # Target size for Letter/A4 at 180 DPI (~1490x2104)
    target_w = 1490
    target_h = 2104
    
    for i in range(len(doc)):
        page = doc[i]
        try:
            # 1. Primary: Render directly at 180 DPI zoom factor for maximum crispness
            mat = fitz.Matrix(ZOOM, ZOOM)
            pix = page.get_pixmap(matrix=mat)
            arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            arr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        except Exception as e:
            # 2. Safe Fallback: If PyMuPDF hits limit bounds (FzErrorLimit / code 5), 
            #    render at base scale (1,1) and upscale cleanly using cv2.resize
            print(f"[PDF Render Warning] Failed to render directly with ZOOM={ZOOM} ({e}). Falling back to base render + upscale...")
            pix = page.get_pixmap(matrix=fitz.Matrix(1, 1))
            arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            arr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            if arr.shape[1] != target_w or arr.shape[0] != target_h:
                arr = cv2.resize(arr, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
                
        results.append(arr)
    doc.close()
    return results

def classify_document(img_path):
    """
    Classifies document by size, estimated DPI, and color profile.
    """
    img = cv2.imread(img_path)
    if img is None:
        return {"type": "scanned", "dpi": 300, "pages": 1, "is_color": False}
        
    h, w = img.shape[:2]
    est_dpi = int((w / 8.27 + h / 11.69) / 2)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Simple color check
    color_diff = 0
    if len(img.shape) == 3:
        b, g, r = cv2.split(img)
        color_diff = float(np.mean(cv2.absdiff(b, g)) + np.mean(cv2.absdiff(g, r)))
        
    # Check lighting uniformity
    grid_h, grid_w = h // 4, w // 4
    means = []
    for r_idx in range(4):
        for c_idx in range(4):
            block = gray[r_idx*grid_h:(r_idx+1)*grid_h, c_idx*grid_w:(c_idx+1)*grid_w]
            if block.size > 0:
                means.append(np.mean(block))
    lighting_std = np.std(means) if means else 0
    
    doc_type = "scanned"
    if lighting_std > 18:
        doc_type = "mobile_photo"
    elif est_dpi < 150:
        doc_type = "fax_like"
        
    return {
        "type": doc_type,
        "dpi": est_dpi,
        "pages": 1,
        "is_color": color_diff > 5
    }
