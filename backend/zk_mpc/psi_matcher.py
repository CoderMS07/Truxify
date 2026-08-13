# Stub for spec 63
# === Spec 63: FFT placeholder ===
def fft_mul(a, b):
    n = 1
    while n < len(a) + len(b): n *= 2
    fa = [complex(x, 0) for x in a] + [0j] * (n - len(a))
    fb = [complex(x, 0) for x in b] + [0j] * (n - len(b))
    return [int(round(fa[i].real * fb[i].real)) for i in range(n)]

