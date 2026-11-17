package httpapi

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jot-project/jot/apps/api/internal/security"
)

var hostnameLabel = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

type customDomain struct {
	Domain   string `json:"domain"`
	Verified bool   `json:"verified"`
	TXTName  string `json:"txtName"`
	TXTValue string `json:"txtValue"`
	Target   string `json:"target"`
}

func normalizeHost(raw string) string {
	host := strings.ToLower(strings.TrimSpace(raw))
	if h, _, e := net.SplitHostPort(host); e == nil {
		host = h
	}
	return strings.TrimSuffix(host, ".")
}

// validCustomDomain accepts a lowercase DNS hostname that is not an IP address or the app's own host.
func (s *Server) validCustomDomain(host string) bool {
	if host == "" || len(host) > 253 {
		return false
	}
	if _, e := netip.ParseAddr(host); e == nil {
		return false
	}
	labels := strings.Split(host, ".")
	if len(labels) < 2 || strings.Trim(labels[len(labels)-1], "0123456789") == "" {
		return false
	}
	for _, label := range labels {
		if !hostnameLabel.MatchString(label) {
			return false
		}
	}
	app := ""
	if u, e := url.Parse(s.Config.Origin); e == nil {
		app = strings.ToLower(u.Hostname())
	}
	for _, own := range []string{app, s.Config.CustomDomainTarget, "localhost"} {
		if own != "" && (host == own || strings.HasSuffix(host, "."+own)) {
			return false
		}
	}
	return true
}
func (s *Server) domainEnabled(w http.ResponseWriter) bool {
	if s.Config.CustomDomainTarget == "" {
		writeError(w, 503, "Custom domains are not configured", "domains_unavailable")
		return false
	}
	return true
}

// loadDomain returns the author's domain, or nil when none is set.
func (s *Server) loadDomain(ctx context.Context, userID string) (*customDomain, error) {
	var d customDomain
	var token string
	e := s.DB.QueryRow(ctx, `SELECT domain,verify_token,verified_at IS NOT NULL FROM custom_domains WHERE user_id=$1`, userID).Scan(&d.Domain, &token, &d.Verified)
	if isNotFound(e) {
		return nil, nil
	}
	d.TXTName, d.TXTValue, d.Target = "_jot."+d.Domain, "jot-verify="+token, s.Config.CustomDomainTarget
	return &d, e
}
func (s *Server) writeDomain(w http.ResponseWriter, r *http.Request, userID string) {
	d, e := s.loadDomain(r.Context(), userID)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, d)
}
func (s *Server) getDomain(w http.ResponseWriter, r *http.Request) {
	if u, ok := requireUser(w, r); ok {
		if s.Config.CustomDomainTarget == "" {
			writeJSON(w, 200, nil)
			return
		}
		s.writeDomain(w, r, u.ID)
	}
}
func (s *Server) putDomain(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok || !s.domainEnabled(w) {
		return
	}
	var in struct {
		Domain string `json:"domain"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	host := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(in.Domain)), ".")
	if !s.validCustomDomain(host) {
		writeError(w, 400, "Enter a domain name such as blog.example.com", "validation")
		return
	}
	// Changing the domain issues a new token and clears verification; repeating the same domain keeps both.
	_, e := s.DB.Exec(r.Context(), `INSERT INTO custom_domains(user_id,domain,verify_token) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET domain=EXCLUDED.domain,verify_token=EXCLUDED.verify_token,verified_at=NULL,created_at=now() WHERE custom_domains.domain<>EXCLUDED.domain`, u.ID, host, security.RandomToken())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	s.writeDomain(w, r, u.ID)
}
func (s *Server) deleteDomain(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	if _, e := s.DB.Exec(r.Context(), `DELETE FROM custom_domains WHERE user_id=$1`, u.ID); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (s *Server) verifyDomain(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok || !s.domainEnabled(w) {
		return
	}
	d, e := s.loadDomain(r.Context(), u.ID)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if d == nil {
		notFound(w)
		return
	}
	if d.Verified {
		writeJSON(w, 200, d)
		return
	}
	if !s.limiter.allow("domain-verify:"+u.ID, time.Now(), 20, time.Hour) {
		writeError(w, 429, "Too many verification attempts; try later", "rate_limit")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	records, _ := s.lookupTXT(ctx, d.TXTName)
	cancel()
	found := false
	for _, record := range records {
		found = found || strings.TrimSpace(record) == d.TXTValue
	}
	if !found {
		writeError(w, 400, "The TXT record was not found yet. DNS changes can take a while to appear.", "domain_unverified")
		return
	}
	_, e = s.DB.Exec(r.Context(), `UPDATE custom_domains SET verified_at=now() WHERE user_id=$1 AND domain=$2`, u.ID, d.Domain)
	if isUniqueViolation(e) {
		writeError(w, 409, "This domain is already connected to another page", "domain_taken")
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	s.writeDomain(w, r, u.ID)
}

// verifiedDomainUser returns the username for a verified domain, or "" when there is none.
func (s *Server) verifiedDomainUser(r *http.Request, raw string) (string, error) {
	host := normalizeHost(raw)
	if s.Config.CustomDomainTarget == "" || !s.validCustomDomain(host) {
		return "", nil
	}
	var username string
	e := s.DB.QueryRow(r.Context(), `SELECT u.username FROM custom_domains d JOIN users u ON u.id=d.user_id WHERE d.domain=$1 AND d.verified_at IS NOT NULL`, host).Scan(&username)
	if isNotFound(e) {
		return "", nil
	}
	return username, e
}
func (s *Server) resolveDomain(w http.ResponseWriter, r *http.Request) {
	username, e := s.verifiedDomainUser(r, r.URL.Query().Get("host"))
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if username == "" {
		notFound(w)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	writeJSON(w, 200, map[string]string{"username": username})
}

// allowedDomain answers Caddy's on-demand TLS "ask" check: 200 only for verified domains.
func (s *Server) allowedDomain(w http.ResponseWriter, r *http.Request) {
	username, e := s.verifiedDomainUser(r, r.URL.Query().Get("domain"))
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if username == "" {
		notFound(w)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// customDomainOrigin allows the two writes a signed-out reader makes on an author's own domain: counting a view of
// one of the author's posts and subscribing to the author. The Origin must be exactly https://<verified domain>,
// and that domain must belong to the post's author or to the author being subscribed to.
func (s *Server) customDomainOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	host, ok := strings.CutPrefix(origin, "https://")
	if r.Method != "POST" || s.Config.CustomDomainTarget == "" || !ok || !s.validCustomDomain(host) {
		return false
	}
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) != 5 || parts[0] != "" || parts[1] != "api" {
		return false
	}
	var query string
	if parts[2] == "posts" && parts[4] == "view" {
		if _, e := uuid.Parse(parts[3]); e != nil {
			return false
		}
		query = `SELECT EXISTS(SELECT 1 FROM custom_domains d JOIN posts p ON p.author_id=d.user_id WHERE d.domain=$1 AND d.verified_at IS NOT NULL AND p.id=$2::uuid)`
	} else if parts[2] == "authors" && parts[4] == "subscribe" {
		query = `SELECT EXISTS(SELECT 1 FROM custom_domains d JOIN users u ON u.id=d.user_id WHERE d.domain=$1 AND d.verified_at IS NOT NULL AND u.username=$2)`
	} else {
		return false
	}
	var allowed bool
	if e := s.DB.QueryRow(r.Context(), query, host, parts[3]).Scan(&allowed); e != nil {
		slog.Warn("Custom domain origin check failed", "error", e)
		return false
	}
	return allowed
}
