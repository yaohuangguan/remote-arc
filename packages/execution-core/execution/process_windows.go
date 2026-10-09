package execution

import (
	"os"
	"os/exec"
	"strconv"
	"syscall"
)

func shellCommand(command string) *exec.Cmd {
	cmd := exec.Command("cmd.exe")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CmdLine: `cmd.exe /d /s /c "` + command + `"`}
	return cmd
}
func hideCommand(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
func terminateTree(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	kill := exec.Command("taskkill.exe", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
	hideCommand(kill)
	_ = kill.Run()
	_ = cmd.Process.Kill()
}
func processSignal(_ *os.ProcessState) any { return nil }
