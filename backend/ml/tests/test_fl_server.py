"""Unit tests for backend/ml/federated/fl_server.py.

Run with: python3 -m pytest tests/test_fl_server.py -v --no-header
"""
import numpy as np
from federated.fl_server import FederatedAveragingServer, robust_aggregate


class TestRobustAggregate:
    """Byzantine-robust aggregation must resist a malicious outlier."""

    def test_malicious_outlier_does_not_move_global_model(self):
        """A single extreme client weight must not skew the aggregate.

        With four honest clients near 1.0 and one malicious client submitting
        an extreme value (1e6), a naive mean would land near 2e5, but the
        coordinate-wise median must stay at ~1.0 (and the clipped delta keeps
        it bounded).
        """
        honest = [np.array([1.0, 1.0]) for _ in range(4)]
        malicious = [np.array([1e6, 1e6])]
        global_weights = np.array([1.0, 1.0])

        result = robust_aggregate(
            honest + malicious, global_weights, clip_norm=1.0
        )

        # Median of five values with one outlier is still ~1.0 for each coord.
        assert np.allclose(result, np.array([1.0, 1.0]), atol=1e-6)
        # The malicious client must not move the model by more than the clip.
        assert np.linalg.norm(result - global_weights) <= 1.0 + 1e-6

    def test_single_client_returns_its_weights(self):
        """With one client there is no outlier to resist; return its weights."""
        result = robust_aggregate([np.array([3.0, 4.0])])
        assert np.allclose(result, np.array([3.0, 4.0]))



class TestAggregateUpdates:
    """Tests for the FedAvg weight aggregation."""

    def test_empty_updates_keep_global_weights(self):
        """No client updates must leave the global weights unchanged."""
        server = FederatedAveragingServer(num_weights=5)
        server.global_weights = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        result = server.aggregate_updates([])
        assert np.array_equal(result, server.global_weights)

    def test_single_client_uses_its_weights(self):
        """A single client must set the global weights to its own."""
        server = FederatedAveragingServer(num_weights=3)
        updates = [{"weights": np.array([1.0, 2.0, 3.0]), "num_samples": 10}]
        result = server.aggregate_updates(updates)
        assert np.array_equal(result, np.array([1.0, 2.0, 3.0]))

    def test_two_clients_are_weighted_by_sample_count(self):
        """The aggregate must be the sample-weighted average of client weights."""
        server = FederatedAveragingServer(num_weights=2)
        updates = [
            {"weights": np.array([1.0, 1.0]), "num_samples": 1},
            {"weights": np.array([3.0, 3.0]), "num_samples": 3},
        ]
        result = server.aggregate_updates(updates)
        # (1*1 + 3*3)/4 = 2.5 per element
        assert np.allclose(result, np.array([2.5, 2.5]))

    def test_global_weights_are_mutated(self):
        """aggregate_updates must persist the result to global_weights."""
        server = FederatedAveragingServer(num_weights=2)
        updates = [{"weights": np.array([5.0, 6.0]), "num_samples": 1}]
        server.aggregate_updates(updates)
        assert np.array_equal(server.global_weights, np.array([5.0, 6.0]))

    def test_initial_global_weights_are_zero(self):
        """A fresh server must start with zero global weights."""
        server = FederatedAveragingServer(num_weights=4)
        assert np.array_equal(server.global_weights, np.zeros(4))
