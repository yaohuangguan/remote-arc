package cli

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
)

func TestPriorOwnerStaleLockExpiresWithoutForcedDeletion(t *testing.T) {
	dir := t.TempDir()
	lock := filepath.Join(dir, "execution.lock")
	if e := os.Mkdir(lock, 0700); e != nil {
		t.Fatal(e)
	}
	last := time.Now().Add(-lease.Stale + 350*time.Millisecond)
	if e := os.Chtimes(lock, last, last); e != nil {
		t.Fatal(e)
	}
	start := time.Now()
	if e := waitForPriorOwnerRelease(context.Background(), dir); e != nil {
		t.Fatal(e)
	}
	if elapsed := time.Since(start); elapsed > 4*time.Second {
		t.Fatalf("unexpected delay %v", elapsed)
	}
	if _, e := os.Stat(lock); e != nil {
		t.Fatal("must not delete the old lock; Acquire later handles stale cleanup", e)
	}
}

func TestPriorOwnerLiveLockNeverStolen(t *testing.T) {
	dir := t.TempDir()
	lock := filepath.Join(dir, "execution.lock")
	if e := os.Mkdir(lock, 0700); e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 350*time.Millisecond)
	defer cancel()
	e := waitForPriorOwnerRelease(ctx, dir)
	if !errors.Is(e, context.DeadlineExceeded) {
		t.Fatalf("live lock must not be preempted: %v", e)
	}
	if _, e := os.Stat(lock); e != nil {
		t.Fatal("live lock was removed", e)
	}
}
