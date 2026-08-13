import pytest
from backend.ml.gan.fraud_gan import CosineAnnealingLR
def test_init():
    s = CosineAnnealingLR(1.0, 100)
    assert abs(s.get(0) - 1.0) < 1e-9
def test_half():
    s = CosineAnnealingLR(1.0, 100)
    assert s.get(50) < 1.0
