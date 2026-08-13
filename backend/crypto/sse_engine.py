# Stub for spec 48
# === Spec 48: HMAC trapdoor ===
import hmac, hashlib, os
def make_trapdoor(k, term):
    n = os.urandom(16)
    return n + hmac.new(k, n + term.encode(), hashlib.sha256).digest()
def verify_trapdoor(k, td, term):
    if len(td) != 48: return False
    n, t = td[:16], td[16:]
    e = hmac.new(k, n + term.encode(), hashlib.sha256).digest()
    return hmac.compare_digest(t, e)

