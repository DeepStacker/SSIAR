import os
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader
from typing import List, Tuple, Optional
from dataclasses import dataclass, field
from pathlib import Path

# Compute paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
MODEL_PATH = str(BASE_DIR / "shared" / "database" / "digit_cnn.pth")

@dataclass
class DigitResult:
    digit: str
    confidence: float
    bbox: Tuple[int, int, int, int]
    is_merged: bool = False
    alternatives: List[Tuple[str, float]] = field(default_factory=list)

@dataclass
class NumberResult:
    text: str
    confidence: float
    per_digit: List[DigitResult] = field(default_factory=list)
    engine: str = "digit_cnn"

# ---------------------------------------------------------------------------
# Digit Segmentation — Connected Components + Spacing Analysis
# ---------------------------------------------------------------------------

def segment_digits(crop: np.ndarray) -> List[Tuple[int, int, int, int]]:
    """
    Segments a crop into individual digit bounding boxes.
    Uses connected components and splits wide touching components.
    """
    if crop is None or crop.size == 0:
        return []

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 4
    )

    # Clean small noise blobs
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    n_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if n_labels <= 1:
        return []

    h, w = binary.shape
    total_pixels = h * w
    components = []

    for i in range(1, n_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        x = stats[i, cv2.CC_STAT_LEFT]
        y = stats[i, cv2.CC_STAT_TOP]
        cw = stats[i, cv2.CC_STAT_WIDTH]
        ch = stats[i, cv2.CC_STAT_HEIGHT]

        # Ignore tiny dust or borders using absolute thresholds
        if area < 15 or area > total_pixels * 0.9:
            continue
        if cw < 2 or ch < 6:
            continue
        if cw > w * 0.9:
            continue

        components.append((x, y, cw, ch, area))

    if not components:
        return []

    # Sort components from left to right
    components.sort(key=lambda c: c[0])

    # Merge broken strokes (like '5' with separate top bar, or '0', '4' with disconnected segments)
    merged = []
    for comp in components:
        if not merged:
            merged.append(comp)
            continue
        px, py, pw, ph, pa = merged[-1]
        cx, cy, cw, ch, ca = comp
        
        # Overlapping or very close horizontally
        h_overlap = (cx < px + pw + 4)
        v_overlap = not (cy + ch < py - 4 or py + ph < cy - 4)
        
        if h_overlap and v_overlap:
            nx0 = min(px, cx)
            ny0 = min(py, cy)
            nx1 = max(px + pw, cx + cw)
            ny1 = max(py + ph, cy + ch)
            merged[-1] = (nx0, ny0, nx1 - nx0, ny1 - ny0, pa + ca)
        else:
            merged.append(comp)

    # Split touching/wide components (aspect ratio > 1.4)
    final_boxes = []
    for x, y, cw, ch, area in merged:
        if cw > ch * 1.4 and cw > 20:
            # Split using vertical projection valley
            splits = _split_wide_digit(binary[y:y+ch, x:x+cw], x, y)
            final_boxes.extend(splits)
        else:
            final_boxes.append((x, y, cw, ch))

    # Add 20% padding to each isolated digit
    padded_boxes = []
    for x, y, cw, ch in final_boxes:
        pad_x = int(cw * 0.15)
        pad_y = int(ch * 0.15)
        px0 = max(0, x - pad_x)
        py0 = max(0, y - pad_y)
        px1 = min(crop.shape[1], x + cw + pad_x)
        py1 = min(crop.shape[0], y + ch + pad_y)
        padded_boxes.append((px0, py0, px1 - px0, py1 - py0))

    return padded_boxes

def _split_wide_digit(binary_patch: np.ndarray, offset_x: int, offset_y: int) -> List[Tuple[int, int, int, int]]:
    """Finds the lowest vertical projection profile point to split touching digits."""
    h, w = binary_patch.shape
    vproj = binary_patch.sum(axis=0) / 255.0
    
    # Restrict split point to middle 60% of width
    min_idx = int(w * 0.2) + int(np.argmin(vproj[int(w * 0.2):int(w * 0.8)]))
    
    box1 = (offset_x, offset_y, min_idx, h)
    box2 = (offset_x + min_idx, offset_y, w - min_idx, h)
    
    # Reject sub-splits that are too thin
    out = []
    if min_idx > 4:
        out.append(box1)
    if (w - min_idx) > 4:
        out.append(box2)
    return out if out else [(offset_x, offset_y, w, h)]

# ---------------------------------------------------------------------------
# PyTorch Model & Synthetic Generator
# ---------------------------------------------------------------------------

class CNNNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, 3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.fc1 = nn.Linear(32 * 7 * 7, 128)
        self.fc2 = nn.Linear(128, 10)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.2)

    def forward(self, x):
        x = self.pool(self.relu(self.conv1(x)))
        x = self.pool(self.relu(self.conv2(x)))
        x = x.view(x.size(0), -1)
        x = self.dropout(self.relu(self.fc1(x)))
        return self.fc2(x)

