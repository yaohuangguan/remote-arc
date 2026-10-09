package execution

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

type manifest struct {
	ID      string `json:"id"`
	Created string `json:"createdAt"`
	Tool    string `json:"tool"`
	Target  string `json:"targetPath"`
	Existed bool   `json:"existed"`
	Mode    uint32 `json:"mode,omitempty"`
	Bytes   int64  `json:"bytes"`
	Hash    string `json:"postChangeHash,omitempty"`
}
type snapshot struct {
	Dir      string
	Manifest manifest
}

func undoRoot() string {
	if s := os.Getenv("REMOTEARC_UNDO_ROOT"); s != "" {
		return s
	}
	return filepath.Join(config.Dir(), "undo")
}
func hashFile(p string) (string, error) {
	f, e := os.Open(p)
	if e != nil {
		return "", e
	}
	defer f.Close()
	h := sha256.New()
	if _, e = io.Copy(h, f); e != nil {
		return "", e
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func undoCandidates() ([]snapshot, error) {
	root := undoRoot()
	if e := os.MkdirAll(root, 0700); e != nil {
		return nil, e
	}
	es, e := os.ReadDir(root)
	if e != nil {
		return nil, e
	}
	items := []snapshot{}
	for _, entry := range es {
		if !entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			continue
		}
		dir := filepath.Join(root, entry.Name())
		var m manifest
		b, e := os.ReadFile(filepath.Join(dir, "manifest.json"))
		if e != nil || json.Unmarshal(b, &m) != nil {
			continue
		}
		created, e := time.Parse(time.RFC3339Nano, m.Created)
		if e != nil || time.Since(created) > 7*24*time.Hour {
			_ = os.RemoveAll(dir)
			continue
		}
		if m.ID != entry.Name() || m.Bytes < 0 || m.Target == "" {
			continue
		}
		items = append(items, snapshot{Dir: dir, Manifest: m})
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Manifest.Created == items[j].Manifest.Created {
			return items[i].Manifest.ID > items[j].Manifest.ID
		}
		return items[i].Manifest.Created > items[j].Manifest.Created
	})
	var total int64
	for _, s := range items {
		total += s.Manifest.Bytes
	}
	for len(items) > 0 && total > 200*1024*1024 {
		last := items[len(items)-1]
		_ = os.RemoveAll(last.Dir)
		total -= last.Manifest.Bytes
		items = items[:len(items)-1]
	}
	return items, nil
}
func createSnapshot(tool, target string) (*snapshot, error) {
	items, e := undoCandidates()
	if e != nil {
		return nil, e
	}
	// Reserve a store-relative millisecond timestamp. Fast mutations and clock
	// rollback must not leave order to the random suffix of a snapshot ID.
	created := time.Now().UnixMilli()
	for _, item := range items {
		stamp, err := time.Parse(time.RFC3339Nano, item.Manifest.Created)
		if err == nil && stamp.UnixMilli() >= created {
			created = stamp.UnixMilli() + 1
		}
	}
	m := manifest{Tool: tool, Target: target, Created: time.UnixMilli(created).UTC().Format("2006-01-02T15:04:05.000Z")}
	var original []byte
	s, e := os.Stat(target)
	if e == nil {
		if !s.Mode().IsRegular() || s.Size() > MaxTextBytes {
			return nil, nil
		}
		m.Existed = true
		m.Bytes = s.Size()
		_, _, m.Mode = statDetails(target, s)
		original, e = os.ReadFile(target)
		if e != nil {
			return nil, e
		}
	} else if !errors.Is(e, os.ErrNotExist) {
		return nil, e
	}
	m.ID = fmt.Sprintf("%d-%s", created, randomID()[:8])
	snap := &snapshot{Dir: filepath.Join(undoRoot(), m.ID), Manifest: m}
	if e = os.Mkdir(snap.Dir, 0700); e != nil {
		return nil, e
	}
	if e = config.SyncDirectoryWithDurability(undoRoot(), config.UndoDurability()); e != nil {
		return nil, e
	}
	if original != nil {
		if e = config.AtomicWriteWithDurability(filepath.Join(snap.Dir, "content.bin"), original, 0600, config.UndoDurability()); e != nil {
			discardSnapshot(snap)
			return nil, e
		}
	}
	b, _ := json.MarshalIndent(m, "", "  ")
	if e = config.AtomicWriteWithDurability(filepath.Join(snap.Dir, "manifest.json"), b, 0600, config.UndoDurability()); e != nil {
		discardSnapshot(snap)
		return nil, e
	}
	return snap, nil
}
func discardSnapshot(s *snapshot) {
	if s != nil {
		_ = os.RemoveAll(s.Dir)
	}
}
func discardUnchangedSnapshot(s *snapshot) {
	if s == nil {
		return
	}
	if !s.Manifest.Existed {
		if _, err := os.Stat(s.Manifest.Target); errors.Is(err, os.ErrNotExist) {
			discardSnapshot(s)
		}
		return
	}
	before, err := hashFile(filepath.Join(s.Dir, "content.bin"))
	if err != nil {
		return
	}
	after, err := hashFile(s.Manifest.Target)
	if err == nil && before == after {
		discardSnapshot(s)
	}
}
func finalizeSnapshot(s *snapshot) bool {
	if s == nil {
		return false
	}
	h, e := hashFile(s.Manifest.Target)
	if e != nil {
		return false
	}
	s.Manifest.Hash = h
	b, _ := json.MarshalIndent(s.Manifest, "", "  ")
	if config.AtomicWriteWithDurability(filepath.Join(s.Dir, "manifest.json"), b, 0600, config.UndoDurability()) != nil {
		// Retain recovery evidence: replacement may have happened before a
		// directory sync failed. A prepared manifest still refuses auto-Undo.
		return false
	}
	return true
}
func listUndo(limit int) ([]map[string]any, error) {
	items, e := undoCandidates()
	if e != nil {
		return nil, e
	}
	out := []map[string]any{}
	limit = max(1, min(100, limit))
	for _, s := range items[:min(len(items), limit)] {
		m := s.Manifest
		status := "legacy"
		if m.Hash != "" {
			h, e := hashFile(m.Target)
			status = "ready"
			if e != nil {
				status = "missing"
			} else if h != m.Hash {
				status = "conflict"
			}
		}
		out = append(out, map[string]any{"id": m.ID, "created_at": m.Created, "tool": m.Tool, "path": m.Target, "bytes": m.Bytes, "existed_before": m.Existed, "conflict_safe": m.Hash != "", "can_undo": status == "ready", "status": status})
	}
	return out, nil
}

