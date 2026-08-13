# Stub for spec 107
# === Spec 107: normalizer ===
class RunningNormalizer:
    def __init__(self): self.mean = 0.0; self.var = 1.0; self.count = 0
    def update(self, v):
        self.count += 1
        self.mean += (v - self.mean) / self.count
    def normalize(self, v):
        return (v - self.mean) / (self.var ** 0.5) if self.var > 0 else v

