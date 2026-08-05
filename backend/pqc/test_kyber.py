"""Tests for CSPRNG-based key generation in backend/pqc/kyber.py.

Run with: python -m pytest backend/pqc/test_kyber.py
"""

import hashlib
import os
import subprocess
import sys

import numpy as np

from kyber import KyberKEM, DilithiumSignature, _rejection_sample_uniform


def _module_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def test_kyber_secret_keys_not_reproducible_from_numpy_seed():
    """Seeding numpy's PRNG must not reproduce Kyber secret keys."""
    np.random.seed(12345)
    kem = KyberKEM()
    _, sk1 = kem.keygen()
    np.random.seed(12345)
    _, sk2 = kem.keygen()
    assert not np.array_equal(sk1['s'], sk2['s'])
    assert not np.array_equal(sk1['t'], sk2['t'])


def test_dilithium_secret_keys_not_reproducible_from_numpy_seed():
    """Seeding numpy's PRNG must not reproduce Dilithium secret keys."""
    np.random.seed(12345)
    d1 = DilithiumSignature()
    _, sk1 = d1.keygen()
    np.random.seed(12345)
    d2 = DilithiumSignature()
    _, sk2 = d2.keygen()
    assert not np.array_equal(sk1['s1'], sk2['s1'])
    assert not np.array_equal(sk1['s2'], sk2['s2'])


def test_kyber_keys_differ_between_generations():
    """Consecutive keygen calls must produce fresh secrets."""
    kem = KyberKEM()
    pk1, sk1 = kem.keygen()
    pk2, sk2 = kem.keygen()
    assert not np.array_equal(sk1['s'], sk2['s'])
    assert not np.array_equal(pk1['t'], pk2['t'])
    assert not np.array_equal(sk1['A'], sk2['A'])


def test_dilithium_secrets_eta_bounded():
    """s1/s2 coefficients must lie in [-eta, eta] (stored mod q)."""
    d = DilithiumSignature()
    _, sk = d.keygen()
    eta = d.params['eta']
    q = d.params['q']
    assert sk['s1'].shape == (d.params['l'], d.params['n'])
    assert sk['s2'].shape == (d.params['k'], d.params['n'])
    for arr in (sk['s1'], sk['s2']):
        assert np.all((arr <= eta) | (arr >= q - eta))


def test_sample_uniform_in_range():
    """Rejection-sampled uniform coefficients stay in [0, q)."""
    kem = KyberKEM()
    samples = kem._sample_uniform((50, 50))
    assert samples.shape == (50, 50)
    assert np.all(samples >= 0)
    assert np.all(samples < kem.q)


def test_sample_cbd_range():
    """CBD(eta) coefficients stay within [-eta, eta] (stored mod q)."""
    kem = KyberKEM()
    samples = kem._sample_cbd(2, (100,))
    assert np.all((samples <= 2) | (samples >= kem.q - 2))


def test_public_matrix_deterministic_from_public_seed():
    """A must be reproducible from the public seed rho while secrets are not."""
    d = DilithiumSignature()
    pk, _ = d.keygen()
    A = np.empty((d.params['k'], d.params['l'], d.params['n']), dtype=np.int64)
    counter = 0
    for i in range(d.params['k']):
        for j in range(d.params['l']):
            A[i][j] = _rejection_sample_uniform(
                d.params['q'], d.params['n'], seed=pk['rho'], counter=counter
            )
            counter += 1
    assert np.array_equal(A, pk['A'])


def test_rejection_sample_uniform_is_deterministic():
    """The same seed+counter must reproduce the same stream."""
    seed = bytes(range(32))
    a = _rejection_sample_uniform(8380417, 100, seed=seed)
    b = _rejection_sample_uniform(8380417, 100, seed=seed)
    assert np.array_equal(a, b)


def test_secret_keys_differ_across_processes():
    """Secrets must differ between independent interpreter runs (restarts),
    proving they are not derived from any reproducible seed."""
    hashes = []
    for _ in range(2):
        proc = subprocess.run(
            [
                sys.executable,
                "-c",
                "import hashlib; import numpy as np; from kyber import KyberKEM; "
                "np.random.seed(999); k = KyberKEM(); _, sk = k.keygen(); "
                "print(hashlib.sha256(sk['s'].tobytes()).hexdigest())",
            ],
            cwd=_module_dir(),
            capture_output=True,
            text=True,
            check=True,
        )
        hashes.append(proc.stdout.strip())
    assert len(hashes) == 2
    assert hashes[0] != hashes[1]
