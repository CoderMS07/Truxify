# Stub for spec 59
# === Spec 59: threaded index ===
from concurrent.futures import ThreadPoolExecutor
def bulk_index_documents(fn, docs, workers=4):
    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(fn, docs))
    return len(docs)

