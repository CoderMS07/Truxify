package main

import (
	"testing"
	"time"
)

func TestSweepDrivers(t *testing.T) {
	now := time.Now()

	// Populate active drivers (one fresh, one stale)
	activeDrivers.Store("driver-fresh", driverEntry{lastSeen: now})
	activeDrivers.Store("driver-stale", driverEntry{lastSeen: now.Add(-driverTTL - time.Minute)})

	// Populate ping rate limits (one fresh, one stale)
	entryFresh := &rateEntry{stamps: []time.Time{now}}
	pingRateLimit.Store("driver-fresh", entryFresh)

	entryStale := &rateEntry{stamps: []time.Time{now.Add(-driverTTL - time.Minute)}}
	pingRateLimit.Store("driver-stale", entryStale)

	// Execute sweep
	sweepDrivers()

	// Assert activeDrivers eviction
	if _, ok := activeDrivers.Load("driver-fresh"); !ok {
		t.Errorf("expected driver-fresh to remain in activeDrivers")
	}
	if _, ok := activeDrivers.Load("driver-stale"); ok {
		t.Errorf("expected driver-stale to be evicted from activeDrivers")
	}

	// Assert pingRateLimit eviction
	if _, ok := pingRateLimit.Load("driver-fresh"); !ok {
		t.Errorf("expected driver-fresh to remain in pingRateLimit")
	}
	if _, ok := pingRateLimit.Load("driver-stale"); ok {
		t.Errorf("expected driver-stale to be evicted from pingRateLimit")
	}
}
