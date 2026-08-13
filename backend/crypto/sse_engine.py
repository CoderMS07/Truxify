# Stub for spec 62
# === Spec 62: pad to power-of-2 ===
def pad_results(r):
    if not r: return []
    n = len(r); t = 1
    while t < n: t *= 2
    return r + [b"\x00"*16] * (t - n)

