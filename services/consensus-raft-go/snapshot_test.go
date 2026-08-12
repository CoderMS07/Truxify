package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// raftHandlersWithSnapshot wires all Raft HTTP routes including the snapshot RPC.
func raftHandlersWithSnapshot(n *RaftNode) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/raft/status", n.HandleStatus)
	mux.HandleFunc("/api/v1/raft/commit", n.HandleCommitOrder)
	mux.HandleFunc("/api/v1/raft/vote", n.HandleVote)
	mux.HandleFunc("/api/v1/raft/append", n.HandleAppend)
	mux.HandleFunc("/api/v1/raft/snapshot", n.HandleSnapshot)
	return mux
}

// TestCompactionTruncatesAppliedLog verifies committed-and-applied entries are
// folded into a snapshot and the in-memory log is truncated.
func TestCompactionTruncatesAppliedLog(t *testing.T) {
	node := NewRaftNode("node1", nil, nil)
	node.compactionThreshold = 2
	now := time.Now()
	node.Log = []LogEntry{
		{Index: 1, Term: 1, Command: "CREATED", OrderID: "ord-1", Timestamp: now},
		{Index: 2, Term: 1, Command: "DISPATCHED", OrderID: "ord-1", Timestamp: now},
		{Index: 3, Term: 1, Command: "IN_TRANSIT", OrderID: "ord-1", Timestamp: now},
		{Index: 4, Term: 1, Command: "DELIVERED", OrderID: "ord-1", Timestamp: now},
		{Index: 5, Term: 1, Command: "COMPLETED", OrderID: "ord-1", Timestamp: now},
	}
	node.CommitIndex = 5

	node.mu.Lock()
	node.maybeSnapshotLocked()
	node.mu.Unlock()

	if node.snapshotIndex != 5 || node.snapshotTerm != 1 {
		t.Errorf("expected snapshot at index 5 term 1, got index %d term %d", node.snapshotIndex, node.snapshotTerm)
	}
	if len(node.Log) != 0 {
		t.Errorf("expected log truncated to 0 entries, got %d", len(node.Log))
	}
	if node.lastLogIndex() != 5 {
		t.Errorf("expected lastLogIndex 5, got %d", node.lastLogIndex())
	}
	if node.snapshotState["ord-1"] != "COMPLETED" {
		t.Errorf("expected snapshot state COMPLETED, got %q", node.snapshotState["ord-1"])
	}
}

// TestAdvanceCommitIndexAfterSnapshot verifies commit accounting continues
// correctly past the snapshot boundary.
func TestAdvanceCommitIndexAfterSnapshot(t *testing.T) {
	node := NewRaftNode("node1", nil, nil)
	node.Role = Leader
	node.CurrentTerm = 2
	node.snapshotIndex = 5
	node.snapshotTerm = 1
	node.snapshotState = map[string]string{"ord-1": "DELIVERED"}
	node.Log = []LogEntry{
		{Index: 6, Term: 2, Command: "COMPLETED", OrderID: "ord-1", Timestamp: time.Now()},
	}
	node.CommitIndex = 5

	node.mu.Lock()
	node.advanceCommitIndexLocked()
	node.mu.Unlock()

	if node.CommitIndex != 6 {
		t.Errorf("expected commit_index 6 after snapshot, got %d", node.CommitIndex)
	}
	if node.LastApplied != 6 {
		t.Errorf("expected last_applied 6, got %d", node.LastApplied)
	}
}

// TestSnapshotTransferToLaggingFollower verifies a follower that fell behind the
// retained log prefix catches up via the InstallSnapshot RPC.
func TestSnapshotTransferToLaggingFollower(t *testing.T) {
	bypassAuth = true
	defer func() { bypassAuth = false }()

	follower := NewRaftNode("node2", []string{"node1"}, nil)
	now := time.Now()
	follower.Log = []LogEntry{
		{Index: 1, Term: 1, Command: "CREATED", OrderID: "ord-1", Timestamp: now},
		{Index: 2, Term: 1, Command: "DISPATCHED", OrderID: "ord-1", Timestamp: now},
	}
	server := httptest.NewServer(raftHandlersWithSnapshot(follower))
	defer server.Close()

	leader := NewRaftNode("node1", []string{"node2"}, []string{server.URL})
	leader.snapshotIndex = 5
	leader.snapshotTerm = 1
	leader.snapshotState = map[string]string{"ord-1": "DELIVERED"}
	leader.Log = []LogEntry{
		{Index: 6, Term: 1, Command: "COMPLETED", OrderID: "ord-1", Timestamp: now},
	}
	leader.mu.Lock()
	leader.Role = Leader
	leader.LeaderID = "node1"
	leader.CurrentTerm = 1
	leader.nextIndex = map[string]uint64{server.URL: 1}
	leader.matchIndex = map[string]uint64{server.URL: 0}
	leader.mu.Unlock()

	leader.sendHeartbeats()

	follower.mu.Lock()
	snapIdx := follower.snapshotIndex
	snapTerm := follower.snapshotTerm
	state := follower.snapshotState["ord-1"]
	logLen := len(follower.Log)
	follower.mu.Unlock()

	if snapIdx != 5 || snapTerm != 1 {
		t.Errorf("expected follower snapshot index 5 term 1, got %d/%d", snapIdx, snapTerm)
	}
	if state != "DELIVERED" {
		t.Errorf("expected follower snapshot state DELIVERED, got %q", state)
	}
	if logLen != 0 {
		t.Errorf("expected follower log truncated to 0 entries, got %d", logLen)
	}

	leader.mu.Lock()
	match := leader.matchIndex[server.URL]
	next := leader.nextIndex[server.URL]
	leader.mu.Unlock()
	if match != 5 {
		t.Errorf("expected leader matchIndex 5 after snapshot ack, got %d", match)
	}
	if next != 6 {
		t.Errorf("expected leader nextIndex 6 after snapshot ack, got %d", next)
	}
}

