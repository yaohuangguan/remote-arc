package policy

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows"
)

// Resolve each existing path from a fresh handle. EvalSymlinks walks and case-
// normalizes every ancestor on Windows, multiplying syscalls for each policy
// root. The handle follows junctions/symlinks; no resolved path is cached.
func canonicalExisting(path string) (string, error) {
	// Keep device namespaces and alternate-stream semantics on the old path.
	if strings.HasPrefix(path, `\\.\`) || strings.Contains(path[len(filepath.VolumeName(path)):], ":") {
		return filepath.EvalSymlinks(path)
	}
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return "", err
	}
	h, err := windows.CreateFile(p, 0, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		if errors.Is(err, windows.ERROR_FILE_NOT_FOUND) || errors.Is(err, windows.ERROR_PATH_NOT_FOUND) {
			return "", &os.PathError{Op: "canonical", Path: path, Err: err}
		}
		return filepath.EvalSymlinks(path)
	}
	defer windows.CloseHandle(h)
	buffer := make([]uint16, 512)
	for {
		// FILE_NAME_NORMALIZED | VOLUME_NAME_DOS are both zero. Unsupported
		// providers/permissions fall back to the existing resolver.
		n, err := windows.GetFinalPathNameByHandle(h, &buffer[0], uint32(len(buffer)), 0)
		if err != nil || n == 0 || n > 32768 {
			break
		}
		if n >= uint32(len(buffer)) {
			buffer = make([]uint16, n+1)
			continue
		}
		resolved := windows.UTF16ToString(buffer[:n])
		if strings.HasPrefix(resolved, `\\?\UNC\`) {
			return `\\` + resolved[len(`\\?\UNC\`):], nil
		}
		if strings.HasPrefix(resolved, `\\?\`) {
			resolved = resolved[len(`\\?\`):]
			if len(filepath.VolumeName(resolved)) == 2 && filepath.IsAbs(resolved) {
				return resolved, nil
			}
		}
		break
	}
	return filepath.EvalSymlinks(path)
}
