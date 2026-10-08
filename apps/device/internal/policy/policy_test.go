package policy

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/yaohuangguan/remote-arc/apps/device/internal/protocol"
)

func TestRootsSensitiveExceptionsAndTaskBoundary(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	root := filepath.Join(home, "work")
	os.MkdirAll(root, 0700)
	p := protocol.Policy{WorkspaceRoots: []string{root}}
	if _, e := Enforce(filepath.Join(root, "new", "file.txt"), p, true); e != nil {
		t.Fatal(e)
	}
	outside := filepath.Join(home, "work-escape", "file.txt")
	if _, e := Enforce(outside, p, true); e == nil {
		t.Fatal("prefix escape accepted")
	}
	if _, e := Enforce(outside, p, false); e != nil {
		t.Fatal("ordinary reads should not be capped by write roots")
	}
	for _, s := range []string{".env", ".env.local", ".npmrc", "credentials", "id_ed25519"} {
		if _, e := Enforce(filepath.Join(root, s), p, false); e == nil {
			t.Fatalf("sensitive path %s accepted", s)
		}
	}
	p.SensitiveAllowPaths = []string{filepath.Join(root, ".env")}
	if _, e := Enforce(filepath.Join(root, ".env"), p, false); e != nil {
		t.Fatal(e)
	}
	if _, e := Enforce(filepath.Join(root, ".env.other"), p, false); e == nil {
		t.Fatal("narrow exception broadened")
	}
	p.TaskWorkspaceRoot = filepath.Join(root, "candidate")
	if _, e := Enforce(filepath.Join(root, "other.txt"), p, false); e == nil {
		t.Fatal("task read escaped candidate")
	}
	for _, s := range []string{"~", "$HOME", "%USERPROFILE%"} {
		if Expand(s) != home {
			t.Fatalf("home expansion %s", s)
		}
	}
}
func TestSymlinkEscapeAndMissingDescendants(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "root")
	outside := filepath.Join(dir, "outside")
	os.Mkdir(root, 0700)
	os.Mkdir(outside, 0700)
	link := filepath.Join(root, "link")
	if e := os.Symlink(outside, link); e != nil {
		t.Skip("symlink permission unavailable:", e)
	}
	if _, e := Enforce(filepath.Join(link, "missing", "file"), protocol.Policy{WorkspaceRoots: []string{root}}, true); e == nil {
		t.Fatal("symlink escape accepted")
	}
}
