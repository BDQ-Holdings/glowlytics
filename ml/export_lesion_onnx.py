"""
Export YOLOv8 lesion detector from .pt to ONNX format.

Usage:
  cd ml
  python export_lesion_onnx.py

Requires: pip install ultralytics
Input:  ../RadianceIQ/backend/models/lesion_yolov8_best.pt
Output: ../RadianceIQ/backend/models/lesion_detector.onnx
"""

import os
from pathlib import Path

try:
    from ultralytics import YOLO
except ImportError:
    print("Error: ultralytics not installed. Run: pip install ultralytics")
    raise SystemExit(1)

MODELS_DIR = Path(__file__).resolve().parent.parent / "RadianceIQ" / "backend" / "models"
PT_PATH = MODELS_DIR / "lesion_yolov8_best.pt"
ONNX_PATH = MODELS_DIR / "lesion_detector.onnx"

if not PT_PATH.exists():
    print(f"Error: {PT_PATH} not found. Run download-models.sh first.")
    raise SystemExit(1)

print(f"Loading model from {PT_PATH}")
model = YOLO(str(PT_PATH))

print("Exporting to ONNX (imgsz=640, simplify=True)...")
export_path = model.export(format="onnx", imgsz=640, simplify=True)

# ultralytics puts the .onnx next to the .pt with same stem
exported = Path(export_path)
if exported.exists() and exported != ONNX_PATH:
    os.replace(str(exported), str(ONNX_PATH))

print(f"Done: {ONNX_PATH}")