// listUndoFiltered only hashes authorized entries; the caller already
// scanned the snapshot store and checked workspace policy once.
func listUndoFiltered(items []snapshot, limit int) ([]map[string]any, error) {
	out := []map[string]any{}
	limit = max(1, min(100, limit))
	for _, snap := range items[:min(len(items), limit)] {
		m := snap.Manifest
		status := "legacy"
		if m.Hash != "" {
			h, err := hashFile(m.Target)
			status = "ready"
			if err != nil {
				status = "missing"
			} else if h != m.Hash {
				status = "conflict"
			}
		}
		out = append(out, map[string]any{"id": m.ID, "created_at": m.Created, "tool": m.Tool, "path": m.Target, "bytes": m.Bytes, "existed_before": m.Existed, "conflict_safe": m.Hash != "", "can_undo": status == "ready", "status": status})
	}
	return out, nil
}
func restoreUndo(id string) (map[string]any, error) {
	items, e := undoCandidates()
	if e != nil {
		return nil, e
	}
	for _, s := range items {
		if s.Manifest.ID == id {
			return restoreUndoSnapshot(s)
		}
	}
	return nil, errors.New("Undo action not found or expired on this device.")
}

// The caller has already selected a workspace-allowed snapshot. Avoid an
// expensive second directory scan and hashing all unrelated undo actions.
func restoreUndoSnapshot(s snapshot) (map[string]any, error) {
	m := s.Manifest
	if m.Hash == "" {
		return nil, errors.New("This snapshot predates conflict-safe Local Undo and cannot be restored automatically.")
	}
	h, e := hashFile(m.Target)
	if e != nil || h != m.Hash {
		return nil, errors.New("The target file changed again after the Remote Arc edit. Automatic undo was refused to avoid overwriting newer work.")
	}
	if m.Existed {
		b, e := os.ReadFile(filepath.Join(s.Dir, "content.bin"))
		if e != nil {
			return nil, e
		}
		if e = config.AtomicWrite(m.Target, b, os.FileMode(m.Mode)&0777); e != nil {
			return nil, e
		}
	} else {
		if e = os.Remove(m.Target); e != nil {
			return nil, e
		}
		if e = config.SyncDirectory(filepath.Dir(m.Target)); e != nil {
			return nil, e
		}
	}
	discardSnapshot(&s)
	return map[string]any{"restored": true, "action_id": m.ID, "tool": m.Tool, "path": m.Target, "snapshot_location": "local-device-only"}, nil
}
