//go:build !windows

package power

import "os/exec"

func hide(_ *exec.Cmd) {}
