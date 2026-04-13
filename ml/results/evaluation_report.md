# Glowlytics Model Evaluation Report

> Run `ml/notebooks/12_distillation_eval.ipynb` to populate this report with actual results.

## Pipeline

**Teacher:** `ft:gpt-4o-2024-08-06:personal:radianceiq-skin:DHBaOo20`
**Students:** ONNX models distilled from teacher pseudo-labels

## Models

| Model | Type | Backbone | Status |
|-------|------|----------|--------|
| Structure | ONNX (distilled) | MobileNetV3-Large | Pending — run notebooks 10→11→12 |
| Hydration | ONNX (distilled) | EfficientNet-B0 + 44d features | Pending |
| Elasticity | ONNX (distilled) | EfficientNet-B0 + 14d features | Pending |
| Multi-Signal | ONNX (distilled) | EfficientNet-B0 + 58d features | Pending |
| Lesion Detector | ONNX | YOLOv8s | Deployed (pre-distillation) |

## Target Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| MAE (per signal) | < 10 | On 0-100 scale, student vs teacher |
| Pearson r (per signal) | > 0.7 | Score correlation |
| Consistency (variance) | < teacher | Deterministic student should beat stochastic teacher |
| Latency | < 200ms | ONNX on CPU (vs ~4s for GPT-4o) |
| Lesion mAP@0.5 | > 0.5 | 6-class detection |

## Results

*Run the evaluation notebooks to populate.*
