package httpapi

import (
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestRateAddressGroupsIPv6ByPrefix(t *testing.T) {
	if rateAddress("2001:db8:1:2:aaaa::1") != rateAddress("2001:db8:1:2:bbbb::9") {
		t.Fatal("addresses in one /64 should share a rate counter")
	}
	if rateAddress("2001:db8:1:3::1") == rateAddress("2001:db8:1:2::1") {
		t.Fatal("different /64s should not share a rate counter")
	}
	if rateAddress("203.0.113.7") != "203.0.113.7" {
		t.Fatal("IPv4 addresses are kept as they are")
	}
}

func TestFullIPStoreStillAdmitsNewClients(t *testing.T) {
	var l rateLimiter
	now := time.Now()
	for i := 0; i < rateLimiterKeysPerPurpose; i++ {
		l.allow("ip:10.0."+strconv.Itoa(i/250)+"."+strconv.Itoa(i%250), now, 120, time.Minute)
	}
	if !l.allow("ip:198.51.100.1", now, 120, time.Minute) {
		t.Fatal("a full ip store must not lock out a new client")
	}
	// Login counters still fail closed, so churning keys cannot reset them.
	for i := 0; i < rateLimiterKeysPerPurpose; i++ {
		l.allow("login:"+strconv.Itoa(i), now, 5, time.Minute)
	}
	if l.allow("login:new", now, 5, time.Minute) {
		t.Fatal("a full login store must refuse new keys")
	}
}

func TestFeedContentStaysWithinBudget(t *testing.T) {
	used, post := 0, strings.Repeat("x", maxFeedContentBytes/3-100)
	kept := 0
	for i := 0; i < 50; i++ {
		if feedContent(post, &used) != "" {
			kept++
		}
	}
	if kept != 3 || used > maxFeedContentBytes {
		t.Fatalf("kept %d posts, used %d bytes", kept, used)
	}
	if feedContent("short", &used) != "short" {
		t.Fatal("a short post that still fits keeps its content")
	}
}
