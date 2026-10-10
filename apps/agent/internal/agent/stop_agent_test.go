package agent

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func TestRemoteStopCurrentClosesForegroundOwner(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "test-secret", DeviceName: "Fixture", Mode: "managed", Origin: "https://example.com"}
	yes := true
	cfg.BackgroundEnabled = &yes
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	a := New(cfg, "0.6.1-rc.3", false, nil)
	a.Background = fakeBackground{}
	stopped := make(chan struct{}, 1)
	a.Stop = func() { stopped <- struct{}{} }
	result, e := a.dispatch(context.Background(), protocol.Call{
		Tool: "set_background_agent", Arguments: map[string]any{"enabled": false, "stop_current": true},
	}, nil)
	if e != nil {
		t.Fatal(e)
	}
	data, ok := result.(map[string]any)
	if !ok || data["desired_enabled"] != false {
		t.Fatalf("stop reply: %#v", result)
	}
	updated, e := config.Load()
	if e != nil || updated.BackgroundEnabled == nil || *updated.BackgroundEnabled {
		t.Fatalf("recovery not disabled first: %v", e)
	}
	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("foreground stop callback not reached")
	}
	capabilities := a.hello(context.Background())["capabilities"].([]string)
	found := false
	for _, v := range capabilities {
		if v == "device_stop_v1" {
			found = true
		}
	}
	if !found {
		t.Fatal("capability missing")
	}
}
func TestRemoteStopFailsClosedWhenStopCallbackUnavailable(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "test-secret", Origin: "https://example.com", Mode: "managed"}
	yes := true
	cfg.BackgroundEnabled = &yes
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	a := New(cfg, "test", false, nil)
	a.Background = fakeBackground{}
	_, e := a.dispatch(context.Background(), protocol.Call{Tool: "set_background_agent", Arguments: map[string]any{"enabled": false, "stop_current": true}}, nil)
	if e == nil || !strings.Contains(e.Error(), "cannot be stopped") {
		t.Fatalf("stop should fail closed, got %v", e)
	}
	current, _ := config.Load()
	if current.BackgroundEnabled == nil || !*current.BackgroundEnabled {
		t.Fatal("stop without callback should not disable recovery")
	}
}
