## Problem

`backend/ml/federated/federated_server.py` aggregates client updates with no binding between an update and the round it belongs to. The aggregation routine `receive_client_update` accepted any payload keyed by `client_id` and folded it into the running global model, with no `round` check on the incoming update.

A client could submit an update computed from an old global model (stale weights from a previous round, or a replayed/withheld update) and the server would still average it in during the current round, desyncing or corrupting convergence. There was also no dedup, so replayed updates were accepted as new contributions.

## Fix

- The update envelope now carries the `round` it was computed against. `receive_client_update` reads `payload['round']` and:
  - rejects updates with a missing round tag (`{'success': False, 'error': 'missing round tag'}`),
  - rejects updates where `round != self.current_round` (`{'success': False, 'error': 'stale round'}`),
  - drops duplicates keyed by `(client_id, round)` (returns `{'success': True, 'duplicate': True}`),
  - only stores current-round updates in `client_weights`, so only current-round contributions count toward the `clients_per_round` quorum.
- `current_round` and the accepted `(client_id, round)` set are persisted via Redis (`federated:round`, `federated:accepted`) and reloaded on init, so restarts don't re-accept already-counted updates.
- Updated the client upload contract (`federated_client.py` `send_update`) to embed `round` in the encrypted envelope.

## Files changed

- `backend/ml/federated/federated_server.py`
- `backend/ml/federated/federated_client.py`
- `backend/ml/tests/test_federated.py` (added round-tag tests)

## Testing

- `python -c "import ast; ast.parse(...)"` for syntax validation.
- `pytest backend/ml/tests/test_federated.py::TestFederated` (round-tag tests added):
  - `test_receive_update_accepts_current_round` — current-round envelope accepted and stored.
  - `test_receive_update_rejects_stale_round` — mismatched round rejected and not stored.
  - `test_receive_update_rejects_missing_round` — missing round tag rejected.
  - `test_receive_update_dedup_same_client_round` — duplicate `(client_id, round)` dropped and reported as duplicate.

Closes #11391
