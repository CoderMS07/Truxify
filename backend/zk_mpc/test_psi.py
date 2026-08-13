import pytest
from backend.zk_mpc.psi_matcher import identifier_to_field
def test_det(): assert identifier_to_field("a") == identifier_to_field("a")
def test_ctrl():
    with pytest.raises(ValueError): identifier_to_field("a\x00")
def test_type():
    with pytest.raises(TypeError): identifier_to_field(1)
