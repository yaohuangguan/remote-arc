//go:build !windows && !linux

package execution

import "time"

func birthTime(_ string, fallback time.Time) time.Time { return fallback }
