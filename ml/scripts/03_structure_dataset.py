"""
Download FFHQ-256 subset and auto-annotate for structure model.
Uses classical CV to generate:
- pore_count: LoG blob detection on enhanced skin regions
- texture_regularity: GLCM homogeneity + Gabor energy variance (0-100)
- structure_score: weighted combination (0-100)
"""
import json, os, random
import numpy as np
from pathlib import Path
from PIL import Image
from collections import Counter

DATA_DIR = Path("/root/cornell-hackathon/ml/data/structure")
IMG_DIR = DATA_DIR / "images"
IMG_DIR.mkdir(parents=True, exist_ok=True)

# Download FFHQ-256 (70K images at 256x256 — manageable size)
print("Loading FFHQ-256 from HuggingFace...")
from datasets import load_dataset
ds = load_dataset("merkol/ffhq-256", split="train")
print(f"Loaded {len(ds)} images")
print(f"Features: {ds.features}")

# We'll use a subset for annotation (10K images — enough for training)
SUBSET_SIZE = min(10000, len(ds))
random.seed(42)
indices = random.sample(range(len(ds)), SUBSET_SIZE)
print(f"Using {SUBSET_SIZE} images for annotation")

import cv2
from skimage.feature import blob_log, graycomatrix, graycoprops
from scipy.ndimage import gaussian_filter

def extract_structure_features(img_array):
    """Extract pore count, texture regularity, and structure score from face image."""
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    
    # Focus on cheek/forehead region (center of face)
    roi_y1, roi_y2 = int(h * 0.25), int(h * 0.75)
    roi_x1, roi_x2 = int(w * 0.2), int(w * 0.8)
    roi = gray[roi_y1:roi_y2, roi_x1:roi_x2]
    
    # 1. Pore detection using LoG blob detection
    # Enhance contrast first with CLAHE
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(roi)
    
    try:
        blobs = blob_log(enhanced, min_sigma=1, max_sigma=4, 
                         num_sigma=5, threshold=0.05)
        pore_count = len(blobs)
    except:
        pore_count = 0
    
    # 2. Texture regularity via GLCM
    # Quantize to 32 levels for GLCM computation
    quantized = (roi // 8).astype(np.uint8)
    try:
        glcm = graycomatrix(quantized, distances=[1, 2], 
                           angles=[0, np.pi/4, np.pi/2, 3*np.pi/4],
                           levels=32, symmetric=True, normed=True)
        homogeneity = graycoprops(glcm, 'homogeneity').mean()
        contrast = graycoprops(glcm, 'contrast').mean()
        energy = graycoprops(glcm, 'energy').mean()
        
        # Higher homogeneity + energy, lower contrast = smoother skin
        texture_regularity = (homogeneity * 40 + energy * 40 + (1 - min(contrast/50, 1)) * 20)
        texture_regularity = max(0, min(100, texture_regularity))
    except:
        texture_regularity = 50.0
    
    # 3. Smoothness via Laplacian variance (lower = smoother)
    laplacian_var = cv2.Laplacian(roi, cv2.CV_64F).var()
    # Normalize: typical range 0-2000, lower is smoother
    smoothness = max(0, min(100, 100 - (laplacian_var / 20)))
    
    # 4. Structure score: weighted combination
    # Fewer pores + higher regularity + smoother = higher score
    pore_penalty = min(pore_count / 100, 1.0) * 30  # 0-30 penalty
    structure_score = 0.35 * texture_regularity + 0.35 * smoothness + 0.30 * (100 - pore_penalty)
    structure_score = max(0, min(100, structure_score))
    
    return {
        "pore_count": int(pore_count),
        "texture_regularity": round(texture_regularity, 1),
        "structure_score": round(structure_score, 1),
    }

# Process images
print("Running auto-annotation pipeline...")
annotations = []
for count, idx in enumerate(indices):
    try:
        sample = ds[idx]
        img = sample["image"]
        img_array = np.array(img.convert("RGB"))
        
        features = extract_structure_features(img_array)
        
        fname = f"ffhq_{idx:06d}.jpg"
        img_path = IMG_DIR / fname
        if not img_path.exists():
            img.save(img_path, "JPEG", quality=95)
        
        features["image"] = fname
        annotations.append(features)
        
        if (count + 1) % 1000 == 0:
            scores = [a["structure_score"] for a in annotations]
            print(f"  Processed {count+1}/{SUBSET_SIZE} | "
                  f"Avg structure: {sum(scores)/len(scores):.1f} | "
                  f"Avg pores: {sum(a['pore_count'] for a in annotations)/len(annotations):.0f}")
    except Exception as e:
        continue

print(f"\nAnnotated {len(annotations)} images")

# Stats
scores = [a["structure_score"] for a in annotations]
pores = [a["pore_count"] for a in annotations]
textures = [a["texture_regularity"] for a in annotations]
print(f"Structure score: {min(scores):.0f}-{max(scores):.0f} (mean {np.mean(scores):.1f}, std {np.std(scores):.1f})")
print(f"Pore count: {min(pores)}-{max(pores)} (mean {np.mean(pores):.0f})")
print(f"Texture regularity: {min(textures):.0f}-{max(textures):.0f} (mean {np.mean(textures):.1f})")

# Split 70/15/15
random.shuffle(annotations)
n = len(annotations)
t, v = int(0.7 * n), int(0.15 * n)

splits = {"train": annotations[:t], "val": annotations[t:t+v], "test": annotations[t+v:]}
for name, data in splits.items():
    out = DATA_DIR / "annotations" / f"{name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(data, f, indent=2)
    print(f"{name}: {len(data)} images")

print("\nDone! Structure dataset ready.")
