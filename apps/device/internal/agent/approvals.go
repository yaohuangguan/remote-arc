package agent

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/device/internal/config"
)

type Approval struct {
	ID         string `json:"id"`
	ClientID   string `json:"client_id"`
	ClientName string `json:"client_name"`
	RequestID  string `json:"request_id"`
	ToolName   string `json:"tool_name"`
	TargetPath string `json:"target_path"`
	ExpiresAt  string `json:"expires_at"`
}
type Ask func(context.Context, string) (string, error)

func Decision(answer string) string {
	switch strings.ToLower(strings.TrimSpace(answer)) {
	case "1":
		return "allow_once"
	case "2":
		return "allow_10m"
	case "3":
		return "always_folder"
	case "d", "deny":
		return "deny"
	}
	return ""
}
func (c *Client) PromptApproval(ctx context.Context, cfg config.Config, output io.Writer, ask Ask) error {
	var pending []Approval
	_, e := c.Request(ctx, cfg.Origin, cfg.DeviceToken, "GET", "/api/device/approvals/pending", nil, &pending)
	if e != nil || len(pending) == 0 {
		return e
	}
	a := pending[0]
	if a.ID == "" {
		return nil
	}
	client := a.ClientName
	if client == "" {
		client = a.ClientID
	}
	if client == "" {
		client = "AI client"
	}
	fmt.Fprintf(output, "\nApproval required · %s\n       %s\n       %s · expires %s\n", a.ToolName, a.TargetPath, client, a.ExpiresAt)
	promptCtx := ctx
	cancel := func() {}
	if expires, err := time.Parse(time.RFC3339, a.ExpiresAt); err == nil {
		promptCtx, cancel = context.WithDeadline(ctx, expires)
	}
	defer cancel()
	answer, e := ask(promptCtx, "       [1] Allow once  [2] Allow 10 min  [3] Trust folder  [d] Deny  [Enter] Later\n       > ")
	if e != nil {
		return e
	}
	decision := Decision(answer)
	if decision == "" {
		fmt.Fprintln(output, "Approval left pending · use Dashboard → Security anytime.")
		return nil
	}
	_, e = c.Request(ctx, cfg.Origin, cfg.DeviceToken, "POST", "/api/device/approvals/"+url.PathEscape(a.ID)+"/decision", map[string]string{"decision": decision}, nil)
	if e == nil {
		fmt.Fprintln(output, "Approval decision saved: "+decision)
	}
	return e
}
func (c *Client) PollApprovals(ctx context.Context, cfg config.Config, output io.Writer, ask Ask) {
	for ctx.Err() == nil {
		_ = c.PromptApproval(ctx, cfg, output, ask)
		if pause(ctx, 4*time.Second) != nil {
			return
		}
	}
}
