# Stub for spec 58
# === Spec 58: invert retry ===
class NonInvertibleError(Exception): pass
def invert_with_retry(gen, attempts=3):
    last = None
    for _ in range(attempts):
        f = gen()
        try: return f, True
        except NonInvertibleError as e: last = e
    raise last or NonInvertibleError("give up")

