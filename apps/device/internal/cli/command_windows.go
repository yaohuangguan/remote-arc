package cli

import (
	"os/exec"
	"strings"
	"syscall"
)

func hide(c *exec.Cmd) { c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
func launchBrowser(link string) error {
	quoted := "'" + strings.ReplaceAll(link, "'", "''") + "'"
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", "Start-Process -FilePath "+quoted)
	hide(cmd)
	if e := cmd.Start(); e != nil {
		return e
	}
	go cmd.Wait()
	return nil
}
