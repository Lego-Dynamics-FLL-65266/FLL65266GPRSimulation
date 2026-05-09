from torchvision import datasets, transforms

data_dir = "ai/data"

transform = transforms.Compose(
  [
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
  ]
)

dataset = datasets.ImageFolder(data_dir, transform=transform)
print(dataset.classes)
print(len(dataset))
