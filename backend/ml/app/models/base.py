import asyncio
import inspect
import json
import logging
import os
import pickle
import shutil
import threading
import uuid
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

MODEL_STORAGE_DIR = os.environ.get(
    "MODEL_STORAGE_DIR",
    os.path.join(os.path.dirname(__file__), "..", "..", "models_storage"),
)

# ---------------------------------------------------------------------------
# Model-scoped locking.
#
# Two levels of mutual exclusion protect model artifacts:
#
# 1. _get_lock()/get_model_lock(): an ``asyncio.Lock`` per model used on the
#    event loop to serialize whole training requests for the same model
#    (see ensure_model_loaded() and the /train endpoints).
# 2. _get_write_lock(): a ``threading.Lock`` per model held around every
#    synchronous artifact publication (publish_model() / restore_previous_model()).
#    This is required because training actually executes on worker threads
#    (executor), where an asyncio.Lock cannot be used, and multiple threads
#    (an HTTP-triggered retrain racing a lazy auto-train from a prediction)
#    can otherwise write the same model concurrently.
# ---------------------------------------------------------------------------
_model_locks: dict[str, asyncio.Lock] = {}
_model_write_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _get_lock(model_name: str) -> "asyncio.Lock":
    if model_name not in _model_locks:
        _model_locks[model_name] = asyncio.Lock()
    return _model_locks[model_name]


def get_model_lock(model_name: str) -> "asyncio.Lock":
    """Return the event-loop-level lock serializing trainings of *model_name*."""
    return _get_lock(model_name)


def _get_write_lock(model_name: str) -> threading.Lock:
    """Return the thread-level lock serializing artifact writes for *model_name*."""
    with _locks_guard:
        lock = _model_write_locks.get(model_name)
        if lock is None:
            lock = threading.Lock()
            _model_write_locks[model_name] = lock
        return lock


class TrainingCancelled(Exception):
    """Raised when a training run is cancelled (e.g. its HTTP request timed
    out) and must not publish a new model generation.

    Backwards-compatible alias; the canonical definition lives in
    app/execution.py where the training-timeout machinery is implemented.
    """


def _training_cancelled() -> bool:
    """Return True when the calling worker thread's training job was cancelled."""
    try:
        from ..execution import is_training_cancelled
        return is_training_cancelled()
    except Exception:
        return False


def _raise_if_cancelled(model_name: str) -> None:
    """Raise TrainingCancelled when the calling training worker timed out."""
    from ..execution import TrainingCancelled as _ExecutionTrainingCancelled
    if _training_cancelled():
        logger.warning("Not publishing '%s': training run was cancelled", model_name)
        raise _ExecutionTrainingCancelled(f"Training for '{model_name}' was cancelled")


# ---------------------------------------------------------------------------
# Paths.
#
# Layout per model inside MODEL_STORAGE_DIR:
#
#   <name>_active.json            # {"generation": "<genid>"}  (atomic pointer)
#   <name>_previous_active.json   # previous generation pointer (rollback)
#   <name>.pkl / <name>_meta.json # legacy flat mirrors, kept for compatibility
#   generations/<name>/<genid>/
#       model.pkl                 # immutable generation artifact
#       meta.json                 # generation metadata (matches the artifact)
#
# Internal readers (load_model / get_model_meta / model_exists) resolve the
# active generation through the pointer, so they can never observe a mixed
# model/metadata state: the pointer is swapped atomically and only after a
# fully validated generation has been written.
# ---------------------------------------------------------------------------

def get_model_path(model_name: str) -> str:
    os.makedirs(MODEL_STORAGE_DIR, exist_ok=True)
    return os.path.join(MODEL_STORAGE_DIR, f"{model_name}.pkl")


def get_meta_path(model_name: str) -> str:
    os.makedirs(MODEL_STORAGE_DIR, exist_ok=True)
    return os.path.join(MODEL_STORAGE_DIR, f"{model_name}_meta.json")


