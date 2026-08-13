import json
import pytest
from unittest.mock import patch, MagicMock

class TestFederated:
    @patch("redis.Redis.from_url")
    def test_federated_server_init(self, mock_redis):
        from federated.federated_server import FederatedServer
        server = FederatedServer()
        assert server.round == 0
        assert server.min_clients == 3

    @patch("redis.Redis.from_url")
    def test_federated_client_init(self, mock_redis):
        from federated.federated_client import FederatedClient
        client = FederatedClient(client_id="client-101")
        assert client.client_id == "client-101"

    @patch("redis.Redis.from_url")
    def test_receive_update_accepts_current_round(self, mock_redis):
        from federated.federated_server import FederatedServer
        server = FederatedServer()

        weights = server.model.get_weights()
        payload = {
            'round': server.round,
            'weights': [w.tolist() for w in weights],
        }
        encrypted = server.cipher.encrypt(json.dumps(payload).encode())

        ok = server.receive_client_update("client-1", encrypted)
        assert ok['success'] is True
        assert "client-1" in server.client_weights

    @patch("redis.Redis.from_url")
    def test_receive_update_rejects_stale_round(self, mock_redis):
        from federated.federated_server import FederatedServer
        server = FederatedServer()

        weights = server.model.get_weights()
        bad = {
            'round': server.round + 1,
            'weights': [w.tolist() for w in weights],
        }
        encrypted_bad = server.cipher.encrypt(json.dumps(bad).encode())

        rejected = server.receive_client_update("client-2", encrypted_bad)
        assert rejected['success'] is False
        assert rejected['error'] == 'stale round'
        assert "client-2" not in server.client_weights

    @patch("redis.Redis.from_url")
    def test_receive_update_rejects_missing_round(self, mock_redis):
        from federated.federated_server import FederatedServer
        server = FederatedServer()

        weights = server.model.get_weights()
        payload = {'weights': [w.tolist() for w in weights]}  # no round tag
        encrypted = server.cipher.encrypt(json.dumps(payload).encode())

        res = server.receive_client_update("client-3", encrypted)
        assert res['success'] is False
        assert res['error'] == 'missing round tag'

    @patch("redis.Redis.from_url")
    def test_receive_update_dedup_same_client_round(self, mock_redis):
        from federated.federated_server import FederatedServer
        server = FederatedServer()

        weights = server.model.get_weights()
        payload = {
            'round': server.round,
            'weights': [w.tolist() for w in weights],
        }
        encrypted = server.cipher.encrypt(json.dumps(payload).encode())

        first = server.receive_client_update("client-9", encrypted)
        second = server.receive_client_update("client-9", encrypted)
        assert first['success'] is True
        assert second['success'] is True
        assert second.get('duplicate') is True
