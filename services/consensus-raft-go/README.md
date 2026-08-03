# 🌐 Truxify Go Raft Distributed Consensus Node

This directory contains the **Go Raft Distributed Consensus Engine** designed for multi-region database sharding consensus, atomic order state machine locking, and zero-downtime leader election across logistics hub clusters.

---

## 🌐 Raft Consensus Features

- **Distributed State Machine**: Guarantees linearizable order state transitions (`CREATED` $\rightarrow$ `DISPATCHED` $\rightarrow$ `COMPLETED`) across multi-cloud regions.
- **Leader Election & Heartbeats**: Built-in leader election timer and term bump logic to survive regional network partitions.
- **Atomic Log Replication**: Appends transactional state transition entries into an append-only WAL log.

---

## 🔐 Authentication

All raft endpoints require the service-to-service API key configured via `RAFT_API_KEY`, sent as the `X-API-Key` header. Requests without a matching key return `401`; if `RAFT_API_KEY` is unset the endpoints fail closed (`503`). For local development only, set `BYPASS_AUTH=true` (with `NODE_ENV != production`) to skip the check.

Commit requests are validated before they touch the log:

- `order_id` must be non-empty, at most 64 chars, and contain only `[A-Za-z0-9_-]`.
- `command` must be in the allow-list (`CREATED`, `DISPATCHED`, `IN_TRANSIT`, `DELIVERED`, `COMPLETED`, `CANCELLED`), overridable via `RAFT_ALLOWED_COMMANDS` (comma-separated).

---

## ⚙️ Configuration

| Env var | Default | Description |
| :--- | :--- | :--- |
| `RAFT_PORT` | `8089` | HTTP listen port. |
| `NODE_ID` | `raft-node-north-1` | Unique id for this node. |
| `RAFT_API_KEY` | — | Shared service-to-service API key required on every endpoint. When unset, authenticated requests are rejected (`503`). |
| `RAFT_ALLOWED_COMMANDS` | `CREATED,DISPATCHED,IN_TRANSIT,DELIVERED,COMPLETED,CANCELLED` | Comma-separated allow-list of order commands accepted by `/commit`. |

---

## 🐳 Docker Deployment

```bash
# Build container image
docker build -t truxify-raft-go services/consensus-raft-go/

# Run container
docker run -p 8089:8089 truxify-raft-go
```
