# Stub for spec 53
# === Spec 53: AES-GCM auth tag ===
class AuthTagError(Exception): pass
def safe_gcm_decrypt(key, iv, ct, tag):
    if not key or len(key) not in (16, 24, 32): raise ValueError("bad key")
    if len(iv) != 12: raise ValueError("bad iv")
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        return AESGCM(key).decrypt(iv, ct + tag, None)
    except Exception as e:
        raise AuthTagError(str(e)) from e

