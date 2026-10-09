package journal

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const MaxBytes = 5 * 1024 * 1024

var ansi = regexp.MustCompile(`\x1b\[[0-9;]*m`)

type Journal struct {
	Dir    string
	Output io.Writer
	Color  bool // only interactive stdout; never the on-disk journal
	mu     sync.Mutex
}

func (j *Journal) Log(level, message string) {
	now := time.Now()
	clean := ansi.ReplaceAllString(message, "")
	line := fmt.Sprintf("[%s] %-7s %s\n", now.Format("15:04:05"), level, clean)
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.Output != nil {
		if j.Color && os.Getenv("NO_COLOR") == "" {
			fmt.Fprint(j.Output, FormatConsoleLine(now, level, clean, true))
		} else {
			fmt.Fprint(j.Output, line)
		}
	}
	if os.MkdirAll(j.Dir, 0700) != nil {
		return
	}
	p := filepath.Join(j.Dir, "events.log")
	if s, e := os.Stat(p); e == nil && s.Size() > MaxBytes {
		_ = os.Remove(p + ".1")
		_ = os.Rename(p, p+".1")
	}
	f, e := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if e == nil {
		_, _ = f.WriteString(line)
		_ = f.Close()
	}
}
func (j *Journal) Tail(limit int) map[string]any {
	if limit < 20 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}
	p := filepath.Join(j.Dir, "events.log")
	f, e := os.Open(p)
	if e != nil {
		return map[string]any{"source": "local-device", "lines": []string{}, "total_bytes": 0, "truncated": false, "updated_at": nil}
	}
	defer f.Close()
	s, e := f.Stat()
	if e != nil {
		return map[string]any{"source": "local-device", "lines": []string{}, "total_bytes": 0, "truncated": false, "updated_at": nil}
	}
	start := max(int64(0), s.Size()-128*1024)
	b := make([]byte, s.Size()-start)
	n, _ := f.ReadAt(b, start)
	lines := strings.Split(string(b[:n]), "\n")
	if start > 0 && len(lines) > 0 {
		lines = lines[1:]
	}
	clean := []string{}
	for _, l := range lines {
		if strings.TrimSpace(l) != "" {
			clean = append(clean, strings.TrimRight(l, "\r\t "))
		}
	}
	truncated := start > 0 || len(clean) > limit
	if len(clean) > limit {
		clean = clean[len(clean)-limit:]
	}
	return map[string]any{"source": "local-device", "lines": clean, "total_bytes": s.Size(), "truncated": truncated, "updated_at": s.ModTime().UTC().Format("2006-01-02T15:04:05.000Z")}
}
func (j *Journal) Read(cursor *int64) (int64, string) {
	f, e := os.Open(filepath.Join(j.Dir, "events.log"))
	if e != nil {
		if cursor != nil {
			return *cursor, ""
		}
		return 0, ""
	}
	defer f.Close()
	s, e := f.Stat()
	if e != nil {
		return 0, ""
	}
	start := max(int64(0), s.Size()-16384)
	if cursor != nil {
		start = *cursor
		if start > s.Size() {
			start = 0
		}
	}
	b := make([]byte, min(int64(65536), s.Size()-start))
	n, _ := f.ReadAt(b, start)
	text := string(b[:n])
	if cursor == nil {
		ls := strings.Split(text, "\n")
		if len(ls) > 21 {
			ls = ls[len(ls)-21:]
		}
		text = strings.Join(ls, "\n")
	}
	return start + int64(n), text
}
