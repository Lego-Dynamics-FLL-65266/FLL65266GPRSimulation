import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import sys
import random
from pathlib import Path

# Detect device
device = "cpu"
if hasattr(torch, 'xpu') and torch.xpu.is_available():
    device = "xpu"
elif torch.cuda.is_available():
    device = "cuda"

# Load model
model = models.resnet18(weights="DEFAULT")
model.fc = nn.Linear(model.fc.in_features, 2)
model.load_state_dict(torch.load("artifact_classifier.pth", map_location=device))
model = model.to(device)
model.eval()

# Image preprocessing
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
])

class_names = ["artifact", "no-artifact"]

def classify_image(image_path):
    """Classify a single image"""
    try:
        image = Image.open(image_path).convert('RGB')
        image_tensor = transform(image).unsqueeze(0).to(device)
        
        with torch.no_grad():
            outputs = model(image_tensor)
            probabilities = torch.softmax(outputs, dim=1)
            predicted_class = torch.argmax(probabilities, dim=1).item()
            confidence = probabilities[0][predicted_class].item()
        
        result = class_names[predicted_class]
        return result, confidence
    except Exception as e:
        return None, str(e)

def sample_test(data_dir="data", n=1526):
    """Pick n random images from data_dir and classify them"""
    image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
    all_images = [
        p for p in Path(data_dir).rglob("*")
        if p.suffix.lower() in image_extensions
    ]

    if not all_images:
        print(f"No images found in '{data_dir}'")
        return

    sample = random.sample(all_images, min(n, len(all_images)))

    print(f"Random sample of {len(sample)} images:")
    print("-" * 55)

    correct = 0
    for path in sample:
        relative = path.as_posix()  # e.g. data/artifact/2_aug_10.jpg
        true_label = path.parent.name  # folder name is the ground truth
        result, confidence = classify_image(path)

        if result is None:
            print(f"{relative}\n  Error: {confidence}\n")
            continue

        is_correct = result == true_label
        if is_correct:
            correct += 1
        status = "✓" if is_correct else "✗"
        print(f"{status} {relative}")
        print(f"  Predicted: {result} ({confidence:.2%})  |  True: {true_label}")

    print("-" * 55)
    print(f"Accuracy on sample: {correct}/{len(sample)} ({correct/len(sample):.0%})")

if __name__ == "__main__":
    if len(sys.argv) == 1:
        # No arguments: run random sample test
        sample_test()
    elif sys.argv[1] == "--sample":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        sample_test(n=n)
    else:
        # Original single-image mode
        image_path = sys.argv[1]
        result, confidence = classify_image(image_path)
        if result is None:
            print(f"Error: {confidence}")
        else:
            print(f"Classification: {result}")
            print(f"Confidence: {confidence:.2%}")