# Stub for spec 111
# === Spec 111: no_grad stub ===
class NoGrad:
    def __enter__(self): return self
    def __exit__(self, *a): return False
def no_grad(): return NoGrad()

