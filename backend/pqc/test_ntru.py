import pytest
from backend.pqc.ntru_signer import invert_with_retry, NonInvertibleError
def test_ok():
    _, ok = invert_with_retry(lambda: "p")
    assert ok
def test_fail():
    with pytest.raises(NonInvertibleError):
        invert_with_retry(lambda: (_ for _ in ()).throw(NonInvertibleError()), 2)
