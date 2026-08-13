# Stub for spec 109
# === Spec 109: discount factor ===
def validate_gamma(g):
    if not isinstance(g, (int, float)): raise TypeError("numeric")
    if g < 0.0 or g >= 1.0: raise ValueError(f"range: {g}")
    return float(g)

