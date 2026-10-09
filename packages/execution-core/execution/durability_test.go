package execution

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// Both explicit profiles must preserve atomic replace, persisted restart-Undo
// and conflict protection. A pre-commit crash must never authorize rollback.
func TestDurabilityProfilesAndInterruptedUndo(t *testing.T) {
	for _, mode := range []string{"atomic", "durable", "layered"} {
		t.Run(mode, func(t *testing.T) {
			root := t.TempDir()
			fileMode, undoMode := mode, mode
			if mode == "layered" {
				fileMode, undoMode = "atomic", "durable"
			}
			t.Setenv("REMOTEARC_FILE_DURABILITY", fileMode)
			t.Setenv("REMOTEARC_UNDO_DURABILITY", undoMode)
			t.Setenv("REMOTEARC_UNDO_ROOT", filepath.Join(root, "undo"))
			t.Setenv("REMOTEARC_HOME", root)
			target := filepath.Join(root, "trusted", "file.txt")
			if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(target, []byte("alpha"), 0600); err != nil {
				t.Fatal(err)
			}
			core := New("full")
			p := protocol.Policy{WorkspaceRoots: []string{filepath.Dir(target)}}
			if _, err := core.Call(context.Background(), "edit_block", map[string]any{"file_path": target, "old_string": "alpha", "new_string": "beta"}, p); err != nil {
				t.Fatal(err)
			}
			core.Close()
			restarted := New("full")
			if _, err := restarted.Call(context.Background(), "undo_last_change", nil, p); err != nil {
				t.Fatal("restart undo:", err)
			}
			b, _ := os.ReadFile(target)
			if string(b) != "alpha" {
				t.Fatalf("undo returned %q", b)
			}
			if _, err := restarted.Call(context.Background(), "write_file", map[string]any{"path": target, "content": "updated"}, p); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(target, []byte("external"), 0600); err != nil {
				t.Fatal(err)
			}
			if _, err := restarted.Call(context.Background(), "undo_last_change", nil, p); err == nil {
				t.Fatal("Undo overwrote external change")
			}
			b, _ = os.ReadFile(target)
			if string(b) != "external" {
				t.Fatal("conflict protection failed")
			}
			restarted.Close()
			// Simulate crash after prepared snapshot but before committed post-change hash.
			snap, err := createSnapshot("edit_block", target)
			if err != nil {
				t.Fatal(err)
			}
			if snap == nil {
				t.Fatal("snapshot missing")
			}
			if snap.Manifest.Hash != "" {
				t.Fatal("prepared state committed too early")
			}
			if err := os.WriteFile(target, []byte("interrupted mutation"), 0600); err != nil {
				t.Fatal(err)
			}
			if _, err := restoreUndo(snap.Manifest.ID); err == nil {
				t.Fatal("uncommitted snapshot restored")
			}
			b, _ = os.ReadFile(target)
			if string(b) != "interrupted mutation" {
				t.Fatal("pre-commit snapshot changed file")
			}
			discardSnapshot(snap)
		})
	}
}

func TestUndoOrderSurvivesClockRollback(t *testing.T) {
	root := t.TempDir()
	t.Setenv("REMOTEARC_UNDO_ROOT", filepath.Join(root, "undo"))
	t.Setenv("REMOTEARC_FILE_DURABILITY", "atomic")
	t.Setenv("REMOTEARC_UNDO_DURABILITY", "atomic")
	target := filepath.Join(root, "target.txt")
	if err := os.WriteFile(target, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	core := New("full")
	defer core.Close()
	policy := protocol.Policy{WorkspaceRoots: []string{root}}
	if _, err := core.Call(context.Background(), "write_file", map[string]any{"path": target, "content": "first"}, policy); err != nil {
		t.Fatal(err)
	}
	items, err := undoCandidates()
	if err != nil || len(items) != 1 {
		t.Fatal("missing first receipt", err)
	}
	// An older persisted record can be ahead of today's clock after NTP correction.
	items[0].Manifest.Created = time.Now().Add(time.Minute).UTC().Format(time.RFC3339Nano)
	b, err := json.Marshal(items[0].Manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(items[0].Dir, "manifest.json"), b, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := core.Call(context.Background(), "write_file", map[string]any{"path": target, "content": "second"}, policy); err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"first", "original"} {
		if _, err := core.Call(context.Background(), "undo_last_change", nil, policy); err != nil {
			t.Fatal(err)
		}
		b, err := os.ReadFile(target)
		if err != nil || string(b) != expected {
			t.Fatalf("Undo order: %q, expected %q (%v)", b, expected, err)
		}
	}
}
