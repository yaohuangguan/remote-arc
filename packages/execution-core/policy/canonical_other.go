//go:build !windows

package policy

import "path/filepath"

func canonicalExisting(path string) (string, error) { return filepath.EvalSymlinks(path) }
