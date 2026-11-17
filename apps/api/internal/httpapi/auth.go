package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/security"
	"golang.org/x/crypto/bcrypt"
)

func isUniqueViolation(e error) bool { p, ok := e.(*pgconn.PgError); return ok && p.Code == "23505" }
func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password, Username, Name string }
	if !decodeJSONBody(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Username = strings.ToLower(strings.TrimSpace(in.Username))
	in.Name = strings.TrimSpace(in.Name)
	if !validEmail(in.Email) || len(in.Password) < 10 || len(in.Password) > 72 || !domain.ValidUsername(in.Username) || len(in.Name) < 1 || len(in.Name) > 100 || !domain.ValidText(in.Name) {
		writeError(w, 400, "Use a valid email, a 10–72 byte password, name, and 3–32 character username (letters, numbers, underscore)", "validation")
		return
	}
	if !s.limiter.allow("signup:"+s.clientIP(r), time.Now(), 10, time.Hour) {
		writeError(w, 429, "Please try again later", "rate_limit")
		return
	}
	pw, e := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	u := domain.User{ID: uuid.NewString(), Username: in.Username, Name: in.Name}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	_, e = tx.Exec(r.Context(), `INSERT INTO users(id,email,password_hash,username,name) VALUES($1,$2,$3,$4,$5)`, u.ID, in.Email, string(pw), u.Username, u.Name)
	if isUniqueViolation(e) {
		writeError(w, 409, "Email or username is already in use", "account_exists")
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	t := security.RandomToken()
	expires := time.Now().Add(30 * 24 * time.Hour)
	_, e = tx.Exec(r.Context(), `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, security.HashToken(t), u.ID, expires)
	if e == nil && s.Config.EmailEnabled() {
		e = queueAccountEmail(r.Context(), tx, u.ID, "verification", in.Email, u.Name)
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		writeInternalError(w, e)
		return
	}
	s.setSessionCookie(w, t, expires)
	writeJSON(w, 201, u)
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password string }
	if !decodeJSONBody(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if len(in.Email) > 254 || len(in.Password) > 72 {
		writeError(w, 401, "Invalid email or password", "invalid_credentials")
		return
	}
	if !s.limiter.allow("login:"+security.HashToken(in.Email), time.Now(), 15, 15*time.Minute) {
		writeError(w, 429, "Too many login attempts; try later", "rate_limit")
		return
	}
	var u domain.User
	var pw string
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	e = tx.QueryRow(r.Context(), `SELECT id,username,name,bio,avatar,password_hash FROM users WHERE email=$1 FOR UPDATE`, in.Email).Scan(&u.ID, &u.Username, &u.Name, &u.Bio, &u.Avatar, &pw)
	if e != nil {
		pw = "$2a$12$AAAAAAAAAAAAAAAAAAAAAOiYvO6zGVxhhl5F8bsBxKl6M0HwvYj/a"
	}
	match := bcrypt.CompareHashAndPassword([]byte(pw), []byte(in.Password))
	if e != nil || match != nil {
		writeError(w, 401, "Invalid email or password", "invalid_credentials")
		return
	}
	t := security.RandomToken()
	expires := time.Now().Add(30 * 24 * time.Hour)
	_, e = tx.Exec(r.Context(), `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, security.HashToken(t), u.ID, expires)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		writeInternalError(w, e)
		return
	}
	s.setSessionCookie(w, t, expires)
	writeJSON(w, 200, u)
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, e := r.Cookie("jot_session"); e == nil {
		if _, e = s.DB.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash=$1`, security.HashToken(c.Value)); e != nil {
			writeInternalError(w, e)
			return
		}
	}
	s.setSessionCookie(w, "", time.Now().Add(-time.Hour))
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if ok {
		writeJSON(w, 200, u)
	}
}
func (s *Server) updateMe(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	if expected := r.Header.Get("X-Jot-User-ID"); expected != "" && expected != u.ID {
		writeError(w, 409, "Your signed-in account changed. Reload before saving.", "identity_changed")
		return
	}
	var in struct{ Name, Bio, Avatar string }
	if !decodeJSONBody(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 100 || len(in.Bio) > 2000 || !domain.ValidText(in.Name) || !domain.ValidText(in.Bio) || len(in.Avatar) > 2000 || !domain.IsSafeURL(in.Avatar, true) {
		writeError(w, 400, "Invalid profile fields", "validation")
		return
	}
	u.Name = in.Name
	u.Bio = in.Bio
	u.Avatar = in.Avatar
	if _, e := s.DB.Exec(r.Context(), `UPDATE users SET name=$2,bio=$3,avatar=$4 WHERE id=$1`, u.ID, u.Name, u.Bio, u.Avatar); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, u)
}
