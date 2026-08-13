import pytest
from backend.ml.gan.fraud_gan import dropout
def test_d():
    assert 0 < dropout([1]*100, p=0.5).count(0) < 100
def test_p0():
    assert dropout([1,2,3], p=0) == [1,2,3]
