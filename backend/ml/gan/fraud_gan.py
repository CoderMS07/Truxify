# Stub for spec 112
# === Spec 112: NaN sanitize ===
import math
def sanitize_features(values, clip=1e6):
    out = []
    for v in values:
        if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
            out.append(0.0)
        else:
            f = float(v); f = min(f, clip); f = max(f, -clip)
            out.append(f)
    return out

