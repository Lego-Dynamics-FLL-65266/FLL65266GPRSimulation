import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import sys

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

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python inference.py <image_path>")
        print("Example: python inference.py test_image.jpg")
        sys.exit(1)
    
    image_path = sys.argv[1]
    result, confidence = classify_image(image_path)
    
    if result is None:
        print(f"Error: {confidence}")
    else:
        print(f"Classification: {result}")
        print(f"Confidence: {confidence:.2%}")