def get_previous_model_path(model_name: str) -> str:
    os.makedirs(MODEL_STORAGE_DIR, exist_ok=True)
    return os.path.join(MODEL_STORAGE_DIR, f"{model_name}_previous.pkl")


def get_previous_meta_path(model_name: str) -> str:
    os.makedirs(MODEL_STORAGE_DIR, exist_ok=True)
    return os.path.join(MODEL_STORAGE_DIR, f"{model_name}_previous_meta.json")


def _generations_root(model_name: str) -> str:
    return os.path.join(MODEL_STORAGE_DIR, "generations", model_name)


def _generation_dir(model_name: str, generation: str) -> str:
    return os.path.join(_generations_root(model_name), generation)


def _generation_model_path(model_name: str, generation: str) -> str:
    return os.path.join(_generation_dir(model_name, generation), "model.pkl")


def _generation_meta_path(model_name: str, generation: str) -> str:
    return os.path.join(_generation_dir(model_name, generation), "meta.json")


def _active_ptr_path(model_name: str) -> str:
    return os.path.join(MODEL_STORAGE_DIR, f"{model_name}_active.json")


def _previous_ptr_path(model_name: str) -> str:
    return os.path.join(MODEL_STORAGE_DIR, f"{model_name}_previous_active.json")


def _generate_generation_id(model_name: str) -> str:
    """Unique generation id: ``gen_<timestamp>_<random-run>``.

    The random component guarantees two concurrent training runs for the same
    model never produce the same generation or the same temporary artifact path.
    """
    ts = datetime.now().strftime("%Y%m%d%H%M%S%f")
    return f"gen_{ts}_{uuid.uuid4().hex[:8]}"


def _read_pointer(path: str) -> Optional[str]:
    try:
        with open(path, "r") as f:
            data = json.load(f)
    except Exception:
        return None
    generation = data.get("generation")
    return generation if isinstance(generation, str) else None


def get_active_generation(model_name: str) -> Optional[str]:
    """Return the generation id the active pointer references, if any."""
    return _read_pointer(_active_ptr_path(model_name))


def get_previous_generation(model_name: str) -> Optional[str]:
    """Return the generation id the previous pointer references, if any."""
    return _read_pointer(_previous_ptr_path(model_name))


def _generation_exists(model_name: str, generation: str) -> bool:
    return os.path.exists(_generation_model_path(model_name, generation))


def _atomic_write_json(path: str, data: dict) -> None:
    """Atomically write a JSON pointer file using a unique temporary path."""
    tmp = f"{path}.{uuid.uuid4().hex}.tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _unique_temp(final_path: str) -> str:
    """Return a per-run temporary path next to *final_path*."""
    return f"{final_path}.{uuid.uuid4().hex}.tmp"


# ---------------------------------------------------------------------------
# Publication
# ---------------------------------------------------------------------------

def _validate_generation(model_name: str, generation: str, model_tmp: str, meta_tmp: str) -> None:
    """Reload the just-written generation artifacts and verify they are intact
    and refer to each other before anything becomes active."""
    with open(model_tmp, "rb") as f:
        loaded = pickle.load(f)
    if loaded is None:
        raise ValueError(f"Generated artifact for '{model_name}' is empty")
    with open(meta_tmp, "r") as f:
        meta = json.load(f)
    if meta.get("model_name") != model_name:
        raise ValueError(
            f"Metadata model_name {meta.get('model_name')!r} != {model_name!r}"
        )
    if meta.get("generation") != generation:
        raise ValueError(
            f"Metadata generation {meta.get('generation')!r} != {generation!r}"
        )


