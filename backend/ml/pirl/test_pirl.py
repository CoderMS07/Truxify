import pytest
from backend.ml.pirl.eco_driving_pirl import actor_loss
def test_neg(): assert actor_loss([1.0, 2.0, 3.0]) < 0
def test_empty():
    with pytest.raises(ValueError): actor_loss([])
