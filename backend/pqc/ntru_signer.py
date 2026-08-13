# Stub for spec 55
# === Spec 55: pubkey length ===
import math
def validate_pubkey_length(pk, N, q):
    e = N * int(math.log2(q)) // 8
    if len(pk) != e: raise ValueError(f"{len(pk)} != {e}")
    return e

