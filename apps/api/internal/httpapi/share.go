package httpapi

import (
	"encoding/json"
	"net/http"
	"regexp"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/publishing"
	"github.com/jot-project/jot/apps/api/internal/security"
)

var shareTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func (s *Server) share(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, e := uuid.Parse(id); e != nil {
		notFound(w)
		return
	}
	token := security.RandomURLToken()
	tag, e := s.DB.Exec(r.Context(), `UPDATE posts SET share_token=$3 WHERE id=$1 AND author_id=$2`, id, u.ID, token)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		notFound(w)
		return
	}
	writeJSON(w, 200, map[string]string{"token": token})
}
func (s *Server) unshare(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, e := uuid.Parse(id); e != nil {
		notFound(w)
		return
	}
	tag, e := s.DB.Exec(r.Context(), `UPDATE posts SET share_token=NULL WHERE id=$1 AND author_id=$2`, id, u.ID)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		notFound(w)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (s *Server) sharedDraft(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if !shareTokenPattern.MatchString(token) {
		notFound(w)
		return
	}
	var out struct {
		domain.Snapshot
		Author    domain.User `json:"author"`
		UpdatedAt time.Time   `json:"updatedAt"`
	}
	var raw []byte
	e := s.DB.QueryRow(r.Context(), `SELECT p.draft,p.updated_at,u.id,u.username,u.name,u.bio,u.avatar FROM posts p JOIN users u ON u.id=p.author_id WHERE p.share_token=$1`, token).Scan(&raw, &out.UpdatedAt, &out.Author.ID, &out.Author.Username, &out.Author.Name, &out.Author.Bio, &out.Author.Avatar)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e == nil {
		e = json.Unmarshal(raw, &out.Snapshot)
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	w.Header().Set("X-Robots-Tag", "noindex")
	writeJSON(w, 200, out)
}

func (s *Server) schedule(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		At               time.Time `json:"at"`
		EmailSubscribers bool      `json:"emailSubscribers"`
		Revision         int       `json:"revision"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	if now := time.Now(); in.At.Before(now.Add(2*time.Minute)) || in.At.After(now.AddDate(1, 0, 0)) {
		writeError(w, 400, "Schedule a time between 2 minutes and 1 year from now", "validation")
		return
	}
	id := chi.URLParam(r, "id")
	if _, e := uuid.Parse(id); e != nil {
		notFound(w)
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var raw []byte
	var revision int
	var reservedSlug *string
	var verified bool
	e = tx.QueryRow(r.Context(), `SELECT p.draft,p.revision,p.first_published_slug,u.email_verified FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=$1 AND p.author_id=$2 FOR UPDATE OF p`, id, u.ID).Scan(&raw, &revision, &reservedSlug, &verified)
	if e == nil && revision != in.Revision {
		e = publishing.ErrRevision
	}
	var sn domain.Snapshot
	if e == nil {
		e = json.Unmarshal(raw, &sn)
	}
	if e == nil {
		e = publishing.Check(s.Config, sn, reservedSlug, in.EmailSubscribers)
	}
	if e == nil && in.EmailSubscribers && !verified {
		e = publishing.ErrEmailUnverified
	}
	if e == nil {
		_, e = tx.Exec(r.Context(), `UPDATE posts SET scheduled_at=$2,schedule_email=$3,schedule_attempts=0,schedule_error=NULL WHERE id=$1`, id, in.At, in.EmailSubscribers)
	}
	if e != nil {
		writePublishError(w, e)
		return
	}
	s.commitPostAndRespond(w, r, tx, id, u.ID)
}
func (s *Server) unschedule(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, e := uuid.Parse(id); e != nil {
		notFound(w)
		return
	}
	if _, e := s.DB.Exec(r.Context(), `UPDATE posts SET scheduled_at=NULL,schedule_email=false WHERE id=$1 AND author_id=$2`, id, u.ID); e != nil {
		writeInternalError(w, e)
		return
	}
	s.writeOwnedPost(w, r, id, u.ID, 200)
}
