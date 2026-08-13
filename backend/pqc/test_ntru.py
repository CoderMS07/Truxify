import pytest
from backend.pqc.ntru_signer import poly_mod
def test_wrap(): assert poly_mod([1,2,3,4,5], 3) == [5,7,3]
def test_zero(): assert poly_mod([], 3) == [0,0,0]
