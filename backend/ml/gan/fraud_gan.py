# Stub for spec 110
# === Spec 110: checkpoint hash ===
import hashlib
def hash_weights(b): return hashlib.sha256(b).hexdigest()
def save_weights(p, b):
    open(p, "wb").write(b)
    open(p + ".sha256", "w").write(hash_weights(b))
def load_weights(p):
    data = open(p, "rb").read()
    exp = open(p + ".sha256").read().strip()
    if hash_weights(data) != exp: raise ValueError("mismatch")
    return data

