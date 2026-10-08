package cli

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/device/internal/control"
	"github.com/yaohuangguan/remote-arc/apps/device/internal/journal"
	"github.com/yaohuangguan/remote-arc/apps/device/internal/lease"
	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/config"
)

func supervise(parent context.Context, version string, log *journal.Journal) error {
	if !enabled() {
		return nil
	}
	dir := filepath.Join(config.Dir(), "agent")
	owned, e := lease.Acquire(dir, "supervisor")
	if e != nil || owned == nil {
		return e
	}
	defer owned.Release()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	go func() {
		select {
		case <-owned.Lost():
			cancel()
		case <-ctx.Done():
		}
	}()
	executable, e := os.Executable()
	if e != nil {
		return e
	}
	delay := time.Second
	for ctx.Err() == nil && enabled() {
		if e = os.MkdirAll(log.Dir, 0700); e != nil {
			return e
		}
		out, e := os.OpenFile(filepath.Join(log.Dir, "agent.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if e != nil {
			return e
		}
		errOut, e := os.OpenFile(filepath.Join(log.Dir, "agent-error.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if e != nil {
			out.Close()
			return e
		}
		cmd := exec.Command(executable, "--agent")
		hide(cmd)
		cmd.Stdout = out
		cmd.Stderr = errOut
		started := time.Now()
		e = cmd.Start()
		out.Close()
		errOut.Close()
		if e == nil {
			done := make(chan error, 1)
			go func() { done <- cmd.Wait() }()
			select {
			case e = <-done:
			case <-ctx.Done():
				stopCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
				status, _ := control.Request(stopCtx, dir, "GET", "/status")
				if pid, ok := status["pid"].(float64); ok && int(pid) == cmd.Process.Pid {
					_, _ = control.Request(stopCtx, dir, "POST", "/stop")
				}
				stop()
				select {
				case <-done:
				case <-time.After(10 * time.Second):
					_ = cmd.Process.Kill()
					<-done
				}
				return ctx.Err()
			}
		}
		if ctx.Err() != nil || !enabled() {
			break
		}
		log.Log("warn", fmt.Sprintf("Go worker exited; recovery retry in %ds.", int(delay/time.Second)))
		if wait(ctx, delay) != nil {
			break
		}
		if time.Since(started) > 60*time.Second {
			delay = time.Second
		} else {
			delay = min(delay*2, 30*time.Second)
		}
	}
	return nil
}
