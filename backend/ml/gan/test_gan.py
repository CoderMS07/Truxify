import pytest
from backend.ml.gan.fraud_gan import clip_grads
def test_clip():
    class M:
        def __init__(self): self.p = [[1.0, 2.0, 3.0]]
        def parameters(self): return self.p
    m = M()
    norm = clip_grads(m, max_norm=1.0)
    assert norm <= 1.0001
