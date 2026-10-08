package workspace

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/protocol"
)

func repository(t *testing.T) string {
	t.Helper()
	if _, e := exec.LookPath("git"); e != nil {
		t.Fatal("git is required for workspace acceptance tests")
	}
	dir := t.TempDir()
	ctx := context.Background()
	if _, e := git(ctx, dir, "init"); e != nil {
		t.Fatal(e)
	}
	os.WriteFile(filepath.Join(dir, "fixture.txt"), []byte("baseline"), 0600)
	git(ctx, dir, "add", ".")
	if _, e := git(ctx, dir, "commit", "-m", "baseline"); e != nil {
		t.Fatal(e)
	}
	return dir
}
func TestFrozenCheckpointsReceiptsAndRejectedCandidatePreservesUserCheckout(t *testing.T) {
	dir := repository(t)
	ctx := context.Background()
	m := &Manager{}
	p := protocol.Policy{WorkspaceRoots: []string{dir}}
	head, _ := git(ctx, dir, "rev-parse", "HEAD")
	request := func(action, op string, extra map[string]any) (map[string]any, error) {
		a := map[string]any{"workspace": dir, "task_id": "test", "operation_id": op, "action": action}
		for k, v := range extra {
			a[k] = v
		}
		return m.Call(ctx, a, p)
	}
	created, e := request("create", "create", nil)
	if e != nil {
		t.Fatal(e)
	}
	again, e := request("create", "create", nil)
	if e != nil || again["path"] != created["path"] {
		t.Fatal("create receipt not idempotent", e)
	}
	candidate := created["path"].(string)
	os.WriteFile(filepath.Join(candidate, "fixture.txt"), []byte("accepted"), 0600)
	fingerprint, e := request("fingerprint", "fingerprint", nil)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = request("capture", "wrong", map[string]any{"expected_frontier": created["frontier"], "expected_tree": "wrong"}); e == nil {
		t.Fatal("unvalidated tree promoted")
	}
	accepted, e := request("capture", "accept", map[string]any{"expected_frontier": created["frontier"], "expected_tree": fingerprint["tree"]})
	if e != nil || accepted["frontier"] == head {
		t.Fatal("capture failed", e)
	}
	replay, e := request("capture", "accept", nil)
	if e != nil || replay["frontier"] != accepted["frontier"] {
		t.Fatal("capture replay not idempotent", e)
	}
	os.WriteFile(filepath.Join(candidate, "fixture.txt"), []byte("rejected"), 0600)
	if _, e = request("reject", "stale", map[string]any{"expected_frontier": head}); e == nil {
		t.Fatal("stale frontier accepted")
	}
	rejected, e := request("reject", "reject", map[string]any{"expected_frontier": accepted["frontier"]})
	if e != nil || rejected["path"] == candidate {
		t.Fatal("reject failed", e)
	}
	b, _ := os.ReadFile(filepath.Join(rejected["path"].(string), "fixture.txt"))
	if string(b) != "accepted" {
		t.Fatal("accepted frontier was not preserved")
	}
	b, _ = os.ReadFile(filepath.Join(candidate, "fixture.txt"))
	if string(b) != "rejected" {
		t.Fatal("rejected work was destructively reset")
	}
	current, _ := git(ctx, dir, "rev-parse", "HEAD")
	b, _ = os.ReadFile(filepath.Join(dir, "fixture.txt"))
	if current != head || string(b) != "baseline" {
		t.Fatal("user checkout changed")
	}
}
func TestDirtyRootAndCandidateOwnershipFailClosed(t *testing.T) {
	dir := repository(t)
	m := &Manager{}
	args := map[string]any{"workspace": dir, "task_id": "test", "operation_id": "create", "action": "create"}
	os.WriteFile(filepath.Join(dir, "fixture.txt"), []byte("user edits"), 0600)
	if _, e := m.Call(context.Background(), args, protocol.Policy{}); e == nil {
		t.Fatal("dirty baseline accepted")
	}
	os.WriteFile(filepath.Join(dir, "fixture.txt"), []byte("baseline"), 0600)
	r, e := m.Call(context.Background(), args, protocol.Policy{})
	if e != nil {
		t.Fatal(e)
	}
	os.Remove(filepath.Join(r["path"].(string), ".git"))
	args["action"] = "status"
	args["operation_id"] = "status"
	if _, e = m.Call(context.Background(), args, protocol.Policy{}); e == nil {
		t.Fatal("unowned candidate accepted")
	}
}
