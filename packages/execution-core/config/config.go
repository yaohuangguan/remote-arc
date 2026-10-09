package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
)

const DefaultOrigin = "https://mcp.remotearc.app"

type Config struct {
	DeviceID          string                     `json:"deviceId"`
	DeviceToken       string                     `json:"deviceToken"`
	DeviceName        string                     `json:"deviceName"`
	Origin            string                     `json:"origin"`
	Mode              string                     `json:"mode"`
	BackgroundEnabled *bool                      `json:"backgroundEnabled,omitempty"`
	Extra             map[string]json.RawMessage `json:"-"`
}

func Home() string {
	if s := os.Getenv("REMOTEARC_HOME"); s != "" {
		return s
	}
	s, _ := os.UserHomeDir()
	return s
}
func Dir() string           { return filepath.Join(Home(), ".remotearc") }
func Load() (Config, error) { return LoadAt(Dir()) }
func LoadAt(dir string) (Config, error) {
	var c Config
	b, e := os.ReadFile(filepath.Join(dir, "config.json"))
	if errors.Is(e, os.ErrNotExist) {
		b, e = os.ReadFile(filepath.Join(filepath.Dir(dir), ".remote-link", "config.json"))
	}
	if e != nil {
		return c, e
	}
	if e = json.Unmarshal(b, &c); e != nil {
		return c, e
	}
	json.Unmarshal(b, &c.Extra)
	if c.DeviceID == "" || c.DeviceToken == "" || c.Origin == "" {
		return c, errors.New("Invalid saved device configuration.")
	}
	if c.Mode == "" {
		c.Mode = "managed"
	}
	return c, nil
}
func Save(c Config) error { return SaveAt(Dir(), c) }
func SaveAt(dir string, c Config) error {
	b, e := json.Marshal(c)
	if e != nil {
		return e
	}
	m := map[string]json.RawMessage{}
	for k, v := range c.Extra {
		m[k] = v
	}
	var known map[string]json.RawMessage
	json.Unmarshal(b, &known)
	for k, v := range known {
		m[k] = v
	}
	if c.BackgroundEnabled == nil {
		delete(m, "backgroundEnabled")
	}
	b, e = json.MarshalIndent(m, "", "  ")
	if e != nil {
		return e
	}
	return DurableWrite(filepath.Join(dir, "config.json"), append(b, '\n'), 0600)
}

// FileDurability selects equal atomic/durable profiles in the Go and TS cores.
// Default is durable; the atomic profile is explicit, and never fsyncs.
func FileDurability() string {
	if os.Getenv("REMOTEARC_FILE_DURABILITY") == "atomic" {
		return "atomic"
	}
	return "durable"
}

// UndoDurability can be explicitly separated from ordinary workspace writes.
// Unset retains the existing profile; invalid values retain stronger syncing.
func UndoDurability() string {
	switch os.Getenv("REMOTEARC_UNDO_DURABILITY") {
	case "":
		return FileDurability()
	case "atomic":
		return "atomic"
	default:
		return "durable"
	}
}
func SyncDirectory(dir string) error {
	return SyncDirectoryWithDurability(dir, FileDurability())
}
func SyncDirectoryWithDurability(dir, durability string) error {
	if durability != "durable" || runtime.GOOS == "windows" {
		return nil
	}
	f, e := os.Open(dir)
	if e != nil {
		return e
	}
	err := f.Sync()
	ce := f.Close()
	if err != nil {
		return err
	}
	return ce
}
func AtomicWrite(path string, b []byte, mode os.FileMode) error {
	return AtomicWriteWithDurability(path, b, mode, FileDurability())
}

// DurableWrite protects Agent state independently of workspace/benchmark flags.
func DurableWrite(path string, b []byte, mode os.FileMode) error {
	return AtomicWriteWithDurability(path, b, mode, "durable")
}
func AtomicWriteWithDurability(path string, b []byte, mode os.FileMode, durability string) error {
	return atomicWrite(path, b, mode, durability, writeOperations{sync: (*os.File).Sync, rename: os.Rename, syncDirectory: SyncDirectoryWithDurability})
}

// Per-call operations let tests inject storage failures without global hooks.
type writeOperations struct {
	sync          func(*os.File) error
	rename        func(string, string) error
	syncDirectory func(string, string) error
}

func atomicWrite(path string, b []byte, mode os.FileMode, durability string, ops writeOperations) error {
	if e := os.MkdirAll(filepath.Dir(path), 0700); e != nil {
		return e
	}
	f, e := os.CreateTemp(filepath.Dir(path), ".remotearc-*.tmp")
	if e != nil {
		return e
	}
	name := f.Name()
	defer os.Remove(name)
	if e = f.Chmod(mode.Perm()); e == nil {
		_, e = f.Write(b)
	}
	if e == nil && durability == "durable" {
		e = ops.sync(f)
	}
	ce := f.Close()
	if e != nil {
		return e
	}
	if ce != nil {
		return ce
	}
	if e = ops.rename(name, path); e != nil {
		return e
	}
	return ops.syncDirectory(filepath.Dir(path), durability)
}
func Reset() error {
	for _, p := range []string{filepath.Join(Dir(), "config.json"), filepath.Join(Home(), ".remote-link", "config.json")} {
		if e := os.Remove(p); e != nil && !errors.Is(e, os.ErrNotExist) {
			return e
		}
	}
	return nil
}
