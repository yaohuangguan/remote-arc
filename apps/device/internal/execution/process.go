package execution

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const MaxCaptureBytes = 2 * 1024 * 1024

type cappedBuffer struct {
	mu        sync.Mutex
	b         []byte
	truncated bool
}

func (b *cappedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := len(p)
	space := MaxCaptureBytes - len(b.b)
	if len(p) > space {
		b.truncated = true
		p = p[:max(0, space)]
	}
	b.b = append(b.b, p...)
	return n, nil
}
func (b *cappedBuffer) Text() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	s := strings.ToValidUTF8(string(b.b), "�")
	if b.truncated {
		s += "\n… output truncated …"
	}
	return s
}
func (b *cappedBuffer) Size() int { b.mu.Lock(); defer b.mu.Unlock(); return len(b.b) }
func randomID() string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	h := hex.EncodeToString(b)
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}

type managed struct {
	mu               sync.Mutex
	id, command, cwd string
	cmd              *exec.Cmd
	started          time.Time
	ended            *time.Time
	code             *int
	signal           any
	out, err         cappedBuffer
	done             chan struct{}
	killOnce         sync.Once
}
type Processes struct {
	mu     sync.Mutex
	items  map[string]*managed
	closed bool
}

func NewProcesses() *Processes { return &Processes{items: map[string]*managed{}} }
func (m *managed) kill()       { m.killOnce.Do(func() { terminateTree(m.cmd) }) }
func (m *managed) status() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	status := "running"
	until := time.Now()
	var ended any
	if m.ended != nil {
		status = "exited"
		until = *m.ended
		ended = until.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	var cwd any
	if m.cwd != "" {
		cwd = m.cwd
	}
	return map[string]any{"process_id": m.id, "pid": m.cmd.Process.Pid, "command": m.command, "cwd": cwd, "status": status, "exit_code": m.code, "signal": m.signal, "started_at": m.started.UTC().Format("2006-01-02T15:04:05.000Z"), "ended_at": ended, "duration_ms": until.Sub(m.started).Milliseconds()}
}
func (p *Processes) cleanup() {
	now := time.Now()
	for id, m := range p.items {
		m.mu.Lock()
		expired := m.ended != nil && now.Sub(*m.ended) > 30*time.Minute
		m.mu.Unlock()
		if expired {
			delete(p.items, id)
		}
	}
}
func (p *Processes) start(command, cwd string, deadline time.Duration) (*managed, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return nil, errors.New("Execution core is closed.")
	}
	p.cleanup()
	if len(p.items) >= 32 {
		return nil, errors.New("Remote Arc already has the maximum number of managed background processes on this device.")
	}
	cmd := shellCommand(command)
	cmd.Dir = cwd
	cmd.WaitDelay = 3 * time.Second
	m := &managed{id: randomID(), command: command, cwd: cwd, cmd: cmd, started: time.Now(), done: make(chan struct{})}
	cmd.Stdout = &m.out
	cmd.Stderr = &m.err
	if e := cmd.Start(); e != nil {
		return nil, e
	}
	p.items[m.id] = m
	go func() {
		e := cmd.Wait()
		m.mu.Lock()
		now := time.Now()
		m.ended = &now
		code := 0
		if e != nil {
			code = cmd.ProcessState.ExitCode()
			m.signal = processSignal(cmd.ProcessState)
			if code < 0 {
				m.code = nil
			} else {
				m.code = &code
			}
		} else {
			m.code = &code
		}
		m.mu.Unlock()
		close(m.done)
	}()
	if deadline > 0 {
		go func() {
			t := time.NewTimer(deadline)
			defer t.Stop()
			select {
			case <-m.done:
			case <-t.C:
				m.err.Write([]byte("\nRemote Arc: authorized process time budget exhausted."))
				m.kill()
			}
		}()
	}
	return m, nil
}
func (p *Processes) Background(command, cwd string, seconds int) (map[string]any, error) {
	if seconds < 0 || seconds > 7*86400 {
		return nil, errors.New("Invalid managed process duration.")
	}
	m, e := p.start(command, cwd, time.Duration(seconds)*time.Second)
	if e != nil {
		return nil, e
	}
	var dir any
	if cwd != "" {
		dir = cwd
	}
	return map[string]any{"process_id": m.id, "pid": m.cmd.Process.Pid, "command": command, "cwd": dir, "status": "running", "started_at": m.started.UTC().Format("2006-01-02T15:04:05.000Z")}, nil
}
func (p *Processes) Run(ctx context.Context, command, cwd string, timeout int) (map[string]any, error) {
	m, e := p.start(command, cwd, 0)
	if e != nil {
		return nil, e
	}
	t := time.NewTimer(time.Duration(max(100, min(120000, timeout))) * time.Millisecond)
	defer t.Stop()
	timedOut := false
	select {
	case <-m.done:
	case <-ctx.Done():
		m.kill()
		<-m.done
	case <-t.C:
		timedOut = true
		m.kill()
		<-m.done
	}
	s := m.status()
	p.mu.Lock()
	delete(p.items, m.id)
	p.mu.Unlock()
	return map[string]any{"command": command, "cwd": s["cwd"], "exit_code": s["exit_code"], "signal": s["signal"], "stdout": m.out.Text(), "stderr": m.err.Text(), "duration_ms": s["duration_ms"], "timed_out": timedOut}, nil
}
func (p *Processes) get(id string) (*managed, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.cleanup()
	m := p.items[id]
	if m == nil {
		return nil, errors.New("Managed process not found or its local retention window has expired.")
	}
	return m, nil
}
func (p *Processes) Status(id string) (map[string]any, error) {
	m, e := p.get(id)
	if e != nil {
		return nil, e
	}
	return m.status(), nil
}
func (p *Processes) Output(id string) (map[string]any, error) {
	m, e := p.get(id)
	if e != nil {
		return nil, e
	}
	s := m.status()
	s["stdout"] = m.out.Text()
	s["stderr"] = m.err.Text()
	s["truncated"] = m.out.Size() >= MaxCaptureBytes || m.err.Size() >= MaxCaptureBytes
	return s, nil
}
func (p *Processes) Stop(id string) (map[string]any, error) {
	m, e := p.get(id)
	if e != nil {
		return nil, e
	}
	select {
	case <-m.done:
		s := m.status()
		s["stopped"] = false
		s["already_exited"] = true
		return s, nil
	default:
	}
	m.kill()
	select {
	case <-m.done:
	case <-time.After(5 * time.Second):
		return nil, errors.New("Managed process did not stop within the shutdown deadline.")
	}
	s := m.status()
	s["stopped"] = true
	s["already_exited"] = false
	return s, nil
}
func (p *Processes) List() []map[string]any {
	p.mu.Lock()
	p.cleanup()
	items := []*managed{}
	for _, m := range p.items {
		items = append(items, m)
	}
	p.mu.Unlock()
	sort.Slice(items, func(i, j int) bool { return items[i].started.After(items[j].started) })
	result := []map[string]any{}
	for _, m := range items {
		s := m.status()
		s["stdout_bytes"] = m.out.Size()
		s["stderr_bytes"] = m.err.Size()
		result = append(result, s)
	}
	return result
}
func (p *Processes) Close() {
	p.mu.Lock()
	p.closed = true
	items := []*managed{}
	for _, m := range p.items {
		items = append(items, m)
	}
	p.mu.Unlock()
	var wg sync.WaitGroup
	for _, m := range items {
		wg.Add(1)
		go func(m *managed) {
			defer wg.Done()
			select {
			case <-m.done:
				return
			default:
			}
			m.kill()
			select {
			case <-m.done:
			case <-time.After(5 * time.Second):
			}
		}(m)
	}
	wg.Wait()
}
func listProcesses() (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ps", "-axo", "pid,ppid,user,%cpu,%mem,etime,command")
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "tasklist.exe", "/FO", "CSV", "/NH")
	}
	hideCommand(cmd)
	var out, err cappedBuffer
	cmd.Stdout = &out
	cmd.Stderr = &err
	if e := cmd.Run(); e != nil {
		return "", fmt.Errorf("Could not list processes: %s", err.Text())
	}
	platform := runtime.GOOS
	if platform == "windows" {
		platform = "win32"
	}
	return "Processes on " + platform + ":\n\n" + strings.TrimSpace(out.Text()), nil
}
