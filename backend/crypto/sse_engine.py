import hashlib
import hmac


class SymmetricSearchableEncryptionEngine:
    """
    Curtmola Symmetric Searchable Encryption (SSE) Engine.
    Allows keyword search queries over encrypted databases without plaintext disclosure.
    """
    def __init__(self, key: str = "truxify_sse_master_key"):
        self.key = key.encode('utf-8')

    def generate_trapdoor(self, keyword: str) -> str:
        """Generates cryptographically secure trapdoor search token for a keyword.

        HMAC-SHA256 over the keyed keyword replaces the previous raw
        SHA-256(key || keyword) concatenation, which was vulnerable to
        length-extension and key-concatenation weaknesses. Keyword trapdoors
        stay deterministic — that is inherent to server-side SSE — so the
        server can look up all documents for a keyword.
        """
        h = hmac.new(self.key, keyword.encode('utf-8'), hashlib.sha256).hexdigest()
        return h

    def build_encrypted_index(self, document_id: str, keywords: list, index_map: dict = None) -> dict:
        """Constructs index maps binding encrypted keywords to document IDs.

        Each trapdoor maps to a *list* of document IDs so a keyword shared by
        multiple documents (or a repeated keyword) never overwrites earlier
        entries. Pass an existing index_map to accumulate a global inverted
        index across documents (issue #11677).
        """
        if index_map is None:
            index_map = {}
        for keyword in keywords:
            trapdoor = self.generate_trapdoor(keyword)
            bucket = index_map.setdefault(trapdoor, [])
            if document_id not in bucket:
                bucket.append(document_id)
        return index_map

    def search_index(self, trapdoor: str, encrypted_index: dict) -> list:
        """Return the list of document IDs matching the trapdoor (empty if none)."""
        return encrypted_index.get(trapdoor, [])


sse_engine = SymmetricSearchableEncryptionEngine()
