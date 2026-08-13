# Stub for spec 118
# === Spec 118: DataLoader config ===
def make_loader_config(num_workers=4, pin_memory=True, batch_size=32):
    if num_workers < 0: raise ValueError(">=0")
    return {"num_workers": num_workers, "pin_memory": pin_memory, "batch_size": batch_size}

