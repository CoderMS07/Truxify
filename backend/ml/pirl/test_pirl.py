import pytest
from backend.ml.pirl.eco_driving_pirl import RunningNormalizer
def test_mean():
    n = RunningNormalizer()
    n.update(10); n.update(20)
    assert 14 < n.mean < 16
