package cli

import (
	"context"
	"errors"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
)

// A force-terminated TS/Go owner cannot remove its execution.lock directory.
// Its 15-second heartbeat lease must expire before Go recovery can safely
// start. Never remove or take over a fresh lock: a live owner may still hold it.
func waitForPriorOwnerRelease(ctx context.Context, dir string) error {
	deadline := time.Now().Add(lease.Stale + lease.Interval + time.Second)
	for lease.Active(dir, "execution") {
		if time.Now().After(deadline) {
			return errors.New("Another Agent still owns the execution lease. Stop it locally before enabling Go recovery.")
		}
		if err := wait(ctx, 250*time.Millisecond); err != nil {
			return err
		}
	}
	// Confirming absence of the lease does not claim ownership. The new
	// supervisor/worker still must acquire its own atomic mkdir lease.
	return nil
}
