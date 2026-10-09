package protocol

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

type Policy struct {
	WorkspaceRoots        []string `json:"workspaceRoots,omitempty"`
	TaskWorkspaceRoot     string   `json:"taskWorkspaceRoot,omitempty"`
	ProtectSensitivePaths *bool    `json:"protectSensitivePaths,omitempty"`
	SensitivePaths        []string `json:"sensitivePaths,omitempty"`
	SensitiveAllowPaths   []string `json:"sensitiveAllowPaths,omitempty"`
	UndoEnabled           *bool    `json:"undoEnabled,omitempty"`
}

func Normalize(p Policy) Policy {
	clean := func(roots []string) []string {
		out := []string{}
		seen := map[string]bool{}
		for _, root := range roots {
			if strings.TrimSpace(root) != "" && !seen[root] {
				seen[root] = true
				out = append(out, root)
				if len(out) == 32 {
					break
				}
			}
		}
		return out
	}
	p.WorkspaceRoots = clean(p.WorkspaceRoots)
	p.SensitivePaths = clean(p.SensitivePaths)
	p.SensitiveAllowPaths = clean(p.SensitiveAllowPaths)
	if strings.TrimSpace(p.TaskWorkspaceRoot) == "" {
		p.TaskWorkspaceRoot = ""
	}
	return p
}

type Call struct {
	Type      string         `json:"type"`
	ID        string         `json:"id"`
	Tool      string         `json:"tool"`
	Arguments map[string]any `json:"arguments"`
	Policy    Policy         `json:"policy"`
}
type Text struct {
	Type string `json:"type"`
	Text string `json:"text"`
}
type Result struct {
	Content []Text `json:"content"`
	IsError bool   `json:"isError,omitempty"`
}

func TextResult(value any) Result {
	s, ok := value.(string)
	if !ok {
		b, _ := json.MarshalIndent(value, "", "  ")
		s = string(b)
	}
	return Result{Content: []Text{{Type: "text", Text: s}}}
}
func String(args map[string]any, key string) (string, error) {
	s, ok := args[key].(string)
	if !ok {
		return "", fmt.Errorf("%s must be a string.", key)
	}
	return s, nil
}
func OptionalString(args map[string]any, key string) string { s, _ := args[key].(string); return s }
func Number(args map[string]any, key string, fallback int) int {
	f, ok := args[key].(float64)
	if ok && !math.IsNaN(f) && !math.IsInf(f, 0) {
		return int(f)
	}
	if n, ok := args[key].(int); ok {
		return n
	}
	return fallback
}
func Integer(args map[string]any, key string, fallback, minimum, maximum int) (int, error) {
	v, present := args[key]
	if !present {
		return fallback, nil
	}
	f, ok := v.(float64)
	if n, integer := v.(int); integer {
		f = float64(n)
		ok = true
	}
	if !ok || math.IsNaN(f) || math.IsInf(f, 0) || math.Trunc(f) != f || f < float64(minimum) || f > float64(maximum) {
		return 0, fmt.Errorf("%s must be an integer between %d and %d.", key, minimum, maximum)
	}
	return int(f), nil
}
func Bool(args map[string]any, key string) bool { b, _ := args[key].(bool); return b }
func Enabled(value *bool) bool                  { return value == nil || *value }
func Platform(value string) string {
	if value == "windows" {
		return "win32"
	}
	return value
}
