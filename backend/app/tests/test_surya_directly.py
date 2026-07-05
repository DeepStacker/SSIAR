import os
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

import numpy as np
import time

print("Starting Surya import...")
from surya.inference import SuryaInferenceManager
from surya.recognition import RecognitionPredictor
from PIL import Image

print("Initializing SuryaInferenceManager...")
manager = SuryaInferenceManager()

print("Initializing RecognitionPredictor...")
predictor = RecognitionPredictor(manager)

print("Creating dummy image...")
img = Image.fromarray(np.ones((200, 800, 3), dtype=np.uint8) * 255)

print("Calling Surya predictor (full_page=True)...")
t0 = time.time()
try:
    predictions = predictor([img], full_page=True)
    print(f"Prediction succeeded! Time taken: {time.time() - t0:.3f}s")
    print(f"Result type: {type(predictions)}")
    if predictions:
        print(f"Result elements: {predictions[0]}")
except Exception as e:
    print(f"Prediction failed with error: {e}")
