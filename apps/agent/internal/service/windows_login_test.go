package service

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestWindowsLoginSilentScriptPreservesSpacesAndQuotes(t *testing.T) {
	bin := `C:\Users\Sam O'Neill\Coding Files\remotelink.exe`
	script := windowsStartupScript(bin)
	for _, piece := range []string{`CreateObject("WScript.Shell")`, `Chr(34) & "`, bin, ` --supervise", 0, False`} {
		if !strings.Contains(script, piece) {
			t.Fatalf("missing startup behavior %q in %q", piece, script)
		}
	}
	if strings.Contains(script, "cmd.exe") || strings.Contains(script, "powershell.exe") {
		t.Fatal("interactive shell must not be used")
	}
}

func TestWindowsLegacyConsoleRunMigratesToHiddenLauncherWithoutRestartingOwner(t *testing.T) {
	dir := t.TempDir()
	c := &Controller{Home: dir, Platform: "windows", Executable: filepath.Join(dir, "source.exe"), Version: "test", Wait: func(time.Duration) {}}
	if e := os.MkdirAll(c.dir(), 0700); e != nil {
		t.Fatal(e)
	}
	binary := filepath.Join(c.dir(), "bin", "go-test", "remotelink.exe")
	if e := os.MkdirAll(filepath.Dir(binary), 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(binary, []byte("native-agent"), 0700); e != nil {
		t.Fatal(e)
	}
	b, _ := json.Marshal(Registration{Engine: "go", Binary: binary, Version: "test"})
	if e := os.WriteFile(c.marker(), b, 0600); e != nil {
		t.Fatal(e)
	}
	registryValue := `"` + binary + `" --supervise`
	var called []string
	c.Run = func(ctx context.Context, name string, args ...string) (string, error) {
		line := name + " " + strings.Join(args, " ")
		called = append(called, line)
		if name == "reg.exe" && len(args) > 0 {
			if args[0] == "query" {
				return registryValue, nil
			}
			if args[0] == "add" {
				for i := 0; i < len(args); i++ {
					if args[i] == "/d" && i+1 < len(args) {
						registryValue = args[i+1]
					}
				}
				return "", nil
			}
		}
		if strings.Contains(line, "Get-CimInstance") {
			return "123", nil
		}
		return "", nil
	}
	if c.Foreign(context.Background()) {
		t.Fatal("legacy owned Run must not be mistaken for another application")
	}
	before := c.Status(context.Background())
	if before.Enabled || !before.Active {
		t.Fatalf("legacy console must trigger migration: %+v", before)
	}
	status, e := c.Enable(context.Background())
	if e != nil || !status.Enabled || !status.Active {
		t.Fatalf("enable migrated: %+v %v", status, e)
	}
	if !strings.Contains(strings.ToLower(registryValue), "wscript.exe") || strings.Contains(registryValue, binary) {
		t.Fatalf("Run key still opens a console: %q", registryValue)
	}
	if !c.installedWindowsStartupScript(binary) {
		t.Fatal("expected script not installed")
	}
	for _, line := range called {
		if strings.HasPrefix(line, "wscript.exe") || strings.Contains(line, "Start-Process") {
			t.Fatalf("live owner restarted during startup migration: %s", line)
		}
	}
	if c.Foreign(context.Background()) {
		t.Fatal("new silent launcher must be recognized as owned")
	}
}
