# Stub for spec 60
# === Spec 60: zkp nonce ===
import hashlib, os
def fiat_shamir_challenge(ts, nonce, msg):
    h = hashlib.sha256()
    h.update(str(ts).encode()); h.update(nonce); h.update(msg if isinstance(msg, bytes) else str(msg).encode())
    return h.digest()
def new_session_nonce(): return os.urandom(16)

