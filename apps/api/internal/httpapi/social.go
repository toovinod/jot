package httpapi

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jot-project/jot/apps/api/internal/domain"
)

func (s *Server) publishedExists(r *http.Request, id string) (bool, error) {
	if _, e := uuid.Parse(id); e != nil {
		return false, nil
	}
	var ok bool
	e := s.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM posts WHERE id=$1 AND published IS NOT NULL)`, id).Scan(&ok)
	return ok, e
}
func (s *Server) engagement(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ok, e := s.publishedExists(r, id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if !ok {
		notFound(w)
		return
	}
	u, logged := user(r)
	liked, bookmarked := false, false
	if logged {
		e = s.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM likes WHERE post_id=$1 AND user_id=$2),EXISTS(SELECT 1 FROM bookmarks WHERE post_id=$1 AND user_id=$2)`, id, u.ID).Scan(&liked, &bookmarked)
		if e != nil {
			writeInternalError(w, e)
			return
		}
	}
	var likes int
	if e = s.DB.QueryRow(r.Context(), `SELECT count(*) FROM likes WHERE post_id=$1`, id).Scan(&likes); e != nil {
		writeInternalError(w, e)
		return
	}
	rows, e := s.DB.Query(r.Context(), `SELECT c.id,c.body,c.created_at,u.id,u.username,u.name,u.bio,u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 ORDER BY c.created_at DESC LIMIT 100`, id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer rows.Close()
	comments := []domain.Comment{}
	for rows.Next() {
		var c domain.Comment
		if e = rows.Scan(&c.ID, &c.Body, &c.CreatedAt, &c.Author.ID, &c.Author.Username, &c.Author.Name, &c.Author.Bio, &c.Author.Avatar); e != nil {
			writeInternalError(w, e)
			return
		}
		comments = append(comments, c)
	}
	if e = rows.Err(); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"liked": liked, "bookmarked": bookmarked, "likes": likes, "comments": comments})
}
func (s *Server) like(w http.ResponseWriter, r *http.Request)     { s.reaction(w, r, "likes") }
func (s *Server) bookmark(w http.ResponseWriter, r *http.Request) { s.reaction(w, r, "bookmarks") }
func (s *Server) reaction(w http.ResponseWriter, r *http.Request, table string) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Active bool `json:"active"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	id := chi.URLParam(r, "id")
	ok, e := s.publishedExists(r, id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if !ok {
		notFound(w)
		return
	}
	if in.Active {
		_, e = s.DB.Exec(r.Context(), `INSERT INTO `+table+`(post_id,user_id) SELECT id,$2 FROM posts WHERE id=$1 AND published IS NOT NULL ON CONFLICT DO NOTHING`, id, u.ID)
	} else {
		_, e = s.DB.Exec(r.Context(), `DELETE FROM `+table+` WHERE post_id=$1 AND user_id=$2`, id, u.ID)
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func (s *Server) addComment(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Body string `json:"body"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	in.Body = strings.TrimSpace(in.Body)
	if utf8.RuneCountInString(in.Body) < 1 || utf8.RuneCountInString(in.Body) > 5000 || !domain.ValidText(in.Body) {
		writeError(w, 400, "Comments must contain 1–5000 characters", "validation")
		return
	}
	id := chi.URLParam(r, "id")
	ok, e := s.publishedExists(r, id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if !ok {
		notFound(w)
		return
	}
	c := domain.Comment{ID: uuid.NewString(), Body: in.Body, Author: u}
	e = s.DB.QueryRow(r.Context(), `INSERT INTO comments(id,post_id,user_id,body) SELECT $1,id,$3,$4 FROM posts WHERE id=$2 AND published IS NOT NULL RETURNING created_at`, c.ID, id, u.ID, c.Body).Scan(&c.CreatedAt)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 201, c)
}
func (s *Server) deleteComment(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	id, cid := chi.URLParam(r, "id"), chi.URLParam(r, "commentId")
	if _, e := uuid.Parse(id); e != nil {
		notFound(w)
		return
	}
	if _, e := uuid.Parse(cid); e != nil {
		notFound(w)
		return
	}
	tag, e := s.DB.Exec(r.Context(), `DELETE FROM comments c USING posts p WHERE c.id=$1 AND c.post_id=$2 AND p.id=c.post_id AND(c.user_id=$3 OR p.author_id=$3)`, cid, id, u.ID)
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
