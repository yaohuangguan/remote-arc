package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

type Receipt struct {
	Root       string `json:"root"`
	Path       string `json:"path"`
	Frontier   string `json:"frontier"`
	Generation int    `json:"generation"`
}
type state struct {
	Version    int                `json:"version"`
	TaskID     string             `json:"task_id"`
	Root       string             `json:"root"`
	Path       string             `json:"path"`
	Frontier   string             `json:"frontier"`
	Generation int                `json:"generation"`
	Operations map[string]Receipt `json:"operations"`
}
type Manager struct{ mu sync.Mutex }

var taskID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)
var operationID = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,120}$`)

func git(ctx context.Context, dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	base := []string{"-c", "core.hooksPath=", "-c", "commit.gpgSign=false", "-C", dir}
	cmd := exec.CommandContext(ctx, "git", append(base, args...)...)
	hide(cmd)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_AUTHOR_NAME=Remote Arc", "GIT_AUTHOR_EMAIL=task@remotearc.local", "GIT_COMMITTER_NAME=Remote Arc", "GIT_COMMITTER_EMAIL=task@remotearc.local")
	b, e := cmd.CombinedOutput()
	if e != nil {
		return "", fmt.Errorf("goal workspace git: %s", strings.TrimSpace(string(b)))
	}
	if len(b) > 1000000 {
		return "", errors.New("Git response exceeds the workspace output limit.")
	}
	return strings.TrimSpace(string(b)), nil
}
func (m *Manager) Call(ctx context.Context, args map[string]any, p protocol.Policy) (map[string]any, error) {
	p = protocol.Normalize(p)
	m.mu.Lock()
	defer m.mu.Unlock()
	id := protocol.OptionalString(args, "task_id")
	op := protocol.OptionalString(args, "operation_id")
	action := protocol.OptionalString(args, "action")
	if !taskID.MatchString(id) || !operationID.MatchString(op) || (action != "create" && action != "capture" && action != "reject" && action != "status" && action != "fingerprint") {
		return nil, errors.New("Invalid goal workspace operation.")
	}
	root, e := policy.Enforce(protocol.OptionalString(args, "workspace"), p, true)
	if e != nil {
		return nil, e
	}
	canonical, e := filepath.EvalSymlinks(root)
	if e != nil {
		return nil, e
	}
	dir, e := policy.Enforce(filepath.Join(canonical, ".remotearc-goals", id), p, true)
	if e != nil {
		return nil, e
	}
	file := filepath.Join(dir, "state.json")
	var s state
	b, e := os.ReadFile(file)
	exists := e == nil
	if e != nil && !errors.Is(e, os.ErrNotExist) {
		return nil, e
	}
	if exists {
		if json.Unmarshal(b, &s) != nil || s.Version != 1 || s.TaskID != id || s.Root != canonical || s.Operations == nil {
			return nil, errors.New("Workspace ownership cannot be proven.")
		}
	}
	result := func() map[string]any {
		return map[string]any{"root": s.Root, "path": s.Path, "frontier": s.Frontier, "generation": s.Generation}
	}
	if r, ok := s.Operations[op]; exists && ok && action != "status" && action != "fingerprint" {
		return map[string]any{"root": r.Root, "path": r.Path, "frontier": r.Frontier, "generation": r.Generation}, nil
	}
	if !exists {
		if action != "create" {
			return nil, errors.New("No owned goal workspace. Update the device CLI if this tool is unavailable.")
		}
		top, e := git(ctx, canonical, "rev-parse", "--show-toplevel")
		if e != nil {
			return nil, e
		}
		top, e = policy.Canonical(top)
		if e != nil || top != root {
			return nil, errors.New("Quality isolation requires the repository root.")
		}
		status, e := git(ctx, canonical, "status", "--porcelain", "--", ".", ":!.remotearc-goals")
		if e != nil {
			return nil, e
		}
		if status != "" {
			return nil, errors.New("Quality baseline requires a clean checkout; preserve user edits before starting.")
		}
		frontier, e := git(ctx, canonical, "rev-parse", "HEAD")
		if e != nil {
			return nil, e
		}
		if e = os.MkdirAll(dir, 0700); e != nil {
			return nil, e
		}
		candidate, e := policy.Enforce(filepath.Join(dir, "candidate-0"), p, true)
		if e != nil {
			return nil, e
		}
		if _, e = git(ctx, canonical, "worktree", "add", "--detach", candidate, frontier); e != nil {
			return nil, e
		}
		s = state{Version: 1, TaskID: id, Root: canonical, Path: candidate, Frontier: frontier, Operations: map[string]Receipt{}}
	} else {
		expected, e := policy.Canonical(filepath.Join(dir, fmt.Sprintf("candidate-%d", s.Generation)))
		if e != nil {
			return nil, e
		}
		actual, e := policy.Canonical(s.Path)
		if e != nil || actual != expected || filepath.Clean(s.Path) != expected {
			return nil, errors.New("Candidate ownership path changed.")
		}
		if _, e = policy.Enforce(s.Path, p, true); e != nil {
			return nil, e
		}
		marker, e := os.Lstat(filepath.Join(s.Path, ".git"))
		if e != nil || !marker.Mode().IsRegular() {
			return nil, errors.New("Candidate Git identity changed.")
		}
		common, e := git(ctx, s.Path, "rev-parse", "--path-format=absolute", "--git-common-dir")
		if e != nil {
			return nil, e
		}
		original, e := git(ctx, canonical, "rev-parse", "--path-format=absolute", "--git-common-dir")
		if e != nil {
			return nil, e
		}
		a, e := policy.Canonical(common)
		if e != nil {
			return nil, e
		}
		b, e := policy.Canonical(original)
		if e != nil || a != b {
			return nil, errors.New("Candidate belongs to another repository.")
		}
		if action == "capture" || action == "reject" {
			if args["expected_frontier"] != s.Frontier {
				return nil, errors.New("Accepted checkpoint changed. Read context again.")
			}
		}
		if action == "capture" {
			if _, e = git(ctx, s.Path, "add", "-A", "--", "."); e != nil {
				return nil, e
			}
			tree, e := git(ctx, s.Path, "write-tree")
			if e != nil {
				return nil, e
			}
			if args["expected_tree"] != tree {
				return nil, errors.New("Candidate changed during validation; rerun checks before promoting.")
			}
			head, e := git(ctx, s.Path, "rev-parse", "HEAD")
			if e != nil {
				return nil, e
			}
			commit, e := git(ctx, s.Path, "commit-tree", tree, "-p", head, "-m", "Remote Arc accepted task checkpoint "+id)
			if e != nil {
				return nil, e
			}
			if _, e = git(ctx, s.Path, "update-ref", "HEAD", commit, head); e != nil {
				return nil, e
			}
			s.Frontier = commit
		}
		if action == "reject" {
			candidate, e := policy.Enforce(filepath.Join(dir, fmt.Sprintf("candidate-%d", s.Generation+1)), p, true)
			if e != nil {
				return nil, e
			}
			if _, e = git(ctx, canonical, "worktree", "add", "--detach", candidate, s.Frontier); e != nil {
				return nil, e
			}
			s.Generation++
			s.Path = candidate
		}
	}
	if action == "fingerprint" {
		if _, e = git(ctx, s.Path, "add", "-A", "--", "."); e != nil {
			return nil, e
		}
		tree, e := git(ctx, s.Path, "write-tree")
		if e != nil {
			return nil, e
		}
		r := result()
		r["tree"] = tree
		return r, nil
	}
	s.Operations[op] = Receipt{Root: s.Root, Path: s.Path, Frontier: s.Frontier, Generation: s.Generation}
	if len(s.Operations) > 256 {
		keys := []string{}
		for k := range s.Operations {
			if k != op {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		for _, k := range keys[:len(s.Operations)-256] {
			delete(s.Operations, k)
		}
	}
	b, _ = json.Marshal(s)
	if e = config.DurableWrite(file, b, 0600); e != nil {
		return nil, e
	}
	r := result()
	if action == "status" {
		status, e := git(ctx, s.Path, "status", "--porcelain")
		if e != nil {
			return nil, e
		}
		if len(status) > 6000 {
			status = status[:6000]
		}
		r["git_status"] = status
	}
	return r, nil
}
