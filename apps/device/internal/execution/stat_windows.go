package execution

import (
	"os"
	"syscall"
	"time"
)

func statDetails(_ string, s os.FileInfo) (time.Time, time.Time, uint32) {
	created, accessed := s.ModTime(), s.ModTime()
	if v, ok := s.Sys().(*syscall.Win32FileAttributeData); ok {
		created = time.Unix(0, v.CreationTime.Nanoseconds())
		accessed = time.Unix(0, v.LastAccessTime.Nanoseconds())
	}
	mode := uint32(s.Mode().Perm()) | 0100000
	if s.IsDir() {
		mode = uint32(s.Mode().Perm()) | 0040000
	}
	if s.Mode()&os.ModeSymlink != 0 {
		mode = uint32(s.Mode().Perm()) | 0120000
	}
	return created, accessed, mode
}
