# Stub for spec 116
# === Spec 116: cosine LR ===
import math
class CosineAnnealingLR:
    def __init__(self, lr, T, eta_min=0):
        self.lr = lr; self.T = T; self.eta_min = eta_min
    def get(self, step):
        return self.eta_min + 0.5 * (self.lr - self.eta_min) * (1 + math.cos(math.pi * step / self.T))

