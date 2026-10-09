package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/agent"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/control"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/journal"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/localmcp"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/execution"
)

const Help = `Remote Arc Go device agent
Usage: remotelink [options]
  --go              Select the complete Go runtime (also accepted natively)
  --safe            Hard local read-only cap
  --developer       Legacy alias for dashboard-managed capabilities
  --foreground      Stay attached without installing recovery
  --background      Enable native process recovery and stay attached
  --no-background   Disable future recovery; preserve current execution
  --reset           Remove pairing after gracefully stopping this Go agent
  --status          Print the active Go agent and recovery status
  --stop            Disable recovery and gracefully stop this Go agent
  --logs            Print the last 100 local operation log entries
  --mcp             Serve local MCP over stdio (default mode: safe)
  --origin=<url>    Relay origin used for a new pairing
  --version, -v     Print version
  --help, -h        Show help
`

type Options struct {
	Safe, Developer, Foreground, Background, NoBackground, Reset, Status, Stop, Logs, MCP, Agent, Supervise, Help, Version bool
	Origin                                                                                                                 string
}

func Parse(args []string) (Options, error) {
	var o Options
	for _, s := range args {
		switch s {
		case "--go":
		case "--safe":
			o.Safe = true
		case "--developer":
			o.Developer = true
		case "--foreground":
			o.Foreground = true
		case "--background":
			o.Background = true
		case "--no-background":
			o.NoBackground = true
		case "--reset":
			o.Reset = true
		case "--status":
			o.Status = true
		case "--stop":
			o.Stop = true
		case "--logs":
			o.Logs = true
		case "--mcp":
			o.MCP = true
		case "--agent":
			o.Agent = true
		case "--supervise":
			o.Supervise = true
		case "--help", "-h":
			o.Help = true
		case "--version", "-v":
			o.Version = true
		default:
			if strings.HasPrefix(s, "--origin=") {
				o.Origin = strings.TrimPrefix(s, "--origin=")
			} else {
				return o, fmt.Errorf("Unknown Go agent option: %s", s)
			}
		}
	}
	if (o.Safe && o.Developer) || (o.Background && o.NoBackground) || (o.Agent && o.Supervise) || (o.Foreground && o.Background) {
		return o, errors.New("Conflicting Go agent options.")
	}
	if o.Origin != "" {
		var e error
		o.Origin, e = agent.Origin(o.Origin)
		if e != nil {
			return o, e
		}
	}
	return o, nil
}

type synchronizedWriter struct {
	sync.Mutex
	io.Writer
	colored bool
}

func (s *synchronizedWriter) TerminalColor() bool { return s.colored }

