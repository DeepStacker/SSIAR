import os
import sys
import cv2
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.image.pdf import split_pdf_to_images
from app.image.alignment import align_page_hierarchical, TEMPLATE_W, TEMPLATE_H

PDF_PATH = "/Users/deepstacker/WorkSpace/dupcq/SSIAR/Dabohara CF_00Pre.pdf"
TEMPLATES_DIR = "/Users/deepstacker/WorkSpace/dupcq/SSIAR/shared/templates"

def main():
    temp_dir = "/Users/deepstacker/WorkSpace/dupcq/SSIAR/shared/temp/align_debug"
    os.makedirs(temp_dir, exist_ok=True)
    img_paths = split_pdf_to_images(PDF_PATH, temp_dir)

    p1_raw = cv2.imread(img_paths[0])
    p1_temp = cv2.imread(os.path.join(TEMPLATES_DIR, "template_p1.png"))

    print(f"p1_raw shape: {p1_raw.shape}")
    print(f"p1_temp shape: {p1_temp.shape}")

    aligned, zones, method = align_page_hierarchical(p1_raw, p1_temp)
    print(f"Alignment Method Succeeded: {method}")
    print(f"Aligned Image Shape: {aligned.shape}")

    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
