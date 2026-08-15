"""
Tests for the model training / deployment consistency guarantees:

- concurrent same-model training is serialized and cannot corrupt artifacts;
- concurrent training of different models is independent;
- every training run uses unique temporary artifact paths;
- a failed or timed-out run never replaces the currently active model;
- model artifact + metadata are published atomically as one generation;
- the active model and its metadata always refer to the same generation;
- the prediction cache is invalidated only after a successful publication;
- per-model locks serialize same-model training safely;
- temporary artifacts are cleaned up after success/failure/cancellation.
"""
import asyncio
import json
import os
import threading
import time

import pytest

from app.models import base as base_module
from app.execution import run_training_job
from app.models.base import (
    MODEL_STORAGE_DIR,
    save_model,
    load_model,
    model_exists,
    get_model_meta,
    get_model_lock,
    get_active_generation,
    get_previous_generation,
    publish_model,
    delete_model,
    cleanup_stale_training_artifacts,
)


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
    return tmp_path


def _no_temp_files(root):
    for dirpath, _, files in os.walk(str(root)):
        for f in files:
            if f.endswith(".tmp"):
                return False
    return True


def _generation_ids(model_name):
    root = base_module._generations_root(model_name)
    if not os.path.isdir(root):
        return []
    return sorted(os.listdir(root))


# ---------------------------------------------------------------------------
# 1. Two concurrent training requests for the same model
# ---------------------------------------------------------------------------

