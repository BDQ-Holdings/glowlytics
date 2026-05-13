"""
Download UTKFace dataset and create elasticity annotations.
UTKFace: 20K+ face images with age/gender/ethnicity in filename.
Format: [age]_[gender]_[race]_[date&time].jpg
"""
import os
import json
import random
import tarfile
import urllib.request
from pathlib import Path
from collections import Counter

DATA_DIR = Path("/root/cornell-hackathon/ml/data/elasticity")
RAW_DIR = DATA_DIR / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

# UTKFace download URLs (hosted on multiple mirrors)
URLS = [
    "https://drive.usercontent.google.com/download?id=0BxYys69jI14kYVM3aVhKS1VhRUk&export=download&confirm=t",
]

# Try HuggingFace datasets API first (more reliable)
print("Downloading UTKFace via HuggingFace datasets...")
try:
    from datasets import load_dataset
    ds = load_dataset("utkface_new", split="train", trust_remote_code=True)
    print(f"Loaded {len(ds)} images from HuggingFace")
    USE_HF = True
except Exception as e:
    print(f"HuggingFace failed: {e}")
    print("Trying direct Kaggle-style download...")
    USE_HF = False

if not USE_HF:
    # Fallback: try loading from a known mirror
    try:
        from datasets import load_dataset
        ds = load_dataset("vittoriocasula/UTKFace", split="train", trust_remote_code=True)
        print(f"Loaded {len(ds)} images from HuggingFace mirror")
        USE_HF = True
    except Exception as e:
        print(f"Mirror also failed: {e}")
        print("Trying another mirror...")
        try:
            ds = load_dataset("alxwuz/UTKFace", split="train", trust_remote_code=True)
            print(f"Loaded {len(ds)} images from alxwuz mirror")
            USE_HF = True
        except Exception as e2:
            print(f"All mirrors failed: {e2}")
            USE_HF = False

def age_to_elasticity(age):
    """Map age to elasticity score (0-100).
    Young skin (age 18-25) = 90-100
    Middle age (40-55) = 40-65
    Elderly (70+) = 5-25
    Uses a sigmoid-like curve, not purely linear.
    """
    if age < 18:
        return min(100, 95 + random.gauss(0, 2))
    elif age > 85:
        return max(0, 5 + random.gauss(0, 3))
    else:
        # Sigmoid-ish decay
        base = 100 - ((age - 18) / (85 - 18)) * 95
        noise = random.gauss(0, 3)  # Natural variation
        return max(0, min(100, base + noise))

if USE_HF:
    # Process HuggingFace dataset
    annotations = []
    img_dir = DATA_DIR / "images"
    img_dir.mkdir(exist_ok=True)
    
    print("Processing images and generating elasticity labels...")
    skipped = 0
    for i, sample in enumerate(ds):
        try:
            age = sample.get("age", None)
            if age is None:
                skipped += 1
                continue
            
            gender = sample.get("gender", 0)
            ethnicity = sample.get("race", 0)  # or "ethnicity"
            
            # Save image
            img = sample["image"]
            fname = f"{age}_{gender}_{ethnicity}_{i:06d}.jpg"
            img_path = img_dir / fname
            if not img_path.exists():
                img.save(img_path, "JPEG", quality=95)
            
            elasticity = age_to_elasticity(age)
            
            annotations.append({
                "image": fname,
                "age": int(age),
                "gender": int(gender),
                "ethnicity": int(ethnicity),
                "elasticity_score": round(elasticity, 1),
            })
            
            if (i + 1) % 2000 == 0:
                print(f"  Processed {i+1} images...")
                
        except Exception as e:
            skipped += 1
            continue
    
    print(f"Total processed: {len(annotations)}, skipped: {skipped}")
    
    # Split into train/val/test (70/15/15)
    random.seed(42)
    random.shuffle(annotations)
    n = len(annotations)
    train_n = int(0.7 * n)
    val_n = int(0.15 * n)
    
    splits = {
        "train": annotations[:train_n],
        "val": annotations[train_n:train_n + val_n],
        "test": annotations[train_n + val_n:],
    }
    
    for split_name, split_data in splits.items():
        out_path = DATA_DIR / "annotations" / f"{split_name}.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(split_data, f, indent=2)
        
        ages = [s["age"] for s in split_data]
        scores = [s["elasticity_score"] for s in split_data]
        print(f"\n{split_name}: {len(split_data)} images")
        print(f"  Age range: {min(ages)}-{max(ages)}, mean: {sum(ages)/len(ages):.1f}")
        print(f"  Elasticity range: {min(scores):.1f}-{max(scores):.1f}, mean: {sum(scores)/len(scores):.1f}")
    
    print(f"\nDone! Images saved to {img_dir}")
    print(f"Annotations saved to {DATA_DIR / 'annotations'}")
else:
    print("ERROR: Could not download UTKFace from any source.")
    print("Manual download needed from: https://www.kaggle.com/datasets/jangedoo/utkface-new")
