package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/yaohuangguan/remote-arc/apps/device/internal/cli"
)

var version = "dev"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if e := cli.Main(ctx, os.Args[1:], version, os.Stdin, os.Stdout, os.Stderr); e != nil && !errors.Is(e, context.Canceled) {
		fmt.Fprintln(os.Stderr, "Remote Arc: "+e.Error())
		os.Exit(1)
	}
}
