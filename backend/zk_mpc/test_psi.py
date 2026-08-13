import pytest
from backend.zk_mpc.psi_matcher import fft_mul
def test_list(): assert isinstance(fft_mul([1], [2]), list)