// TestLeaderSendsDeltaNotFullLogAfterSnapshot verifies a follower that is up to
// date with the snapshot boundary receives only the retained delta, not the
// compacted prefix.
func TestLeaderSendsDeltaNotFullLogAfterSnapshot(t *testing.T) {
	bypassAuth = true
	defer func() { bypassAuth = false }()

	now := time.Now()
	var mu sync.Mutex
	var captured *AppendEntriesRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/raft/append" {
			var req AppendEntriesRequest
			json.NewDecoder(r.Body).Decode(&req)
			mu.Lock()
			captured = &req
			mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(AppendEntriesResponse{Term: 1, Success: true})
		}
	}))
	defer server.Close()

	leader := NewRaftNode("node1", []string{"node2"}, []string{server.URL})
	leader.snapshotIndex = 5
	leader.snapshotTerm = 1
	leader.snapshotState = map[string]string{"ord-1": "DELIVERED"}
	leader.Log = []LogEntry{
		{Index: 6, Term: 1, Command: "COMPLETED", OrderID: "ord-1", Timestamp: now},
		{Index: 7, Term: 1, Command: "ARCHIVED", OrderID: "ord-1", Timestamp: now},
	}
	leader.mu.Lock()
	leader.Role = Leader
	leader.LeaderID = "node1"
	leader.CurrentTerm = 1
	leader.nextIndex = map[string]uint64{server.URL: 6}
	leader.matchIndex = map[string]uint64{server.URL: 5}
	leader.mu.Unlock()

	leader.sendHeartbeats()

	mu.Lock()
	defer mu.Unlock()
	if captured == nil {
		t.Fatal("expected an AppendEntries request to the follower")
	}
	if len(captured.Entries) != 2 {
		t.Fatalf("expected only 2 delta entries, got %d", len(captured.Entries))
	}
	if captured.Entries[0].Index != 6 || captured.Entries[1].Index != 7 {
		t.Errorf("expected delta entries 6 and 7, got %d and %d", captured.Entries[0].Index, captured.Entries[1].Index)
	}
	if captured.PrevLogIndex != 5 || captured.PrevLogTerm != 1 {
		t.Errorf("expected PrevLogIndex 5 / PrevLogTerm 1 (snapshot boundary), got %d / %d", captured.PrevLogIndex, captured.PrevLogTerm)
	}
}

// TestSnapshotPersistenceRoundTrip verifies a persisted snapshot is recovered on
// startup so restart recovery is bounded by snapshot + retained delta.
func TestSnapshotPersistenceRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "snapshot.json")

	n1 := NewRaftNode("node1", nil, nil)
	n1.mu.Lock()
	n1.snapshotPath = path
	if err := n1.persistSnapshotLocked(RaftSnapshot{Index: 5, Term: 1, State: map[string]string{"ord-1": "COMPLETED"}}); err != nil {
		t.Fatalf("persist snapshot: %v", err)
	}
	n1.mu.Unlock()

	n2 := NewRaftNode("node1", nil, nil)
	if err := n2.loadSnapshot(path); err != nil {
		t.Fatalf("load snapshot: %v", err)
	}
	n2.mu.Lock()
	defer n2.mu.Unlock()
	if n2.snapshotIndex != 5 || n2.snapshotTerm != 1 {
		t.Errorf("expected snapshot index 5 term 1, got %d/%d", n2.snapshotIndex, n2.snapshotTerm)
	}
	if n2.snapshotState["ord-1"] != "COMPLETED" {
		t.Errorf("expected recovered state COMPLETED, got %q", n2.snapshotState["ord-1"])
	}
}

// TestHandleSnapshotAppliesState verifies the InstallSnapshot RPC applies the
// compacted state, truncates the log, and advances CommitIndex.
func TestHandleSnapshotAppliesState(t *testing.T) {
	bypassAuth = true
	defer func() { bypassAuth = false }()

	follower := NewRaftNode("node2", nil, nil)
	follower.Log = []LogEntry{
		{Index: 1, Term: 1, Command: "CREATED", OrderID: "ord-1", Timestamp: time.Now()},
		{Index: 2, Term: 1, Command: "DISPATCHED", OrderID: "ord-1", Timestamp: time.Now()},
	}
	body := `{"term":1,"leader_id":"node1","snapshot_index":5,"snapshot_term":1,"state":{"ord-1":"DELIVERED"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/raft/snapshot", strings.NewReader(body))
	w := httptest.NewRecorder()
	follower.HandleSnapshot(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp InstallSnapshotResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.Success {
		t.Fatal("expected snapshot accepted")
	}
	follower.mu.Lock()
	defer follower.mu.Unlock()
	if follower.snapshotIndex != 5 {
		t.Errorf("expected snapshot index 5, got %d", follower.snapshotIndex)
	}
	if follower.snapshotState["ord-1"] != "DELIVERED" {
		t.Errorf("expected state DELIVERED, got %q", follower.snapshotState["ord-1"])
	}
	if len(follower.Log) != 0 {
		t.Errorf("expected follower log truncated, got %d entries", len(follower.Log))
	}
	if follower.CommitIndex != 5 {
		t.Errorf("expected follower commit_index 5, got %d", follower.CommitIndex)
	}
}
