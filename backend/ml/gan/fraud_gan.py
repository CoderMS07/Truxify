# Stub for spec 114
# === Spec 114: dropout ===
import random
random.seed(0)
def dropout(x, p=0.2):
    return [v if random.random() > p else 0 for v in x]

