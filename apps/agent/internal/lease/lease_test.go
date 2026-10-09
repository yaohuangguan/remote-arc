package lease

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestExclusiveStaleAndCompromisedLease(t *testing.T) {
	dir := t.TempDir()
	l, e := Acquire(dir, "execution")
	if e != nil || l == nil {
		t.Fatal(e)
	}
	defer l.Release()
	if another, e := Acquire(dir, "execution"); e != nil || another != nil {
		t.Fatal("double owner")
	}
	if !Active(dir, "execution") {
		t.Fatal("missing active lease")
	}
	path := filepath.Join(dir, "execution.lock")
	changed := time.Now().Add(time.Second)
	if e = os.Chtimes(path, changed, changed); e != nil {
		t.Fatal(e)
	}
	select {
	case <-l.Lost():
	case <-time.After(Interval + 2*time.Second):
		t.Fatal("compromise was not detected")
	}
	l.Release()
	if _, e = os.Stat(path); e != nil {
		t.Fatal("release removed another owner's lease")
	}
	stale := time.Now().Add(-Stale - time.Second)
	if e = os.Chtimes(path, stale, stale); e != nil {
		t.Fatal(e)
	}
	newOwner, e := Acquire(dir, "execution")
	if e != nil || newOwner == nil {
		t.Fatal("stale lease cannot recover", e)
	}
	newOwner.Release()
	if Active(dir, "execution") {
		t.Fatal("released lease remains")
	}
}
func TestNonemptyStaleDirectoryIsPreserved(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "execution.lock")
	if e := os.Mkdir(p, 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(p, "foreign"), nil, 0600); e != nil {
		t.Fatal(e)
	}
	old := time.Now().Add(-Stale - time.Second)
	os.Chtimes(p, old, old)
	if l, e := Acquire(dir, "execution"); l != nil || e != nil {
		t.Fatal("removed a nonempty lock")
	}
}
