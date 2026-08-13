import pytest
from backend.ml.pirl.eco_driving_pirl import ReplayBuffer
def test_under():
    b = ReplayBuffer(); b.add(1)
    with pytest.raises(IndexError): b.sample(5)
def test_ok():
    b = ReplayBuffer()
    for i in range(10): b.add(i)
    assert len(b.sample(5)) == 5
