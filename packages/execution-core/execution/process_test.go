package execution

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestProcessHelper(t *testing.T) {
	if os.Getenv("REMOTEARC_TEST_HELPER") != "1" {
		return
	}
	mode := os.Args[len(os.Args)-1]
	switch mode {
	case "wait":
		fmt.Print("ready\n")
		time.Sleep(20 * time.Second)
	case "large":
		fmt.Print(strings.Repeat("x", MaxCaptureBytes+8192))
	case "fail":
		fmt.Fprint(os.Stderr, "failure")
		os.Exit(7)
	default:
		fmt.Print("hello")
		fmt.Fprint(os.Stderr, "diagnostic")
	}
	os.Exit(0)
}
func helper(t *testing.T, mode string) string {
	t.Helper()
	t.Setenv("REMOTEARC_TEST_HELPER", "1")
	return `"` + os.Args[0] + `" -test.run=TestProcessHelper -- ` + mode
}
func TestProcessRunTimeoutCancellationAndOutputLimit(t *testing.T) {
	p := NewProcesses()
	defer p.Close()
	r, e := p.Run(context.Background(), helper(t, "success"), "", 5000)
	if e != nil || r["stdout"] != "hello" || r["stderr"] != "diagnostic" {
		t.Fatalf("run %v %v", r, e)
	}
	r, e = p.Run(context.Background(), helper(t, "large"), "", 5000)
	if e != nil || !strings.Contains(r["stdout"].(string), "truncated") || len(r["stdout"].(string)) > MaxCaptureBytes+100 {
		t.Fatal("capture limit failed", e)
	}
	r, e = p.Run(context.Background(), helper(t, "wait"), "", 100)
	if e != nil || r["timed_out"] != true {
		t.Fatal("timeout failed", e)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, e = p.Run(ctx, helper(t, "wait"), "", 120000)
	if e != nil || time.Since(start) > 6*time.Second {
		t.Fatal("cancellation did not stop command", e)
	}
	if len(p.List()) != 0 {
		t.Fatal("synchronous processes leaked")
	}
}
func TestManagedProcessRetentionBudgetStopAndClose(t *testing.T) {
	p := NewProcesses()
	defer p.Close()
	r, e := p.Background(helper(t, "wait"), "", 1)
	if e != nil {
		t.Fatal(e)
	}
	id := r["process_id"].(string)
	deadline := time.Now().Add(8 * time.Second)
	for {
		s, e := p.Output(id)
		if e != nil {
			t.Fatal(e)
		}
		if s["status"] == "exited" {
			if !strings.Contains(s["stderr"].(string), "budget exhausted") {
				t.Fatal("budget message missing")
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("duration budget failed")
		}
		time.Sleep(50 * time.Millisecond)
	}
	if s, e := p.Stop(id); e != nil || s["already_exited"] != true {
		t.Fatal("finished receipt not retained")
	}
	r, e = p.Background(helper(t, "wait"), "", 0)
	if e != nil {
		t.Fatal(e)
	}
	id = r["process_id"].(string)
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = p.Output(id); _ = p.List() }()
	}
	wg.Wait()
	p.Close()
	if s, e := p.Status(id); e != nil || s["status"] != "exited" {
		t.Fatal("close left running process")
	}
	if _, e := p.Background("echo bad", "", 0); e == nil {
		t.Fatal("closed manager accepted work")
	}
	if _, e := p.Status("unknown"); e == nil {
		t.Fatal("unknown process found")
	}
}
