// Package lease implements proper-lockfile's shared mkdir/mtime lease protocol.
// Both engines use the same directory, stale period and heartbeat interval.
package lease

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const Stale = 15 * time.Second
const Interval = 3 * time.Second

type Lease struct {
	path   string
	cancel context.CancelFunc
	done   chan struct{}
	lost   chan struct{}
	once   sync.Once
	mu     sync.Mutex
	mtime  time.Time
}

func Active(dir, role string) bool {
	s, e := os.Stat(filepath.Join(dir, role+".lock"))
	return e == nil && time.Since(s.ModTime()) <= Stale
}
func Acquire(dir, role string) (*Lease, error) {
	if e := os.MkdirAll(dir, 0700); e != nil {
		return nil, e
	}
	p := filepath.Join(dir, role+".lock")
	if e := os.Mkdir(p, 0700); e != nil {
		if !errors.Is(e, os.ErrExist) {
			return nil, e
		}
		s, e := os.Stat(p)
		if e != nil {
			return nil, nil
		}
		if time.Since(s.ModTime()) <= Stale {
			return nil, nil
		}
		// Remove only an empty stale lock. Re-check mtime immediately before removal.
		again, e := os.Stat(p)
		if e != nil || !again.ModTime().Equal(s.ModTime()) {
			return nil, nil
		}
		if os.Remove(p) != nil {
			return nil, nil
		}
		if os.Mkdir(p, 0700) != nil {
			return nil, nil
		}
	}
	now := time.Now()
	if e := os.Chtimes(p, now, now); e != nil {
		os.Remove(p)
		return nil, e
	}
	s, e := os.Stat(p)
	if e != nil {
		return nil, e
	}
	ctx, cancel := context.WithCancel(context.Background())
	l := &Lease{path: p, cancel: cancel, done: make(chan struct{}), lost: make(chan struct{}), mtime: s.ModTime()}
	go func() {
		defer close(l.done)
		t := time.NewTicker(Interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				l.mu.Lock()
				s, e := os.Stat(p)
				if e != nil || !s.ModTime().Equal(l.mtime) {
					l.mu.Unlock()
					close(l.lost)
					return
				}
				now := time.Now()
				e = os.Chtimes(p, now, now)
				if e == nil {
					s, e = os.Stat(p)
				}
				if e != nil {
					l.mu.Unlock()
					close(l.lost)
					return
				}
				l.mtime = s.ModTime()
				l.mu.Unlock()
			}
		}
	}()
	return l, nil
}
func (l *Lease) Lost() <-chan struct{} { return l.lost }
func (l *Lease) Release() {
	l.once.Do(func() {
		l.cancel()
		<-l.done
		l.mu.Lock()
		defer l.mu.Unlock()
		if s, e := os.Stat(l.path); e == nil && s.ModTime().Equal(l.mtime) {
			_ = os.Remove(l.path)
		}
	})
}
