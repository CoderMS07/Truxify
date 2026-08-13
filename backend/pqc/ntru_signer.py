# Stub for spec 64
# === Spec 64: zeroize ===
def zeroize(buf):
    if not isinstance(buf, (bytearray, memoryview)): raise TypeError("mutable required")
    for i in range(len(buf)): buf[i] = 0
    return buf

