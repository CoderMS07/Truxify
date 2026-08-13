import pytest
from backend.ml.gan.fraud_gan import wasserstein_distance
def test_same(): assert wasserstein_distance([1,2,3], [1,2,3]) == 0
def test_diff(): assert wasserstein_distance([1,2,3], [4,5,6]) > 0
def test_bad():
    with pytest.raises(ValueError): wasserstein_distance([1,2], [1,2,3])
