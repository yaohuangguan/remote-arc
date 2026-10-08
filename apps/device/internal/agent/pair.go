package agent

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/device/internal/config"
	"github.com/yaohuangguan/remote-arc/apps/device/internal/protocol"
)

func Arch() string {
	if runtime.GOARCH == "amd64" {
		return "x64"
	}
	if runtime.GOARCH == "386" {
		return "ia32"
	}
	return runtime.GOARCH
}

type PairingStart struct {
	DeviceCode           string `json:"device_code"`
	DeviceSecret         string `json:"device_secret"`
	UserCode             string `json:"user_code"`
	VerificationURI      string `json:"verification_uri"`
	VerificationComplete string `json:"verification_uri_complete"`
	ExpiresIn            int    `json:"expires_in"`
	Interval             int    `json:"interval"`
}
type PairingToken struct {
	DeviceID    string `json:"device_id"`
	DeviceToken string `json:"device_token"`
}

func (c *Client) Pair(ctx context.Context, origin, mode string, output io.Writer, open func(string) error) (config.Config, error) {
	var saved config.Config
	origin, e := Origin(origin)
	if e != nil {
		return saved, e
	}
	hostname, _ := os.Hostname()
	var start PairingStart
	_, e = c.Request(ctx, origin, "", "POST", "/api/device/start", map[string]any{"device_name": hostname, "platform": protocol.Platform(runtime.GOOS), "arch": Arch(), "hostname": hostname}, &start)
	if e != nil {
		return saved, e
	}
	if start.DeviceCode == "" || start.DeviceSecret == "" || start.ExpiresIn < 1 || start.ExpiresIn > 86400 {
		return saved, errors.New("Invalid pairing response.")
	}
	link := start.VerificationComplete
	if link == "" {
		link = start.VerificationURI
	}
	if link == "" {
		return saved, errors.New("Pairing response did not include an authorization URL.")
	}
	fmt.Fprintf(output, "Pair this computer: %s\nCode: %s\n", link, start.UserCode)
	if open != nil {
		_ = open(link)
	}
	interval := start.Interval
	if interval < 2 {
		interval = 2
	}
	if interval > 60 {
		interval = 60
	}
	deadline, cancel := context.WithTimeout(ctx, time.Duration(start.ExpiresIn)*time.Second)
	defer cancel()
	for {
		if e = pause(deadline, time.Duration(interval)*time.Second); e != nil {
			return saved, errors.New("Pairing cancelled or expired; run remotelink again to retry.")
		}
		var token PairingToken
		status, err := c.Request(deadline, origin, "", "POST", "/api/device/token", map[string]any{"device_code": start.DeviceCode, "device_secret": start.DeviceSecret}, &token)
		if status == 428 {
			continue
		}
		if err != nil {
			if status == 0 || status >= 500 {
				continue
			}
			return saved, err
		}
		if token.DeviceID == "" || token.DeviceToken == "" {
			return saved, errors.New("Invalid pairing token response.")
		}
		saved = config.Config{DeviceID: token.DeviceID, DeviceToken: token.DeviceToken, DeviceName: hostname, Origin: origin, Mode: mode}
		return saved, config.Save(saved)
	}
}
