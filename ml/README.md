# Glowlytics ML Pipeline

Train and evaluate computer vision models for skin health signal scoring.

## Architecture: Knowledge Distillation

```
┌─────────────────────────────────────────────────────────┐
│  Teacher: Fine-tuned GPT-4o                             │
│  (ft:gpt-4o-2024-08-06:personal:radianceiq-skin:...)    │
│  • 5-signal scores (structure, hydration, inflammation,  │
│    sunDamage, elasticity)                                │
│  • ~4s latency, ~$0.01-0.03/image                       │
└──────────────────────┬──────────────────────────────────┘
                       │ Pseudo-labels (10k+ images)
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Students: Lightweight ONNX Models                       │
│  • Structure:  MobileNetV3-Large (~18MB, ~50ms)          │
│  • Hydration:  EfficientNet-B0 + 44d features (~17MB)    │
│  • Elasticity: EfficientNet-B0 + 14d features (~17MB)    │
│  • MultiSignal: EfficientNet-B0 + 58d features (all 5)   │
│  • Lesion:     YOLOv8s (6 classes, ~45MB)                │
└─────────────────────────────────────────────────────────┘
```

## Setup (Google Colab)

1. Upload this `ml/` folder to Google Drive
2. Open notebooks in Google Colab (GPU runtime for training)
3. Set `OPENAI_API_KEY` in Colab secrets for teacher labeling
4. Run notebooks in order: 10 → 11 → 12

## Notebooks

### Active Pipeline (Knowledge Distillation)

| Notebook | Purpose | Runtime |
|----------|---------|---------|
| `10_teacher_labeling.ipynb` | GPT-4o pseudo-labels on FFHQ/UTKFace/CelebA-HQ | CPU (API calls) |
| `11_distillation_training.ipynb` | Train student ONNX models on teacher labels | **GPU** |
| `12_distillation_eval.ipynb` | Student vs teacher agreement, metrics, report | CPU/GPU |

### Supporting Notebooks

| Notebook | Purpose | Status |
|----------|---------|--------|
| `02_gpt4o_finetune.ipynb` | Fine-tune GPT-4o (the teacher model) | Current |
| `03_medgemma_finetune.ipynb` | MedGemma alternative (optional) | Current |
| `08_lesion_detection.ipynb` | YOLOv8 lesion detector training | Current |
| `09_signal_evaluation.ipynb` | Per-signal model evaluation | Current |

### Legacy (Superseded by Distillation Pipeline)

| Notebook | Replaced By |
|----------|-------------|
| `01_data_preparation.ipynb` | `10_teacher_labeling.ipynb` — old notebook used random labels |
| `04_evaluation.ipynb` | `12_distillation_eval.ipynb` |
| `05_structure_model.ipynb` | `11_distillation_training.ipynb` |
| `06_hydration_model.ipynb` | `11_distillation_training.ipynb` |
| `07_elasticity_model.ipynb` | `11_distillation_training.ipynb` |

## 5-Signal Schema

All models produce scores on a 0-100 scale (100 = optimal health):

| Signal | What it measures |
|--------|-----------------|
| `structure` | Texture quality, pore visibility, surface smoothness |
| `hydration` | Moisture levels, barrier function, dehydration lines |
| `inflammation` | Redness, breakouts, erythema severity |
| `sunDamage` | Hyperpigmentation, sunspots, UV damage |
| `elasticity` | Firmness, wrinkles, skin laxity |

## Deployment

Copy trained ONNX models to the backend:
```bash
cp models/distilled/onnx/structure.onnx ../RadianceIQ/backend/models/
cp models/distilled/onnx/hydration.onnx ../RadianceIQ/backend/models/
cp models/distilled/onnx/elasticity.onnx ../RadianceIQ/backend/models/
```

The backend (`signal-models.js`) auto-loads models at startup and falls back to
Layer 1 deterministic features when models aren't available.

## Dependencies

```bash
pip install -r requirements.txt
```

Set `OPENAI_API_KEY` for teacher labeling and GPT-4o fine-tuning.

## Target Metrics

- **MAE** < 10 per signal (student vs teacher)
- **Pearson r** > 0.7 per signal
- **Latency** < 200ms per model (ONNX on CPU)
- **Lesion mAP@0.5** > 0.5
