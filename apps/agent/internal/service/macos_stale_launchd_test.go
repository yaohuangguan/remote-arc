package service

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestMacStaleLoadedNodeJobReplacedOnlyWhenIdle(t *testing.T) {
	ctx := context.Background()
	home := t.TempDir()
	source := filepath.Join(home, "source-go")
	if e := os.WriteFile(source, []byte("go-test-binary"), 0700); e != nil {
		t.Fatal(e)
	}
	c := &Controller{Home: home, Platform: "darwin", Executable: source, Version: "0.6.1-test", UID: "501", Wait: func(time.Duration) {}}
	reg, e := c.installBinary()
	if e != nil {
		t.Fatal(e)
	}
	if e = os.MkdirAll(filepath.Dir(c.serviceFile()), 0700); e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile(c.serviceFile(), []byte("<string>"+reg.Binary+"</string>"), 0600); e != nil {
		t.Fatal(e)
	}
	loadedProgram := "/usr/local/bin/node"
	running := false
	var calls []string
	c.Run = func(_ context.Context, name string, args ...string) (string, error) {
		line := name + " " + strings.Join(args, " ")
		calls = append(calls, line)
		switch {
		case strings.Contains(line, "launchctl print-disabled"):
			return "", nil
		case strings.Contains(line, "launchctl print "):
			if loadedProgram == "" {
				return "", os.ErrNotExist
			}
			if running {
				return "program = " + loadedProgram + "\npid = 323\n", nil
			}
			return "program = " + loadedProgram + "\nstate = not running\n", nil
		case strings.Contains(line, "launchctl bootout"):
			if running {
				t.Fatal("must not boot out an active foreign job")
			}
			loadedProgram = ""
			return "", nil
		case strings.Contains(line, "launchctl bootstrap"):
			if loadedProgram != "" {
				t.Fatal("bootstrap called while stale launchd label still loaded")
			}
			loadedProgram = reg.Binary
			running = true
			return "", nil
		default:
			return "", nil
		}
	}
	status, e := c.Enable(ctx)
	if e != nil || !status.Enabled || !status.Active {
		t.Fatalf("failed to migrate idle old launchd job: %+v %v", status, e)
	}
	bootout, bootstrap := 0, 0
	for _, call := range calls {
		if strings.Contains(call, "launchctl bootout") {
			bootout++
		}
		if strings.Contains(call, "launchctl bootstrap") {
			bootstrap++
		}
	}
	if bootout != 1 || bootstrap != 1 {
		t.Fatalf("expected exactly one bootout followed by bootstrap: %v", calls)
	}
	calls = nil
	_, e = c.Enable(ctx)
	if e != nil {
		t.Fatal(e)
	}
	for _, call := range calls {
		if strings.Contains(call, "launchctl bootout") || strings.Contains(call, "launchctl bootstrap") {
			t.Fatal("healthy current Go job restarted", call)
		}
	}
}
func TestMacActiveForeignLaunchdJobFailsClosed(t *testing.T) {
	ctx := context.Background()
	home := t.TempDir()
	source := filepath.Join(home, "source-go")
	if e := os.WriteFile(source, []byte("go-test-binary"), 0700); e != nil {
		t.Fatal(e)
	}
	c := &Controller{Home: home, Platform: "darwin", Executable: source, Version: "0.6.1-test", UID: "501"}
	reg, e := c.installBinary()
	if e != nil {
		t.Fatal(e)
	}
	if e = os.MkdirAll(filepath.Dir(c.serviceFile()), 0700); e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile(c.serviceFile(), []byte("<string>"+reg.Binary+"</string>"), 0600); e != nil {
		t.Fatal(e)
	}
	var called []string
	c.Run = func(_ context.Context, name string, args ...string) (string, error) {
		line := name + " " + strings.Join(args, " ")
		called = append(called, line)
		if strings.Contains(line, "launchctl print ") {
			return "program = /usr/local/bin/node\npid = 777\n", nil
		}
		return "", nil
	}
	_, e = c.Enable(ctx)
	if e == nil || !strings.Contains(e.Error(), "Stop that Agent") {
		t.Fatalf("foreign active job should block takeover: %v", e)
	}
	for _, line := range called {
		if strings.Contains(line, "launchctl bootout") || strings.Contains(line, "launchctl bootstrap") {
			t.Fatal("foreign agent modified", line)
		}
	}
}
