#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/../models"
mkdir -p "$MODELS_DIR"
MODELS_DIR="$(cd "$MODELS_DIR" && pwd)"

HF_BASE="https://huggingface.co/mufasabrownie/glowlytics-skin-models/resolve/main"

echo "[download-models] Downloading ONNX models to $MODELS_DIR"

download() {
  local remote="$1" local_name="$2" min_bytes="${3:-1000000}"
  local dest="$MODELS_DIR/$local_name"

  # Skip if cached AND file is at least min_bytes (guards against truncated downloads)
  if [ -f "$dest" ] && [ "$(wc -c < "$dest")" -ge "$min_bytes" ]; then
    echo "  · $local_name (cached)"
    return
  fi

  # Download with retry (2 attempts, 30s timeout each)
  local attempt
  for attempt in 1 2; do
    if curl -fSL --connect-timeout 30 --max-time 300 --progress-bar "$HF_BASE/$remote" -o "$dest.tmp"; then
      mv "$dest.tmp" "$dest"
      echo "  ✓ $local_name"
      return
    fi
    echo "  ⚠ $local_name attempt $attempt failed, retrying..."
    rm -f "$dest.tmp"
    sleep 2
  done

  echo "  ✗ $local_name FAILED after 2 attempts (non-fatal)"
  rm -f "$dest.tmp"
}

# Signal models (structure, hydration, elasticity) — ~17-18MB each
download "structure_model.onnx" "structure.onnx" 10000000
download "hydration_model.onnx" "hydration.onnx" 10000000
download "elasticity_model.onnx" "elasticity.onnx" 10000000

# Unified skin signals model (multi-head EfficientNet-B0) — ~600KB
download "skin_signals.onnx" "skin_signals.onnx" 500000

# Acne/lesion detector (YOLOv8s single-class) — ~43MB
download "acne_detector.onnx" "acne_detector.onnx" 30000000

echo "[download-models] Done. Models in $MODELS_DIR:"
ls -lh "$MODELS_DIR"/*.onnx 2>/dev/null || echo "  (no .onnx files)"
