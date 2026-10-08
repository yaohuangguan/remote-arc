package protocol

import "testing"

func TestIntegerValidation(t *testing.T) {
	for _, v := range []any{1.1, "2", float64(-1), float64(181)} {
		if _, e := Integer(map[string]any{"s": v}, "s", 120, 0, 180); e == nil {
			t.Fatalf("accepted %v", v)
		}
	}
	if n, e := Integer(nil, "s", 120, 0, 180); e != nil || n != 120 {
		t.Fatal("default missing")
	}
}
func TestPolicyNormalizationBoundsAndDuplicates(t *testing.T) {
	roots := []string{"", " ", "root", "root"}
	for i := 0; i < 40; i++ {
		roots = append(roots, string(rune('a'+i)))
	}
	p := Normalize(Policy{WorkspaceRoots: roots, SensitivePaths: roots, SensitiveAllowPaths: roots, TaskWorkspaceRoot: " "})
	if len(p.WorkspaceRoots) != 32 || p.WorkspaceRoots[0] != "root" || len(p.SensitivePaths) != 32 || len(p.SensitiveAllowPaths) != 32 || p.TaskWorkspaceRoot != "" {
		t.Fatal("normalization differs from TS")
	}
}
