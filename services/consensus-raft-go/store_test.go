package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestDurableStateSurvivesRestart verifies that a freshly recovered node resumes
// the exact currentTerm, votedFor, and log that were persisted before it went
// down.
func TestDurableStateSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "raft.log")

	n1 := NewRaftNode("node1", []string{"node2"}, nil)
	if err := n1.recoverFromWAL(path); err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer n1.Close()
	n1.mu.Lock()
	n1.CurrentTerm = 3
	n1.VotedFor = "node2"
	if err := n1.persistTermLocked(3, "node2"); err != nil {
		t.Fatalf("persist term/vote: %v", err)
	}
	now := time.Now()
	if err := n1.persistEntriesLocked([]LogEntry{
		{Index: 1, Term: 3, Command: "CREATED", OrderID: "ord-1", Timestamp: now},
		{Index: 2, Term: 3, Command: "DISPATCHED", OrderID: "ord-1", Timestamp: now},
	}); err != nil {
		t.Fatalf("persist entries: %v", err)
	}
	n1.mu.Unlock()

	// Simulate a restart: a fresh node recovers from the same file.
	n2 := NewRaftNode("node1", []string{"node2"}, nil)
	if err := n2.recoverFromWAL(path); err != nil {
		t.Fatalf("recover after restart: %v", err)
	}
	defer n2.Close()
	n2.mu.Lock()
	defer n2.mu.Unlock()
	if n2.CurrentTerm != 3 {
		t.Errorf("expected recovered term 3, got %d", n2.CurrentTerm)
	}
	if n2.VotedFor != "node2" {
		t.Errorf("expected recovered voted_for node2, got %q", n2.VotedFor)
	}
	if len(n2.Log) != 2 || n2.Log[0].OrderID != "ord-1" || n2.Log[1].Index != 2 {
		t.Errorf("expected recovered log of 2 entries, got %+v", n2.Log)
	}
}

// TestRecoverFromWALReconcilesOverwrittenEntries verifies that replay applies
// later log records at the same index as overwrites, matching the conflict
// resolution used when appending entries from a leader.
func TestRecoverFromWALReconcilesOverwrittenEntries(t *testing.T) {
	path := filepath.Join(t.TempDir(), "raft.log")
	now := time.Now()

	n := NewRaftNode("node1", nil, nil)
	if err := n.recoverFromWAL(path); err != nil {
		t.Fatalf("open store: %v", err)
	}
	n.mu.Lock()
	if err := n.persistEntriesLocked([]LogEntry{
		{Index: 1, Term: 1, Command: "CREATED", OrderID: "ord-1", Timestamp: now},
		{Index: 2, Term: 1, Command: "DISPATCHED", OrderID: "ord-1", Timestamp: now},
		{Index: 3, Term: 1, Command: "IN_TRANSIT", OrderID: "ord-1", Timestamp: now},
	}); err != nil {
		t.Fatalf("persist entries: %v", err)
	}
	// The leader later overwrites index 2 with a conflicting term, sending its
	// own version of the whole tail (entries 2 and 3).
	if err := n.persistEntriesLocked([]LogEntry{
		{Index: 2, Term: 2, Command: "CANCELLED", OrderID: "ord-1", Timestamp: now},
		{Index: 3, Term: 2, Command: "DELIVERED", OrderID: "ord-1", Timestamp: now},
	}); err != nil {
		t.Fatalf("persist overwrite: %v", err)
	}
	n.mu.Unlock()
	defer n.Close()

	n2 := NewRaftNode("node1", nil, nil)
	if err := n2.recoverFromWAL(path); err != nil {
		t.Fatalf("recover: %v", err)
	}
	defer n2.Close()
	n2.mu.Lock()
	defer n2.mu.Unlock()
	if len(n2.Log) != 3 {
		t.Fatalf("expected 3 entries after replay, got %d", len(n2.Log))
	}
	if n2.Log[1].Term != 2 || n2.Log[1].Command != "CANCELLED" {
		t.Errorf("expected index 2 to reflect the overwrite, got %+v", n2.Log[1])
	}
	if n2.Log[2].Term != 2 || n2.Log[2].Command != "DELIVERED" {
		t.Errorf("expected index 3 to reflect the leader tail, got %+v", n2.Log[2])
	}
}

