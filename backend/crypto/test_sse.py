import pytest
from backend.crypto.sse_engine import bulk_index_documents
def test_basic():
    seen = []
    assert bulk_index_documents(seen.append, [1,2,3], 2) == 3
