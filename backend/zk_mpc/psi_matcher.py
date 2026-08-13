# Stub for spec 54
# === Spec 54: hash identifiers ===
import hashlib
def identifier_to_field(s):
    if not isinstance(s, str): raise TypeError("must be str")
    if any(ord(c) < 0x20 for c in s): raise ValueError("control char")
    h = hashlib.sha256(s.encode()).digest()
    return int.from_bytes(h, "big") % ((1 << 127) - 1)