// TestStartElectionPersistsTermAndVote verifies a candidate durably records its
// term and self-vote before requesting votes.
func TestStartElectionPersistsTermAndVote(t *testing.T) {
	path := filepath.Join(t.TempDir(), "raft.log")
	n := NewRaftNode("node1", nil, nil)
	if err := n.recoverFromWAL(path); err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer n.Close()
	n.startElection()

	n2 := NewRaftNode("node1", nil, nil)
	if err := n2.recoverFromWAL(path); err != nil {
		t.Fatalf("recover: %v", err)
	}
	defer n2.Close()
	n2.mu.Lock()
	defer n2.mu.Unlock()
	if n2.CurrentTerm != 1 {
		t.Errorf("expected recovered term 1, got %d", n2.CurrentTerm)
	}
	if n2.VotedFor != "node1" {
		t.Errorf("expected recovered self-vote for node1, got %q", n2.VotedFor)
	}
}

// TestHandleVotePersistsVoteBeforeAck verifies that granting a vote makes the
// decision durable before the 200 response is sent.
func TestHandleVotePersistsVoteBeforeAck(t *testing.T) {
	bypassAuth = true
	defer func() { bypassAuth = false }()

	path := filepath.Join(t.TempDir(), "raft.log")
	n := NewRaftNode("node1", []string{"node2"}, nil)
	if err := n.recoverFromWAL(path); err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer n.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/raft/vote", strings.NewReader(`{"term":1,"candidate_id":"node2","last_log_index":0,"last_log_term":0}`))
	w := httptest.NewRecorder()
	n.HandleVote(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp RequestVoteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.VoteGranted {
		t.Fatal("expected vote to be granted")
	}

	n2 := NewRaftNode("node1", nil, nil)
	if err := n2.recoverFromWAL(path); err != nil {
		t.Fatalf("recover: %v", err)
	}
	defer n2.Close()
	n2.mu.Lock()
	defer n2.mu.Unlock()
	if n2.VotedFor != "node2" {
		t.Errorf("expected recovered vote for node2, got %q", n2.VotedFor)
	}
}

// TestRecoveredNodeRejectsStaleTermVote verifies a restarted node never votes in
// a term lower than the persisted one.
func TestRecoveredNodeRejectsStaleTermVote(t *testing.T) {
	bypassAuth = true
	defer func() { bypassAuth = false }()

	path := filepath.Join(t.TempDir(), "raft.log")
	n := NewRaftNode("node1", nil, nil)
	if err := n.recoverFromWAL(path); err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer n.Close()
	n.mu.Lock()
	n.CurrentTerm = 5
	if err := n.persistTermLocked(5, ""); err != nil {
		t.Fatalf("persist term: %v", err)
	}
	n.mu.Unlock()

	n2 := NewRaftNode("node1", nil, nil)
	if err := n2.recoverFromWAL(path); err != nil {
		t.Fatalf("recover: %v", err)
	}
	defer n2.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/raft/vote", strings.NewReader(`{"term":4,"candidate_id":"node2","last_log_index":0,"last_log_term":0}`))
	w := httptest.NewRecorder()
	n2.HandleVote(w, req)

	var resp RequestVoteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.VoteGranted {
		t.Error("expected stale-term vote to be rejected")
	}
	n2.mu.Lock()
	defer n2.mu.Unlock()
	if n2.CurrentTerm != 5 {
		t.Errorf("expected term to remain 5, got %d", n2.CurrentTerm)
	}
	if n2.VotedFor != "" {
		t.Errorf("expected no vote to be recorded, got %q", n2.VotedFor)
	}
}

// TestHandleCommitOrderPersistsEntryBeforeAck verifies the leader makes a new
// entry durable before returning success to the client.
func TestHandleCommitOrderPersistsEntryBeforeAck(t *testing.T) {
	bypassAuth = true
	defer func() { bypassAuth = false }()

	path := filepath.Join(t.TempDir(), "raft.log")
	n := NewRaftNode("node1", nil, nil)
	if err := n.recoverFromWAL(path); err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer n.Close()
	n.mu.Lock()
	n.Role = Leader
	n.LeaderID = "node1"
	n.CurrentTerm = 1
	n.mu.Unlock()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/raft/commit", strings.NewReader(`{"order_id":"ord-dur-1","command":"CREATED"}`))
	w := httptest.NewRecorder()
	n.HandleCommitOrder(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 from single-node leader, got %d (%s)", w.Code, w.Body.String())
	}

	n2 := NewRaftNode("node1", nil, nil)
	if err := n2.recoverFromWAL(path); err != nil {
		t.Fatalf("recover: %v", err)
	}
	defer n2.Close()
	n2.mu.Lock()
	defer n2.mu.Unlock()
	if len(n2.Log) != 1 || n2.Log[0].OrderID != "ord-dur-1" || n2.Log[0].Command != "CREATED" {
		t.Errorf("expected the committed entry to survive restart, got %+v", n2.Log)
	}
	if n2.Log[0].Term != 1 || n2.Log[0].Index != 1 {
		t.Errorf("expected entry term 1 index 1, got term %d index %d", n2.Log[0].Term, n2.Log[0].Index)
	}
}
