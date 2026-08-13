import pytest
from backend.ml.gan.fraud_gan import DataLoaderConfig
def test_drop():
    assert DataLoaderConfig(list(range(105)), 10, True).num_batches() == 10
def test_no_drop():
    assert DataLoaderConfig(list(range(105)), 10, False).num_batches() == 11
