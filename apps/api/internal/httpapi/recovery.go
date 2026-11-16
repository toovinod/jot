package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jot-project/jot/apps/api/internal/security"
	"golang.org/x/crypto/bcrypt"
)

func (s *Server) requestVerification(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	if !s.Config.EmailEnabled() {
		writeError(w, 503, "Email verification is not configured", "email_unavailable")
		return
	}
	s.requestAccountEmail(w, r, u.ID, "verification", "")
}
func (s *Server) requestPassword(w http.ResponseWriter, r *http.Request) {
	if !s.Config.EmailEnabled() {
		writeError(w, 503, "Password recovery email is not configured", "email_unavailable")
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
	s.requestAccountEmail(w, r, "", "password", in.Email)
}
func (s *Server) requestAccountEmail(w http.ResponseWriter, r *http.Request, id, kind, email string) {
	key := id
	if key == "" {
		key = security.HashToken(email)
	}
	if !s.limiter.allow("account-email:"+kind+":"+key, time.Now(), 3, time.Hour) {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var name string
	var verified bool
	query := `SELECT id,email,name,email_verified FROM users WHERE id::text=$1 FOR UPDATE`
	arg := id
	if id == "" {
		query = `SELECT id,email,name,email_verified FROM users WHERE email=$1 FOR UPDATE`
		arg = email
	}
	e = tx.QueryRow(r.Context(), query, arg).Scan(&id, &email, &name, &verified)
	if isNotFound(e) {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if kind == "verification" && verified {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	var count int
	e = tx.QueryRow(r.Context(), `SELECT count(*) FROM jobs WHERE user_id=$1 AND kind=$2 AND created_at>now()-interval '1 hour'`, id, kind).Scan(&count)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if count >= 3 {
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	raw := security.RandomToken()
	expires := time.Now().Add(time.Hour)
	_, e = tx.Exec(r.Context(), `INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,$3,$4)`, security.HashToken(raw), id, kind, expires)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	payload := map[string]string{"token": raw, "email": email, "name": name}
	_, e = tx.Exec(r.Context(), `INSERT INTO jobs(id,kind,user_id,payload,idempotency_key) VALUES($1,$2,$3,$4,$5)`, uuid.NewString(), kind, id, encodeJSON(payload), kind+":"+security.HashToken(raw))
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
func (s *Server) confirmVerification(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	if len(in.Token) != 64 {
		writeError(w, 400, "Invalid or expired verification token", "invalid_token")
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	e = tx.QueryRow(r.Context(), `DELETE FROM account_tokens WHERE token_hash=$1 AND kind='verification' AND expires_at>now() RETURNING user_id`, security.HashToken(in.Token)).Scan(&id)
	if isNotFound(e) {
		writeError(w, 400, "Invalid or expired verification token", "invalid_token")
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	_, e = tx.Exec(r.Context(), `UPDATE users SET email_verified=true WHERE id=$1`, id)
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
func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow("password-reset:"+s.clientIP(r), time.Now(), 10, 15*time.Minute) {
		writeError(w, 429, "Too many reset attempts; try later", "rate_limit")
		return
	}
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	if len(in.Token) != 64 || len(in.Password) < 10 || len(in.Password) > 72 {
		writeError(w, 400, "Provide a valid token and 10-72 byte password", "validation")
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	e = tx.QueryRow(r.Context(), `SELECT user_id FROM account_tokens WHERE token_hash=$1 AND kind='password' AND expires_at>now()`, security.HashToken(in.Token)).Scan(&id)
	if isNotFound(e) {
		writeError(w, 400, "Invalid or expired reset token", "invalid_token")
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	pw, e := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if _, e = tx.Exec(r.Context(), `SELECT id FROM users WHERE id=$1 FOR UPDATE`, id); e != nil {
		writeInternalError(w, e)
		return
	}
	tag, e := tx.Exec(r.Context(), `DELETE FROM account_tokens WHERE token_hash=$1 AND kind='password' AND expires_at>now()`, security.HashToken(in.Token))
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 400, "Invalid or expired reset token", "invalid_token")
		return
	}
	_, e = tx.Exec(r.Context(), `UPDATE users SET password_hash=$2,email_verified=true WHERE id=$1`, id, string(pw))
	if e == nil {
		_, e = tx.Exec(r.Context(), `DELETE FROM sessions WHERE user_id=$1`, id)
	}
	if e == nil {
		_, e = tx.Exec(r.Context(), `DELETE FROM account_tokens WHERE user_id=$1 AND kind='password'`, id)
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		writeInternalError(w, e)
		return
	}
	s.setSessionCookie(w, "", time.Now().Add(-time.Hour))
	writeJSON(w, 200, map[string]bool{"ok": true})
}
