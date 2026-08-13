# Stub for spec 120
# === Spec 120: wasserstein ===
def wasserstein_distance(p, q):
    if len(p) != len(q): raise ValueError("length")
    return sum(abs(a - b) for a, b in zip(sorted(p), sorted(q)))

