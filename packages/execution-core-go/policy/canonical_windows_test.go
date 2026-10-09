package policy

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/protocol"
)

func TestWindowsFinalPathMatchesExistingResolver(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "Mixed Case Space")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "hello.txt")
	if err := os.WriteFile(file, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{root, dir, file, strings.ToUpper(file), `\\?\` + file} {
		want, err := filepath.EvalSymlinks(path)
		if err != nil {
			t.Fatal(err)
		}
		want = strings.TrimPrefix(want, `\\?\`)
		got, err := canonicalExisting(path)
		if err != nil || !strings.EqualFold(got, want) {
			t.Fatalf("%q: got %q (%v), want %q", path, got, err, want)
		}
	}
	got, err := Canonical(filepath.Join(dir, "new", "missing.txt"))
	realDir, resolveErr := filepath.EvalSymlinks(dir)
	if resolveErr != nil {
		t.Fatal(resolveErr)
	}
	want := strings.ToLower(filepath.Join(realDir, "new", "missing.txt"))
	if err != nil || got != want {
		t.Fatalf("missing descendants: %q (%v), want %q", got, err, want)
	}
}

func TestWindowsJunctionEscapeSensitiveRootAndRetarget(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	root := filepath.Join(home, "work")
	outside := filepath.Join(home, "outside")
	for _, dir := range []string{root, outside} {
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	link := filepath.Join(root, "junction")
	junction := func(path, target string) {
		t.Helper()
		cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", `New-Item -ItemType Junction -Path $env:RA_TEST_JUNCTION -Target $env:RA_TEST_TARGET | Out-Null`)
		cmd.Env = append(os.Environ(), "RA_TEST_JUNCTION="+path, "RA_TEST_TARGET="+target)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("junction: %v: %s", err, out)
		}
	}
	junction(link, outside)
	p := protocol.Policy{WorkspaceRoots: []string{root}}
	if _, err := Enforce(filepath.Join(link, "new", "file.txt"), p, true); err == nil {
		t.Fatal("junction write escaped root")
	}
	if err := os.Remove(link); err != nil {
		t.Fatal(err)
	}
	junction(link, root)
	if _, err := Enforce(filepath.Join(link, "new", "file.txt"), p, true); err != nil {
		t.Fatal("fresh junction target ignored:", err)
	}
	if err := os.Remove(link); err != nil {
		t.Fatal(err)
	}
	junction(link, outside)
	if _, err := Enforce(filepath.Join(link, "new", "file.txt"), p, true); err == nil {
		t.Fatal("retargeted junction used stale path")
	}
	if err := os.Remove(link); err != nil {
		t.Fatal(err)
	}
	// The protected root itself can be an alias for another directory.
	sensitive := filepath.Join(home, ".aws")
	junction(sensitive, outside)
	defer os.Remove(sensitive)
	if _, err := Enforce(filepath.Join(outside, "credentials.txt"), p, false); err == nil {
		t.Fatal("protected junction alias was ignored")
	}
	p.SensitiveAllowPaths = []string{filepath.Join(outside, "credentials.txt")}
	if _, err := Enforce(filepath.Join(outside, "credentials.txt"), p, false); err != nil {
		t.Fatal("narrow exception refused:", err)
	}
	if _, err := Enforce(filepath.Join(outside, "other.txt"), p, false); err == nil {
		t.Fatal("narrow exception broadened")
	}
}

func TestWindowsLongFinalPathAndAlternateStreamCompatibility(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 12; i++ {
		dir = filepath.Join(dir, "long-directory-component-abcdefghijklmnopqrstuvwxyz")
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "hello.txt")
	if err := os.WriteFile(file, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	want, err := filepath.EvalSymlinks(file)
	if err != nil {
		t.Fatal(err)
	}
	got, err := canonicalExisting(`\\?\` + file)
	if err != nil || !strings.EqualFold(got, want) {
		t.Fatalf("long resolved path: %q (%v), want %q", got, err, want)
	}
	stream := file + ":probe"
	if err := os.WriteFile(stream, []byte("stream"), 0600); err != nil {
		t.Fatal(err)
	}
	want, wantErr := filepath.EvalSymlinks(stream)
	got, err = canonicalExisting(stream)
	if (err == nil) != (wantErr == nil) || !strings.EqualFold(got, want) {
		t.Fatalf("alternate stream changed resolution: %q (%v), want %q (%v)", got, err, want, wantErr)
	}
}
