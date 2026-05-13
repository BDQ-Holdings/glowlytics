"""
Build hydration dataset using FFHQ images + auto-annotation.
Uses Gabor filters, LBP, and specular highlight analysis to estimate hydration.
Well-hydrated skin: smoother texture, more uniform reflectance, fewer dry patches.
"""
import json, os, random
import numpy as np
import cv2
from pathlib import Path
from PIL import Image
from skimage.feature import local_binary_pattern, graycomatrix, graycoprops

DATA_DIR = Path("/root/cornell-hackathon/ml/data/hydration")
IMG_DIR = DATA_DIR / "images"
IMG_DIR.mkdir(parents=True, exist_ok=True)

# Load skin type classification dataset for calibration
print("Loading skin type dataset for calibration...")
try:
    from datasets import load_dataset
    skin_ds = load_dataset("akage99/skin_type_classification", split="train")
    print(f"Loaded {len(skin_ds)} skin type samples")
    print(f"Features: {skin_ds.features}")
    HAS_SKIN_TYPES = True
except Exception as e:
    print(f"Skin type dataset unavailable: {e}")
    HAS_SKIN_TYPES = False

# Also reuse FFHQ images already downloaded for structure
print("\nLoading FFHQ-256 for hydration annotation...")
from datasets import load_dataset
ffhq_ds = load_dataset("merkol/ffhq-256", split="train")
print(f"Loaded {len(ffhq_ds)} FFHQ images")

SUBSET_SIZE = 10000
random.seed(123)  # Different seed from structure for different subset
indices = random.sample(range(len(ffhq_ds)), SUBSET_SIZE)

def compute_gabor_features(gray, num_orientations=4, num_frequencies=3):
    """Compute Gabor filter bank responses (24 features)."""
    features = []
    frequencies = [0.1, 0.2, 0.4]
    orientations = np.linspace(0, np.pi, num_orientations, endpoint=False)
    
    for freq in frequencies:
        for theta in orientations:
            kernel_size = max(3, int(1.0 / freq) * 2 + 1)
            if kernel_size % 2 == 0:
                kernel_size += 1
            kernel = cv2.getGaborKernel(
                (kernel_size, kernel_size), sigma=1.0/freq * 0.56,
                theta=theta, lambd=1.0/freq, gamma=0.5, psi=0
            )
            filtered = cv2.filter2D(gray, cv2.CV_64F, kernel)
            features.append(float(np.mean(np.abs(filtered))))
            features.append(float(np.std(filtered)))
    return features  # 24 features

def compute_lbp_features(gray, radius=2, n_points=16):
    """Compute LBP histogram (18 features for uniform patterns)."""
    lbp = local_binary_pattern(gray, n_points, radius, method='uniform')
    n_bins = n_points + 2
    hist, _ = np.histogram(lbp.ravel(), bins=n_bins, range=(0, n_bins), density=True)
    return hist.tolist()  # 18 features

def compute_specular_features(gray):
    """Compute specular highlight features (2 features)."""
    # High intensity = specular highlights (indicates oilier/more hydrated skin)
    threshold = np.percentile(gray, 95)
    highlight_mask = gray > threshold
    highlight_ratio = float(np.mean(highlight_mask))
    
    # Spatial spread of highlights
    if highlight_mask.any():
        coords = np.argwhere(highlight_mask)
        spread = float(np.std(coords)) / max(gray.shape)
    else:
        spread = 0.0
    
    return [highlight_ratio, spread]

def estimate_hydration(img_array):
    """Estimate hydration score from facial image using texture analysis."""
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    
    # Focus on cheeks/forehead
    roi = gray[int(h*0.25):int(h*0.75), int(w*0.2):int(w*0.8)]
    
    # 1. Gabor texture energy — smoother = more hydrated
    gabor = compute_gabor_features(roi)
    gabor_energy = np.mean(gabor[::2])  # Mean of means
    gabor_var = np.mean(gabor[1::2])    # Mean of stds
    
    # 2. LBP uniformity — more uniform = better hydrated
    lbp = compute_lbp_features(roi)
    lbp_uniformity = max(lbp)  # Dominant pattern proportion
    
    # 3. Specular highlights — more highlights = oilier/more hydrated surface
    spec = compute_specular_features(roi)
    highlight_ratio = spec[0]
    
    # 4. GLCM smoothness
    quantized = (roi // 8).astype(np.uint8)
    try:
        glcm = graycomatrix(quantized, [1], [0], levels=32, symmetric=True, normed=True)
        homogeneity = float(graycoprops(glcm, 'homogeneity')[0, 0])
        contrast = float(graycoprops(glcm, 'contrast')[0, 0])
    except:
        homogeneity = 0.5
        contrast = 10.0
    
    # Combine into hydration score
    # High homogeneity + low contrast + some highlights + uniform LBP = well hydrated
    score = (
        homogeneity * 30 +
        (1 - min(contrast / 50, 1)) * 20 +
        highlight_ratio * 200 +  # Amplify small signal
        lbp_uniformity * 30 +
        (1 - min(gabor_var / 50, 1)) * 20
    )
    score = max(0, min(100, score))
    
    # Add small noise for natural variation
    score += random.gauss(0, 2)
    score = max(0, min(100, round(score, 1)))
    
    # Also return the raw features for the dual-input model
    all_features = gabor + lbp + spec  # 24 + 18 + 2 = 44 features
    
    return {
        "hydration_score": score,
        "handcrafted_features": [round(f, 6) for f in all_features],
    }

# Process FFHQ images
print(f"\nAnnotating {SUBSET_SIZE} images for hydration...")
annotations = []
for count, idx in enumerate(indices):
    try:
        sample = ffhq_ds[idx]
        img = sample["image"]
        img_array = np.array(img.convert("RGB"))
        
        result = estimate_hydration(img_array)
        
        fname = f"ffhq_hydra_{idx:06d}.jpg"
        img_path = IMG_DIR / fname
        if not img_path.exists():
            img.save(img_path, "JPEG", quality=95)
        
        result["image"] = fname
        annotations.append(result)
        
        if (count + 1) % 1000 == 0:
            scores = [a["hydration_score"] for a in annotations]
            print(f"  Processed {count+1}/{SUBSET_SIZE} | "
                  f"Avg hydration: {np.mean(scores):.1f} (std {np.std(scores):.1f})")
    except Exception as e:
        continue

# Process skin type images if available
if HAS_SKIN_TYPES:
    print(f"\nProcessing {len(skin_ds)} skin type images...")
    skin_type_map = {}
    for i, sample in enumerate(skin_ds):
        try:
            img = sample["image"]
            img_array = np.array(img.convert("RGB"))
            if img_array.shape[0] < 50 or img_array.shape[1] < 50:
                continue
            
            result = estimate_hydration(img_array)
            label = sample.get("label", sample.get("skin_type", None))
            
            fname = f"skintype_{i:04d}.jpg"
            img_path = IMG_DIR / fname
            if not img_path.exists():
                img.save(img_path, "JPEG", quality=95)
            
            result["image"] = fname
            result["skin_type_label"] = int(label) if label is not None else -1
            annotations.append(result)
        except:
            continue
    print(f"  Added {len(skin_ds)} skin type samples")

print(f"\nTotal annotated: {len(annotations)}")
scores = [a["hydration_score"] for a in annotations]
print(f"Hydration score: {min(scores):.0f}-{max(scores):.0f} (mean {np.mean(scores):.1f}, std {np.std(scores):.1f})")

# Split
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

print("\nDone! Hydration dataset ready.")
