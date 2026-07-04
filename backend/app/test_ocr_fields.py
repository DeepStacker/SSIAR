import os
os.environ["HF_HUB_OFFLINE"] = "1"
import sys
import cv2
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.pipeline import split_pdf_to_images
from app.modules.alignment import align_page_hierarchical
from app.modules.preprocessing import assess_image_quality, select_and_apply_preprocessing
from app.modules.roi import extract_dynamic_roi
from app.modules.recognition import get_recognition_router
from app.modules.digit_engine import get_digit_engine

PDF_PATH = "/Users/deepstacker/WorkSpace/dupcq/SSIAR/Dabohara CF_00Pre.pdf"
TEMPLATES_DIR = "/Users/deepstacker/WorkSpace/dupcq/SSIAR/shared/templates"

def main():
    print("1. Creating temp directory...")
    temp_dir = "/Users/deepstacker/WorkSpace/dupcq/SSIAR/shared/temp/ocr_debug"
    os.makedirs(temp_dir, exist_ok=True)
    
    print("2. Splitting PDF to images...")
    img_paths = split_pdf_to_images(PDF_PATH, temp_dir)

    print("3. Reading images...")
    p1_raw = cv2.imread(img_paths[0])
    p1_temp = cv2.imread(os.path.join(TEMPLATES_DIR, "template_p1.png"))

    print("4. Aligning raw image...")
    aligned_p1_raw, _, _ = align_page_hierarchical(p1_raw, p1_temp)

    print("5. Assessing image quality...")
    q_report_p1 = assess_image_quality(aligned_p1_raw)
    
    print("6. Preprocessing aligned image...")
    aligned_p1 = select_and_apply_preprocessing(aligned_p1_raw, q_report_p1)

    print("7. Getting recognition router...")
    router = get_recognition_router()
    
    print("8. Getting digit engine...")
    digit_engine = get_digit_engine()

    fields = ["roll_number", "class", "dob", "gender"]
    print("\n=== OCR Diagnostics ===")
    for field_name in fields:
        crop = extract_dynamic_roi(aligned_p1, field_name, 1)
        print(f"\nField: {field_name} (Crop shape: {crop.shape})")

        # Local Digit CNN
        import time
        t0 = time.time()
        try:
            digit_res = digit_engine.predict_number(crop)
            print(f"  DigitCNN: '{digit_res.text}' (Conf: {digit_res.confidence:.3f}) - Time: {time.time() - t0:.3f}s")
        except Exception as e:
            print(f"  DigitCNN Error: {e} - Time: {time.time() - t0:.3f}s")

        # Pluggable OCR Plugins
        for name in ['easyocr', 'surya']:
            plugin = router.get_plugin(name)
            if plugin:
                t0 = time.time()
                try:
                    res = plugin.recognize(crop, field_name)
                    if res:
                        print(f"  {name}: '{res.text}' (Conf: {res.confidence:.3f}) - Time: {time.time() - t0:.3f}s")
                    else:
                        print(f"  {name}: None - Time: {time.time() - t0:.3f}s")
                except Exception as e:
                    print(f"  {name} Error: {e} - Time: {time.time() - t0:.3f}s")

    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
