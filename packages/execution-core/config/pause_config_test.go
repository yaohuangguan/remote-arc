package config

import "testing"

func TestPauseFlagCanBeClearedDespitePreservedUnknownFields(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	enabled := true
	cfg := Config{DeviceID: "d", DeviceToken: "secret", Origin: "https://example.com", BackgroundEnabled: &enabled}
	if e := Save(cfg); e != nil {
		t.Fatal(e)
	}
	cfg.ExecutionPaused = true
	if e := Save(cfg); e != nil {
		t.Fatal(e)
	}
	loaded, e := Load()
	if e != nil || !loaded.ExecutionPaused {
		t.Fatal("pause must persist")
	}
	loaded.ExecutionPaused = false
	if e := Save(loaded); e != nil {
		t.Fatal(e)
	}
	fresh, e := Load()
	if e != nil || fresh.ExecutionPaused {
		t.Fatal("resuming must delete stale pause key from the unknown-field snapshot")
	}
	if fresh.BackgroundEnabled == nil || !*fresh.BackgroundEnabled {
		t.Fatal("resume must not disable recovery")
	}
}
