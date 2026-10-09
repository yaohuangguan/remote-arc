package journal

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTTYFormattingDoesNotAlterPersistentLog(t *testing.T) {
	t.Setenv("NO_COLOR", "")
	stamp := time.Date(2026, 10, 9, 9, 10, 11, 0, time.UTC)
	line := FormatConsoleLine(stamp, "success", "tool.done write_file", true)
	if !strings.Contains(line, "✓") || !strings.Contains(line, "\x1b[") {
		t.Fatalf("colored terminal line %q", line)
	}
	if strings.Contains(FormatConsoleLine(stamp, "warn", "permission denied", false), "\x1b") {
		t.Fatal("NO_COLOR fallback contains ANSI")
	}
	hist := FormatHistory("[09:10:11] success tool.done write_file\n[09:10:12] error   failed\n", true)
	if !strings.Contains(hist, "✓") || !strings.Contains(hist, "×") || !strings.Contains(hist, "\x1b[") {
		t.Fatalf("history is not styled %q", hist)
	}
	dir := t.TempDir()
	var screen bytes.Buffer
	j := &Journal{Dir: dir, Output: &screen, Color: true}
	j.Log("success", "works")
	onDisk, e := os.ReadFile(filepath.Join(dir, "events.log"))
	if e != nil {
		t.Fatal(e)
	}
	if strings.Contains(string(onDisk), "\x1b") || strings.Contains(string(onDisk), "✓") {
		t.Fatal("Journal storage changed format")
	}
	if !strings.Contains(screen.String(), "✓") {
		t.Fatal("Terminal missing icon")
	}
}
