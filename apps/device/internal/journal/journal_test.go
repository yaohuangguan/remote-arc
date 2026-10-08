package journal

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestRotationTailCursorAndConcurrentEvents(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "events.log")
	if e := os.WriteFile(p, bytes.Repeat([]byte("x"), MaxBytes+1), 0600); e != nil {
		t.Fatal(e)
	}
	var output bytes.Buffer
	j := &Journal{Dir: dir, Output: &output}
	j.Log("info", "\x1b[31mrotated\x1b[0m")
	if _, e := os.Stat(p + ".1"); e != nil {
		t.Fatal("rotation failed", e)
	}
	if strings.Contains(output.String(), "\x1b") {
		t.Fatal("ANSI persisted")
	}
	cursor, text := j.Read(nil)
	if !strings.Contains(text, "rotated") {
		t.Fatal("initial tail missing")
	}
	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func(i int) { defer wg.Done(); j.Log("event", fmt.Sprintf("event-%d", i)) }(i)
	}
	wg.Wait()
	_, text = j.Read(&cursor)
	if strings.Count(text, "event-") != 40 {
		t.Fatal("events lost or interleaved")
	}
	tail := j.Tail(1)
	if len(tail["lines"].([]string)) != 20 || tail["truncated"] != true {
		t.Fatal("tail bounds incorrect")
	}
	if e := os.WriteFile(p, []byte("after rotation\n"), 0600); e != nil {
		t.Fatal(e)
	}
	_, text = j.Read(&cursor)
	if text != "after rotation\n" {
		t.Fatal("cursor did not recover after truncation")
	}
}
func TestUnavailableLogDoesNotAbort(t *testing.T) {
	file := filepath.Join(t.TempDir(), "file")
	if e := os.WriteFile(file, nil, 0600); e != nil {
		t.Fatal(e)
	}
	j := &Journal{Dir: file}
	j.Log("info", "still running")
	if len(j.Tail(100)["lines"].([]string)) != 0 {
		t.Fatal("unexpected tail")
	}
}