class DigitCNN:
    def __init__(self):
        self._model = None
        self._device = None
        self._initialized = False

    def _lazy_init(self):
        if self._initialized:
            return True
        
        # Select device
        if torch.backends.mps.is_available():
            self._device = torch.device("mps")
        elif torch.cuda.is_available():
            self._device = torch.device("cuda")
        else:
            self._device = torch.device("cpu")
            
        self._model = CNNNet().to(self._device)
        
        # Load weights or train if missing
        if os.path.exists(MODEL_PATH):
            try:
                self._model.load_state_dict(torch.load(MODEL_PATH, map_location=self._device))
                self._model.eval()
                self._initialized = True
                print("DigitCNN: Loaded model weights from", MODEL_PATH)
                return True
            except Exception as e:
                print(f"DigitCNN: Failed to load model weights: {e}. Auto-retraining...")
                
        # Auto-train
        self._train_model()
        self._initialized = True
        return True

    def _train_model(self):
        """Generates 50,000 synthetic digits and trains the CNN to high accuracy."""
        print("DigitCNN: Generating 50,000 synthetic handwritten digit samples...")
        
        # Generate synthetic digit dataset in memory
        X_data = []
        y_data = []
        
        # Hershey fonts in CV2
        fonts = [
            cv2.FONT_HERSHEY_SIMPLEX, cv2.FONT_HERSHEY_COMPLEX,
            cv2.FONT_HERSHEY_SCRIPT_SIMPLEX, cv2.FONT_HERSHEY_SCRIPT_COMPLEX
        ]
        
        np.random.seed(42)
        samples_per_digit = 5000  # 50,000 total (5,000 * 10 digits)
        
        for digit in range(10):
            char = str(digit)
            for _ in range(samples_per_digit):
                # 28x28 black canvas
                canvas = np.zeros((28, 28), dtype=np.uint8)
                
                # Random font, size, thickness
                font = np.random.choice(fonts)
                scale = np.random.uniform(0.65, 0.95)
                thickness = np.random.randint(1, 3)
                
                # Get text size to center it
                (tw, th), baseline = cv2.getTextSize(char, font, scale, thickness)
                x_pos = (28 - tw) // 2 + np.random.randint(-2, 3)
                y_pos = (28 + th) // 2 + np.random.randint(-2, 3)
                
                cv2.putText(canvas, char, (x_pos, y_pos), font, scale, 255, thickness, cv2.LINE_AA)
                
                # -- Augmentations --
                # Rotate
                angle = np.random.uniform(-15, 15)
                M = cv2.getRotationMatrix2D((14, 14), angle, 1.0)
                canvas = cv2.warpAffine(canvas, M, (28, 28))
                
                # Blur
                if np.random.rand() > 0.4:
                    canvas = cv2.GaussianBlur(canvas, (3, 3), 0)
                    
                # Elastic affine distortion (shear/scale)
                if np.random.rand() > 0.5:
                    pts1 = np.float32([[2,2], [26,2], [2,26]])
                    offset = np.random.uniform(-1.5, 1.5, (3, 2)).astype(np.float32)
                    pts2 = pts1 + offset
                    M_dist = cv2.getAffineTransform(pts1, pts2)
                    canvas = cv2.warpAffine(canvas, M_dist, (28, 28))
                    
                # Add noise
                noise = np.random.normal(0, np.random.uniform(2, 8), canvas.shape).astype(np.uint8)
                canvas = cv2.add(canvas, noise)
                
                X_data.append(canvas.astype(np.float32) / 255.0)
                y_data.append(digit)
                
        X_tensor = torch.tensor(X_data, dtype=torch.float32).unsqueeze(1) # shape: (50000, 1, 28, 28)
        y_tensor = torch.tensor(y_data, dtype=torch.long)
        
        dataset = TensorDataset(X_tensor, y_tensor)
        loader = DataLoader(dataset, batch_size=256, shuffle=True)
        
        print("DigitCNN: Training CNN model on device:", self._device)
        self._model.train()
        criterion = nn.CrossEntropyLoss()
        optimizer = optim.Adam(self._model.parameters(), lr=0.003)
        
        epochs = 4
        for epoch in range(epochs):
            running_loss = 0.0
            correct = 0
            total = 0
            for inputs, labels in loader:
                inputs, labels = inputs.to(self._device), labels.to(self._device)
                optimizer.zero_grad()
                outputs = self._model(inputs)
                loss = criterion(outputs, labels)
                loss.backward()
                optimizer.step()
                
                running_loss += loss.item() * inputs.size(0)
                _, predicted = outputs.max(1)
                total += labels.size(0)
                correct += predicted.eq(labels).sum().item()
                
            epoch_loss = running_loss / total
            epoch_acc = (correct / total) * 100.0
            print(f"  Epoch {epoch+1}/{epochs} - Loss: {epoch_loss:.4f} - Acc: {epoch_acc:.2f}%")
            
        # Save trained weights
        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        torch.save(self._model.state_dict(), MODEL_PATH)
        self._model.eval()
        print("DigitCNN: Auto-training finished. Weights saved to", MODEL_PATH)

    def predict_patch(self, patch: np.ndarray) -> Tuple[str, float, List[Tuple[str, float]]]:
        """Runs inference on a single normalized digit patch."""
        self._lazy_init()
        
        # Prepare image: resize to 28x28, convert to grayscale, invert to white ink on black background
        img = cv2.resize(patch, (28, 28), interpolation=cv2.INTER_AREA)
        if len(img.shape) == 3:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
        img_f = img.astype(np.float32) / 255.0
        # Auto-invert if background is bright (white paper)
        if img_f.mean() > 0.45:
            img_f = 1.0 - img_f
            
        tensor = torch.tensor(img_f, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(self._device)
        
        with torch.no_grad():
            outputs = self._model(tensor)
            probs = torch.softmax(outputs, dim=1).cpu().numpy()[0]
            
        best_digit = int(np.argmax(probs))
        alternatives = [(str(i), float(probs[i])) for i in range(10)]
        alternatives.sort(key=lambda x: -x[1])
        
        return str(best_digit), float(probs[best_digit]), alternatives

    def predict_number(self, crop: np.ndarray) -> NumberResult:
        """
        Segments crop, runs Digit CNN ensemble (test-time augmentation),
        detects spacing, and returns the overall combined number string.
        """
        boxes = segment_digits(crop)
        if not boxes:
            return NumberResult(text="", confidence=0.0)

        digits = []
        
        # Test-Time Augmentations (slight scale and rot) for robust ensemble classification
        for idx, (x, y, w, h) in enumerate(boxes):
            patch = crop[y:y+h, x:x+w]
            if patch.size == 0:
                continue
                
            views = [patch]
            if w > 8 and h > 8:
                # Rotated views
                center = (float(w) / 2.0, float(h) / 2.0)
                M1 = cv2.getRotationMatrix2D(center, -6, 1.0)
                views.append(cv2.warpAffine(patch, M1, (w, h), borderMode=cv2.BORDER_REPLICATE))
                M2 = cv2.getRotationMatrix2D(center, 6, 1.0)
                views.append(cv2.warpAffine(patch, M2, (w, h), borderMode=cv2.BORDER_REPLICATE))
                
            # Ensemble predictions
            vote_confs = {}
            for view in views:
                digit, conf, alts = self.predict_patch(view)
                if digit not in vote_confs:
                    vote_confs[digit] = []
                vote_confs[digit].append(conf)
                
            # Pick best digit by highest average confidence
            best_digit = max(vote_confs.keys(), key=lambda d: np.mean(vote_confs[d]))
            avg_conf = float(np.mean(vote_confs[best_digit]))
            
            alts = [(d, float(np.mean(c))) for d, c in vote_confs.items() if d != best_digit]
            alts.sort(key=lambda x: -x[1])
            
            digits.append(DigitResult(
                digit=best_digit,
                confidence=avg_conf,
                bbox=(x, y, w, h),
                is_merged=(w > h * 1.5),
                alternatives=alts
            ))
            
        # Spacing Detection
        # Compute horizontal gaps between digits. Large gaps translate to space separators.
        text_parts = []
        for i in range(len(digits)):
            text_parts.append(digits[i].digit)
            if i < len(digits) - 1:
                x_curr, _, w_curr, _ = digits[i].bbox
                x_next, _, _, _ = digits[i + 1].bbox
                gap = x_next - (x_curr + w_curr)
                # If gap is wider than 0.75x average digit width, insert space separator
                avg_w = np.mean([d.bbox[2] for d in digits])
                if gap > avg_w * 0.75:
                    text_parts.append(" ")
                    
        full_text = "".join(text_parts)
        overall_conf = float(np.mean([d.confidence for d in digits])) if digits else 0.0
        
        return NumberResult(text=full_text, confidence=overall_conf, per_digit=digits, engine="digit_cnn")

# Module singleton
_engine = None

def get_digit_engine() -> DigitCNN:
    global _engine
    if _engine is None:
        _engine = DigitCNN()
    return _engine
