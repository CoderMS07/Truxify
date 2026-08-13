import pytest
from backend.ml.pirl.eco_driving_pirl import validate_gamma
def test_ok(): assert validate_gamma(0.99) == 0.99
def test_one():
    with pytest.raises(ValueError): validate_gamma(1.0)
def test_neg():
    with pytest.raises(ValueError): validate_gamma(-0.1)
