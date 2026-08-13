# Stub for spec 113
# === Spec 113: replay guard ===
class ReplayBuffer:
    def __init__(self): self.b = []
    def add(self, x): self.b.append(x)
    def size(self): return len(self.b)
    def sample(self, n):
        if len(self.b) < n: raise IndexError(f"{len(self.b)} < {n}")
        return self.b[:n]

