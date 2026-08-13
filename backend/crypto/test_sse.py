import pytest
from backend.crypto.sse_engine import envelope_encrypt, CURRENT_KEY_VERSION
def test_ver(): assert envelope_encrypt(b"x", b"k"*32, b"i"*12)[0] == CURRENT_KEY_VERSION
