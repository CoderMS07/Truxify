import pytest
from backend.zk_mpc.psi_matcher import fiat_shamir_challenge, new_session_nonce
def test_nonce(): assert new_session_nonce() != new_session_nonce()
def test_chal():
    assert fiat_shamir_challenge(1, b"a", b"m") != fiat_shamir_challenge(1, b"b", b"m")