def _mirror_to_flat(model_name: str, generation_model: str, generation_meta: str) -> None:
    """Best-effort copy of a validated generation onto the legacy flat files.

    Internal readers never use these (they resolve the atomic pointer), so this
    is purely for existing consumers that scan MODEL_STORAGE_DIR directly.
    """
    flat = get_model_path(model_name)
    flat_meta = get_meta_path(model_name)
    try:
        tmp_model = _unique_temp(flat)
        with open(generation_model, "rb") as src, open(tmp_model, "wb") as dst:
            shutil.copyfileobj(src, dst)
            dst.flush()
            os.fsync(dst.fileno())
        os.replace(tmp_model, flat)

        tmp_meta = _unique_temp(flat_meta)
        with open(generation_meta, "r") as src, open(tmp_meta, "w") as dst:
            shutil.copyfileobj(src, dst)
            dst.flush()
            os.fsync(dst.fileno())
        os.replace(tmp_meta, flat_meta)
    except Exception as e:
        logger.warning("Failed to mirror model '%s' to legacy flat files: %s", model_name, e)


def _cleanup_generation_temps(model_name: str, generation: str) -> None:
    """Remove temporary artifacts created for a single generation (no-op if gone)."""
    gen_dir = _generation_dir(model_name, generation)
    try:
        for name in os.listdir(gen_dir):
            if name.endswith(".tmp"):
                try:
                    os.remove(os.path.join(gen_dir, name))
                except OSError:
                    pass
    except OSError:
        pass


def _prune_generations(model_name: str, keep: set) -> None:
    """Delete generation directories not referenced by the active/previous
    pointers and any stray .tmp artifacts left by a crashed run."""
    root = _generations_root(model_name)
    if not os.path.isdir(root):
        return
    for gen in os.listdir(root):
        gen_dir = os.path.join(root, gen)
        if not os.path.isdir(gen_dir):
            continue
        if gen in keep:
            continue
        shutil.rmtree(gen_dir, ignore_errors=True)


def publish_model(model: Any, model_name: str, metrics: Optional[dict] = None) -> str:
    """Atomically publish *model* as the production version for *model_name*.

    Returns the id of the newly active generation.

    Guarantees:
    - same-model publications are serialized (per-model write lock);
    - every run writes to its own temporary artifact paths;
    - a generation only becomes active after both artifact and metadata have
      been written and validated;
    - the active pointer is swapped with a single atomic rename, so readers
      observe either the old complete generation or the new complete generation,
      never a mix of the two;
    - a cancelled training run (see ``TrainingCancelled``) publishes nothing.
    """
    if _training_cancelled():
        _raise_if_cancelled(model_name)

    with _get_write_lock(model_name):
        _raise_if_cancelled(model_name)

        generation = _generate_generation_id(model_name)
        gen_dir = _generation_dir(model_name, generation)
        os.makedirs(gen_dir, exist_ok=True)

        model_final = _generation_model_path(model_name, generation)
        meta_final = _generation_meta_path(model_name, generation)
        model_tmp = _unique_temp(model_final)
        meta_tmp = _unique_temp(meta_final)

        meta = {
            "model_name": model_name,
            "generation": generation,
            "saved_at": datetime.now().isoformat(),
            "metrics": metrics or {},
        }

        try:
            with open(model_tmp, "wb") as f:
                pickle.dump(model, f)
                f.flush()
                os.fsync(f.fileno())
            with open(meta_tmp, "w") as f:
                json.dump(meta, f, indent=2)
                f.flush()
                os.fsync(f.fileno())

            _validate_generation(model_name, generation, model_tmp, meta_tmp)

            # Make the generation immutable: move both files into place before
            # touching the pointer, so the pointer only ever references a
            # complete generation.
            os.replace(model_tmp, model_final)
            os.replace(meta_tmp, meta_final)

            # Rotate the active pointer (single atomic rename flips readers).
            active_path = _active_ptr_path(model_name)
            previous_path = _previous_ptr_path(model_name)
            current = _read_pointer(active_path) if os.path.exists(active_path) else None
            if current is not None:
                _atomic_write_json(previous_path, {"generation": current})
            _atomic_write_json(active_path, {"generation": generation})

            # Refresh legacy flat mirrors (best effort, not used by readers).
            _mirror_to_flat(model_name, model_final, meta_final)

            keep = {generation, _read_pointer(previous_path)} if os.path.exists(previous_path) else {generation}
            _prune_generations(model_name, keep)
        except Exception:
            _cleanup_generation_temps(model_name, generation)
            # If the pointer was not switched the previous active model stays
            # active; if the exception happened after the pointer switched the
            # generation on disk is already complete and valid.
            logger.exception("Failed to publish model '%s' (generation %s)", model_name, generation)
            raise
        finally:
            _cleanup_generation_temps(model_name, generation)

        logger.info("Model '%s' generation %s published atomically", model_name, generation)
        return generation


