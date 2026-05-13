# RadianceIQ / Glowlytics ML Pipeline

End-to-end machine learning pipeline for quantitative skin health assessment.
Four specialised signal models analyse facial images and produce continuous scores
(0-100) or bounding-box detections that power the RadianceIQ skin dashboard.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Signal Models](#signal-models)
3. [Dataset Sources & Sizes](#dataset-sources--sizes)
4. [Directory Layout](#directory-layout)
5. [Pipeline Stages](#pipeline-stages)
6. [Running on Google Colab](#running-on-google-colab)
7. [Expected Results](#expected-results)
8. [Dependencies](#dependencies)

---

## Architecture Overview

```
Selfie Image
     |
     v
 +-----------+     +-----------+     +-----------+     +-----------+
 | Structure |     | Hydration |     | Elasticity|     |  Lesion   |
 | MobileNet |     | EffNet-B0 |     | EffNet-B0 |     | YOLOv8s  |
 |  V3-Large |     | +Gabor/LBP|     | +Frangi   |     | 6-class  |
 +-----------+     +-----------+     +-----------+     +-----------+
   |  |  |              |                 |               |
   v  v  v              v                 v               v
 pore texture      hydration         elasticity       bounding
 count regularity  score [0-100]     score [0-100]    boxes +
       structure                                      class labels
       score
       [0-100]
     \            |               /                 /
      \           |              /                 /
       +----------+-----------+-+                 /
                  |                               /
                  v                               v
        Regression Scores                Detection Results
        (structure, hydration,           (comedone, papule,
         elasticity)                      pustule, nodule,
                                          macule, patch)
                   \                     /
                    +------- API -------+
                           |
                           v
                    RadianceIQ Dashboard
```

---

## Signal Models

### 1. Structure Signal (Notebook 05)

| Property | Value |
|----------|-------|
| **Backbone** | MobileNetV3-Large (ImageNet pretrained) |
| **Architecture** | Multi-task: shared FC(1280->256) then 3 heads |
| **Outputs** | `pore_count`, `texture_regularity` [0-100], `structure_score` [0-100] |
| **Input** | 224x224 RGB (green-channel CLAHE enhanced, stacked 3x) |
| **Preprocessing** | Green channel isolation, CLAHE, 2D FFT texture features, LoG blob detection |
| **Loss** | Weighted multi-task MSE (0.3 pore, 0.35 texture, 0.35 structure) |
| **Optimiser** | AdamW, lr=1e-4, cosine annealing, 30 epochs |
| **Export** | ONNX (opset 17), dynamic batch |

### 2. Hydration Signal (Notebook 06)

| Property | Value |
|----------|-------|
| **Backbone** | EfficientNet-B0 (ImageNet pretrained) |
| **Architecture** | CNN (1280-d) + handcrafted FC(44->64) -> fused FC(1344->256->1) |
| **Handcrafted features** | Gabor bank 4x3=12 filters (mean+std=24), LBP histogram (18), specular (2) = **44 dims** |
| **Output** | `hydration_score` [0-100] |
| **Input** | 224x224 RGB image + 44-dim feature vector |
| **Loss** | MSE |
| **Optimiser** | AdamW, lr=1e-4, cosine annealing, 30 epochs |
| **Export** | ONNX (opset 17), dual input (image + handcrafted) |

### 3. Elasticity Signal (Notebook 07)

| Property | Value |
|----------|-------|
| **Backbone** | EfficientNet-B0 (ImageNet pretrained) |
| **Architecture** | CNN (1280-d) + handcrafted FC(14->32) -> fused FC(1312->256->1) |
| **Handcrafted features** | Frangi ROI features (3 ROIs x 3 = 9) + landmark geometry ratios (5) = **14 dims** |
| **Output** | `elasticity_score` [0-100] |
| **Label source** | Age -> elasticity mapping: `95 - (age - 20) * 80/60` |
| **Input** | 224x224 RGB image + 14-dim feature vector |
| **Loss** | Smooth L1 |
| **Optimiser** | AdamW, lr=1e-4, cosine annealing, 30 epochs |
| **Export** | ONNX (opset 17), dual input |

### 4. Lesion Detection (Notebook 08)

| Property | Value |
|----------|-------|
| **Model** | YOLOv8s (COCO pretrained) |
| **Classes** | `comedone`, `papule`, `pustule`, `nodule`, `macule`, `patch` (6) |
| **Input** | 640x640 RGB |
| **Training** | Phase 1: HAM10000+ISIC general lesion (50 epochs, lr=1e-3) |
|              | Phase 2: ACNE04 fine-tune (30 epochs, lr=5e-4, freeze 10 layers) |
| **Augmentation** | mosaic, mixup, HSV jitter, flip |
| **Export** | ONNX + CoreML (.mlpackage) for on-device iOS inference |

---

## Dataset Sources & Sizes

### Structure

| Dataset | Size | Usage |
|---------|------|-------|
| FFHQ | 70,000 faces | Age metadata as structure degradation proxy |
| CelebA-HQ | ~30,000 | Smooth skin attribute labels |
| Custom annotations | - | Manual pore count & texture regularity labels |

**Prepared splits:** 7,000 train / 1,500 val / 1,500 test

### Hydration

| Dataset | Size | Usage |
|---------|------|-------|
| CelebA | ~200,000 | Skin smoothness attributes as hydration proxy |
| Oulu Skin Condition | ~1,000 | Moisture annotations |

**Prepared splits:** 7,000 train / 1,500 val / 1,500 test

### Elasticity

| Dataset | Size | Usage |
|---------|------|-------|
| UTKFace | ~24,000 | Age labels (inverse elasticity proxy) |
| FFHQ | 70,000 | Diverse age distribution |
| AgeDB | ~16,000 | Age-annotated in-the-wild faces |

**Prepared splits:** 16,594 train / 3,556 val / 3,557 test

### Lesion Detection

| Dataset | Size | Usage |
|---------|------|-------|
| ACNE04 | ~1,400 | Acne bounding boxes (comedone, papule, pustule, nodule) |
| HAM10000 | 10,015 | Dermoscopic lesion images |
| ISIC 2018 | ~12,000 | Dermoscopic with segmentation masks |
| DDI | ~656 | Diverse skin tone representation |

**Prepared splits:** 640 train / 197 val / 92 test (YOLO format)

---

## Directory Layout

```
ml/
  notebooks/
    01_data_preparation.ipynb     # Download & preprocess datasets
    02_gpt4o_finetune.ipynb       # GPT-4o fine-tune (legacy)
    03_medgemma_finetune.ipynb    # MedGemma LoRA fine-tune (legacy)
    04_evaluation.ipynb           # Legacy model comparison
    05_structure_model.ipynb      # Train structure signal model
    06_hydration_model.ipynb      # Train hydration signal model
    07_elasticity_model.ipynb     # Train elasticity signal model
    08_lesion_detection.ipynb     # Train YOLOv8 lesion detector
    09_signal_evaluation.ipynb    # ** Unified evaluation of all 4 models **
  data/
    structure/
      images/                     # Face images (FFHQ-derived)
      annotations/
        train.json, val.json, test.json
    hydration/
      images/                     # Face images with hydration labels
      annotations/
        train.json, val.json, test.json
    elasticity/
      images/                     # UTKFace-derived images
      annotations/
        train.json, val.json, test.json
    lesion/
      dataset.yaml                # YOLO dataset config
      train/images/, train/labels/
      val/images/,   val/labels/
      test/images/,  test/labels/
  checkpoints/                    # Trained model weights
    structure_model.onnx
    hydration_model.onnx
    elasticity_model.onnx
    lesion_best.pt
  evaluation_outputs/             # Generated by notebook 09
    evaluation_report.json
    all_signals_scatter.png
    all_signals_errors.png
    structure_evaluation.png
    hydration_evaluation.png
    elasticity_evaluation.png
    lesion_confusion_matrix.png
  scripts/
    generate_eval_notebook.py     # Notebook generator script
```

---

## Pipeline Stages

### Stage 1: Data Preparation

```
Notebook 01 -> Downloads Fitzpatrick17k, ISIC, PAD-UFES-20
Notebooks 05-08 inline prep -> Converts to per-signal format
```

Each regression model expects a JSON annotation list:
```json
[
  {
    "image": "filename.jpg",
    "hydration_score": 55.8,
    "handcrafted_features": [...]
  }
]
```

Lesion detection uses standard YOLO format (one `.txt` per image):
```
class_id x_center y_center width height
```

### Stage 2: Training

Run notebooks **05 -> 06 -> 07 -> 08** in order (or in parallel).
Each notebook:
1. Defines preprocessing and dataset class
2. Defines model architecture
3. Trains with AdamW + cosine annealing
4. Exports best checkpoint to ONNX (or `.pt` for YOLO)

### Stage 3: Evaluation

Run notebook **09**:
1. Loads all 4 model checkpoints
2. Runs inference on held-out test sets
3. Computes regression metrics (MAE, RMSE, Pearson r, Spearman rho)
4. Computes detection metrics (mAP@0.5, precision, recall)
5. Generates scatter plots, error histograms, confusion matrix
6. Outputs `evaluation_report.json` with pass/fail verdicts

---

## Running on Google Colab

### Quick Start

1. **Upload** the `ml/` folder to Google Drive at `MyDrive/RadianceIQ/ml/`

2. **Open** any notebook in Colab:
   - Click the notebook file in Drive, or
   - Upload directly via File > Upload Notebook

3. **Set GPU runtime**: Runtime > Change runtime type > T4 GPU

4. **Mount Drive** (first cell in each notebook handles this):
   ```python
   from google.colab import drive
   drive.mount('/content/drive')
   ```

5. **Run notebooks in order**:
   ```
   05 -> 06 -> 07 -> 08 -> 09
   ```

### Resource Requirements

| Notebook | GPU Memory | Time (T4) | Time (A100) |
|----------|-----------|-----------|-------------|
| 05 Structure | ~2 GB | ~20 min | ~5 min |
| 06 Hydration | ~3 GB | ~25 min | ~7 min |
| 07 Elasticity | ~3 GB | ~30 min | ~8 min |
| 08 Lesion | ~4 GB | ~45 min | ~12 min |
| 09 Evaluation | ~2 GB | ~5 min | ~2 min |

### Colab Tips

- Use **Colab Pro** for longer sessions and A100 access
- Save checkpoints to Drive to avoid retraining after disconnects
- The evaluation notebook (09) works without GPU (CPU inference via ONNX Runtime)
- If checkpoints are not found, notebook 09 runs in **demo mode** with synthetic predictions

---

## Expected Results

### Regression Models (Target: MAE < 10, Pearson r > 0.7)

| Model | MAE | RMSE | Pearson r | Spearman rho | Status |
|-------|-----|------|-----------|-------------|--------|
| Structure (score) | ~6-8 | ~8-11 | ~0.75-0.85 | ~0.73-0.83 | PASS |
| Hydration | ~5-7 | ~7-9 | ~0.80-0.88 | ~0.78-0.86 | PASS |
| Elasticity | ~6-8 | ~8-10 | ~0.78-0.86 | ~0.76-0.84 | PASS |

### Lesion Detection (Target: mAP@0.5 > 0.5)

| Metric | Expected Value |
|--------|---------------|
| mAP@0.5 | 0.55-0.65 |
| mAP@0.5:0.95 | 0.30-0.40 |
| Precision | 0.65-0.75 |
| Recall | 0.50-0.60 |

### Per-Class AP@0.5 (Lesion)

| Class | Expected AP |
|-------|------------|
| comedone | 0.50-0.60 |
| papule | 0.60-0.70 |
| pustule | 0.65-0.75 |
| nodule | 0.45-0.55 |
| macule | 0.55-0.65 |
| patch | 0.50-0.65 |

---

## Dependencies

```bash
pip install torch torchvision timm
pip install onnx onnxruntime
pip install ultralytics          # YOLOv8
pip install opencv-python scikit-learn scikit-image
pip install albumentations
pip install scipy matplotlib seaborn
pip install tqdm
```

Or install everything at once:
```bash
pip install -q torch torchvision timm onnx onnxruntime ultralytics \
    opencv-python scikit-learn scikit-image scipy matplotlib seaborn \
    albumentations tqdm
```

Set `OPENAI_API_KEY` if using the legacy GPT-4o fine-tuning notebook (02).

---

## License

This pipeline is developed for the Cornell Hackathon. Dataset usage is subject
to the respective dataset licenses (FFHQ: Creative Commons, UTKFace: non-commercial,
HAM10000: CC BY-NC-SA 4.0, ISIC: CC BY-NC 3.0).
