package execution

import (
	"testing"
	"time"
)

func TestStatTimestampMatchesNodeMillisecondRounding(t *testing.T) {
	for _, test := range []struct {
		nanos int64
		want  string
	}{
		{499999, "1970-01-01T00:00:00.000Z"},
		{500000, "1970-01-01T00:00:00.001Z"},
		{999999500, "1970-01-01T00:00:01.000Z"},
		{-500000, "1970-01-01T00:00:00.000Z"},
		{-500001, "1969-12-31T23:59:59.999Z"},
	} {
		if got := statTimestamp(time.Unix(0, test.nanos)); got != test.want {
			t.Errorf("timestamp(%d) = %s, want %s", test.nanos, got, test.want)
		}
	}
}
