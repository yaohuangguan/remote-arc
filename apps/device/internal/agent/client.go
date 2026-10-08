package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/config"
)

var ErrRevoked = errors.New("Saved device credential has been revoked.")

func Origin(value string) (string, error) {
	if value == "https://remote.samyao.me" || value == "https://remotearc.app" {
		value = config.DefaultOrigin
	}
	u, e := url.Parse(value)
	if e != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", errors.New("Origin must be an HTTP(S) origin without credentials, a path, or a query.")
	}
	return strings.TrimSuffix(u.String(), "/"), nil
}

type Client struct{ HTTP *http.Client }

func NewClient() *Client {
	return &Client{HTTP: &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (c *Client) Request(ctx context.Context, origin, token, method, path string, body any, output any) (int, error) {
	base, e := Origin(origin)
	if e != nil {
		return 0, e
	}
	var input io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		input = bytes.NewReader(b)
	}
	req, e := http.NewRequestWithContext(ctx, method, base+path, input)
	if e != nil {
		return 0, e
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, e := c.HTTP.Do(req)
	if e != nil {
		return 0, errors.New("Remote Arc request failed; check the origin and network connection.")
	}
	defer resp.Body.Close()
	if token != "" && (resp.StatusCode == 401 || resp.StatusCode == 403) {
		return resp.StatusCode, ErrRevoked
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return resp.StatusCode, fmt.Errorf("Remote Arc returned HTTP %d.", resp.StatusCode)
	}
	if output != nil {
		e = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(output)
	}
	return resp.StatusCode, e
}
func (c *Client) Validate(ctx context.Context, cfg config.Config) error {
	_, e := c.Request(ctx, cfg.Origin, cfg.DeviceToken, "POST", "/api/device/heartbeat", nil, nil)
	if errors.Is(e, ErrRevoked) {
		return e
	}
	return nil
}
func pause(ctx context.Context, duration time.Duration) error {
	t := time.NewTimer(duration)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
