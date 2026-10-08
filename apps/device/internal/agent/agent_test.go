package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yaohuangguan/remote-arc/apps/device/internal/journal"
	"github.com/yaohuangguan/remote-arc/apps/device/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/config"
)

type fakeBackground struct{}

func (fakeBackground) Status(context.Context) service.Status {
	return service.Status{Supported: true, Service: "test", Engine: "go"}
}
func (f fakeBackground) Enable(ctx context.Context) (service.Status, error) {
	return f.Status(ctx), nil
}
func (fakeBackground) Disable(context.Context) error { return nil }
func TestClientRevocationTransientFailuresAndOriginValidation(t *testing.T) {
	var status atomic.Int32
	status.Store(503)
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("missing device authentication")
		}
		w.WriteHeader(int(status.Load()))
	}))
	defer s.Close()
	c := NewClient()
	cfg := config.Config{Origin: s.URL, DeviceToken: "test-token"}
	if c.Validate(context.Background(), cfg) != nil {
		t.Fatal("transient error destroyed pairing")
	}
	for _, code := range []int32{401, 403} {
		status.Store(code)
		if !errors.Is(c.Validate(context.Background(), cfg), ErrRevoked) {
			t.Fatal("revocation ignored")
		}
	}
	for _, origin := range []string{"file:///tmp", "https://user:secret@example.com", "https://example.com/path", "https://example.com?secret=1"} {
		if _, e := Origin(origin); e == nil {
			t.Fatal("unsafe origin accepted")
		}
	}
}
func TestPairingAndApprovalDecision(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	var decision atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/device/start":
			json.NewEncoder(w).Encode(PairingStart{DeviceCode: "code", DeviceSecret: "pair-secret", UserCode: "ABCD", VerificationComplete: "https://example.com/authorize", ExpiresIn: 10, Interval: 1})
		case "/api/device/token":
			var b map[string]string
			json.NewDecoder(r.Body).Decode(&b)
			if b["device_secret"] != "pair-secret" {
				t.Error("pairing secret omitted")
			}
			json.NewEncoder(w).Encode(PairingToken{DeviceID: "test-device", DeviceToken: "test-token"})
		case "/api/device/approvals/pending":
			json.NewEncoder(w).Encode([]Approval{{ID: "approval", ToolName: "write_file", TargetPath: "fixture", ExpiresAt: time.Now().Add(time.Minute).UTC().Format(time.RFC3339)}})
		case "/api/device/approvals/approval/decision":
			var b map[string]string
			json.NewDecoder(r.Body).Decode(&b)
			if b["decision"] != "allow_10m" {
				t.Error("incorrect approval")
			}
			decision.Add(1)
			w.WriteHeader(204)
		default:
			w.WriteHeader(404)
		}
	}))
	defer s.Close()
	c := NewClient()
	var output bytes.Buffer
	opened := false
	cfg, e := c.Pair(context.Background(), s.URL, "managed", &output, func(u string) error { opened = u == "https://example.com/authorize"; return nil })
	if e != nil || cfg.DeviceID != "test-device" || !opened {
		t.Fatal("pairing failed", e)
	}
	if strings.Contains(output.String(), "pair-secret") || strings.Contains(output.String(), "test-token") {
		t.Fatal("pairing secret printed")
	}
	if e = c.PromptApproval(context.Background(), cfg, &output, func(context.Context, string) (string, error) { return "2", nil }); e != nil || decision.Load() != 1 {
		t.Fatal("approval failed", e)
	}
	if e = c.PromptApproval(context.Background(), cfg, &output, func(context.Context, string) (string, error) { return "", nil }); e != nil || decision.Load() != 1 {
		t.Fatal("later implicitly granted approval")
	}
	for answer, expected := range map[string]string{"1": "allow_once", "2": "allow_10m", "3": "always_folder", "D": "deny", "anything": ""} {
		if Decision(answer) != expected {
			t.Fatal("decision mapping")
		}
	}
}
func TestAuthenticatedWebsocketToolCallsReconnectAndPrivateJournal(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	file := filepath.Join(home, "fixture.txt")
	secret := "private-file-payload"
	var connections atomic.Int32
	replies := make(chan map[string]any, 8)
	upgrader := websocket.Upgrader{}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent" {
			w.WriteHeader(204)
			return
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			w.WriteHeader(401)
			return
		}
		conn, e := upgrader.Upgrade(w, r, nil)
		if e != nil {
			return
		}
		defer conn.Close()
		number := connections.Add(1)
		var hello map[string]any
		if conn.ReadJSON(&hello) != nil {
			return
		}
		replies <- hello
		call := map[string]any{"type": "call", "id": "read", "tool": "read_file", "arguments": map[string]any{"path": file}}
		if number == 1 {
			call["id"] = "write"
			call["tool"] = "write_file"
			call["arguments"] = map[string]any{"path": file, "content": secret}
		}
		if conn.WriteJSON(call) != nil {
			return
		}
		var reply map[string]any
		if conn.ReadJSON(&reply) != nil {
			return
		}
		replies <- reply
		if number == 1 {
			return
		}
		for {
			if _, _, e := conn.ReadMessage(); e != nil {
				return
			}
		}
	}))
	defer s.Close()
	cfg := config.Config{DeviceID: "test-device", DeviceToken: "test-token", DeviceName: "fixture", Origin: s.URL, Mode: "managed"}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	j := &journal.Journal{Dir: filepath.Join(home, "logs")}
	a := New(cfg, "test", false, j)
	a.Background = fakeBackground{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()
	defer cancel()
	for i := 0; i < 4; i++ {
		select {
		case reply := <-replies:
			if reply["type"] == "hello" {
				if reply["device"].(map[string]any)["id"] != cfg.DeviceID {
					t.Fatal("device identity changed")
				}
				if len(reply["tools"].([]any)) != 21 {
					t.Fatal("tool surface incomplete")
				}
			} else if reply["error"] != nil {
				t.Fatal("remote tool failed", reply["error"])
			}
		case <-time.After(10 * time.Second):
			t.Fatal("websocket/reconnect timed out")
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("agent failed to drain")
	}
	b, _ := os.ReadFile(file)
	if string(b) != secret {
		t.Fatal("remote file not written")
	}
	log, _ := os.ReadFile(filepath.Join(home, "logs", "events.log"))
	if strings.Contains(string(log), secret) || strings.Contains(string(log), "test-token") {
		t.Fatal("sensitive request data logged")
	}
	if !strings.Contains(string(log), "tool.done") || !strings.Contains(string(log), "reconnecting") {
		t.Fatal("operation/reconnect records missing")
	}
	cfg.DeviceToken = "replacement"
	config.Save(cfg)
	if a.identityValid() {
		t.Fatal("replacement credentials were not detected")
	}
}
func TestWebsocketUnauthorizedStopsWithoutRetry(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) }))
	defer s.Close()
	cfg := config.Config{DeviceID: "test", DeviceToken: "test-token", Origin: s.URL, Mode: "safe"}
	config.Save(cfg)
	a := New(cfg, "test", false, nil)
	a.Background = fakeBackground{}
	if e := a.Run(context.Background()); !errors.Is(e, ErrRevoked) {
		t.Fatal("unauthorized connection retried", e)
	}
}
