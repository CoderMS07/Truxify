package main

import (
	"encoding/json"
	"io"
	"log"
	"os"
)

// walRecord is one append-only write-ahead-log entry. Every durable state
// change (a committed log entry and/or a term/votedFor update) is appended as
// a single JSON object, one per line, so loadState can replay them in order to
// rebuild Log, CurrentTerm, and VotedFor on startup.
type walRecord struct {
	Kind        string    `json:"kind"` // "entry" or "meta"
	Entry       *LogEntry `json:"entry,omitempty"`
	CurrentTerm uint64    `json:"current_term,omitempty"`
	VotedFor    string    `json:"voted_for,omitempty"`
}

// defaultWALPath returns the configured WAL path or a sensible default.
func defaultWALPath() string {
	if p := os.Getenv("RAFT_WAL_PATH"); p != "" {
		return p
	}
	return "raft.wal"
}

// persistState durably appends committed Log entries and current term/votedFor
// to the write-ahead log and fsync's it. It must be called while rn.mu is held
// (the caller guards rn.Log and the persisted index), so it performs no
// locking of its own. Only entries at or beyond rn.persistedIndex are written.
func (rn *RaftNode) persistState() {
	f, err := os.OpenFile(rn.walPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		log.Printf("raft: open WAL for append failed: %v", err)
		return
	}
	defer f.Close()

	for i := rn.persistedIndex; i < uint64(len(rn.Log)); i++ {
		rec := walRecord{Kind: "entry", Entry: &rn.Log[i]}
		if err := writeWALRecord(f, rec); err != nil {
			log.Printf("raft: write WAL entry failed: %v", err)
			return
		}
	}

	if err := writeWALRecord(f, walRecord{Kind: "meta", CurrentTerm: rn.CurrentTerm, VotedFor: rn.VotedFor}); err != nil {
		log.Printf("raft: write WAL meta failed: %v", err)
		return
	}

	if err := f.Sync(); err != nil {
		log.Printf("raft: fsync WAL failed: %v", err)
		return
	}

	rn.persistedIndex = uint64(len(rn.Log))
}

// persistMeta appends a single term/votedFor record to the WAL and fsync's it.
// It is called from paths that change term/votedFor outside of a commit (votes,
// elections, append-entries) while rn.mu is already held.
func (rn *RaftNode) persistMeta() {
	f, err := os.OpenFile(rn.walPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		log.Printf("raft: open WAL for meta failed: %v", err)
		return
	}
	defer f.Close()

	if err := writeWALRecord(f, walRecord{Kind: "meta", CurrentTerm: rn.CurrentTerm, VotedFor: rn.VotedFor}); err != nil {
		log.Printf("raft: write WAL meta failed: %v", err)
		return
	}

	if err := f.Sync(); err != nil {
		log.Printf("raft: fsync WAL failed: %v", err)
	}
}

// writeWALRecord marshals rec as one JSON line and appends it to w.
func writeWALRecord(w io.Writer, rec walRecord) error {
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	b = append(b, '\n')
	_, err = w.Write(b)
	return err
}

// loadState replays the write-ahead log to rebuild Log, CurrentTerm, and
// VotedFor before the node joins the cluster. It must only be called once at
// startup before any concurrent access, so it performs no locking.
func (rn *RaftNode) loadState() {
	f, err := os.Open(rn.walPath)
	if err != nil {
		if os.IsNotExist(err) {
			return
		}
		log.Printf("raft: open WAL failed: %v", err)
		return
	}
	defer f.Close()

	dec := json.NewDecoder(f)
	for dec.More() {
		var rec walRecord
		if err := dec.Decode(&rec); err != nil {
			log.Printf("raft: corrupt WAL record: %v", err)
			break
		}
		switch rec.Kind {
		case "entry":
			if rec.Entry != nil {
				rn.Log = append(rn.Log, *rec.Entry)
			}
		case "meta":
			rn.CurrentTerm = rec.CurrentTerm
			rn.VotedFor = rec.VotedFor
		}
	}

	rn.persistedIndex = uint64(len(rn.Log))
}
