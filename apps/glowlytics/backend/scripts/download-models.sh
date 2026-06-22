#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/../models"
mkdir -p "$MODELS_DIR"
MODELS_DIR="$(cd "$MODELS_DIR" && pwd)"

# Pin to an immutable HuggingFace revision by exporting HF_MODEL_REV=<commit-sha>.
# Defaults to the moving "main" ref so existing setups keep working unchanged;
# operators SHOULD pin a commit SHA and commit a models.sha256 manifest so a
# force-updated branch or compromised repo cannot swap in a tampered model.
HF_MODEL_REV="${HF_MODEL_REV:-main}"
HF_BASE="https://huggingface.co/mufasabrownie/glowlytics-skin-models/resolve/$HF_MODEL_REV"

echo "[download-models] Downloading ONNX models to $MODELS_DIR (rev: $HF_MODEL_REV)"

# Files this script is responsible for (populated by download(), verified below).
MANAGED_FILES=()

download() {
  local remote="$1" local_name="$2" min_bytes="${3:-1000000}"
  local dest="$MODELS_DIR/$local_name"
  MANAGED_FILES+=("$local_name")

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

# Verify the managed files against a committed models.sha256 manifest.
# Manifest format: one "<sha256>  <filename>" line per file (i.e. `shasum -a 256`
# output, filenames matching the local names below). On a mismatch the tampered
# file is deleted and the script exits non-zero so a bad model never reaches the
# inference path. When the manifest is absent we fall back to the wc -c size-floor
# guard in download() and warn that integrity is unverified.
verify_checksums() {
  local manifest="$MODELS_DIR/models.sha256"

  if [ ! -f "$manifest" ]; then
    echo "[download-models] ⚠ No models.sha256 manifest found — model integrity UNVERIFIED (size-floor check only)."
    echo "                  Pin HF_MODEL_REV to a commit SHA and commit a models.sha256 manifest to harden this."
    return 0
  fi

  echo "[download-models] Verifying SHA-256 checksums against models.sha256"
  local f line failed=0
  for f in "${MANAGED_FILES[@]}"; do
    [ -f "$MODELS_DIR/$f" ] || continue
    line="$(awk -v name="$f" '$2 == name {print; exit}' "$manifest")"
    if [ -z "$line" ]; then
      echo "  ⚠ $f not listed in manifest — unverified"
      continue
    fi
    if printf '%s\n' "$line" | (cd "$MODELS_DIR" && shasum -a 256 -c -) >/dev/null 2>&1; then
      echo "  ✓ $f checksum OK"
    else
      echo "  ✗ $f CHECKSUM MISMATCH — removing tampered file"
      rm -f "$MODELS_DIR/$f"
      failed=1
    fi
  done

  if [ "$failed" -ne 0 ]; then
    echo "[download-models] CHECKSUM VERIFICATION FAILED — aborting."
    exit 1
  fi
  echo "[download-models] All checksums verified."
}

# Signal models (structure, hydration, elasticity) — ~17-18MB each
download "structure_model.onnx" "structure.onnx" 10000000
download "hydration_model.onnx" "hydration.onnx" 10000000
download "elasticity_model.onnx" "elasticity.onnx" 10000000

# Unified skin signals model (multi-head EfficientNet-B0) — ~600KB
download "skin_signals.onnx" "skin_signals.onnx" 500000

# Acne/lesion detector (YOLOv8s single-class) — ~43MB
download "acne_detector.onnx" "acne_detector.onnx" 30000000

verify_checksums

echo "[download-models] Done. Models in $MODELS_DIR:"
ls -lh "$MODELS_DIR"/*.onnx 2>/dev/null || echo "  (no .onnx files)"
