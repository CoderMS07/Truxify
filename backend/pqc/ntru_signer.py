# Stub for spec 52
# === Spec 52: poly modulo wrap ===
def poly_mod(coeffs, N):
    out = [0] * N
    for i, c in enumerate(coeffs):
        out[i % N] += c
    return out

