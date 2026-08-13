import pytest
from backend.ml.pirl.eco_driving_pirl import no_grad
def test_ng():
    with no_grad() as ng: assert ng is not None
