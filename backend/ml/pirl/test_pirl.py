import pytest
from backend.ml.pirl.eco_driving_pirl import validate_state_dim
def test_match(): validate_state_dim([1,2,3], 3)
def test_bad():
    with pytest.raises(ValueError): validate_state_dim([1,2], 3)
