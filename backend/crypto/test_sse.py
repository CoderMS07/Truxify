import pytest
from backend.crypto.sse_engine import safe_gcm_decrypt, AuthTagError
def test_key():
    with pytest.raises(ValueError): safe_gcm_decrypt(b"x", b"i"*12, b"c", b"t"*16)
