import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, models, transforms
import torch

data_dir = "data"

# Detect available device: XPU (Intel Arc/Iris Xe) > CUDA > CPU
device = "cpu"

if hasattr(torch, 'xpu') and torch.xpu.is_available():
    print(f"Intel GPU available. Using XPU: {torch.xpu.get_device_name(0)}")
    device = "xpu"
elif torch.cuda.is_available():
    print(f"CUDA is available. Using: {torch.cuda.get_device_name(0)}")
    device = "cuda"
else:
    print("Using CPU")

# Setup the model
model = models.resnet18(weights="DEFAULT")
# Change the last layer to only output 2 classes
model.fc = nn.Linear(model.fc.in_features, 2)
# Move the model to the CPU or GPU
model = model.to(device)

# Setup the optimizer
optimizer = torch.optim.Adam(
    model.parameters(),
    lr=0.0001  # Learning rate or how big each update is
)

transform = transforms.Compose(
    [
        # Make every image the same size
        transforms.Resize((224, 224)),
        # Turn the image into numbers
        transforms.ToTensor(),
    ]
)

# Load the images from the data folders
dataset = datasets.ImageFolder(data_dir, transform=transform)

train_size = int(len(dataset) * 0.8)
validation_size = int(len(dataset) - train_size)

print(dataset.classes)
print(len(dataset))

train_data, validation_data = random_split(dataset, [train_size, validation_size])

# DataLoaders give the model 8 images at a time
train_loader = DataLoader(train_data, batch_size=8, shuffle=True)
validation_loader = DataLoader(validation_data, batch_size=8)

# Create loss function
loss_function = nn.CrossEntropyLoss()

def train_loop(train_loader, optimizer):
    # Put the model in training mode
    model.train()
    total_loss = 0
    for images, labels in train_loader:
        # Move the images and answers to the CPU or GPU
        images = images.to(device)
        labels = labels.to(device)
        outputs = model(images) # Give images to model
        loss = loss_function(outputs, labels)
        # Clear old gradients before making a new update
        optimizer.zero_grad()
        # Calculate how the model should change
        loss.backward()
        # Update the model
        optimizer.step()
        total_loss += loss.item()
    return total_loss

epochs = 50
# Train the model multiple times through the data
for epoch in range(epochs):
    total_loss = train_loop(train_loader=train_loader, optimizer=optimizer)
    print(f"epoch {epoch + 1}, avg loss: {total_loss / len(train_loader)}")


def validation_loop(validation_loader):
    # Put the model in testing mode
    model.eval()
    total_loss = 0

    with torch.no_grad():
        for images, labels in validation_loader:
            # Send images to the CPU or GPU
            images = images.to(device)
            labels = labels.to(device)

            outputs = model(images) # Give images to model
            loss = loss_function(outputs, labels)
            total_loss += loss.item()

    return total_loss

print("========Validation========")
validation_loss = validation_loop(validation_loader)
print(f"loss:{validation_loss}")

torch.save(model.state_dict(), "artifact_classifier.pth")
