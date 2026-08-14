import numpy as np

class FederatedAveragingServer:
    """
    FedAvg Aggregator Server. Aggregates encrypted/compressed local model weight updates from Driver Apps.
    """
    def __init__(self, num_weights: int = 10):
        self.num_weights = num_weights
        self.global_weights = np.zeros(num_weights)

    def aggregate_updates(self, client_updates: list) -> np.ndarray:
        """
        client_updates: List of dicts containing {"weights": np.ndarray, "num_samples": int}
        """
        if not client_updates:
            return self.global_weights

        total_samples = sum(c["num_samples"] for c in client_updates)
        weighted_sum = np.zeros(self.num_weights)

        for client in client_updates:
            weight = client["num_samples"] / total_samples
            weighted_sum += client["weights"] * weight

        self.global_weights = weighted_sum
        return self.global_weights

fl_server = FederatedAveragingServer()


def robust_aggregate(layer_weights, global_weights=None, clip_norm=1.0):
    """Coordinate-wise median aggregator (byzantine-robust).

    Unlike a naive ``np.mean``, the median is resistant to a single malicious
    or compromised client submitting extreme weights: one outlier cannot move
    the median materially. When ``global_weights`` is provided, the per-layer
    delta from the previous global weights is clipped to ``clip_norm`` so even
    several colluding clients cannot shift the global model arbitrarily.

    Parameters
    ----------
    layer_weights : iterable of array-like
        Per-client weight arrays for a single layer (same shape each).
    global_weights : array-like, optional
        Previous global weights for this layer, used to clip the update delta.
    clip_norm : float
        Maximum L2 norm of the aggregated delta.
    """
    stacked = np.stack([np.asarray(w, dtype=float) for w in layer_weights], axis=0)
    median = np.median(stacked, axis=0)

    if global_weights is not None:
        delta = median - np.asarray(global_weights, dtype=float)
        norm = float(np.linalg.norm(delta))
        if norm > clip_norm > 0:
            delta = delta * (clip_norm / (norm + 1e-8))
        median = np.asarray(global_weights, dtype=float) + delta

    return median
