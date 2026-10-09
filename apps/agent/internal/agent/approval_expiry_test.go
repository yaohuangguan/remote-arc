package agent

import (
	"strings"
	"testing"
	"time"
)

func TestApprovalExpiryIsLocalAbsoluteTime(t *testing.T) {
	nz := time.FixedZone("NZDT", 13*3600)
	now := time.Date(2026, time.October, 9, 9, 20, 0, 0, nz)
	utc := now.Add(15 * time.Minute).UTC().Format(time.RFC3339Nano)
	result := approvalExpiryLabel(utc, now)
	if !strings.Contains(result, "09:35 NZDT") || !strings.Contains(result, "in 15 min") {
		t.Fatalf("Expected local NZ time, got %q", result)
	}
	if strings.Contains(result, "20:35") {
		t.Fatal("Displayed raw UTC instead of device local time")
	}
	expired := approvalExpiryLabel(now.Add(-time.Second).UTC().Format(time.RFC3339), now)
	if !strings.Contains(expired, "expired") {
		t.Fatal("Past approval not labelled expired")
	}
	if approvalExpiryLabel("not-a-time", now) != "unknown time" {
		t.Fatal("invalid expiry not handled")
	}
}
