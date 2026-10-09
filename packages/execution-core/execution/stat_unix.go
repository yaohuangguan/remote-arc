//go:build !windows

package execution

import (
	"os"
	"reflect"
	"time"
)

func statDetails(path string, s os.FileInfo) (time.Time, time.Time, uint32) {
	created, accessed := s.ModTime(), s.ModTime()
	mode := uint32(s.Mode().Perm())
	v := reflect.ValueOf(s.Sys())
	if v.Kind() == reflect.Pointer {
		v = v.Elem()
	}
	if v.Kind() == reflect.Struct {
		if m := v.FieldByName("Mode"); m.IsValid() {
			mode = uint32(m.Uint())
		}
		for _, pair := range []struct {
			name   string
			target *time.Time
		}{{"Atim", &accessed}, {"Atimespec", &accessed}, {"Birthtimespec", &created}} {
			ts := v.FieldByName(pair.name)
			if ts.IsValid() {
				sec, nsec := ts.FieldByName("Sec"), ts.FieldByName("Nsec")
				if sec.IsValid() && nsec.IsValid() {
					*pair.target = time.Unix(sec.Int(), nsec.Int())
				}
			}
		}
	}
	return birthTime(path, created), accessed, mode
}
