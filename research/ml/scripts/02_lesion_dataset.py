"""
Download and prepare acne/lesion detection dataset in YOLO format.
Source: SyedAliJafri/acne-detection-dataset (HuggingFace)
6 classes, 929 images, 7067 bounding boxes, already YOLO-formatted.
"""
import json, os
from pathlib import Path
from datasets import load_dataset
from collections import Counter

DATA_DIR = Path("/root/cornell-hackathon/ml/data/lesion")
CLASS_NAMES = ["comedone", "papule", "pustule", "nodule", "macule", "patch"]

print("Loading acne detection dataset...")
ds = load_dataset("SyedAliJafri/acne-detection-dataset")

split_map = {"train": "train", "valid": "val", "test": "test"}

for hf_split, our_split in split_map.items():
    img_dir = DATA_DIR / our_split / "images"
    lbl_dir = DATA_DIR / our_split / "labels"
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)
    
    class_counts = Counter()
    
    for i, sample in enumerate(ds[hf_split]):
        # Save image
        img = sample["image"]
        fname = f"acne_{our_split}_{i:04d}.jpg"
        img.save(img_dir / fname, "JPEG", quality=95)
        
        # Save YOLO label
        anns = json.loads(sample["annotations"])
        label_lines = []
        for ann in anns:
            cid = ann["class_id"]
            cx, cy, w, h = ann["center_x"], ann["center_y"], ann["width"], ann["height"]
            label_lines.append(f"{cid} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
            class_counts[cid] += 1
        
        lbl_path = lbl_dir / fname.replace(".jpg", ".txt")
        with open(lbl_path, "w") as f:
            f.write("\n".join(label_lines))
    
    print(f"{our_split}: {len(ds[hf_split])} images")
    for cid in sorted(class_counts):
        print(f"  {CLASS_NAMES[cid]}: {class_counts[cid]} boxes")

# Create YOLO dataset.yaml
yaml_content = f"""# Glowlytics Acne/Lesion Detection Dataset
path: {DATA_DIR}
train: train/images
val: val/images
test: test/images

nc: 6
names: {CLASS_NAMES}
"""
yaml_path = DATA_DIR / "dataset.yaml"
with open(yaml_path, "w") as f:
    f.write(yaml_content)

print(f"\nYOLO dataset.yaml saved to {yaml_path}")
print("Ready for YOLOv8 training!")
