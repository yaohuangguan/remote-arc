//go:build !windows

package cli

import (
	"os/exec"
	"runtime"
)

func hide(c *exec.Cmd) {}
func launchBrowser(link string) error {
	command := "xdg-open"
	if runtime.GOOS == "darwin" {
		command = "open"
	}
	cmd := exec.Command(command, link)
	if e := cmd.Start(); e != nil {
		return e
	}
	go cmd.Wait()
	return nil
}
