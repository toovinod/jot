package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jot-project/jot/apps/api/internal/config"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/jobs"
)

func TestDocumentValidation(t *testing.T) {
	cases := []struct {
		name, raw string
		valid     bool
	}{
		{"rich content", `{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Hello"}]},{"type":"image","attrs":{"src":"/media/abc.png","alt":null,"title":null}},{"type":"paragraph","content":[{"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"https://example.com","target":"_blank","rel":"noopener","class":null}}]}]}]}`, true},
		{"script link", `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}]}`, false},
		{"attribute type", `{"type":"doc","content":[{"type":"paragraph","attrs":{"textAlign":5}}]}`, false},
		{"nested document", `{"type":"doc","content":[{"type":"doc"}]}`, false},
		{"duplicate marks", `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"bold"},{"type":"bold"}]}]}]}`, false},
		{"raw html", `{"type":"doc","content":[{"type":"html","text":"<script>x</script>"}]}`, false},
		{"data image", `{"type":"doc","content":[{"type":"image","attrs":{"src":"data:image/svg+xml,<svg/>"}}]}`, false},
		{"list text", `{"type":"doc","content":[{"type":"bulletList","content":[{"type":"text","text":"invalid"}]}]}`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sn := domain.EmptySnapshot()
			if e := json.Unmarshal([]byte(tc.raw), &sn.Content); e != nil {
				t.Fatal(e)
			}
			e := domain.ValidateSnapshot(sn, false)
			if (e == nil) != tc.valid {
				t.Fatalf("valid=%v error=%v", tc.valid, e)
			}
		})
	}
	sn := domain.EmptySnapshot()
	sn.Appearance.Layout = []string{"header", "header", "content", "author"}
	if domain.ValidateSnapshot(sn, false) == nil {
		t.Fatal("duplicate section accepted")
	}
}
func TestOriginAndEmailValidation(t *testing.T) {
	for _, email := range []string{"a@b@example.com", "Display <a@example.com>", "a@example.com\nBcc:other@example.com"} {
		if validEmail(email) {
			t.Fatalf("accepted %q", email)
		}
	}
	for _, origin := range []string{"garbage", "https://example.com/path", "https://user:pass@example.com", "https://example.com?a=b"} {
		if config.Validate(config.Config{Origin: origin}) == nil {
			t.Fatalf("accepted %q", origin)
		}
	}
	if config.Validate(config.Config{Origin: "http://localhost:3000"}) != nil {
		t.Fatal("valid local origin rejected")
	}
}
func TestRetryBackoffAndRateLimit(t *testing.T) {
	if jobs.RetryDelay(1) != 30*time.Second || jobs.RetryDelay(5) != 8*time.Minute || jobs.RetryDelay(100) != 8*time.Minute {
		t.Fatal("unbounded or incorrect backoff")
	}
	l := rateLimiter{entries: map[string]rateEntry{}}
	now := time.Now()
	if !l.allow("a", now, 1, time.Minute) || l.allow("a", now, 1, time.Minute) || !l.allow("a", now.Add(2*time.Minute), 1, time.Minute) {
		t.Fatal("limiter window incorrect")
	}
}

func TestRateLimiterPreservesDifferentWindowAndBoundsKeys(t *testing.T) {
	l := rateLimiter{entries: map[string]rateEntry{}}
	now := time.Now()
	if !l.allow("long", now, 1, time.Hour) {
		t.Fatal("first counter rejected")
	}
	for i := 0; i < 10001; i++ {
		l.allow(string(rune(i)), now, 1, time.Minute)
	}
	if l.allow("long", now.Add(2*time.Minute), 1, time.Hour) {
		t.Fatal("short-window cleanup erased long-window counter")
	}
	if len(l.entries) > 10000 {
		t.Fatal("unbounded limiter map")
	}
	for key := range l.entries {
		if len(key) != 64 {
			t.Fatal("retained raw limiter key")
		}
	}
}

func TestTrustedProxyClientAddress(t *testing.T) {
	s := NewServer(nil, config.Config{TrustedProxyCIDRs: "172.31.97.3/32,172.31.97.2/32"})
	cases := []struct{ peer, header, want string }{
		{"203.0.113.4:9000", "1.2.3.4", "203.0.113.4"},
		{"172.31.97.3:9000", "203.0.113.5", "203.0.113.5"},
		{"172.31.97.3:9000", "1.2.3.4,203.0.113.5", "203.0.113.5"},
		{"172.31.97.3:9000", "203.0.113.5,172.31.97.2", "203.0.113.5"},
		{"172.31.97.3:9000", "not-an-ip,203.0.113.5", "172.31.97.3"},
	}
	for _, tc := range cases {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = tc.peer
		r.Header.Set("X-Forwarded-For", tc.header)
		if got := s.clientIP(r); got != tc.want {
			t.Fatalf("peer %s header %s got %s want %s", tc.peer, tc.header, got, tc.want)
		}
	}
	for _, raw := range []string{"0.0.0.0/0", "bad", "127.0.0.1"} {
		if _, e := config.ParseTrustedProxies(raw); e == nil {
			t.Fatalf("accepted unsafe prefix %q", raw)
		}
	}
}
