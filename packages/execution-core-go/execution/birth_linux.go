package execution

import (
	"golang.org/x/sys/unix"
	"time"
)

func birthTime(path string, fallback time.Time) time.Time {
	var s unix.Statx_t
	if unix.Statx(unix.AT_FDCWD, path, 0, unix.STATX_BTIME, &s) == nil && s.Mask&unix.STATX_BTIME != 0 {
		return time.Unix(s.Btime.Sec, int64(s.Btime.Nsec))
	}
	return fallback
}
