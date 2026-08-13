# Stub for spec 108
# === Spec 108: drop_last ===
class DataLoaderConfig:
    def __init__(self, ds, bs, drop_last=False):
        if not isinstance(bs, int) or bs <= 0: raise ValueError("bs>0")
        self.ds = ds; self.bs = bs; self.drop_last = drop_last
    def num_batches(self):
        n = len(self.ds) // self.bs
        if not self.drop_last and len(self.ds) % self.bs: n += 1
        return n

