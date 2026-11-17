package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/mail"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/security"
)

func (s *Server) security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			if r.URL.Path != "/api/subscriptions/one-click" && r.Header.Get("Origin") != s.Config.Origin && !s.customDomainOrigin(r) {
				writeError(w, 403, "Request origin is not allowed", "origin")
				return
			}
			ip := s.clientIP(r)
			if !s.limiter.allow("ip:"+rateAddress(ip), time.Now(), 120, time.Minute) {
				writeError(w, 429, "Too many requests; try again shortly", "rate_limit")
				return
			}
		}
		if cookie, e := r.Cookie("jot_session"); e == nil && len(cookie.Value) == 64 {
			var u domain.User
			e = s.DB.QueryRow(r.Context(), `SELECT u.id,u.username,u.name,u.bio,u.avatar FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, security.HashToken(cookie.Value)).Scan(&u.ID, &u.Username, &u.Name, &u.Bio, &u.Avatar)
			if e == nil {
				r = r.WithContext(context.WithValue(r.Context(), userKey, u))
			}
		}
		next.ServeHTTP(w, r)
	})
}
func user(r *http.Request) (domain.User, bool) {
	u, ok := r.Context().Value(userKey).(domain.User)
	return u, ok
}
func requireUser(w http.ResponseWriter, r *http.Request) (domain.User, bool) {
	u, ok := user(r)
	if !ok {
		writeError(w, 401, "Please sign in", "unauthorized")
	}
	return u, ok
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, message, code string) {
	writeJSON(w, status, map[string]string{"error": message, "code": code})
}
func writeInternalError(w http.ResponseWriter, e error) {
	slog.Error("request failed", "error", e)
	writeError(w, 500, "Unable to complete request", "internal")
}
func decodeJSONBody(w http.ResponseWriter, r *http.Request, v any) bool {
	return decodeJSONBodyLimit(w, r, v, 2<<20)
}

// maxPostBodyBytes fits a post save at the document limits (50,000 nodes, 500,000 text bytes) with marks and links.
const maxPostBodyBytes = 8 << 20

func decodeJSONBodyLimit(w http.ResponseWriter, r *http.Request, v any, limit int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		writeDecodeError(w, e)
		return false
	}
	if d.Decode(new(any)) != io.EOF {
		writeError(w, 400, "Expected one JSON object", "invalid_request")
		return false
	}
	return true
}

// writeDecodeError says what was wrong with a request body, so clients can show something useful.
func writeDecodeError(w http.ResponseWriter, e error) {
	var tooLarge *http.MaxBytesError
	var typeErr *json.UnmarshalTypeError
	switch {
	case errors.As(e, &tooLarge):
		writeError(w, 413, "This request is too large to save", "too_large")
	case strings.HasPrefix(e.Error(), "json: unknown field "):
		field := strings.TrimPrefix(e.Error(), "json: unknown field ")
		writeError(w, 400, "The server does not accept the field "+field+". It may be older than the app; restart it and try again", "unknown_field")
	case errors.As(e, &typeErr) && typeErr.Field != "":
		writeError(w, 400, `The field "`+typeErr.Field+`" has the wrong type`, "invalid_request")
	default:
		writeError(w, 400, "The request body is not valid JSON", "invalid_request")
	}
}
func integer(v string, def, min, max int) int {
	n, e := strconv.Atoi(v)
	if e != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
func validEmail(v string) bool {
	if len(v) > 254 {
		return false
	}
	a, e := mail.ParseAddress(v)
	if e != nil || a.Address != v {
		return false
	}
	if len(v) > 254 || strings.ContainsAny(v, "\r\n ") {
		return false
	}
	at := strings.IndexByte(v, '@')
	return at > 0 && at < len(v)-3 && strings.Contains(v[at+1:], ".")
}
func (s *Server) setSessionCookie(w http.ResponseWriter, value string, expires time.Time) {
	u, _ := url.Parse(s.Config.Origin)
	http.SetCookie(w, &http.Cookie{Name: "jot_session", Value: value, Path: "/", Expires: expires, MaxAge: int(time.Until(expires).Seconds()), HttpOnly: true, Secure: u != nil && u.Scheme == "https", SameSite: http.SameSiteLaxMode})
}
func notFound(w http.ResponseWriter) { writeError(w, 404, "Not found", "not_found") }
func isNotFound(e error) bool        { return errors.Is(e, pgx.ErrNoRows) }

type rateEntry struct {
	expiresAt time.Time
	count     int
}

// rateLimiter keeps fixed-window counters in memory, in one bounded store per purpose (the key prefix before the
// first ":"), so flooding one purpose with new keys cannot push out the counters of another. A full store first
// drops its expired counters. If it is still full, a new key of a low-value purpose (evictingRatePurposes) evicts
// the counter closest to expiry, while a new key of any other purpose is refused until counters expire: failing
// closed means nobody can reset a login, signup or client-address counter by churning keys. Existing counters
// always keep counting.
type rateLimiter struct {
	mu     sync.Mutex
	stores map[string]map[string]rateEntry
}

const rateLimiterKeysPerPurpose = 10000

// evictingRatePurposes are the purposes where forgetting a counter is harmless. "view" guards cheap, idempotent
// work. "ip" is the shared write limit for every client: refusing new addresses when it is full would lock out
// everyone new, and an attacker churning addresses already gets a fresh counter per address, so evicting costs
// nothing.
var evictingRatePurposes = map[string]bool{"view": true, "ip": true}

// rateAddress collapses an IPv6 client to its /64, which one household or device usually holds, so a single
// client cannot make a new rate counter per address.
func rateAddress(ip string) string {
	if addr, e := netip.ParseAddr(ip); e == nil && addr.Is6() && !addr.Is4In6() {
		return netip.PrefixFrom(addr, 64).Masked().Addr().String()
	}
	return ip
}

func (l *rateLimiter) allow(key string, now time.Time, limit int, window time.Duration) bool {
	purpose, _, _ := strings.Cut(key, ":")
	key = security.HashToken(key)
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.stores == nil {
		l.stores = map[string]map[string]rateEntry{}
	}
	entries := l.stores[purpose]
	if entries == nil {
		entries = map[string]rateEntry{}
		l.stores[purpose] = entries
	}
	if _, exists := entries[key]; !exists && len(entries) >= rateLimiterKeysPerPurpose {
		oldest := ""
		for k, e := range entries {
			if !now.Before(e.expiresAt) {
				delete(entries, k)
			} else if oldest == "" || e.expiresAt.Before(entries[oldest].expiresAt) {
				oldest = k
			}
		}
		if len(entries) >= rateLimiterKeysPerPurpose {
			if !evictingRatePurposes[purpose] {
				return false
			}
			delete(entries, oldest)
		}
	}
	e := entries[key]
	if !now.Before(e.expiresAt) {
		e = rateEntry{expiresAt: now.Add(window)}
	}
	e.count++
	entries[key] = e
	return e.count <= limit
}
func (s *Server) clientIP(r *http.Request) string {
	peer, _, e := net.SplitHostPort(r.RemoteAddr)
	if e != nil {
		return r.RemoteAddr
	}
	addr, e := netip.ParseAddr(peer)
	if e != nil {
		return peer
	}
	addr = addr.Unmap()
	if !s.trusted(addr) {
		return addr.String()
	}
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded == "" || len(forwarded) > 2048 {
		return addr.String()
	}
	parts := strings.Split(forwarded, ",")
	if len(parts) > 8 {
		return addr.String()
	}
	chain := make([]netip.Addr, len(parts))
	for i, p := range parts {
		v, e := netip.ParseAddr(strings.TrimSpace(p))
		if e != nil {
			return addr.String()
		}
		chain[i] = v.Unmap()
	}
	for i := len(chain) - 1; i >= 0; i-- {
		if !s.trusted(addr) {
			break
		}
		addr = chain[i]
	}
	return addr.String()
}
func (s *Server) trusted(addr netip.Addr) bool {
	for _, p := range s.trustedProxies {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

func encodeJSON(v any) []byte { b, _ := json.Marshal(v); return b }
func oneOf(s string, values ...string) bool {
	for _, v := range values {
		if s == v {
			return true
		}
	}
	return false
}
