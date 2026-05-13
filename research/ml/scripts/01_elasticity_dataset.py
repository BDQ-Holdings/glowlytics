"""
Download UTKFace and create elasticity annotations.
Age encoded in key: [age]_[gender]_[race]_[timestamp]
"""
import os, json, random, re
from pathlib import Path
from datasets import load_dataset

DATA_DIR = Path("/root/cornell-hackathon/ml/data/elasticity")
IMG_DIR = DATA_DIR / "images"
IMG_DIR.mkdir(parents=True, exist_ok=True)

print("Loading UTKFace from HuggingFace...")
ds = load_dataset("py97/UTKFace-Cropped", split="train")
print(f"Loaded {len(ds)} images")

def age_to_elasticity(age):
    """Sigmoid-like decay: age 18=~95, age 50=~52, age 80=~10"""
    if age < 18:
        return min(100, 95 + random.gauss(0, 2))
    elif age > 85:
        return max(0, 5 + random.gauss(0, 3))
    else:
        base = 100 - ((age - 18) / (85 - 18)) * 95
        noise = random.gauss(0, 3)
        return max(0, min(100, round(base + noise, 1)))

annotations = []
skipped = 0
gender_map = {0: "male", 1: "female"}
race_map = {0: "white", 1: "black", 2: "asian", 3: "indian", 4: "other"}

for i, sample in enumerate(ds):
    try:
        key = sample["__key__"]
        # Parse: UTKFace/82_0_2_20170111210110290
        parts = key.split("/")[-1].split("_")
        age = int(parts[0])
        gender = int(parts[1]) if len(parts) > 1 else 0
        race = int(parts[2]) if len(parts) > 2 else 4
        
        img = sample["jpg.chip.jpg"]
        fname = f"{age}_{gender}_{race}_{i:06d}.jpg"
        img_path = IMG_DIR / fname
        
        if not img_path.exists():
            img.save(img_path, "JPEG", quality=95)
        
        annotations.append({
            "image": fname,
            "age": age,
            "gender": gender,
            "ethnicity": race,
            "elasticity_score": age_to_elasticity(age),
        })
        
        if (i + 1) % 5000 == 0:
            print(f"  Processed {i+1}/{len(ds)}...")
    except Exception as e:
        skipped += 1

print(f"\nTotal: {len(annotations)}, skipped: {skipped}")

# Split 70/15/15
random.seed(42)
random.shuffle(annotations)
n = len(annotations)
t, v = int(0.7 * n), int(0.15 * n)

splits = {"train": annotations[:t], "val": annotations[t:t+v], "test": annotations[t+v:]}
for name, data in splits.items():
    out = DATA_DIR / "annotations" / f"{name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(data, f, indent=2)
    ages = [s["age"] for s in data]
    scores = [s["elasticity_score"] for s in data]
    print(f"{name}: {len(data)} imgs | age {min(ages)}-{max(ages)} (mean {sum(ages)/len(ages):.0f}) | elasticity {min(scores):.0f}-{max(scores):.0f} (mean {sum(scores)/len(scores):.0f})")

print("\nDone!")
