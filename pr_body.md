## Problem

`backend/ml/mtl/model.py` implements PCGrad (gradient conflict resolution for multi-task learning). The conflict-resolution step iterated over **per-parameter** gradient tensors after a **single** combined `loss.backward()`, rather than computing each task's gradient separately before combining.

With one shared `backward()`, the `.grad` buffers already contain the *summed* gradients of all tasks. PCGrad was then applied to individual parameter tensors that no longer correspond to a single task, so the per-task gradient projection (the core of PCGrad) operated on already-mixed gradients — effectively a no-op / incorrect — and the multi-task model trained as if PCGrad were absent (or with a corrupted gradient).

## Fix

Reworked `MultiTaskTrainer.train_step` so that each task's gradient is materialized independently:

- For each task loss `L_t`: `g_t = torch.autograd.grad(L_t, params, retain_graph=True, allow_unused=True)` (replacing `None` grads with zeros).
- Built the per-parameter, per-task gradient list and ran the existing `GradientSurgery.pcgrad` projection per parameter across tasks.
- Zeroed grads between task passes; applied the projected, summed gradient exactly once via `optimizer.step()`.

For non-PCGrad methods the previous combined `backward()` path is preserved.

## Files changed

- `backend/ml/mtl/model.py`
- `backend/ml/tests/test_mtl.py` (added `TestPCGradPerTask`)

## Testing

- `python -c "import ast; ast.parse(...)"` for syntax validation.
- `pytest backend/ml/tests/test_mtl.py::TestPCGradPerTask` passes (3 passed):
  - `test_per_task_grads_sum_to_combined_backward` verifies the per-task gradients sum to a single combined backward of the summed loss (regression vs. the old summed-grad path).
  - `test_train_step_applies_projected_gradient` smoke-tests the per-task PCGrad path runs without producing non-finite gradients.
  - `test_pcgrad_projection_behavior` verifies PCGrad is a no-op for aligned gradients and removes conflicts for opposing gradients.

Closes #11390