func (s *synchronizedWriter) Write(b []byte) (int, error) {
	s.Lock()
	defer s.Unlock()
	return s.Writer.Write(b)
}
func enabled() bool {
	c, e := config.Load()
	return e == nil && c.BackgroundEnabled != nil && *c.BackgroundEnabled
}
func Main(ctx context.Context, args []string, version string, input *os.File, output, errorOutput io.Writer) error {
	o, e := Parse(args)
	if e != nil {
		return e
	}
	if o.Help {
		_, e = fmt.Fprint(output, Help)
		return e
	}
	if o.Version {
		_, e = fmt.Fprintln(output, version)
		return e
	}
	if o.MCP {
		mode := os.Getenv("REMOTEARC_MODE")
		if mode == "" {
			mode = os.Getenv("REMOTE_LINK_MODE")
		}
		if mode == "" {
			mode = "safe"
		}
		if o.Safe {
			mode = "safe"
		}
		if o.Developer {
			mode = "developer"
		}
		if mode != "safe" && mode != "developer" && mode != "managed" && mode != "full" {
			return errors.New("Invalid local MCP mode.")
		}
		fmt.Fprintln(errorOutput, "Remote Arc Local MCP started in "+mode+" mode using the Go execution core")
		return localmcp.Run(ctx, execution.New(mode), version)
	}
	out := &synchronizedWriter{Writer: output, colored: output == os.Stdout && isOutputTerminal() && os.Getenv("NO_COLOR") == ""}
	dir := filepath.Join(config.Dir(), "agent")
	log := &journal.Journal{Dir: filepath.Join(config.Dir(), "logs"), Output: out, Color: out.TerminalColor()}
	bg := service.New(version)
	if o.Logs {
		return json.NewEncoder(output).Encode(log.Tail(100))
	}
	if o.Status {
		active, err := control.Request(ctx, dir, "GET", "/status")
		if err != nil {
			active = map[string]any{"engine": "go", "active": false}
		}
		return json.NewEncoder(output).Encode(map[string]any{"agent": active, "recovery": bg.Status(ctx)})
	}
	if o.Stop || o.Reset {
		if lease.Active(dir, "execution") {
			status, err := control.Request(ctx, dir, "GET", "/status")
			if err != nil || status["engine"] != "go" {
				return errors.New("A TS agent owns this device. Stop it locally before changing the Go runtime.")
			}
		}
		if c, err := config.Load(); err == nil {
			off := false
			c.BackgroundEnabled = &off
			if err = config.Save(c); err != nil {
				return err
			}
		}
		_ = bg.Disable(ctx)
		if lease.Active(dir, "execution") {
			if _, err := control.Request(ctx, dir, "POST", "/stop"); err != nil {
				return err
			}
		}
		deadline := time.Now().Add(15 * time.Second)
		for lease.Active(dir, "execution") {
			if time.Now().After(deadline) {
				return errors.New("Go agent is still draining operations; pairing has been preserved.")
			}
			if e = wait(ctx, 100*time.Millisecond); e != nil {
				return e
			}
		}
		bg.StopSupervision(ctx)
		if o.Reset {
			return config.Reset()
		}
		return nil
	}
	// Refuse a foreign execution owner before mutating pairing, mode or recovery.
	if !o.Agent && !o.Supervise && lease.Active(dir, "execution") {
		status, err := control.Request(ctx, dir, "GET", "/status")
		if err != nil || status["engine"] != "go" {
			if !o.Background {
				return errors.New("Another Agent owns execution. Stop it locally before changing runtimes; no commands were replayed.")
			}
			// Background startup after a forced TS/Go exit must wait until
			// the previous execution lease expires. Never take a live lease.
			log.Log("warn", "Waiting for previous Agent execution lease to release before restoring Go background recovery.")
			if e := waitForPriorOwnerRelease(ctx, dir); e != nil {
				return e
			}
		} else {
			if o.NoBackground {
				cfg, err := config.Load()
				if err != nil {
					return err
				}
				no := false
				cfg.BackgroundEnabled = &no
				if err = config.Save(cfg); err != nil {
					return err
				}
				if err = bg.Disable(ctx); err != nil {
					return err
				}
			}
			if o.Safe || o.Developer || o.Background {
				return errors.New("A Go agent already owns execution. Change recovery in Dashboard, or use --go --stop before changing its local profile.")
			}
		}
	}
	if o.Supervise {
		return supervise(ctx, version, log)
	}
	if log.Color && !o.Agent {
		fmt.Fprintf(out, "\n\x1b[1mRemote Arc\x1b[0m  \x1b[2mv%s\x1b[0m\n\x1b[2mControlled remote access for AI\x1b[0m\n\x1b[36m●\x1b[0m  Native Go runtime  ·  Dashboard-managed permissions\n\n", version)
	}
	client := agent.NewClient()
	ask := terminalAsk(input, out)
	for ctx.Err() == nil {
		cfg, err := config.Load()
		if err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				return fmt.Errorf("Cannot read saved pairing: %w", err)
			}
			if o.Agent {
				return nil
			}
			origin := o.Origin
			if origin == "" {
				origin = os.Getenv("REMOTEARC_ORIGIN")
			}
			if origin == "" {
				origin = os.Getenv("REMOTE_LINK_ORIGIN")
			}
			if origin == "" {
				origin = config.DefaultOrigin
			}
			mode := "managed"
			if o.Safe {
				mode = "safe"
			}
			cfg, e = client.Pair(ctx, origin, mode, out, openBrowser)
			if e != nil {
				return e
			}
		}
		origin, err := agent.Origin(cfg.Origin)
		if err != nil {
			return err
		}
		if origin != cfg.Origin {
			cfg.Origin = origin
			if e = config.Save(cfg); e != nil {
				return e
			}
		}
		if o.Agent && !enabled() {
			return nil
		}
		if !o.Agent && errors.Is(client.Validate(ctx, cfg), agent.ErrRevoked) {
			if lease.Active(dir, "execution") {
				return errors.New("The active agent's pairing was revoked; stop that agent before pairing again.")
			}
			_ = bg.Disable(ctx)
			bg.StopSupervision(ctx)
			if e = config.Reset(); e != nil {
				return e
			}
			log.Log("warn", "Pairing revoked; starting a fresh device pairing.")
			continue
		}
		var owned *lease.Lease
		var cursor *int64
		announced := false
		stopApprovals := func() {}
		if !o.Agent && isTerminal(input) && isOutputTerminal() {
			approvalCtx, cancelApprovals := context.WithCancel(ctx)
			stopped := make(chan struct{})
			go func() { defer close(stopped); client.PollApprovals(approvalCtx, cfg, out, ask) }()
			stopApprovals = func() { cancelApprovals(); <-stopped }
			defer stopApprovals()
		}
		for ctx.Err() == nil {
			if o.Agent && !enabled() {
				return nil
			}
			owned, e = lease.Acquire(dir, "execution")
			if e != nil {
				return e
			}
			if owned != nil {
				break
			}
			if !o.Agent {
				status, err := control.Request(ctx, dir, "GET", "/status")
				if err != nil || status["engine"] != "go" {
					return errors.New("Another runtime owns execution; stop it locally before launching Go.")
				}
				if !announced {
					log.Log("info", "A Go agent owns execution. Following its operation log; Ctrl+C closes this viewer.")
					announced = true
				}
				next, text := log.Read(cursor)
				cursor = &next
				if text != "" {
					fmt.Fprint(out, journal.FormatHistory(text, log.Color))
				}
			}
			if e = wait(ctx, 500*time.Millisecond); e != nil {
				return e
			}
		}
		if owned == nil {
			return ctx.Err()
		}
		err = runOwned(ctx, o, cfg, version, owned, bg, log, client, out, ask, input)
		stopApprovals()
		if errors.Is(err, agent.ErrRevoked) {
			_ = bg.Disable(ctx)
			if o.Agent {
				off := false
				cfg.BackgroundEnabled = &off
				_ = config.Save(cfg)
				return config.Reset()
			}
			bg.StopSupervision(ctx)
			if e = config.Reset(); e != nil {
				return e
			}
			continue
		}
		if o.Agent && enabled() {
			return errors.New("Go worker ended while recovery is enabled.")
		}
		return err
	}
	return ctx.Err()
}
func runOwned(parent context.Context, o Options, cfg config.Config, version string, owned *lease.Lease, bg *service.Controller, log *journal.Journal, client *agent.Client, out io.Writer, ask agent.Ask, input *os.File) error {
	defer owned.Release()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	go func() {
		select {
		case <-owned.Lost():
			log.Log("error", "Execution lease lost; stopping the Go agent.")
			cancel()
		case <-ctx.Done():
		}
	}()
	if o.Safe {
		cfg.Mode = "safe"
	}
	if o.Developer {
		cfg.Mode = "managed"
	}
	if o.Background {
		yes := true
		cfg.BackgroundEnabled = &yes
	}
	if o.NoBackground {
		no := false
		cfg.BackgroundEnabled = &no
	}
	if e := config.Save(cfg); e != nil {
		return e
	}
	a := agent.New(cfg, version, o.Agent, log)
	a.Stop = cancel
	a.Client = client
	log.Log("info", "Go device runtime "+version+" · local mode "+a.Core.Mode)
	log.Log("info", fmt.Sprintf("File writes: %s · Undo: %s · device state: durable", config.FileDurability(), config.UndoDurability()))
	log.Log("info", fmt.Sprintf("Local tools ready: %d execution tools and 5 device tools.", len(a.Core.ListTools())))
	if cfg.BackgroundEnabled == nil {
		log.Log("info", "Background connection is not configured yet · finish setup in Dashboard → Devices.")
	}
	local, e := control.Start(filepath.Join(config.Dir(), "agent"), version, func() any { return a.Status() }, cancel)
	if e != nil {
		a.Core.Close()
		return e
	}
	defer local.Close()
	if o.NoBackground {
		if e = bg.Disable(ctx); e != nil {
			log.Log("warn", "Could not disable future recovery.")
		}
	}
	if !o.Agent && !o.Foreground && enabled() {
		if _, e = bg.Enable(ctx); e != nil {
			log.Log("warn", "Could not enable recovery; foreground connection remains available: "+e.Error())
		}
	}
	return a.Run(ctx)
}
func wait(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
func terminalAsk(input *os.File, output io.Writer) agent.Ask {
	var once sync.Once
	answers := make(chan string)
	return func(ctx context.Context, prompt string) (string, error) {
		once.Do(func() {
			go func() {
				defer close(answers)
				scanner := bufio.NewScanner(input)
				for scanner.Scan() {
					answers <- scanner.Text()
				}
			}()
		})
		fmt.Fprint(output, prompt)
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case answer, ok := <-answers:
			if !ok {
				return "", io.EOF
			}
			return answer, nil
		}
	}
}
func isTerminal(f *os.File) bool {
	s, e := f.Stat()
	return e == nil && s.Mode()&os.ModeCharDevice != 0
}
func isOutputTerminal() bool { return isTerminal(os.Stdout) }
func openBrowser(link string) error {
	u, e := url.Parse(link)
	if e != nil || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.Host == "" {
		return errors.New("Invalid browser authorization URL.")
	}
	return launchBrowser(u.String())
}
