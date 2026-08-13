import pytest
from backend.ml.gan.fraud_gan import make_loader_config
def test_def():
    c = make_loader_config()
    assert c["num_workers"] == 4
def test_neg():
    with pytest.raises(ValueError): make_loader_config(num_workers=-1)
