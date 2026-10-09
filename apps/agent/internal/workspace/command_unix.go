//go:build !windows

package workspace

import "os/exec"

func hide(_ *exec.Cmd) {}
