package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"

	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/execution"
	"github.com/yaohuangguan/remote-arc/packages/execution-core-go/protocol"
)

type request struct {
	ID     int             `json:"id"`
	Tool   string          `json:"tool"`
	Args   map[string]any  `json:"args"`
	Policy protocol.Policy `json:"policy"`
}

func main() {
	core := execution.New("full")
	defer core.Close()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 4096), 8<<20)
	var workers sync.WaitGroup
	var mu sync.Mutex
	for scanner.Scan() {
		var r request
		if e := json.Unmarshal(scanner.Bytes(), &r); e != nil {
			continue
		}
		workers.Add(1)
		go func(req request) {
			defer workers.Done()
			result, err := core.Call(context.Background(), req.Tool, req.Args, req.Policy)
			response := map[string]any{"id": req.ID, "ok": err == nil}
			if err != nil {
				response["error"] = err.Error()
			} else {
				raw := "null"
				if len(result.Content) > 0 {
					raw = result.Content[0].Text
				}
				var value any
				if e := json.Unmarshal([]byte(raw), &value); e != nil {
					value = raw
				}
				response["value"] = value
			}
			b, _ := json.Marshal(response)
			mu.Lock()
			fmt.Println(string(b))
			mu.Unlock()
		}(r)
	}
	workers.Wait()
}