def save_model(model: Any, model_name: str, metrics: Optional[dict] = None) -> None:
    """Persist *model* as the production version for *model_name*.

    Delegates to the atomic, generation-scoped publisher. The previous active
    generation is preserved for ``restore_previous_model()``.
    """
    publish_model(model, model_name, metrics)


def delete_model(model_name: str) -> None:
    """Remove every persisted artifact for *model_name*.

    Deletes the active/previous pointers, all generations and the legacy flat
    mirrors. Used by tests and by any consumer that must fully remove a model.
    """
    with _get_write_lock(model_name):
        for path in (
            get_model_path(model_name),
            get_meta_path(model_name),
            _active_ptr_path(model_name),
            _previous_ptr_path(model_name),
            f"{get_model_path(model_name)}.tmp",
            f"{get_meta_path(model_name)}.tmp",
        ):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass
        root = _generations_root(model_name)
        if os.path.isdir(root):
            shutil.rmtree(root, ignore_errors=True)


# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------

def restore_previous_model(model_name: str) -> bool:
    """Roll back *model_name* to its previously-published generation.

    The active and previous pointers are swapped so the rollback itself is
    reversible (mirroring the old flat-file semantics). Returns False (no-op)
    when there is no previous generation to restore.
    """
    with _get_write_lock(model_name):
        active_path = _active_ptr_path(model_name)
        previous_path = _previous_ptr_path(model_name)

        current = _read_pointer(active_path) if os.path.exists(active_path) else None
        previous = _read_pointer(previous_path) if os.path.exists(previous_path) else None

        if previous is None or not _generation_exists(model_name, previous):
            logger.warning("No previous generation of model '%s' to restore", model_name)
            return False

        _atomic_write_json(active_path, {"generation": previous})
        if current is not None and _generation_exists(model_name, current):
            _atomic_write_json(previous_path, {"generation": current})
        else:
            try:
                os.remove(previous_path)
            except OSError:
                pass

        _mirror_to_flat(
            model_name,
            _generation_model_path(model_name, previous),
            _generation_meta_path(model_name, previous),
        )
        logger.warning("Model '%s' rolled back to generation %s", model_name, previous)
        return True


# ---------------------------------------------------------------------------
# Readers
# ---------------------------------------------------------------------------

def _generation_candidates(model_name: str):
    """Active generation first, then the previous one (for crash recovery),
    then the legacy flat file path.

    A generation is only considered readable when its model artifact exists, so
    a crash that leaves an incomplete generation never surfaces as a
    model/metadata mix: both readers fall back to the previous valid generation.
    """
    seen = set()
    for gen in (get_active_generation(model_name), get_previous_generation(model_name)):
        if not gen or gen in seen:
            continue
        seen.add(gen)
        model_path = _generation_model_path(model_name, gen)
        if not os.path.exists(model_path):
            logger.warning(
                "Generation %s of model '%s' has no model artifact; skipping",
                gen,
                model_name,
            )
            continue
        yield model_path, _generation_meta_path(model_name, gen)
    yield get_model_path(model_name), get_meta_path(model_name)


