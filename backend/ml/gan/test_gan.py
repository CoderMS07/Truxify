import pytest
from backend.ml.gan.fraud_gan import sanitize_features
def test_nan(): assert sanitize_features([float("nan")])[0] == 0.0
def test_inf(): assert sanitize_features([float("inf")])[0] == 0.0
def test_clip(): assert sanitize_features([1e9])[0] == 1e6
