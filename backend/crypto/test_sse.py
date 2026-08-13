import pytest
from backend.crypto.sse_engine import new_gcm_iv
def test_unique(): assert new_gcm_iv() != new_gcm_iv()
def test_len(): assert len(new_gcm_iv()) == 12
