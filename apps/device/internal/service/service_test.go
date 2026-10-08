package service

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNativeServiceInstallationIdempotencyAndDisablePreservesWorker(t *testing.T) {
	for _, platform := range []string{"windows", "darwin", "linux"} {
		t.Run(platform, func(t *testing.T) {
			dir := t.TempDir()
			source := filepath.Join(dir, "source")
			os.WriteFile(source, []byte("binary-fixture"), 0700)
			c := &Controller{Home: dir, Platform: platform, Executable: source, Version: "test", UID: "501", Wait: func(time.Duration) {}}
			var calls []string
			disabled := false
			c.Run = func(ctx context.Context, name string, args ...string) (string, error) {
				line := name + " " + strings.Join(args, " ")
				calls = append(calls, line)
				switch {
				case strings.Contains(line, "reg.exe query"):
					r, e := c.read()
					if e != nil || disabled {
						return "", errors.New("absent")
					}
					return r.Binary, nil
				case strings.Contains(line, "reg.exe delete"), strings.Contains(line, "launchctl disable"), strings.Contains(line, "systemctl --user disable"):
					disabled = true
				case strings.Contains(line, "reg.exe add"), strings.Contains(line, "launchctl enable"), strings.Contains(line, "systemctl --user enable"):
					disabled = false
				case strings.Contains(line, "Get-CimInstance"):
					return "101", nil
				case strings.Contains(line, "is-enabled"):
					if disabled {
						return "disabled", errors.New("disabled")
					}
					return "enabled", nil
				case strings.Contains(line, "--property=MainPID"):
					return "101", nil
				case strings.Contains(line, "print-disabled"):
					if disabled {
						return `"app.remotearc.agent" => true`, nil
					}
					return "", nil
				case strings.Contains(line, "launchctl print "):
					return "pid = 101", nil
				}
				return "", nil
			}
			s, e := c.Enable(context.Background())
			if e != nil || !s.Enabled || !s.Active {
				t.Fatalf("enable %v %v", s, e)
			}
			r, e := c.read()
			if e != nil {
				t.Fatal(e)
			}
			bytes, _ := os.ReadFile(r.Binary)
			if string(bytes) != "binary-fixture" || r.Engine != "go" {
				t.Fatal("binary was not persisted")
			}
			calls = nil
			if _, e = c.Enable(context.Background()); e != nil {
				t.Fatal(e)
			}
			for _, line := range calls {
				if strings.Contains(line, "Start-Process") || strings.Contains(line, "bootstrap") || strings.Contains(line, "enable --now") {
					t.Fatal("healthy service restarted")
				}
			}
			calls = nil
			if e = c.Disable(context.Background()); e != nil {
				t.Fatal(e)
			}
			for _, line := range calls {
				if strings.Contains(line, "taskkill") || strings.Contains(line, "bootout") || strings.Contains(line, "systemctl --user stop") {
					t.Fatal("disable killed current worker")
				}
			}
			if s := c.Status(context.Background()); s.Enabled || !s.Active {
				t.Fatal("disabled recovery must still report its live worker")
			}
			calls = nil
			if s, e := c.Enable(context.Background()); e != nil || !s.Enabled || !s.Active {
				t.Fatal("re-enable failed", e)
			}
			for _, line := range calls {
				if strings.Contains(line, "bootout") || strings.Contains(line, "Start-Process") || strings.Contains(line, "bootstrap") || strings.Contains(line, "enable --now") {
					t.Fatal("re-enable restarted active execution")
				}
			}
		})
	}
}
func TestForeignTSRegistrationIsNotOverwritten(t *testing.T) {
	dir := t.TempDir()
	c := &Controller{Home: dir, Platform: "linux", Version: "test", Run: func(context.Context, string, ...string) (string, error) { return "", errors.New("absent") }}
	os.MkdirAll(filepath.Dir(c.serviceFile()), 0700)
	original := []byte("ExecStart=node old-ts-agent.js")
	os.WriteFile(c.serviceFile(), original, 0600)
	if _, e := c.Enable(context.Background()); e == nil {
		t.Fatal("foreign service overwritten")
	}
	b, _ := os.ReadFile(c.serviceFile())
	if string(b) != string(original) {
		t.Fatal("TS service changed")
	}
}
