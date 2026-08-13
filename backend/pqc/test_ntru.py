import pytest
from backend.pqc.ntru_signer import validate_salt
def test_ok(): assert validate_salt(b"x"*16, 16) == b"x"*16
def test_bad():
    with pytest.raises(ValueError): validate_salt(b"x", 16)
