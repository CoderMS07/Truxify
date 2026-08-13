# Stub for spec 117
# === Spec 117: state dim ===
def validate_state_dim(s, exp):
    if not hasattr(s, "__len__"): raise TypeError("array-like")
    if len(s) != exp: raise ValueError(f"{len(s)} != {exp}")
    return True

