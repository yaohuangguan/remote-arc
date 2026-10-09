package power

import (
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"runtime"
	"sync"
	"time"
)

type Helper interface{ Stop() }
type child struct{ cmd *exec.Cmd }

func (c *child) Stop() {
	if c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
	}
}

type Manager struct {
	mu       sync.Mutex
	Platform string
	Now      func() time.Time
	Launch   func(string, []string) (Helper, error)
	leases   map[string]time.Time
	helper   Helper
	until    time.Time
	failure  any
	closed   bool
	done     chan struct{}
}

var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,120}$`)

func New() *Manager {
	m := &Manager{Platform: runtime.GOOS, Now: time.Now, leases: map[string]time.Time{}, done: make(chan struct{})}
	m.Launch = func(command string, args []string) (Helper, error) {
		cmd := exec.Command(command, args...)
		hide(cmd)
		if e := cmd.Start(); e != nil {
			return nil, e
		}
		c := &child{cmd: cmd}
		go func() {
			e := cmd.Wait()
			m.mu.Lock()
			defer m.mu.Unlock()
			if m.helper == c {
				m.helper = nil
				m.until = time.Time{}
				if e != nil {
					m.failure = e.Error()
				}
			}
		}()
		return c, nil
	}
	go func() {
		t := time.NewTicker(15 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-m.done:
				return
			case <-t.C:
				m.mu.Lock()
				m.sweep()
				m.mu.Unlock()
			}
		}
	}()
	return m
}
func (m *Manager) supported() bool {
	return m.Platform == "windows" || m.Platform == "darwin" || m.Platform == "linux"
}
func (m *Manager) sweep() {
	now := m.Now()
	for id, until := range m.leases {
		if !until.After(now) {
			delete(m.leases, id)
		}
	}
	if len(m.leases) == 0 && m.helper != nil {
		m.helper.Stop()
		m.helper = nil
		m.until = time.Time{}
	}
}
func (m *Manager) status() map[string]any {
	return map[string]any{"supported": m.supported(), "active": m.helper != nil, "leased_tasks": len(m.leases), "detail": m.failure}
}
func (m *Manager) Set(id string, seconds int) (map[string]any, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return nil, errors.New("Keep-awake manager is closed.")
	}
	if !idPattern.MatchString(id) || seconds < 0 || seconds > 180 {
		return nil, errors.New("Invalid keep-awake lease.")
	}
	if seconds == 0 {
		delete(m.leases, id)
	} else {
		m.leases[id] = m.Now().Add(time.Duration(seconds) * time.Second)
	}
	m.sweep()
	if !m.supported() {
		return map[string]any{"supported": false, "active": false, "detail": "OS power inhibition is unavailable."}, nil
	}
	if len(m.leases) > 0 && (m.helper == nil || m.until.Before(m.Now().Add(90*time.Second))) {
		if m.helper != nil {
			m.helper.Stop()
			m.helper = nil
		}
		command := "caffeinate"
		args := []string{"-i", "-t", "210"}
		if m.Platform == "windows" {
			command = "powershell.exe"
			script := `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class RemoteArcPower { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags); }'; if ([RemoteArcPower]::SetThreadExecutionState([uint32]2147483649) -eq 0) { exit 1 }; try { Start-Sleep -Seconds 210 } finally { [RemoteArcPower]::SetThreadExecutionState([uint32]2147483648) | Out-Null }`
			args = []string{"-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script}
		} else if m.Platform == "linux" {
			command = "systemd-inhibit"
			args = []string{"--what=sleep", "--mode=block", "--who=Remote Arc", "--why=An authorized task is active", "sleep", "210"}
		}
		h, e := m.Launch(command, args)
		if e != nil {
			m.failure = fmt.Sprint(e)
			return nil, e
		}
		m.helper = h
		m.until = m.Now().Add(210 * time.Second)
		m.failure = nil
	}
	return m.status(), nil
}
func (m *Manager) Status() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sweep()
	return m.status()
}
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return
	}
	m.closed = true
	close(m.done)
	m.leases = map[string]time.Time{}
	if m.helper != nil {
		m.helper.Stop()
		m.helper = nil
	}
}
