package control

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAuthenticatedStatusStopAndEndpointValidation(t *testing.T) {
	dir := t.TempDir()
	stopped := make(chan struct{}, 1)
	s, e := Start(dir, "test", func() any { return map[string]any{"engine": "go"} }, func() { stopped <- struct{}{} })
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	resp, e := http.Get(s.endpoint.URL + "/status")
	if e != nil {
		t.Fatal(e)
	}
	resp.Body.Close()
	if resp.StatusCode != 401 {
		t.Fatal("unauthenticated request accepted")
	}
	if m, e := Request(context.Background(), dir, "GET", "/status"); e != nil || m["engine"] != "go" {
		t.Fatal(e)
	}
	if _, e := Request(context.Background(), dir, "POST", "/stop"); e != nil {
		t.Fatal(e)
	}
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("stop callback missing")
	}
	for _, u := range []string{"http://127.0.0.1:80@evil.example", "http://127.0.0.1:80/path", "https://127.0.0.1:80", "http://localhost:80", "http://127.0.0.1:80?secret=1"} {
		ep := s.endpoint
		ep.URL = u
		b, _ := json.Marshal(ep)
		os.WriteFile(filepath.Join(dir, "control.json"), b, 0600)
		if _, e := Request(context.Background(), dir, "GET", "/status"); e == nil {
			t.Fatalf("unsafe endpoint accepted: %s", u)
		}
	}
}
