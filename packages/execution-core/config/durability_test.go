package config

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestIndependentDurabilitySelection(t *testing.T) {
	t.Setenv("REMOTEARC_FILE_DURABILITY", "")
	t.Setenv("REMOTEARC_UNDO_DURABILITY", "")
	if FileDurability() != "durable" || UndoDurability() != "durable" {
		t.Fatal("Go default weakened")
	}
	t.Setenv("REMOTEARC_FILE_DURABILITY", "atomic")
	if UndoDurability() != "atomic" {
		t.Fatal("legacy explicit atomic profile changed")
	}
	t.Setenv("REMOTEARC_UNDO_DURABILITY", "durable")
	if FileDurability() != "atomic" || UndoDurability() != "durable" {
		t.Fatal("layered profile not independent")
	}
	t.Setenv("REMOTEARC_UNDO_DURABILITY", "typo")
	if UndoDurability() != "durable" {
		t.Fatal("invalid undo setting weakened syncing")
	}
}

// Exercise real temporary files/renames with deterministic sync failures.
// These are process-level fault cases, not a physical power-loss simulation.
func TestSyncOrderingAndFailureBoundaries(t *testing.T) {
	for _, failure := range []string{"none", "file", "directory"} {
		t.Run(failure, func(t *testing.T) {
			dir := t.TempDir()
			target := filepath.Join(dir, "target.txt")
			if err := os.WriteFile(target, []byte("before"), 0600); err != nil {
				t.Fatal(err)
			}
			var events []string
			injected := errors.New("injected sync failure")
			ops := writeOperations{
				sync: func(f *os.File) error {
					events = append(events, "file")
					if failure == "file" {
						return injected
					}
					return f.Sync()
				},
				rename: func(a, b string) error { events = append(events, "rename"); return os.Rename(a, b) },
				syncDirectory: func(string, string) error {
					events = append(events, "directory")
					if failure == "directory" {
						return injected
					}
					return nil
				},
			}
			err := atomicWrite(target, []byte("after"), 0600, "durable", ops)
			if failure == "none" && err != nil {
				t.Fatal(err)
			}
			if failure != "none" && !errors.Is(err, injected) {
				t.Fatalf("lost sync error: %v", err)
			}
			wantEvents, wantContent := []string{"file", "rename", "directory"}, "after"
			if failure == "file" {
				wantEvents, wantContent = []string{"file"}, "before"
			}
			if !reflect.DeepEqual(events, wantEvents) {
				t.Fatalf("ordering %v", events)
			}
			content, err := os.ReadFile(target)
			if err != nil || string(content) != wantContent {
				t.Fatalf("target %q: %v", content, err)
			}
			entries, err := os.ReadDir(dir)
			if err != nil || len(entries) != 1 {
				t.Fatal("temporary file leaked", err)
			}
		})
	}
}

func TestAtomicDoesNotSyncFile(t *testing.T) {
	target := filepath.Join(t.TempDir(), "target")
	ops := writeOperations{
		sync:   func(*os.File) error { t.Fatal("atomic file was synced"); return nil },
		rename: os.Rename,
		syncDirectory: func(dir, mode string) error {
			if mode != "atomic" {
				t.Fatal("wrong directory policy")
			}
			return SyncDirectoryWithDurability(dir, mode)
		},
	}
	if err := atomicWrite(target, []byte("atomic"), 0600, "atomic", ops); err != nil {
		t.Fatal(err)
	}
}
