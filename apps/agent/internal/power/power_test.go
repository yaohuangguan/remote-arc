package power

import (
	"errors"
	"strings"
	"testing"
	"time"
)

type fakeHelper struct{ stopped int }

func (h *fakeHelper) Stop() { h.stopped++ }
func TestOSHelpersLeaseExpiryRenewalAndDisconnectCleanup(t *testing.T) {
	for _, platform := range []string{"windows", "darwin", "linux"} {
		t.Run(platform, func(t *testing.T) {
			m := New()
			defer m.Close()
			m.Platform = platform
			now := time.Now()
			m.Now = func() time.Time { return now }
			h := &fakeHelper{}
			launches := 0
			m.Launch = func(command string, args []string) (Helper, error) {
				launches++
				if platform == "windows" && (!strings.Contains(strings.Join(args, " "), "SetThreadExecutionState") || command != "powershell.exe") {
					t.Fatal("windows helper missing")
				}
				return h, nil
			}
			if s, e := m.Set("task", 180); e != nil || s["active"] != true {
				t.Fatal(e)
			}
			if _, e := m.Set("task", 181); e == nil {
				t.Fatal("overlong lease accepted")
			}
			now = now.Add(130 * time.Second)
			if _, e := m.Set("task", 180); e != nil || launches != 2 || h.stopped != 1 {
				t.Fatal("helper did not renew", e)
			}
			now = now.Add(181 * time.Second)
			if s := m.Status(); s["active"] != false || s["leased_tasks"] != 0 {
				t.Fatal("expired lease remained")
			}
			m.Set("task", 1)
			m.Close()
			if h.stopped != 3 {
				t.Fatal("disconnect left helper alive")
			}
		})
	}
}
func TestHelperFailureAndUnsupportedPlatform(t *testing.T) {
	m := New()
	defer m.Close()
	m.Platform = "linux"
	m.Launch = func(string, []string) (Helper, error) { return nil, errors.New("unavailable") }
	if _, e := m.Set("task", 120); e == nil {
		t.Fatal("failure swallowed")
	}
	if m.Status()["active"] != false {
		t.Fatal("failed helper marked active")
	}
	m.Platform = "unsupported"
	if s, e := m.Set("task", 0); e != nil || s["supported"] != false {
		t.Fatal("unsupported status", e)
	}
}
