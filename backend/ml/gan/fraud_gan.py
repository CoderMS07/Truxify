# Stub for spec 106
# === Spec 106: gradient clip ===
def clip_grads(model, max_norm=1.0):
    total = 0.0
    for p in model.parameters():
        total += sum(x * x for x in p)
    total = total ** 0.5
    if total > max_norm:
        scale = max_norm / total
        for p in model.parameters():
            for i in range(len(p)):
                p[i] *= scale
    return total

