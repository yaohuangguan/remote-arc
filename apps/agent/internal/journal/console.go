package journal

import (
	"fmt"
	"strings"
	"time"
)

// FormatConsoleLine intentionally affects only a foreground terminal.
// The persisted events.log and --logs JSON retain the stable plaintext format.
func FormatConsoleLine(timestamp time.Time, level, message string, color bool) string {
	stamp := timestamp.Format("15:04:05")
	icon := "•"
	tint := "36"
	switch level {
	case "success":
		icon, tint = "✓", "32"
	case "warn":
		icon, tint = "!", "33"
	case "error":
		icon, tint = "×", "31"
	case "event":
		icon, tint = "→", "36"
	}
	if color {
		return fmt.Sprintf("\x1b[2m%s\x1b[0m  \x1b[%sm%s\x1b[0m  %s\n", stamp, tint, icon, message)
	}
	return fmt.Sprintf("%s  %s  %s\n", stamp, icon, message)
}

// FormatHistory restores the familiar TS console style for a CLI attached
// as a viewer to a running Go agent, without changing persistent log records.
func FormatHistory(raw string, color bool) string {
	if !color || raw == "" {
		return raw
	}
	var out strings.Builder
	for _, line := range strings.SplitAfter(raw, "\n") {
		original := strings.TrimSuffix(line, "\n")
		if len(original) < 19 || original[0] != '[' || original[9] != ']' {
			out.WriteString(line)
			continue
		}
		stamp := original[1:9]
		tail := strings.TrimSpace(original[10:])
		parts := strings.Fields(tail)
		if len(parts) < 2 {
			out.WriteString(line)
			continue
		}
		level := parts[0]
		if level != "info" && level != "success" && level != "warn" && level != "error" && level != "event" {
			out.WriteString(line)
			continue
		}
		t, err := time.Parse("15:04:05", stamp)
		if err != nil {
			out.WriteString(line)
			continue
		}
		message := strings.TrimSpace(strings.TrimPrefix(tail, level))
		rendered := FormatConsoleLine(t, level, message, true)
		if !strings.HasSuffix(line, "\n") {
			rendered = strings.TrimSuffix(rendered, "\n")
		}
		out.WriteString(rendered)
	}
	return out.String()
}
