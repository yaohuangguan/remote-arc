package policy

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"github.com/yaohuangguan/remote-arc/apps/device/internal/config"
	"github.com/yaohuangguan/remote-arc/apps/device/internal/protocol"
)

func Expand(value string) string {
	s := strings.TrimSpace(value)
	home := config.Home()
	if s == "~" {
		return home
	}
	if strings.HasPrefix(s, "~/") || strings.HasPrefix(s, "~\\") {
		return filepath.Join(home, s[2:])
	}
	s = regexp.MustCompile(`\$HOME\b`).ReplaceAllStringFunc(s, func(string) string { return home })
	for {
		lower := strings.ToLower(s)
		i := strings.Index(lower, "%userprofile%")
		if i < 0 {
			break
		}
		s = s[:i] + home + s[i+13:]
	}
	return s
}
func Canonical(value string) (string, error) {
	p, e := filepath.Abs(Expand(value))
	if e != nil {
		return "", e
	}
	cursor := p
	missing := []string{}
	for {
		real, e := filepath.EvalSymlinks(cursor)
		if e == nil {
			for i := len(missing) - 1; i >= 0; i-- {
				real = filepath.Join(real, missing[i])
			}
			if runtime.GOOS == "windows" {
				real = strings.ToLower(real)
			}
			return filepath.Clean(real), nil
		}
		if !errors.Is(e, os.ErrNotExist) {
			return "", e
		}
		parent := filepath.Dir(cursor)
		if parent == cursor {
			return "", e
		}
		missing = append(missing, filepath.Base(cursor))
		cursor = parent
	}
}
func Inside(target, root string) bool {
	rel, e := filepath.Rel(root, target)
	return e == nil && (rel == "." || rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel))
}
func matches(target string, roots []string) bool {
	for _, root := range roots {
		if strings.TrimSpace(root) == "" {
			continue
		}
		r, e := Canonical(root)
		if e == nil && Inside(target, r) {
			return true
		}
	}
	return false
}
func Sensitive(target string) bool {
	base := strings.ToLower(filepath.Base(target))
	for _, s := range []string{".npmrc", ".pypirc", ".netrc", ".git-credentials", "id_rsa", "id_ed25519", "credentials"} {
		if base == s {
			return true
		}
	}
	if base == ".env" || strings.HasPrefix(base, ".env.") {
		return true
	}
	n := strings.ToLower(filepath.ToSlash(target))
	return strings.HasSuffix(n, "/.docker/config.json") || strings.HasSuffix(n, "/.kube/config")
}
func defaultRoots() []string {
	home := config.Home()
	r := []string{}
	for _, p := range []string{".ssh", ".aws", ".gnupg", ".azure", ".kube", ".docker", ".config/gcloud"} {
		r = append(r, filepath.Join(home, filepath.FromSlash(p)))
	}
	if runtime.GOOS == "darwin" {
		for _, p := range []string{"Google/Chrome", "Microsoft Edge", "Firefox"} {
			r = append(r, filepath.Join(home, "Library", "Application Support", filepath.FromSlash(p)))
		}
	}
	if runtime.GOOS == "windows" {
		if a := os.Getenv("APPDATA"); a != "" {
			r = append(r, filepath.Join(a, "Mozilla", "Firefox"))
		}
		if a := os.Getenv("LOCALAPPDATA"); a != "" {
			r = append(r, filepath.Join(a, "Google", "Chrome", "User Data"), filepath.Join(a, "Microsoft", "Edge", "User Data"))
		}
	}
	return r
}
func Enforce(value string, p protocol.Policy, workspace bool) (string, error) {
	clean := func(roots []string) []string {
		out := []string{}
		for _, root := range roots {
			if root = strings.TrimSpace(root); root != "" {
				out = append(out, root)
			}
		}
		return out
	}
	p.WorkspaceRoots = clean(p.WorkspaceRoots)
	target, e := Canonical(value)
	if e != nil {
		return "", e
	}
	if workspace && len(p.WorkspaceRoots) > 0 && !matches(target, p.WorkspaceRoots) {
		return "", errors.New("Blocked by Remote Arc Trusted Write Locations: path is outside the allowed write roots.")
	}
	if p.TaskWorkspaceRoot != "" && !matches(target, []string{p.TaskWorkspaceRoot}) {
		return "", errors.New("Blocked by Remote Arc Task Workspace: path escapes the owned candidate.")
	}
	if protocol.Enabled(p.ProtectSensitivePaths) && !matches(target, p.SensitiveAllowPaths) && (Sensitive(target) || matches(target, append(defaultRoots(), p.SensitivePaths...))) {
		return "", errors.New("Blocked by Remote Arc Sensitive Path Policy. Add a narrow sensitive-path exception for this device if you intentionally need access.")
	}
	return target, nil
}
