# Stub for spec 119
# === Spec 119: actor loss ===
def actor_loss(q):
    if not hasattr(q, "__len__"): raise TypeError("array-like")
    if len(q) == 0: raise ValueError("non-empty")
    import statistics
    return -statistics.mean(q)

