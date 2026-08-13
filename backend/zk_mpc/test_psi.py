import pytest
from backend.zk_mpc.psi_matcher import mpc_handshake_with_timeout
def test_bad():
    with pytest.raises((OSError, TimeoutError)):
        mpc_handshake_with_timeout(("127.0.0.1", 1), 1)
