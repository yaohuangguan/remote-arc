package execution

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"sync"

	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/policy"
	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/protocol"
)

//go:embed tools.json guards.json
var contracts embed.FS

type Definition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}
type guardRule struct {
	Pattern string `json:"pattern"`
	Reason  string `json:"reason"`
}

var definitions []Definition
var guards []guardRule
var compiled []*regexp.Regexp

func init() {
	b, _ := contracts.ReadFile("tools.json")
	if e := json.Unmarshal(b, &definitions); e != nil {
		panic(e)
	}
	b, _ = contracts.ReadFile("guards.json")
	if e := json.Unmarshal(b, &guards); e != nil {
		panic(e)
	}
	for _, g := range guards {
		compiled = append(compiled, regexp.MustCompile(g.Pattern))
	}
}
func AssertCommandAllowed(command string) error {
	if os.Getenv("REMOTEARC_ALLOW_DESTRUCTIVE") == "1" {
		return nil
	}
	for i, re := range compiled {
		if re.MatchString(command) {
			return errors.New("Blocked by Remote Arc Safety Guard: " + guards[i].Reason + ". Run this action manually on the device if you intentionally need it.")
		}
	}
	return nil
}

type Core struct {
	Mode      string
	Processes *Processes
	mutation  sync.Mutex
}

