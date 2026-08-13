import pytest
from backend.pqc.ntru_signer import zeroize
def test_basic():
    b = bytearray(b"x")
    zeroize(b)
    assert b == bytearray(1)
def test_immut():
    with pytest.raises(TypeError): zeroize(b"x")
