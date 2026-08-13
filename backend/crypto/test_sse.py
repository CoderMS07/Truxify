import pytest
from backend.crypto.sse_engine import make_trapdoor, verify_trapdoor
def test_roundtrip():
    k = b"k" * 32
    assert verify_trapdoor(k, make_trapdoor(k, "x"), "x") is True
def test_bad(): assert verify_trapdoor(b"k"*32, b"x", "y") is False
