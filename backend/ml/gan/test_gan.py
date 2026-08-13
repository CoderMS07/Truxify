import os, tempfile, pytest
from backend.ml.gan.fraud_gan import save_weights, load_weights
def test_rt():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "m.bin"); save_weights(p, b"abc"); assert load_weights(p) == b"abc"
def test_tamper():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "m.bin"); save_weights(p, b"abc")
        open(p, "wb").write(b"x")
        with pytest.raises(ValueError): load_weights(p)
