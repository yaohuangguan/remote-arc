package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLegacyAndUnknownFields(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	legacy := filepath.Join(home, ".remote-link", "config.json")
	if e := AtomicWrite(legacy, []byte(`{"deviceId":"d","deviceToken":"secret","deviceName":"test","origin":"https://mcp.remotearc.app","future":{"v":1}}`), 0600); e != nil {
		t.Fatal(e)
	}
	c, e := Load()
	if e != nil || c.Mode != "managed" {
		t.Fatalf("legacy load: %v", e)
	}
	off := false
	c.BackgroundEnabled = &off
	if e = Save(c); e != nil {
		t.Fatal(e)
	}
	loaded, e := Load()
	if e != nil || loaded.BackgroundEnabled == nil || *loaded.BackgroundEnabled {
		t.Fatal("false recovery flag was lost")
	}
	var future map[string]any
	if json.Unmarshal(loaded.Extra["future"], &future) != nil || future["v"] != float64(1) {
		t.Fatal("unknown config fields were lost")
	}
	if e = Reset(); e != nil {
		t.Fatal(e)
	}
	if _, e = os.Stat(legacy); !os.IsNotExist(e) {
		t.Fatal("legacy pairing survives reset")
	}
}
func TestAtomicReplacementAndInvalidConfiguration(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "nested", "config.json")
	for _, b := range []string{"old", "new"} {
		if e := AtomicWrite(p, []byte(b), 0600); e != nil {
			t.Fatal(e)
		}
	}
	b, _ := os.ReadFile(p)
	if string(b) != "new" {
		t.Fatal("replacement failed")
	}
	es, _ := os.ReadDir(filepath.Dir(p))
	if len(es) != 1 {
		t.Fatal("temporary files leaked")
	}
	if e := AtomicWrite(filepath.Join(dir, "config.json"), []byte(`{"deviceId":"d"}`), 0600); e != nil {
		t.Fatal(e)
	}
	if _, e := LoadAt(dir); e == nil {
		t.Fatal("accepted incomplete credentials")
	}
}
