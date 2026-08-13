# Stub for spec 65
# === Spec 65: key versioning ===
CURRENT_KEY_VERSION = 1
def envelope_encrypt(pt, k, iv):
    return bytes([CURRENT_KEY_VERSION]) + iv + pt

