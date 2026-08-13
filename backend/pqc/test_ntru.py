import pytest
from backend.pqc.ntru_signer import validate_pubkey_length
def test_ok():
    e = 11 * 5 // 8
    assert validate_pubkey_length(b"x" * e, 11, 32) == e
def test_bad():
    with pytest.raises(ValueError): validate_pubkey_length(b"x", 11, 32)
