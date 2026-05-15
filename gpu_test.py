import torch

print("=== GPU Detection ===")
print(f"PyTorch version: {torch.__version__}")
print()

# Check CUDA
print("CUDA:")
print(f"  CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"  CUDA device count: {torch.cuda.device_count()}")
    for i in range(torch.cuda.device_count()):
        print(f"    Device {i}: {torch.cuda.get_device_name(i)}")
print()

# Check XPU
print("XPU (Intel Arc/Iris Xe):")
if hasattr(torch, 'xpu'):
    print(f"  XPU available: {torch.xpu.is_available()}")
    if torch.xpu.is_available():
        print(f"  XPU device count: {torch.xpu.device_count()}")
        for i in range(torch.xpu.device_count()):
            print(f"    Device {i}: {torch.xpu.get_device_name(i)}")
else:
    print("  XPU not available in this PyTorch build")