func New(mode string) *Core { return &Core{Mode: mode, Processes: NewProcesses()} }
func (c *Core) ListTools() []Definition {
	result := []Definition{}
	safe := map[string]bool{"list_directory": true, "browse_directories": true, "read_file": true, "read_binary_file": true, "get_file_info": true, "list_processes": true, "list_undo_actions": true}
	dev := map[string]bool{"write_file": true, "edit_block": true, "undo_change": true, "undo_last_change": true}
	for _, d := range definitions {
		if c.Mode == "safe" && !safe[d.Name] {
			continue
		}
		if c.Mode == "developer" && !safe[d.Name] && !dev[d.Name] {
			continue
		}
		result = append(result, d)
	}
	return result
}
func (c *Core) Close() { c.Processes.Close() }
func (c *Core) Call(ctx context.Context, name string, args map[string]any, p protocol.Policy) (protocol.Result, error) {
	p = protocol.Normalize(p)
	allowed := false
	for _, d := range c.ListTools() {
		if d.Name == name {
			allowed = true
			break
		}
	}
	if !allowed {
		return protocol.Result{}, errors.New("Tool blocked by local permission mode: " + name)
	}
	if args == nil {
		args = map[string]any{}
	}
	rawPath := func(key string, workspace bool) (string, error) {
		s, e := protocol.String(args, key)
		if e != nil {
			return "", e
		}
		return policy.Enforce(s, p, workspace)
	}
	var result any
	var e error
	switch name {
	case "list_directory", "browse_directories", "read_file", "read_binary_file", "get_file_info":
		target, err := rawPath("path", false)
		if err != nil {
			return protocol.Result{}, err
		}
		switch name {
		case "list_directory":
			result, e = listDirectory(target, protocol.Number(args, "depth", 2), p)
		case "browse_directories":
			result, e = browse(target, p)
		case "read_file":
			result, e = readText(target, protocol.Number(args, "offset", 0), protocol.Number(args, "length", 240))
		case "read_binary_file":
			result, e = readBinary(target, protocol.Number(args, "offset", 0), protocol.Number(args, "length", 65536), protocol.OptionalString(args, "expected_revision"))
		case "get_file_info":
			result, e = fileInfo(target)
		}
	case "list_processes":
		result, e = listProcesses()
	case "list_undo_actions", "undo_change", "undo_last_change":
		c.mutation.Lock()
		defer c.mutation.Unlock()
		if name != "list_undo_actions" && !protocol.Enabled(p.UndoEnabled) {
			return protocol.Result{}, errors.New("Local Undo is disabled for this device.")
		}
		limit := 100
		if name == "list_undo_actions" {
			limit = protocol.Number(args, "limit", 20)
		}
		items, err := undoCandidates()
		if err != nil {
			return protocol.Result{}, err
		}
		visible := []snapshot{}
		for _, a := range items {
			if _, err := policy.Enforce(a.Manifest.Target, p, true); err == nil {
				visible = append(visible, a)
			}
		}
		if name == "list_undo_actions" {
			// List metadata and validation status only for authorized records.
			result, e = listUndoFiltered(visible, limit)
			break
		}
		var selected *snapshot
		if name == "undo_change" {
			id, err := protocol.String(args, "action_id")
			if err != nil {
				return protocol.Result{}, err
			}
			for i := range visible {
				if visible[i].Manifest.ID == id {
					selected = &visible[i]
					break
				}
			}
		} else if len(visible) > 0 {
			selected = &visible[0]
		}
		if selected == nil {
			if name == "undo_last_change" {
				e = errors.New("No reversible in-scope Remote Arc file change is available.")
			} else {
				e = errors.New("Undo action not found or expired on this device.")
			}
			break
		}
		result, e = restoreUndoSnapshot(*selected)
	case "start_process":
		command, err := protocol.String(args, "command")
		if err != nil {
			return protocol.Result{}, err
		}
		if err = AssertCommandAllowed(command); err != nil {
			return protocol.Result{}, err
		}
		cwd := protocol.OptionalString(args, "cwd")
		if (len(p.WorkspaceRoots) > 0 || p.TaskWorkspaceRoot != "") && cwd == "" {
			return protocol.Result{}, errors.New("Trusted Write Locations are enabled. start_process requires an in-scope cwd. Terminal commands are not an OS sandbox and may still access paths outside that directory.")
		}
		if cwd != "" {
			cwd, e = policy.Enforce(cwd, p, true)
			if e != nil {
				return protocol.Result{}, e
			}
		}
		if protocol.Bool(args, "background") {
			seconds, err := protocol.Integer(args, "max_duration_seconds", 0, 1, 7*86400)
			if err != nil {
				return protocol.Result{}, errors.New("Invalid managed process duration.")
			}
			result, e = c.Processes.Background(command, cwd, seconds)
		} else {
			result, e = c.Processes.Run(ctx, command, cwd, protocol.Number(args, "timeout_ms", 5000))
		}
	case "list_managed_processes":
		result = c.Processes.List()
	case "process_status", "process_output", "stop_process":
		id, err := protocol.String(args, "process_id")
		if err != nil {
			return protocol.Result{}, err
		}
		switch name {
		case "process_status":
			result, e = c.Processes.Status(id)
		case "process_output":
			result, e = c.Processes.Output(id)
		case "stop_process":
			result, e = c.Processes.Stop(id)
		}
	case "write_file", "edit_block":
		c.mutation.Lock()
		defer c.mutation.Unlock()
		key := "path"
		if name == "edit_block" {
			key = "file_path"
		}
		target, err := rawPath(key, true)
		if err != nil {
			return protocol.Result{}, err
		}
		var snap *snapshot
		if protocol.Enabled(p.UndoEnabled) {
			snap, e = createSnapshot(name, target)
			if e != nil {
				return protocol.Result{}, e
			}
		}
		var data map[string]any
		if name == "write_file" {
			content, err := protocol.String(args, "content")
			if err != nil {
				discardSnapshot(snap)
				return protocol.Result{}, err
			}
			mode := "rewrite"
			if args["mode"] == "append" {
				mode = "append"
			}
			data, e = writeText(target, content, mode)
		} else {
			old, err := protocol.String(args, "old_string")
			if err != nil {
				discardSnapshot(snap)
				return protocol.Result{}, err
			}
			next, err := protocol.String(args, "new_string")
			if err != nil {
				discardSnapshot(snap)
				return protocol.Result{}, err
			}
			data, e = editBlock(target, old, next, protocol.Number(args, "expected_replacements", 1))
		}
		if e != nil {
			// A failed post-rename directory sync can leave the target changed.
			// Keep the prepared snapshot for inspection instead of deleting it.
			discardUnchangedSnapshot(snap)
			break
		}
		available := finalizeSnapshot(snap)
		data["undo_available"] = available
		data["undo_storage"] = nil
		if available {
			data["undo_storage"] = "local-device-only"
		}
		result = data
	default:
		e = fmt.Errorf("Unknown Remote Arc tool: %s", name)
	}
	if e != nil {
		return protocol.Result{}, e
	}
	return protocol.TextResult(result), nil
}