class TestConcurrentSameModelTraining:
    def test_publications_never_overlap_and_artifact_stays_valid(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))

        peak = [0]
        active = [0]
        guard = threading.Lock()
        real_atomic = base_module._atomic_write_json

        def counted_atomic(path, data):
            with guard:
                active[0] += 1
                peak[0] = max(peak[0], active[0])
            try:
                return real_atomic(path, data)
            finally:
                with guard:
                    active[0] -= 1

        monkeypatch.setattr(base_module, "_atomic_write_json", counted_atomic)

        run_count = [0]
        real_gen_id = base_module._generate_generation_id
        monkeypatch.setattr(
            base_module,
            "_generate_generation_id",
            lambda name: (run_count.__setitem__(0, run_count[0] + 1), real_gen_id(name))[1],
        )

        payloads = [f"model-{i}" for i in range(8)]
        errors = []

        def writer(payload):
            try:
                save_model(payload, "same_model", {"run": payload})
            except Exception as e:  # pragma: no cover - diagnostic
                errors.append(e)

        threads = [threading.Thread(target=writer, args=(p,)) for p in payloads]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == []
        assert peak[0] == 1, "same-model publications must never overlap"
        assert load_model("same_model") in payloads, "active artifact must be one intact run"
        assert run_count[0] == len(payloads), "one generation per training run"
        # Storage stays bounded: only active + previous generations are kept.
        assert len(_generation_ids("same_model")) <= 2

    def test_each_generation_is_complete(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        for i in range(5):
            save_model(f"v{i}", "complete_model", {"run": i})
        for gen in _generation_ids("complete_model"):
            gen_dir = base_module._generation_dir("complete_model", gen)
            entries = sorted(os.listdir(gen_dir))
            assert entries == ["meta.json", "model.pkl"]


# ---------------------------------------------------------------------------
# 2. Two concurrent training requests for different models
# ---------------------------------------------------------------------------

class TestConcurrentDifferentModels:
    def test_different_models_are_independent(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        errors = []

        def writer(name, payload):
            try:
                save_model(payload, name, {"tag": name})
            except Exception as e:  # pragma: no cover - diagnostic
                errors.append(e)

        threads = [
            threading.Thread(target=writer, args=("model_a", "payload-A")),
            threading.Thread(target=writer, args=("model_b", "payload-B")),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == []
        assert load_model("model_a") == "payload-A"
        assert load_model("model_b") == "payload-B"
        assert get_model_meta("model_a")["model_name"] == "model_a"
        assert get_model_meta("model_b")["model_name"] == "model_b"
        assert get_active_generation("model_a") != get_active_generation("model_b")


# ---------------------------------------------------------------------------
# 3. Unique temporary artifacts
# ---------------------------------------------------------------------------

class TestUniqueTemporaryArtifacts:
    def test_every_run_gets_a_unique_temp_path(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        generated = []
        real_unique = base_module._unique_temp

        def tracking_unique(final):
            tmp = real_unique(final)
            generated.append(tmp)
            return tmp

        monkeypatch.setattr(base_module, "_unique_temp", tracking_unique)

        save_model("one", "uniq_model")
        save_model("two", "uniq_model")
        save_model("three", "uniq_model")

        assert len(generated) == len(set(generated)), "temp paths must be unique per run"
        assert len(set(generated)) >= 6

    def test_no_temp_files_remain_and_generations_differ(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("a", "unique_model")
        gen1 = get_active_generation("unique_model")
        save_model("b", "unique_model")
        gen2 = get_active_generation("unique_model")
        assert gen1 != gen2
        assert _no_temp_files(tmp_path)

    def test_concurrent_runs_never_share_temp_paths(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        seen = set()
        guard = threading.Lock()
        real_unique = base_module._unique_temp

        def tracking_unique(final):
            tmp = real_unique(final)
            with guard:
                seen.add(tmp)
            return tmp

        monkeypatch.setattr(base_module, "_unique_temp", tracking_unique)

        def writer(payload):
            save_model(payload, "concurrent_uniq_model")

        threads = [threading.Thread(target=writer, args=(f"p{i}",)) for i in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(seen) == len({os.path.basename(p) for p in seen})
        assert _no_temp_files(tmp_path)


# ---------------------------------------------------------------------------
# 4. Training failure keeps the previous active model
# ---------------------------------------------------------------------------

class TestTrainingFailureKeepsActiveModel:
    def test_failed_save_keeps_previous_generation(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("original", "failure_model", {"mae": 1.0})
        orig_gen = get_active_generation("failure_model")

        def boom(*args, **kwargs):
            raise RuntimeError("training blew up")

        monkeypatch.setattr(base_module.pickle, "dump", boom)
        with pytest.raises(RuntimeError):
            save_model("newer", "failure_model", {"mae": 0.1})

        assert load_model("failure_model") == "original"
        assert get_active_generation("failure_model") == orig_gen
        assert get_model_meta("failure_model")["metrics"] == {"mae": 1.0}

    def test_corrupt_temp_artifact_is_rejected(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("good", "corrupt_model", {"mae": 2.0})

        def garbage_dump(obj, f, *args, **kwargs):
            f.write(b"garbage-not-a-pickle")

        monkeypatch.setattr(base_module.pickle, "dump", garbage_dump)
        with pytest.raises(Exception):
            save_model("bad", "corrupt_model", {"mae": 0.0})

        assert load_model("corrupt_model") == "good"
        assert get_model_meta("corrupt_model")["metrics"] == {"mae": 2.0}

    def test_missing_active_artifact_falls_back_to_previous_generation(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("first", "fallback_model", {"v": 1})
        save_model("second", "fallback_model", {"v": 2})
        active = get_active_generation("fallback_model")
        previous = get_previous_generation("fallback_model")
        assert active != previous

        # Simulate a crash that leaves the active generation without its
        # model artifact: readers must fall back to the previous generation
        # and never surface a model/metadata mix.
        os.remove(base_module._generation_model_path("fallback_model", active))

        assert load_model("fallback_model") == "first"
        assert get_model_meta("fallback_model")["metrics"] == {"v": 1}
        assert get_model_meta("fallback_model")["generation"] == previous


# ---------------------------------------------------------------------------
# 5. HTTP training timeout does not unexpectedly deploy a model
# ---------------------------------------------------------------------------

class TestTrainingTimeout:
    def test_timed_out_run_does_not_publish(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        import app.execution as execution_module

        def slow_train():
            time.sleep(0.15)
            save_model("late", "timeout_model", {"mae": 1})
            return {"mae": 1}

        async def scenario():
            with pytest.raises(asyncio.TimeoutError):
                await run_training_job("timeout_model", slow_train, timeout=0.05)

        asyncio.run(scenario())

        # Give the background (uninterruptible) worker time to reach its
        # publish step, which must abort because the run was cancelled.
        time.sleep(0.4)
        assert model_exists("timeout_model") is False
        assert load_model("timeout_model") is None
        assert get_active_generation("timeout_model") is None

    def test_timed_out_http_request_returns_504_and_publishes_nothing(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        from fastapi.testclient import TestClient
        import main as main_module

        real_train = main_module.train_demand_forecast_model

        def slow_train():
            time.sleep(0.3)
            return real_train()

        monkeypatch.setattr(main_module, "train_demand_forecast_model", slow_train)
        monkeypatch.setenv("ML_TRAINING_TIMEOUT_SECONDS", "0.05")

        client = TestClient(main_module.app, headers={"X-API-Key": "test_key"})
        response = client.post("/train/demand")
        assert response.status_code == 504

        time.sleep(0.6)
        assert model_exists("demand_forecast") is False, \
            "a timed-out training must never publish a model"


# ---------------------------------------------------------------------------
# 6. Publication crash never exposes a mixed generation
# ---------------------------------------------------------------------------

class TestPublicationCrash:
    def test_crash_before_pointer_switch_keeps_old_generation(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("old-model", "crash_model", {"gen": 1})

        real_replace = os.replace
        calls = []

        def flaky_replace(src, dst, *args, **kwargs):
            calls.append(str(dst))
            if any("_active.json" in call for call in calls):
                raise RuntimeError("crash during publication")
            return real_replace(src, dst, *args, **kwargs)

        monkeypatch.setattr(base_module.os, "replace", flaky_replace)
        with pytest.raises(RuntimeError):
            save_model("new-model", "crash_model", {"gen": 2})

        # Reader must never see new-model + old-meta or vice versa.
        assert load_model("crash_model") == "old-model"
        assert get_model_meta("crash_model")["metrics"] == {"gen": 1}
        assert get_model_meta("crash_model")["generation"] == get_active_generation("crash_model")

    def test_failed_pointer_write_releases_lock_and_recovers(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("a", "recover_model")

        real_dump = base_module.pickle.dump
        monkeypatch.setattr(
            base_module.pickle,
            "dump",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("write failed")),
        )
        with pytest.raises(RuntimeError):
            save_model("b", "recover_model")

        # Restore a working dumper and verify the lock was released.
        monkeypatch.setattr(base_module.pickle, "dump", real_dump)
        save_model("c", "recover_model")
        assert load_model("recover_model") == "c"


# ---------------------------------------------------------------------------
# 7. Model + metadata generation matching
# ---------------------------------------------------------------------------

class TestGenerationConsistency:
    def test_active_model_and_meta_refer_to_same_generation(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("v1", "match_model", {"mae": 9.0})
        gen1 = get_active_generation("match_model")
        assert get_model_meta("match_model")["generation"] == gen1
        assert os.path.exists(base_module._generation_model_path("match_model", gen1))
        assert os.path.exists(base_module._generation_meta_path("match_model", gen1))

        save_model("v2", "match_model", {"mae": 5.0})
        gen2 = get_active_generation("match_model")
        assert gen2 != gen1
        assert get_model_meta("match_model")["generation"] == gen2
        assert load_model("match_model") == "v2"
        assert get_previous_generation("match_model") == gen1

    def test_metadata_identifies_exact_artifact(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("payload", "identified_model", {"mae": 3.0})
        gen = get_active_generation("identified_model")
        meta_path = base_module._generation_meta_path("identified_model", gen)
        with open(meta_path) as f:
            meta = json.load(f)
        assert meta["generation"] == gen
        assert meta["model_name"] == "identified_model"
        assert meta["metrics"] == {"mae": 3.0}
        assert "saved_at" in meta

    def test_flat_mirror_matches_generation(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("mirrored", "mirror_model", {"mae": 4.0})
        assert load_model("mirror_model") == "mirrored"
        assert get_model_meta("mirror_model")["metrics"] == {"mae": 4.0}


# ---------------------------------------------------------------------------
# 8. Cache invalidation only after successful publication
# ---------------------------------------------------------------------------

class TestCacheConsistency:
    def test_cache_invalidated_only_after_successful_publication(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        import app.models.demand_forecast as df

        df.reset_model_cache()
        df._model_cache = ("cached_model", "cached_scaler")

        # First training run publishes → cache is invalidated.
        df.train_demand_forecast_model()
        assert df._model_cache is None

        # Seed a bad production baseline so the next run passes the promotion
        # gate and reaches the (failing) publication step.
        save_model(("old_model", "old_scaler"), df.MODEL_NAME, metrics={"mae": 100.0})
        df._model_cache = ("cached_model", "cached_scaler")
        monkeypatch.setattr(
            base_module.pickle,
            "dump",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("write failed")),
        )
        with pytest.raises(RuntimeError):
            df.train_demand_forecast_model()
        assert df._model_cache == ("cached_model", "cached_scaler"), \
            "cache must not change when publication fails"


# ---------------------------------------------------------------------------
# 9. Lock behavior
# ---------------------------------------------------------------------------

class TestLockBehavior:
    def test_model_lock_serializes_same_model_requests(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))

        async def scenario():
            peak = 0
            active = 0

            async def worker():
                nonlocal peak, active
                async with get_model_lock("lock_model"):
                    active += 1
                    peak = max(peak, active)
                    await asyncio.sleep(0.05)
                    active -= 1

            await asyncio.gather(*(worker() for _ in range(5)))
            return peak

        assert asyncio.run(scenario()) == 1, \
            "same-model training requests must be serialized"

    def test_different_models_use_independent_locks(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))

        async def scenario():
            lock_a = get_model_lock("lock_model_a")
            lock_b = get_model_lock("lock_model_b")
            a_held, b_held = asyncio.Event(), asyncio.Event()
            both = asyncio.Event()

            async def worker_a():
                async with lock_a:
                    a_held.set()
                    await asyncio.wait_for(both.wait(), timeout=1.0)

            async def worker_b():
                async with lock_b:
                    b_held.set()
                    both.set()
                    await asyncio.sleep(0.1)

            await asyncio.gather(worker_a(), worker_b())
            return a_held.is_set() and b_held.is_set()

        assert asyncio.run(scenario()) is True

    def test_write_lock_serializes_publications(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        peak = [0]
        active = [0]
        guard = threading.Lock()
        real_get_lock = base_module._get_write_lock

        class WrappedLock:
            def __init__(self, lock):
                self._lock = lock

            def __enter__(self):
                self._lock.__enter__()
                with guard:
                    active[0] += 1
                    peak[0] = max(peak[0], active[0])
                return self

            def __exit__(self, *exc):
                try:
                    return self._lock.__exit__(*exc)
                finally:
                    with guard:
                        active[0] -= 1

        def tracked_get_lock(name):
            return WrappedLock(real_get_lock(name))

        monkeypatch.setattr(base_module, "_get_write_lock", tracked_get_lock)
        errors = []

        def writer(payload):
            try:
                save_model(payload, "write_lock_model")
            except Exception as e:  # pragma: no cover - diagnostic
                errors.append(e)

        threads = [threading.Thread(target=writer, args=(f"x{i}",)) for i in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == []
        assert peak[0] == 1, "artifact writes for the same model must be serialized"
        assert load_model("write_lock_model") in {f"x{i}" for i in range(6)}


# ---------------------------------------------------------------------------
# 10. Cleanup of temporary artifacts
# ---------------------------------------------------------------------------

class TestCleanup:
    def test_finished_publish_leaves_no_temp_files(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("ok", "clean_model")
        assert _no_temp_files(tmp_path)
        assert load_model("clean_model") == "ok"

    def test_failed_publish_leaves_no_temp_files_and_keeps_model(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("ok", "clean_model")

        real_dump = base_module.pickle.dump

        def garbage_dump(obj, f, *args, **kwargs):
            f.write(b"garbage-not-a-pickle")

        monkeypatch.setattr(base_module.pickle, "dump", garbage_dump)
        with pytest.raises(Exception):
            save_model("bad", "clean_model")

        assert _no_temp_files(tmp_path)
        assert load_model("clean_model") == "ok"

        monkeypatch.setattr(base_module.pickle, "dump", real_dump)
        save_model("ok2", "clean_model")
        assert _no_temp_files(tmp_path)

    def test_stale_artifacts_swept_without_touching_active_model(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("live", "sweep_model")
        active = get_active_generation("sweep_model")

        stale_gen_tmp = os.path.join(
            base_module._generation_dir("sweep_model", active), "model_gen_x.pkl.tmp"
        )
        stale_ptr_tmp = os.path.join(str(tmp_path), "sweep_model_active.json.abc.tmp")
        stale_flat_tmp = os.path.join(str(tmp_path), "sweep_model.pkl.abc.tmp")
        for p in (stale_gen_tmp, stale_ptr_tmp, stale_flat_tmp):
            with open(p, "w") as f:
                f.write("junk")

        cleanup_stale_training_artifacts()

        for p in (stale_gen_tmp, stale_ptr_tmp, stale_flat_tmp):
            assert not os.path.exists(p), f"stale temp {p} should be swept"
        assert load_model("sweep_model") == "live"
        assert get_active_generation("sweep_model") == active

    def test_delete_model_removes_everything(self, monkeypatch, tmp_path):
        monkeypatch.setattr(base_module, "MODEL_STORAGE_DIR", str(tmp_path))
        save_model("gone", "bye_model")
        assert model_exists("bye_model") is True
        delete_model("bye_model")
        assert model_exists("bye_model") is False
        assert not os.path.exists(base_module._generations_root("bye_model"))
        assert _no_temp_files(tmp_path)
