package agent

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

type activeBackground struct{}

func (activeBackground) Status(context.Context) service.Status {
	return service.Status{Supported: true, Enabled: true, Active: true, Service: "test"}
}
func (activeBackground) Enable(ctx context.Context) (service.Status, error) {
	return activeBackground{}.Status(ctx), nil
}
func (activeBackground) Disable(context.Context) error { return nil }

func TestPauseResumeAndFullDisconnectKeepWakeChannelInert(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	yes := true
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "secret", Origin: "https://example.com", Mode: "managed", BackgroundEnabled: &yes}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	a := New(cfg, "0.6.1-rc.5", false, nil)
	a.Background = activeBackground{}
	stop := make(chan bool, 3)
	a.Stop = func() { stop <- true }
	pause := protocol.Call{Tool: "set_device_runtime", Arguments: map[string]any{"paused": true}}
	got, e := a.dispatch(context.Background(), pause, nil)
	if e != nil || got.(map[string]any)["paused"] != true {
		t.Fatalf("pause %v %v", got, e)
	}
	saved, e := config.Load()
	if e != nil || !saved.ExecutionPaused || saved.BackgroundEnabled == nil || !*saved.BackgroundEnabled {
		t.Fatalf("pause did not durably preserve wake enabled: %+v %v", saved, e)
	}
	if _, e = a.dispatch(context.Background(), protocol.Call{Tool: "read_file", Arguments: map[string]any{"path": "/tmp/test"}}, nil); e == nil || !strings.Contains(e.Error(), "paused") {
		t.Fatalf("execution permitted during transition: %v", e)
	}
	select {
	case <-stop:
	case <-time.After(2 * time.Second):
		t.Fatal("executor did not yield")
	}
	a.Core.Close()

	wake := NewWake(saved, "0.6.1-rc.5", nil)
	if wake.Core != nil || !wake.WakeOnly {
		t.Fatal("wake worker loads execution core")
	}
	wake.Background = activeBackground{}
	wake.Stop = func() { stop <- true }
	hello := wake.hello(context.Background())
	device := hello["device"].(map[string]any)
	if device["executionPaused"] != true {
		t.Fatal("wake hello did not mark pause")
	}
	tools := hello["tools"].([]string)
	for _, tool := range tools {
		if tool == "read_file" || tool == "start_process" || tool == "write_file" {
			t.Fatalf("execution tool exposed: %s", tool)
		}
	}
	if _, e = wake.dispatch(context.Background(), protocol.Call{Tool: "list_directory", Arguments: map[string]any{"path": "/"}}, nil); e == nil || !strings.Contains(e.Error(), "paused") {
		t.Fatalf("wake allowed execution: %v", e)
	}

	got, e = wake.dispatch(context.Background(), protocol.Call{Tool: "set_device_runtime", Arguments: map[string]any{"paused": false}}, nil)
	if e != nil || got.(map[string]any)["paused"] != false {
		t.Fatalf("resume %v %v", got, e)
	}
	saved, e = config.Load()
	if e != nil || saved.ExecutionPaused {
		t.Fatal("resume not persisted")
	}
	if _, e = wake.dispatch(context.Background(), protocol.Call{Tool: "read_file", Arguments: map[string]any{"path": "/tmp/test"}}, nil); e == nil {
		t.Fatal("wake worker started executing without replacement")
	}
	select {
	case <-stop:
	case <-time.After(2 * time.Second):
		t.Fatal("wake-only connection did not yield")
	}
	// A supervisor replacement now loads execution.New() from durable status.
	running := New(saved, "0.6.1-rc.5", true, nil)
	if running.Core == nil || running.cfg().ExecutionPaused {
		t.Fatal("new runtime failed to resume execution")
	}
	running.Core.Close()

	saved.ExecutionPaused = true
	if e = config.Save(saved); e != nil {
		t.Fatal(e)
	}
	wake = NewWake(saved, "0.6.1-rc.5", nil)
	wake.Background = activeBackground{}
	wake.Stop = func() { stop <- true }
	result, e := wake.dispatch(context.Background(), protocol.Call{Tool: "set_background_agent", Arguments: map[string]any{"enabled": false, "stop_current": true}}, nil)
	if e != nil || result.(map[string]any)["desired_enabled"] != false {
		t.Fatalf("disconnect %v %v", result, e)
	}
	saved, e = config.Load()
	if e != nil || saved.ExecutionPaused || saved.BackgroundEnabled == nil || *saved.BackgroundEnabled {
		t.Fatal("full disconnect did not clear wake and recovery")
	}
	select {
	case <-stop:
	case <-time.After(2 * time.Second):
		t.Fatal("wake-only channel did not stop")
	}
}
func TestPauseRefusedWithoutLiveWakeSupervisor(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	yes := true
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "secret", Origin: "https://example.com", BackgroundEnabled: &yes}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	a := New(cfg, "0.6.1-rc.5", false, nil)
	a.Background = fakeBackground{} // status reports enabled/active=false
	a.Stop = func() {}
	defer a.Core.Close()
	_, e := a.dispatch(context.Background(), protocol.Call{Tool: "set_device_runtime", Arguments: map[string]any{"paused": true}}, nil)
	if e == nil || !strings.Contains(e.Error(), "requires an active background wake supervisor") {
		t.Fatalf("unsupervised pause allowed: %v", e)
	}
	saved, _ := config.Load()
	if saved.ExecutionPaused {
		t.Fatal("failed pause modified durable state")
	}
	_, e = a.dispatch(context.Background(), protocol.Call{Tool: "set_device_runtime", Arguments: map[string]any{"paused": false}}, nil)
	if e == nil {
		t.Fatal("unpaused Agent can spoof resume")
	}
}
