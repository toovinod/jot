package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/security"
)

func (s *Server) subscribe(w http.ResponseWriter, r *http.Request) {
	if !s.Config.EmailEnabled() {
		writeError(w, 503, "Email subscriptions are not configured", "email_unavailable")
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if !validEmail(in.Email) {
		writeError(w, 400, "Enter a valid email address", "validation")
		return
	}
	name := chi.URLParam(r, "username")
	if !domain.ValidUsername(name) {
		notFound(w)
		return
	}
	if !s.limiter.allow("subscribe:"+name+":"+security.HashToken(in.Email), time.Now(), 3, time.Hour) {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var authorID, authorName string
	e = tx.QueryRow(r.Context(), `SELECT id,name FROM users WHERE username=$1 FOR UPDATE`, name).Scan(&authorID, &authorName)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	confirmToken, unsubscribeToken := security.RandomToken(), security.RandomToken()
	id := uuid.NewString()
	var inserted string
	e = tx.QueryRow(r.Context(), `INSERT INTO subscriptions(id,author_id,email,confirm_hash,unsubscribe_hash,unsubscribe_token,confirm_expires) VALUES($1,$2,$3,$4,$5,$6,now()+interval '24 hours') ON CONFLICT(author_id,email) DO UPDATE SET confirm_hash=EXCLUDED.confirm_hash,unsubscribe_hash=EXCLUDED.unsubscribe_hash,unsubscribe_token=EXCLUDED.unsubscribe_token,confirm_expires=EXCLUDED.confirm_expires,created_at=now() WHERE NOT subscriptions.active AND subscriptions.created_at<now()-interval '1 hour' RETURNING id`, id, authorID, in.Email, security.HashToken(confirmToken), security.HashToken(unsubscribeToken), unsubscribeToken).Scan(&inserted)
	if isNotFound(e) {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	payload := map[string]string{"subscriptionId": inserted, "email": in.Email, "author": authorName, "confirmToken": confirmToken, "unsubscribeToken": unsubscribeToken}
	_, e = tx.Exec(r.Context(), `INSERT INTO jobs(id,kind,user_id,payload,idempotency_key) VALUES($1,'confirmation',$2,$3,$4)`, uuid.NewString(), authorID, encodeJSON(payload), "confirmation:"+security.HashToken(confirmToken))
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (s *Server) confirm(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	if len(in.Token) != 64 {
		writeError(w, 400, "Invalid or expired confirmation link", "invalid_token")
		return
	}
	tag, e := s.DB.Exec(r.Context(), `UPDATE subscriptions SET active=true,confirmed=true WHERE confirm_hash=$1 AND (confirm_expires>now() OR (active AND confirmed))`, security.HashToken(in.Token))
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 400, "Invalid or expired confirmation link", "invalid_token")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (s *Server) unsubscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if r.URL.Path == "/api/subscriptions/one-click" {
		in.Token = r.URL.Query().Get("token")
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		if e := r.ParseForm(); e != nil {
			writeError(w, 400, "Invalid unsubscribe request", "validation")
			return
		}
		if r.PostForm.Get("List-Unsubscribe") != "One-Click" {
			writeError(w, 400, "Expected one-click unsubscribe form", "validation")
			return
		}
	} else if !decodeJSONBody(w, r, &in) {
		return
	}
	if len(in.Token) != 64 {
		writeError(w, 400, "Invalid unsubscribe link", "invalid_token")
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	e = tx.QueryRow(r.Context(), `UPDATE subscriptions SET active=false,confirm_hash='',confirmed=false WHERE unsubscribe_hash=$1 RETURNING id`, security.HashToken(in.Token)).Scan(&id)
	if isNotFound(e) {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	_, e = tx.Exec(r.Context(), `UPDATE jobs SET status='failed',error='Subscription cancelled',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE kind IN('newsletter','confirmation') AND payload->>'subscriptionId'=$1 AND status IN('pending','running')`, id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
