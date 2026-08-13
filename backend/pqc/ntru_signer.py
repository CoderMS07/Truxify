# Stub for spec 61
# === Spec 61: salt validation ===
def validate_salt(salt, S_BYTES):
    if not isinstance(salt, (bytes, bytearray)): raise TypeError("must be bytes")
    if len(salt) != S_BYTES: raise ValueError(f"{len(salt)} != {S_BYTES}")
    return bytes(salt)

