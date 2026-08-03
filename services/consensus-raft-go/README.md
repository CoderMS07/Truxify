# 🌐 Truxify Go Raft Distributed Consensus Node

This directory contains the **Go Raft Distributed Consensus Engine** designed for multi-region database sharding consensus, atomic order state machine locking, and zero-downtime leader election across logistics hub clusters.

---

## 🌐 Raft Consensus Features

- **Distributed State Machine**: Guarantees linearizable order state transitions (`CREATED` $\rightarrow$ `DISPATCHED` $\rightarrow$ `COMPLETED`) across multi-cloud regions.
- **Leader Election & Heartbeats**: Nodes start as `FOLLOWER`, campaign for leadership via `RequestVote` RPCs, and keep leadership with `AppendEntries` heartbeats and term bumps (Raft paper §5).
- **Atomic Log Replication**: Appends transactional state transition entries into an append-only WAL log.
- **Quorum-Aware Health**: `/api/v1/raft/status` reports `HEALTHY_CLUSTER` only when a leader has quorum; `NO_LEADER`, `ELECTION_IN_PROGRESS`, and `UNHEALTHY_CLUSTER` are reported otherwise.

---

## 🔌 REST Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/raft/status` | `GET` | Returns node role, current term, leader id, log length, quorum, and cluster health. |
| `/api/v1/raft/commit` | `POST` | Commits an order entry. Only the leader may commit; without quorum it returns `503`, and non-leaders return `409` with the current `leader_id`. |
| `/api/v1/raft/vote` | `POST` | Internal Raft `RequestVote` RPC used during elections. |
| `/api/v1/raft/append` | `POST` | Internal Raft `AppendEntries` (heartbeat) RPC used by the leader. |

---

## ⚙️ Configuration

| Env var | Default | Description |
| :--- | :--- | :--- |
| `RAFT_PORT` | `8089` | HTTP listen port. |
| `NODE_ID` | `raft-node-north-1` | Unique id for this node. |
| `RAFT_PEER_IDS` | `raft-node-south-1,...` | Comma-separated peer node ids reported in `/status`. |
| `RAFT_PEER_URLS` | *(none)* | Comma-separated `scheme://host:port` base URLs of peers used for `vote`/`append` RPCs. When empty, the node cannot reach a quorum and stays in `NO_LEADER`/`UNHEALTHY_CLUSTER` until a leader is reachable. A single-node cluster with no peers elects itself. |
| `RAFT_HEARTBEAT_MS` | `100` | Leader heartbeat interval. |
| `RAFT_ELECTION_TIMEOUT_MIN_MS` | `500` | Lower bound of the randomized election timeout. |
| `RAFT_ELECTION_TIMEOUT_MAX_MS` | `1200` | Upper bound of the randomized election timeout. |

---

## 🐳 Docker Deployment

```bash
# Build container image
docker build -t truxify-raft-go services/consensus-raft-go/

# Run container
docker run -p 8089:8089 truxify-raft-go
```
