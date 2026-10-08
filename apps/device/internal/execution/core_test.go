package execution

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/apps/device/internal/protocol"
)

func call(t *testing.T, c *Core, name string, args map[string]any, p protocol.Policy) protocol.Result {
	t.Helper()
	r, e := c.Call(context.Background(), name, args, p)
	if e != nil {
		t.Fatalf("%s: %v", name, e)
	}
	return r
}
func payload(t *testing.T, r protocol.Result) map[string]any {
	t.Helper()
	var v map[string]any
	if e := json.Unmarshal([]byte(r.Content[0].Text), &v); e != nil {
		t.Fatal(e)
	}
	return v
}
func TestModesGuardAndScopedMutation(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	t.Setenv("REMOTEARC_ALLOW_DESTRUCTIVE", "")
	for mode, count := range map[string]int{"safe": 7, "developer": 11, "managed": 16, "full": 16} {
		c := New(mode)
		if len(c.ListTools()) != count {
			t.Fatalf("mode %s", mode)
		}
		c.Close()
	}
	safe := New("safe")
	defer safe.Close()
	path := filepath.Join(dir, "test.txt")
	if _, e := safe.Call(context.Background(), "write_file", map[string]any{"path": path, "content": "bad"}, protocol.Policy{}); e == nil {
		t.Fatal("safe allowed mutation")
	}
	for _, command := range []string{"rm -rf /", "dd if=data of=/dev/sda", "shutdown /s", "mkfs.ext4 /dev/sda", "diskutil eraseDisk x y z"} {
		if AssertCommandAllowed(command) == nil {
			t.Fatalf("guard allowed %s", command)
		}
	}
	c := New("managed")
	defer c.Close()
	root := filepath.Join(dir, "trusted")
	os.Mkdir(root, 0700)
	p := protocol.Policy{WorkspaceRoots: []string{root}}
	if _, e := c.Call(context.Background(), "write_file", map[string]any{"path": path, "content": "bad"}, p); e == nil {
		t.Fatal("write escaped roots")
	}
	if _, e := c.Call(context.Background(), "start_process", map[string]any{"command": "echo allowed"}, p); e == nil {
		t.Fatal("command missing cwd allowed")
	}
	if _, e := c.Call(context.Background(), "read_file", map[string]any{"path": filepath.Join(root, ".env")}, p); e == nil {
		t.Fatal("sensitive read allowed")
	}
}
func TestTextBinaryMetadataAndUndoConflicts(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	c := New("managed")
	defer c.Close()
	p := protocol.Policy{}
	path := filepath.Join(dir, "text.txt")
	r := payload(t, call(t, c, "write_file", map[string]any{"path": path, "content": "a\nb\nc"}, p))
	if r["undo_available"] != true {
		t.Fatal("new-file undo unavailable")
	}
	text := call(t, c, "read_file", map[string]any{"path": path, "offset": -2, "length": 1}, p).Content[0].Text
	if !strings.HasSuffix(text, "b") {
		t.Fatal(text)
	}
	info := payload(t, call(t, c, "get_file_info", map[string]any{"path": path}, p))
	if info["size"] != float64(5) || info["type"] != "file" || info["modified_at"] == "" {
		t.Fatal(info)
	}
	call(t, c, "undo_last_change", nil, p)
	if _, e := os.Stat(path); !os.IsNotExist(e) {
		t.Fatal("new file was not removed by undo")
	}
	os.WriteFile(path, []byte("old old"), 0600)
	if _, e := c.Call(context.Background(), "edit_block", map[string]any{"file_path": path, "old_string": "old", "new_string": "new", "expected_replacements": 1}, p); e == nil {
		t.Fatal("ambiguous edit accepted")
	}
	actions, _ := listUndo(100)
	if len(actions) != 0 {
		t.Fatal("failed edit left an undo receipt")
	}
	call(t, c, "edit_block", map[string]any{"file_path": path, "old_string": "old", "new_string": "new", "expected_replacements": 2}, p)
	actions, _ = listUndo(100)
	id := actions[0]["id"].(string)
	os.WriteFile(path, []byte("user changes"), 0600)
	if _, e := c.Call(context.Background(), "undo_change", map[string]any{"action_id": id}, p); e == nil {
		t.Fatal("undo overwrote newer work")
	}
	os.WriteFile(path, []byte("new new"), 0600)
	call(t, c, "undo_change", map[string]any{"action_id": id}, p)
	b, _ := os.ReadFile(path)
	if string(b) != "old old" {
		t.Fatal("original content not restored")
	}
	binary := filepath.Join(dir, "binary.dat")
	os.WriteFile(binary, []byte{0, 1, 2, 3, 4}, 0600)
	if _, e := c.Call(context.Background(), "read_file", map[string]any{"path": binary}, p); e == nil {
		t.Fatal("binary accepted as text")
	}
	chunk := payload(t, call(t, c, "read_binary_file", map[string]any{"path": binary, "offset": 1, "length": 2}, p))
	decoded, e := base64.StdEncoding.DecodeString(chunk["data"].(string))
	if e != nil || string(decoded) != string([]byte{1, 2}) {
		t.Fatal("binary chunk incorrect")
	}
	os.WriteFile(binary, []byte{0, 1, 2, 3, 4, 5}, 0600)
	if _, e := c.Call(context.Background(), "read_binary_file", map[string]any{"path": binary, "expected_revision": chunk["file_revision"]}, p); e == nil {
		t.Fatal("changed binary revision accepted")
	}
}
func TestListingHidesSensitiveAndTaskEscapes(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	os.Mkdir(filepath.Join(dir, "child"), 0700)
	os.WriteFile(filepath.Join(dir, ".env"), []byte("secret"), 0600)
	os.WriteFile(filepath.Join(dir, "visible.txt"), nil, 0600)
	c := New("safe")
	defer c.Close()
	r := call(t, c, "list_directory", map[string]any{"path": dir}, protocol.Policy{}).Content[0].Text
	if strings.Contains(r, ".env") || !strings.Contains(r, "visible.txt") || !strings.Contains(r, "omitted 1") {
		t.Fatal(r)
	}
	if _, e := c.Call(context.Background(), "read_file", map[string]any{"path": filepath.Join(dir, "visible.txt")}, protocol.Policy{TaskWorkspaceRoot: filepath.Join(dir, "child")}); e == nil {
		t.Fatal("task read escaped")
	}
	no := false
	call(t, c, "read_file", map[string]any{"path": filepath.Join(dir, ".env")}, protocol.Policy{ProtectSensitivePaths: &no})
}
