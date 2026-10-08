package localmcp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/execution"
)

func TestOfficialClientNegotiationToolsValidationAndMutation(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	for mode, count := range map[string]int{"safe": 8, "developer": 12, "managed": 17} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			core := execution.New(mode)
			defer core.Close()
			clientTransport, serverTransport := mcp.NewInMemoryTransports()
			done := make(chan error, 1)
			go func() { done <- Server(core, "test").Run(ctx, serverTransport) }()
			client := mcp.NewClient(&mcp.Implementation{Name: "fixture", Version: "test"}, nil)
			session, e := client.Connect(ctx, clientTransport, nil)
			if e != nil {
				t.Fatal(e)
			}
			defer session.Close()
			tools, e := session.ListTools(ctx, nil)
			if e != nil || len(tools.Tools) != count {
				t.Fatal("tool listing", e)
			}
			status, e := session.CallTool(ctx, &mcp.CallToolParams{Name: "remote_arc_status"})
			if e != nil {
				t.Fatal(e)
			}
			var value map[string]any
			json.Unmarshal([]byte(status.Content[0].(*mcp.TextContent).Text), &value)
			if value["engine"] != "go" || value["mode"] != mode {
				t.Fatal(value)
			}
			file := filepath.Join(home, mode+".txt")
			os.WriteFile(file, []byte("hello"), 0600)
			if r, e := session.CallTool(ctx, &mcp.CallToolParams{Name: "read_file", Arguments: map[string]any{"path": file}}); e != nil || r.IsError {
				t.Fatal("read failed", e)
			}
			if r, e := session.CallTool(ctx, &mcp.CallToolParams{Name: "read_file", Arguments: map[string]any{"path": file, "length": 0}}); e == nil && !r.IsError {
				t.Fatal("SDK accepted invalid schema input")
			}
			r, e := session.CallTool(ctx, &mcp.CallToolParams{Name: "write_file", Arguments: map[string]any{"path": file, "content": "changed"}})
			if mode == "safe" {
				if e == nil && !r.IsError {
					t.Fatal("safe MCP mutated")
				}
			} else if e != nil || r.IsError {
				t.Fatal("write failed", e)
			}
			session.Close()
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("stdio/session close leaked")
			}
		})
	}
}
