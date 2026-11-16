package httpapi

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jot-project/jot/apps/api/internal/domain"
)

func (s *Server) createAI(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	if s.Config.OpenAIKey == "" {
		writeError(w, 503, "AI suggestions are not configured", "ai_unavailable")
		return
	}
	var in struct {
		PostID string `json:"postId"`
		Mode   string `json:"mode"`
		Text   string `json:"text"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	if !oneOf(in.Mode, "grammar", "structure", "review") || len(strings.TrimSpace(in.Text)) == 0 || len(in.Text) > 30000 || !domain.ValidText(in.Text) {
		writeError(w, 400, "Choose a supported AI mode and 1–30000 bytes of text", "validation")
		return
	}
	if _, e := uuid.Parse(in.PostID); e != nil {
		notFound(w)
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var ownedPostID string
	// Retain the post until enqueue commits so deletion cannot miss newly created work.
	e = tx.QueryRow(r.Context(), `SELECT id FROM posts WHERE id=$1 AND author_id=$2 FOR KEY SHARE`, in.PostID, u.ID).Scan(&ownedPostID)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}

	if _, e = tx.Exec(r.Context(), `SELECT id FROM users WHERE id=$1 FOR UPDATE`, u.ID); e != nil {
		writeInternalError(w, e)
		return
	}
	var count int
	e = tx.QueryRow(r.Context(), `SELECT count(*) FROM jobs WHERE kind='ai' AND user_id=$1 AND created_at>now()-interval '1 hour'`, u.ID).Scan(&count)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if count >= 10 {
		writeError(w, 429, "AI limit reached; try again in an hour", "rate_limit")
		return
	}
	id := uuid.NewString()
	payload := map[string]string{"postId": in.PostID, "mode": in.Mode, "text": in.Text}
	_, e = tx.Exec(r.Context(), `INSERT INTO jobs(id,kind,user_id,payload,idempotency_key) VALUES($1,'ai',$2,$3,$4)`, id, u.ID, encodeJSON(payload), "ai:"+id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 202, map[string]string{"id": id})
}
func (s *Server) getAI(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, e := uuid.Parse(id); e != nil {
		notFound(w)
		return
	}
	var status string
	var result, jobError *string
	e := s.DB.QueryRow(r.Context(), `SELECT status,result,error FROM jobs WHERE id=$1 AND user_id=$2 AND kind='ai'`, id, u.ID).Scan(&status, &result, &jobError)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	out := map[string]any{"id": id, "status": status}
	if result != nil {
		out["result"] = *result
	}
	if jobError != nil {
		out["error"] = *jobError
	}
	writeJSON(w, 200, out)
}
