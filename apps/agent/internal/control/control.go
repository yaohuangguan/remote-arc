// Package control provides an authenticated loopback endpoint for graceful local
// stop/status. It never accepts tool execution requests or listens publicly.
package control

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

type Endpoint struct {
	URL     string `json:"url"`
	Token   string `json:"token"`
	PID     int    `json:"pid"`
	Engine  string `json:"engine"`
	Version string `json:"version"`
}
type Server struct {
	HTTP     *http.Server
	Listener net.Listener
	endpoint Endpoint
	path     string
}

func Start(dir, version string, status func() any, stop func()) (*Server, error) {
	l, e := net.Listen("tcp4", "127.0.0.1:0")
	if e != nil {
		return nil, e
	}
	b := make([]byte, 32)
	if _, e = rand.Read(b); e != nil {
		l.Close()
		return nil, e
	}
	ep := Endpoint{URL: "http://" + l.Addr().String(), Token: hex.EncodeToString(b), PID: os.Getpid(), Engine: "go", Version: version}
	s := &Server{Listener: l, endpoint: ep, path: filepath.Join(dir, "control.json")}
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if subtle.ConstantTimeCompare([]byte(token), []byte(ep.Token)) != 1 {
			http.Error(w, "unauthorized", 401)
			return
		}
		if r.Method == "GET" && r.URL.Path == "/status" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(status())
			return
		}
		if r.Method == "POST" && r.URL.Path == "/stop" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"stopping":true}`))
			go stop()
			return
		}
		http.NotFound(w, r)
	})
	s.HTTP = &http.Server{Handler: mux, ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second, MaxHeaderBytes: 8192}
	data, _ := json.Marshal(ep)
	if e = config.DurableWrite(s.path, data, 0600); e != nil {
		l.Close()
		return nil, e
	}
	go s.HTTP.Serve(l)
	return s, nil
}
func (s *Server) Close() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	s.HTTP.Shutdown(ctx)
	if b, e := os.ReadFile(s.path); e == nil {
		var current Endpoint
		if json.Unmarshal(b, &current) == nil && current.Token == s.endpoint.Token {
			os.Remove(s.path)
		}
	}
}
func Request(ctx context.Context, dir, method, path string) (map[string]any, error) {
	b, e := os.ReadFile(filepath.Join(dir, "control.json"))
	if e != nil {
		return nil, e
	}
	var ep Endpoint
	if json.Unmarshal(b, &ep) != nil || ep.Engine != "go" {
		return nil, errors.New("Invalid local agent control endpoint.")
	}
	u, err := url.Parse(ep.URL)
	if err != nil {
		return nil, errors.New("Invalid local agent control endpoint.")
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1 || port > 65535 || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || len(ep.Token) != 64 {
		return nil, errors.New("Invalid local agent control endpoint.")
	}
	if (method != "GET" || path != "/status") && (method != "POST" || path != "/stop") {
		return nil, errors.New("Invalid local control operation.")
	}
	req, e := http.NewRequestWithContext(ctx, method, ep.URL+path, nil)
	if e != nil {
		return nil, e
	}
	req.Header.Set("Authorization", "Bearer "+ep.Token)
	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, e := client.Do(req)
	if e != nil {
		return nil, e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, errors.New("Local agent control request was rejected.")
	}
	var result map[string]any
	e = json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 65536)).Decode(&result)
	return result, e
}