def load_model(model_name: str) -> Optional[Any]:
    """Load the active model for *model_name*.

    Resolution order: active generation -> previous generation (kept valid if a
    new generation fails to become active) -> legacy flat file.
    """
    for model_path, _ in _generation_candidates(model_name):
        if not os.path.exists(model_path):
            continue
        try:
            with open(model_path, "rb") as f:
                return pickle.load(f)
        except Exception:
            logger.warning("Failed to load model '%s' from %s", model_name, model_path)
            continue
    logger.warning("Model '%s' not found at %s", model_name, get_model_path(model_name))
    return None


def model_exists(model_name: str) -> bool:
    for model_path, _ in _generation_candidates(model_name):
        if os.path.exists(model_path):
            return True
    return False


def get_model_meta(model_name: str) -> Optional[dict]:
    """Return the persisted metadata dict for the active model, or None."""
    for _, meta_path in _generation_candidates(model_name):
        if not os.path.exists(meta_path):
            continue
        try:
            with open(meta_path, "r") as f:
                return json.load(f)
        except Exception:
            logger.warning("Failed to read metadata for model '%s'", model_name)
            continue
    return None


def get_generation_meta(model_name: str, generation: str) -> Optional[dict]:
    """Return the metadata for a specific (already persisted) generation."""
    path = _generation_meta_path(model_name, generation)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        logger.warning("Failed to read metadata for model '%s' generation %s", model_name, generation)
        return None


# ---------------------------------------------------------------------------
# Startup / lazy loading
# ---------------------------------------------------------------------------

def cleanup_stale_training_artifacts(model_name: Optional[str] = None) -> None:
    """Remove temporary artifacts left behind by crashed or cancelled runs.

    Only files matching the unique-temp pattern are removed; active and
    previous generations are never touched. When *model_name* is None all
    models under MODEL_STORAGE_DIR are swept.
    """
    if model_name is not None:
        names = [model_name]
    else:
        root = os.path.join(MODEL_STORAGE_DIR, "generations")
        if os.path.isdir(root):
            names = os.listdir(root)
        else:
            names = []
        names = [n for n in names if os.path.isdir(os.path.join(root, n))]

    for name in names:
        gen_root = _generations_root(name)
        if os.path.isdir(gen_root):
            for gen in os.listdir(gen_root):
                _cleanup_generation_temps(name, gen)
        for entry in os.listdir(MODEL_STORAGE_DIR):
            if entry.endswith(".tmp") and (
                entry.startswith(f"{name}_") or entry.startswith(f"{name}.")
            ):
                try:
                    os.remove(os.path.join(MODEL_STORAGE_DIR, entry))
                except OSError:
                    pass


async def ensure_model_loaded(model_name: str, train_fn, *args, **kwargs) -> Optional[Any]:
    async with _get_lock(model_name):
        if not model_exists(model_name):
            logger.info("Model '%s' not found, training...", model_name)
            res = train_fn(*args, **kwargs)
            if inspect.isawaitable(res):
                await res
        return load_model(model_name)

SUPPORTED_MODELS: list[str] = [
    "demand_forecast",
    "price_forecast",
    "driver_profit",
    "trust_scorer",
    "collaborative_filter",
]


def check_models_exist() -> set[str]:
    """Return the set of persisted model names that exist on disk."""
    return {name for name in SUPPORTED_MODELS if model_exists(name)}


async def preload_all_models() -> set[str]:
    """Verify which persisted models exist at startup.

    Returns the set of model names found on disk so the caller can
    populate runtime tracking without hardcoding.
    """
    cleanup_stale_training_artifacts()
    available = set()
    for name in SUPPORTED_MODELS:
        if model_exists(name):
            logger.info("Model '%s' already exists at startup", name)
            available.add(name)
        else:
            logger.info("Model '%s' not found at startup, will train on first request", name)
    return available
