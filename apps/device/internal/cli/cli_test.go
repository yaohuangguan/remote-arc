package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/gorilla/websocket"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/device/internal/config"
	"github.com/yaohuangguan/remote-arc/apps/device/internal/lease"
)

func TestOptionsVersionAndForeignLeasePreservesPairing(t *testing.T) {
	for _, args := range [][]string{{"--safe", "--developer"}, {"--background", "--no-background"}, {"--foreground", "--background"}, {"--unknown"}, {"--origin=https://user:secret@host"}} {
		if _, e := Parse(args); e == nil {
			t.Fatal("invalid options accepted")
		}
	}
	var output bytes.Buffer
	if e := Main(context.Background(), []string{"--version"}, "test", os.Stdin, &output, &output); e != nil || strings.TrimSpace(output.String()) != "test" {
		t.Fatal("version")
	}
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	cfg := config.Config{DeviceID: "old", DeviceToken: "private", Origin: "https://mcp.remotearc.app", Mode: "managed"}
	config.Save(cfg)
	owned, e := lease.Acquire(filepath.Join(config.Dir(), "agent"), "execution")
	if e != nil {
		t.Fatal(e)
	}
	defer owned.Release()
	for _, args := range [][]string{{"--foreground"}, {"--reset"}, {"--background"}, {"--safe"}} {
		if e := Main(context.Background(), args, "test", os.Stdin, &output, &output); e == nil {
			t.Fatal("foreign owner not refused")
		}
		current, _ := config.Load()
		if current.DeviceToken != "private" || current.Mode != "managed" || current.BackgroundEnabled != nil {
			t.Fatal("foreign config mutated")
		}
	}
}
func TestNativeForegroundCLIHardCapAndLocalControl(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	file := filepath.Join(home, "fixture.txt")
	os.WriteFile(file, []byte("fixture"), 0600)
	hellos := make(chan map[string]any, 1)
	replies := make(chan map[string]any, 1)
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent" {
			w.WriteHeader(204)
			return
		}
		conn, e := upgrader.Upgrade(w, r, nil)
		if e != nil {
			return
		}
		defer conn.Close()
		var message map[string]any
		if conn.ReadJSON(&message) != nil {
			return
		}
		hellos <- message
		conn.WriteJSON(map[string]any{"type": "call", "id": "fixture", "tool": "read_file", "arguments": map[string]any{"path": file}})
		var reply map[string]any
		if conn.ReadJSON(&reply) == nil {
			replies <- reply
		}
		for {
			if _, _, e := conn.ReadMessage(); e != nil {
				return
			}
		}
	}))
	defer server.Close()
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "private-token", DeviceName: "fixture", Origin: server.URL, Mode: "managed"}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	var output bytes.Buffer
	go func() { done <- Main(ctx, []string{"--foreground", "--safe"}, "test", os.Stdin, &output, &output) }()
	select {
	case hello := <-hellos:
		if len(hello["tools"].([]any)) != 12 {
			t.Fatal("native CLI did not apply the safe cap")
		}
	case <-time.After(15 * time.Second):
		t.Fatal("native CLI did not connect")
	}
	select {
	case reply := <-replies:
		if reply["error"] != nil {
			t.Fatal("native CLI read failed")
		}
	case <-time.After(time.Second):
		t.Fatal("native CLI did not execute")
	}
	var status bytes.Buffer
	if e := Main(ctx, []string{"--status"}, "test", os.Stdin, &status, &status); e != nil {
		t.Fatal(e)
	}
	var state map[string]any
	if json.Unmarshal(status.Bytes(), &state) != nil || state["agent"].(map[string]any)["engine"] != "go" || strings.Contains(status.String(), "private-token") {
		t.Fatal("invalid local status")
	}
	var conflict bytes.Buffer
	if e := Main(ctx, []string{"--developer"}, "test", os.Stdin, &conflict, &conflict); e == nil {
		t.Fatal("active profile change allowed")
	}
	cancel()
	select {
	case e := <-done:
		if e != nil && !errors.Is(e, context.Canceled) {
			t.Fatal(e)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("native CLI did not stop")
	}
	if lease.Active(filepath.Join(config.Dir(), "agent"), "execution") {
		t.Fatal("CLI leaked execution lease")
	}
	saved, e := config.Load()
	if e != nil || saved.Mode != "safe" || saved.BackgroundEnabled != nil {
		t.Fatal("CLI changed recovery defaults")
	}
	if !strings.Contains(output.String(), "tool.done") || strings.Contains(output.String(), "private-token") {
		t.Fatal("CLI operation log invalid")
	}
}
