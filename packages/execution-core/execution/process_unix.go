//go:build !windows

package execution

import (
	"os"
	"os/exec"
	"syscall"
	"time"
)

func shellCommand(command string) *exec.Cmd {
	cmd := exec.Command("/bin/sh", "-c", command)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return cmd
}
func hideCommand(_ *exec.Cmd) {}
func terminateTree(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	if syscall.Kill(-pid, syscall.SIGTERM) != nil {
		_ = cmd.Process.Signal(syscall.SIGTERM)
	}
	time.Sleep(300 * time.Millisecond)
	_ = syscall.Kill(-pid, syscall.SIGKILL)
}
func processSignal(s *os.ProcessState) any {
	if v, ok := s.Sys().(syscall.WaitStatus); ok && v.Signaled() {
		switch v.Signal() {
		case syscall.SIGTERM:
			return "SIGTERM"
		case syscall.SIGKILL:
			return "SIGKILL"
		default:
			return v.Signal().String()
		}
	}
	return nil
}
