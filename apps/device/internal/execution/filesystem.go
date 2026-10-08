package execution

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/device/internal/config"
	"github.com/yaohuangguan/remote-arc/apps/device/internal/policy"
	"github.com/yaohuangguan/remote-arc/apps/device/internal/protocol"
)

const MaxTextBytes = 20 * 1024 * 1024

func sizeString(n int64) string {
	if n < 1024 {
		return fmt.Sprintf("%d B", n)
	}
	if n < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(n)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(n)/(1024*1024))
}
func listDirectory(target string, depth int, p protocol.Policy) (string, error) {
	depth = max(1, min(10, depth))
	s, e := os.Stat(target)
	if e != nil {
		return "", e
	}
	if !s.IsDir() {
		return "", errors.New("Path is not a directory: " + target)
	}
	lines := []string{}
	seen, protected := 0, 0
	var walk func(string, int, string) error
	walk = func(dir string, level int, prefix string) error {
		es, e := os.ReadDir(dir)
		if e != nil {
			return e
		}
		sort.SliceStable(es, func(i, j int) bool {
			if es[i].IsDir() != es[j].IsDir() {
				return es[i].IsDir()
			}
			return strings.ToLower(es[i].Name()) < strings.ToLower(es[j].Name())
		})
		for _, entry := range es {
			if seen >= 2000 {
				break
			}
			abs := filepath.Join(dir, entry.Name())
			if _, e := policy.Enforce(abs, p, false); e != nil {
				protected++
				continue
			}
			seen++
			label := "[FILE]"
			if entry.IsDir() {
				label = "[DIR]"
			} else if entry.Type()&os.ModeSymlink != 0 {
				label = "[LINK]"
			}
			lines = append(lines, prefix+label+" "+entry.Name())
			if entry.IsDir() && level < depth {
				if e := walk(abs, level+1, prefix+"  "); e != nil {
					return e
				}
			}
		}
		return nil
	}
	if e = walk(target, 1, ""); e != nil {
		return "", e
	}
	if seen >= 2000 {
		lines = append(lines, "… truncated after 2000 entries")
	}
	text := strings.Join(lines, "\n")
	if text == "" {
		text = "(empty)"
	}
	if protected > 0 {
		suffix := "ies"
		if protected == 1 {
			suffix = "y"
		}
		text += fmt.Sprintf("\n\n[Remote Arc omitted %d protected or out-of-scope entr%s.]", protected, suffix)
	}
	return fmt.Sprintf("Directory: %s\nDepth: %d\n\n%s", target, depth, text), nil
}
func readText(target string, offset, length int) (string, error) {
	s, e := os.Stat(target)
	if e != nil {
		return "", e
	}
	if !s.Mode().IsRegular() {
		return "", errors.New("Path is not a file: " + target)
	}
	if s.Size() > MaxTextBytes {
		return "", fmt.Errorf("File is too large for read_file (%s > 20 MB). Use a terminal command or a more targeted tool instead.", sizeString(s.Size()))
	}
	b, e := os.ReadFile(target)
	if e != nil {
		return "", e
	}
	if bytes.IndexByte(b[:min(len(b), 8192)], 0) >= 0 {
		return "", errors.New("Binary file detected. read_file currently supports text files only.")
	}
	text := strings.ToValidUTF8(string(b), "�")
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	start := offset
	if offset < 0 {
		start = len(lines) + offset
	}
	start = max(0, min(len(lines), start))
	if length <= 0 {
		length = 240
	}
	end := min(len(lines), start+length)
	loc := "start"
	if start > 0 {
		if end == len(lines) {
			loc = fmt.Sprintf("line %d to end", start+1)
		} else {
			loc = fmt.Sprintf("lines %d-%d", start+1, end)
		}
	}
	return fmt.Sprintf("[Reading %d lines from %s (total: %d lines, %s)]\n\n%s", end-start, loc, len(lines), sizeString(s.Size()), strings.Join(lines[start:end], "\n")), nil
}
func fileRevision(s os.FileInfo) string {
	t := s.ModTime()
	ms := float64(t.Unix())*1000 + float64(t.Nanosecond())/1e6
	h := sha256.Sum256([]byte(strconv.FormatInt(s.Size(), 10) + ":" + strconv.FormatFloat(ms, 'f', -1, 64)))
	return hex.EncodeToString(h[:])
}
func mimeType(target string, b []byte) string {
	ext := strings.ToLower(filepath.Ext(target))
	office := map[string]string{".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}
	if s := office[ext]; s != "" {
		return s
	}
	switch {
	case bytes.HasPrefix(b, []byte{137, 80, 78, 71, 13, 10, 26, 10}):
		return "image/png"
	case bytes.HasPrefix(b, []byte{255, 216, 255}):
		return "image/jpeg"
	case bytes.HasPrefix(b, []byte("GIF87a")) || bytes.HasPrefix(b, []byte("GIF89a")):
		return "image/gif"
	case bytes.HasPrefix(b, []byte("%PDF-")):
		return "application/pdf"
	case bytes.HasPrefix(b, []byte{31, 139}):
		return "application/gzip"
	case bytes.HasPrefix(b, []byte{0, 97, 115, 109}):
		return "application/wasm"
	case len(b) >= 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WEBP":
		return "image/webp"
	case bytes.HasPrefix(b, []byte{80, 75, 3, 4}) || bytes.HasPrefix(b, []byte{80, 75, 5, 6}) || bytes.HasPrefix(b, []byte{80, 75, 7, 8}):
		return "application/zip"
	}
	known := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf", ".zip": "application/zip", ".gz": "application/gzip", ".wasm": "application/wasm"}
	if s := known[ext]; s != "" {
		return s
	}
	return "application/octet-stream"
}
func readBinary(target string, offset, length int, expected string) (map[string]any, error) {
	s, e := os.Stat(target)
	if e != nil {
		return nil, e
	}
	if !s.Mode().IsRegular() {
		return nil, errors.New("Path is not a file: " + target)
	}
	revision := fileRevision(s)
	if expected != "" && expected != revision {
		return nil, errors.New("FILE_CHANGED_DURING_READ: Binary file changed since the previous chunk. Restart from offset 0 with the new file_revision.")
	}
	if length <= 0 {
		return nil, errors.New("length must be a positive byte count.")
	}
	if length > 262144 {
		return nil, errors.New("read_binary_file length cannot exceed 262144 bytes.")
	}
	offset = max(0, offset)
	data := []byte{}
	header := []byte{}
	if int64(offset) < s.Size() {
		f, e := os.Open(target)
		if e != nil {
			return nil, e
		}
		defer f.Close()
		header = make([]byte, min(int64(16), s.Size()))
		n, _ := f.ReadAt(header, 0)
		header = header[:n]
		data = make([]byte, min(int64(length), s.Size()-int64(offset)))
		n, e = f.ReadAt(data, int64(offset))
		if e != nil && e != io.EOF {
			return nil, e
		}
		data = data[:n]
		after, e := os.Stat(target)
		if e != nil {
			return nil, e
		}
		if fileRevision(after) != revision {
			return nil, errors.New("FILE_CHANGED_DURING_READ: Binary file changed while this chunk was being read. Restart from offset 0.")
		}
	}
	hash := sha256.Sum256(data)
	return map[string]any{"path": target, "mime_type": mimeType(target, header), "encoding": "base64", "size": s.Size(), "file_revision": revision, "offset": offset, "bytes_read": len(data), "eof": int64(offset+len(data)) >= s.Size(), "chunk_sha256": hex.EncodeToString(hash[:]), "data": base64.StdEncoding.EncodeToString(data)}, nil
}

// Node's fs.Stats Date fields round milliseconds before constructing a Date.
// Keep the wire timestamps identical, including negative half-millisecond ties.
func statTimestamp(t time.Time) string {
	ms := float64(t.Unix())*1000 + float64(t.Nanosecond())/1e6
	return time.UnixMilli(int64(math.Floor(ms + 0.5))).UTC().Format("2006-01-02T15:04:05.000Z")
}
func fileInfo(target string) (map[string]any, error) {
	s, e := os.Lstat(target)
	if e != nil {
		return nil, e
	}
	kind := "other"
	if s.Mode().IsRegular() {
		kind = "file"
	} else if s.IsDir() {
		kind = "directory"
	} else if s.Mode()&os.ModeSymlink != 0 {
		kind = "symlink"
	}
	created, accessed, mode := statDetails(target, s)
	return map[string]any{"path": target, "type": kind, "size": s.Size(), "size_human": sizeString(s.Size()), "mode": mode, "created_at": statTimestamp(created), "modified_at": statTimestamp(s.ModTime()), "accessed_at": statTimestamp(accessed)}, nil
}
func writeText(target, content, mode string) (map[string]any, error) {
	if e := os.MkdirAll(filepath.Dir(target), 0755); e != nil {
		return nil, e
	}
	if mode == "append" {
		f, e := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if e != nil {
			return nil, e
		}
		_, e = f.WriteString(content)
		ce := f.Close()
		if e != nil {
			return nil, e
		}
		if ce != nil {
			return nil, ce
		}
	} else {
		if e := config.AtomicWrite(target, []byte(content), 0644); e != nil {
			return nil, e
		}
	}
	s, e := os.Stat(target)
	if e != nil {
		return nil, e
	}
	return map[string]any{"path": target, "mode": mode, "bytes": len(content), "file_size": s.Size(), "atomic": mode == "rewrite"}, nil
}
func editBlock(target, old, new string, expected int) (map[string]any, error) {
	if old == "" {
		return nil, errors.New("old_string cannot be empty.")
	}
	b, e := os.ReadFile(target)
	if e != nil {
		return nil, e
	}
	current := string(b)
	count := strings.Count(current, old)
	if count != expected {
		return nil, fmt.Errorf("Expected %d replacement(s) in %s, found %d. No changes were written.", expected, target, count)
	}
	next := strings.ReplaceAll(current, old, new)
	if e = config.AtomicWrite(target, []byte(next), 0644); e != nil {
		return nil, e
	}
	return map[string]any{"path": target, "replacements": count, "bytes_before": len(current), "bytes_after": len(next), "atomic": true}, nil
}
func browse(target string, p protocol.Policy) (map[string]any, error) {
	s, e := os.Stat(target)
	if e != nil {
		return nil, e
	}
	if !s.IsDir() {
		return nil, errors.New("Path is not a directory: " + target)
	}
	es, e := os.ReadDir(target)
	if e != nil {
		return nil, e
	}
	dirs := []map[string]any{}
	protected := 0
	for _, entry := range es {
		symlink := entry.Type()&os.ModeSymlink != 0
		if !entry.IsDir() && !symlink {
			continue
		}
		abs := filepath.Join(target, entry.Name())
		if _, e = policy.Enforce(abs, p, true); e != nil {
			protected++
			continue
		}
		kind := "directory"
		if symlink {
			kind = "symlink"
		}
		dirs = append(dirs, map[string]any{"name": entry.Name(), "path": abs, "type": kind})
		if len(dirs) >= 300 {
			break
		}
	}
	var parent any = filepath.Dir(target)
	if parent == target {
		parent = nil
	}
	return map[string]any{"path": target, "parent": parent, "directories": dirs, "protected_entries_omitted": protected, "truncated": len(dirs) >= 300}, nil
}
