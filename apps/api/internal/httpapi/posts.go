package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/domain"
)

const postAuthorAndCounts = `u.id,u.username,u.name,u.bio,u.avatar,(SELECT count(*) FROM likes l WHERE l.post_id=p.id),(SELECT count(*) FROM comments c WHERE c.post_id=p.id) FROM posts p JOIN users u ON u.id=p.author_id `
const postSelect = `SELECT p.id,p.draft,p.revision,p.created_at,p.updated_at,p.published_at,p.published,COALESCE(p.first_published_slug,''),` + postAuthorAndCounts
const publicPostSelect = `SELECT p.id,p.published,0,p.created_at,p.published_at,p.published_at,NULL::jsonb,''::text,` + postAuthorAndCounts
const ownedSummarySelect = `SELECT p.id,p.draft_summary,p.revision,p.created_at,p.updated_at,p.published_at,COALESCE(p.first_published_slug,''),p.published IS NOT NULL,` + postAuthorAndCounts
const publicSummarySelect = `SELECT p.id,p.published_summary,0,p.created_at,p.published_at,p.published_at,''::text,true,` + postAuthorAndCounts

type scanner interface{ Scan(...any) error }

func scanPostRow(row scanner, public bool) (domain.Post, error) {
	var p domain.Post
	var draft, pub []byte
	e := row.Scan(&p.ID, &draft, &p.Revision, &p.CreatedAt, &p.UpdatedAt, &p.PublishedAt, &pub, &p.ReservedSlug, &p.Author.ID, &p.Author.Username, &p.Author.Name, &p.Author.Bio, &p.Author.Avatar, &p.Likes, &p.Comments)
	if e != nil {
		return p, e
	}
	if e = json.Unmarshal(draft, &p.Snapshot); e != nil {
		return p, e
	}
	if len(pub) > 0 {
		var sn domain.Snapshot
		if e = json.Unmarshal(pub, &sn); e != nil {
			return p, e
		}
		p.Published = &sn
		if public {
			p.Snapshot = sn
			p.Revision = 0
			p.ReservedSlug = ""
			if p.PublishedAt != nil {
				p.UpdatedAt = *p.PublishedAt
			}
		}
	}
	return p, nil
}
func (s *Server) loadOwnedPost(ctx context.Context, id, owner string) (domain.Post, error) {
	if _, e := uuid.Parse(id); e != nil {
		return domain.Post{}, pgx.ErrNoRows
	}
	return scanPostRow(s.DB.QueryRow(ctx, postSelect+`WHERE p.id=$1 AND p.author_id=$2`, id, owner), false)
}
func (s *Server) writeOwnedPost(w http.ResponseWriter, r *http.Request, id, owner string, status int) {
	p, e := s.loadOwnedPost(r.Context(), id, owner)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, status, p)
}
func (s *Server) createPost(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := uuid.NewString()
	_, e := s.DB.Exec(r.Context(), `INSERT INTO posts(id,author_id,draft,draft_summary) VALUES($1,$2,$3,$4)`, id, u.ID, encodeJSON(domain.EmptySnapshot()), encodeJSON(domain.SummarizeSnapshot(domain.EmptySnapshot())))
	if e != nil {
		writeInternalError(w, e)
		return
	}
	s.writeOwnedPost(w, r, id, u.ID, 201)
}
func (s *Server) getPost(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if ok {
		s.writeOwnedPost(w, r, chi.URLParam(r, "id"), u.ID, 200)
	}
}
func (s *Server) savePost(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		domain.Snapshot
		Revision int `json:"revision"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	if e := domain.ValidateSnapshot(in.Snapshot, false); e != nil {
		writeError(w, 400, e.Error(), "validation")
		return
	}
	id := chi.URLParam(r, "id")
	ownedPost, e := s.loadOwnedPost(r.Context(), id, u.ID)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if ownedPost.ReservedSlug != "" && in.Slug != ownedPost.ReservedSlug {
		writeError(w, 400, "Published post slugs remain stable", "stable_slug")
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	tag, e := tx.Exec(r.Context(), `UPDATE posts SET draft=$3,draft_summary=$5,revision=revision+1,updated_at=now() WHERE id=$1 AND author_id=$2 AND revision=$4`, id, u.ID, encodeJSON(in.Snapshot), in.Revision, encodeJSON(domain.SummarizeSnapshot(in.Snapshot)))
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 409, "This draft changed elsewhere. Reload before saving.", "revision_conflict")
		return
	}
	s.commitPostAndRespond(w, r, tx, id, u.ID)
}
func (s *Server) publish(w http.ResponseWriter, r *http.Request)   { s.changePublication(w, r, true) }
func (s *Server) unpublish(w http.ResponseWriter, r *http.Request) { s.changePublication(w, r, false) }
func (s *Server) changePublication(w http.ResponseWriter, r *http.Request, publish bool) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Revision         int  `json:"revision"`
		EmailSubscribers bool `json:"emailSubscribers"`
	}
	if !decodeJSONBody(w, r, &in) {
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
	e = tx.QueryRow(r.Context(), `SELECT draft,revision,first_published_slug FROM posts WHERE id=$1 AND author_id=$2 FOR UPDATE`, id, u.ID).Scan(&raw, &revision, &reservedSlug)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if revision != in.Revision {
		writeError(w, 409, "Draft revision changed; reload before publishing", "revision_conflict")
		return
	}
	if publish {
		var sn domain.Snapshot
		if e = json.Unmarshal(raw, &sn); e != nil {
			writeInternalError(w, e)
			return
		}
		if e = domain.ValidateSnapshot(sn, true); e != nil {
			writeError(w, 400, e.Error(), "validation")
			return
		}
		if in.EmailSubscribers && (sn.Visibility != "public" || !s.Config.EmailEnabled()) {
			writeError(w, 400, "Email delivery requires a public post and configured email provider", "email_unavailable")
			return
		}
		if reservedSlug != nil && *reservedSlug != sn.Slug {
			writeError(w, 400, "Published post slugs remain stable", "stable_slug")
			return
		}
		_, e = tx.Exec(r.Context(), `UPDATE posts SET published=$3,published_summary=$5,first_published_slug=COALESCE(first_published_slug,$4),published_at=now(),updated_at=now(),revision=revision+1 WHERE id=$1 AND author_id=$2`, id, u.ID, raw, sn.Slug, encodeJSON(domain.SummarizeSnapshot(sn)))
		if isUniqueViolation(e) {
			writeError(w, 409, "This slug is reserved by another post; choose another", "slug_conflict")
			return
		}
		if e != nil {
			writeInternalError(w, e)
			return
		}
		if sn.Visibility == "unlisted" {
			if _, e = tx.Exec(r.Context(), `UPDATE jobs SET status='failed',error='Publication is no longer public',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE kind='newsletter' AND payload->>'postId'=$1 AND status IN('pending','running')`, id); e != nil {
				writeInternalError(w, e)
				return
			}
		}
		var version int64
		if e = tx.QueryRow(r.Context(), `INSERT INTO revisions(post_id,snapshot) VALUES($1,$2) RETURNING id`, id, raw).Scan(&version); e != nil {
			writeInternalError(w, e)
			return
		}
		if in.EmailSubscribers {
			if e = s.enqueueNewsletter(r.Context(), tx, u, id, sn, version); errors.Is(e, errEmailUnverified) {
				writeError(w, 403, e.Error(), "email_unverified")
				return
			} else if errors.Is(e, errNewsletterBudget) {
				writeError(w, 429, e.Error(), "newsletter_budget")
				return
			} else if e != nil {
				writeInternalError(w, e)
				return
			}
		}

	} else {
		_, e = tx.Exec(r.Context(), `UPDATE posts SET published=NULL,published_summary=NULL,published_at=NULL,updated_at=now(),revision=revision+1 WHERE id=$1`, id)
		if e == nil {
			_, e = tx.Exec(r.Context(), `UPDATE jobs SET status='failed',error='Publication removed',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE kind='newsletter' AND payload->>'postId'=$1 AND status IN ('pending','running')`, id)
		}
		if e != nil {
			writeInternalError(w, e)
			return
		}
	}
	s.commitPostAndRespond(w, r, tx, id, u.ID)
}
func (s *Server) deletePost(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
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
	tag, e := tx.Exec(r.Context(), `DELETE FROM posts WHERE id=$1 AND author_id=$2`, id, u.ID)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		notFound(w)
		return
	}
	_, e = tx.Exec(r.Context(), `UPDATE jobs SET status='failed',error='Publication removed',lease_token=NULL,lease_until=NULL WHERE kind='newsletter' AND payload->>'postId'=$1 AND status IN('pending','running')`, id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	_, e = tx.Exec(r.Context(), `UPDATE jobs SET status='failed',payload=jsonb_build_object('postId',$1::text),result=NULL,error='Source post was deleted',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE kind='ai' AND user_id=$2 AND payload->>'postId'=$1`, id, u.ID)
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
func (s *Server) listPosts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	scope := q.Get("scope")
	args := []any{}
	where := `WHERE p.published IS NOT NULL AND p.published_summary->>'visibility'='public'`
	public := true
	sort := `p.published_at DESC,p.id`
	if scope != "" {
		u, ok := requireUser(w, r)
		if !ok {
			return
		}
		args = append(args, u.ID)
		if scope == "mine" {
			where = `WHERE p.author_id=$1`
			public = false
			sort = `p.updated_at DESC,p.id`
		} else if scope == "bookmarks" {
			where = `WHERE p.published IS NOT NULL AND EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id=p.id AND b.user_id=$1)`
		} else {
			writeError(w, 400, "Unknown post scope", "validation")
			return
		}
	}
	if term := strings.TrimSpace(q.Get("q")); term != "" {
		if len(term) > 200 {
			writeError(w, 400, "Search is too long", "validation")
			return
		}
		args = append(args, "%"+term+"%")
		field := "published_summary"
		if !public {
			field = "draft_summary"
		}
		where += fmt.Sprintf(` AND (p.%s->>'title' ILIKE $%d OR p.%s->>'subtitle' ILIKE $%d)`, field, len(args), field, len(args))
	}
	if q.Get("sort") == "popular" && public {
		sort = `(SELECT count(*) FROM likes l WHERE l.post_id=p.id) DESC,p.published_at DESC,p.id`
	}
	args = append(args, integer(q.Get("limit"), 20, 1, 50), integer(q.Get("offset"), 0, 0, 10000))
	selection := publicSummarySelect
	if !public {
		selection = ownedSummarySelect
	}
	rows, e := s.DB.Query(r.Context(), selection+where+fmt.Sprintf(` ORDER BY %s LIMIT $%d OFFSET $%d`, sort, len(args)-1, len(args)), args...)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer rows.Close()
	posts := []domain.PostSummary{}
	for rows.Next() {
		p, e := scanPostSummary(rows)
		if e != nil {
			writeInternalError(w, e)
			return
		}
		posts = append(posts, p)
	}
	if e = rows.Err(); e != nil {
		writeInternalError(w, e)
		return
	}
	v := map[string]any{"posts": posts}
	if scope == "" {
		writePublicJSON(w, r, v)
	} else {
		writeJSON(w, 200, v)
	}
}
func (s *Server) author(w http.ResponseWriter, r *http.Request) {
	var u domain.User
	e := s.DB.QueryRow(r.Context(), `SELECT id,username,name,bio,avatar FROM users WHERE username=$1`, chi.URLParam(r, "username")).Scan(&u.ID, &u.Username, &u.Name, &u.Bio, &u.Avatar)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	rows, e := s.DB.Query(r.Context(), publicSummarySelect+`WHERE p.author_id=$1 AND p.published IS NOT NULL AND p.published_summary->>'visibility'='public' ORDER BY p.published_at DESC LIMIT 100`, u.ID)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer rows.Close()
	posts := []domain.PostSummary{}
	for rows.Next() {
		p, e := scanPostSummary(rows)
		if e != nil {
			writeInternalError(w, e)
			return
		}
		posts = append(posts, p)
	}
	if e = rows.Err(); e != nil {
		writeInternalError(w, e)
		return
	}
	writePublicJSON(w, r, map[string]any{"author": u, "posts": posts})
}
func (s *Server) publicPost(w http.ResponseWriter, r *http.Request) {
	p, e := scanPostRow(s.DB.QueryRow(r.Context(), publicPostSelect+`WHERE u.username=$1 AND p.first_published_slug=$2 AND p.published IS NOT NULL`, chi.URLParam(r, "username"), chi.URLParam(r, "slug")), true)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	writePublicJSON(w, r, p)
}
func writePublicJSON(w http.ResponseWriter, r *http.Request, v any) {
	b := encodeJSON(v)
	sum := sha256.Sum256(b)
	etag := `"` + hex.EncodeToString(sum[:]) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "public, no-cache, must-revalidate")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(304)
		return
	}
	writeJSON(w, 200, v)
}
func (s *Server) revisions(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, e := s.loadOwnedPost(r.Context(), id, u.ID); isNotFound(e) {
		notFound(w)
		return
	} else if e != nil {
		writeInternalError(w, e)
		return
	}
	rows, e := s.DB.Query(r.Context(), `SELECT id,snapshot->>'title',created_at FROM revisions WHERE post_id=$1 ORDER BY id DESC LIMIT 100`, id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer rows.Close()
	out := []domain.RevisionSummary{}
	for rows.Next() {
		var v domain.RevisionSummary
		if e = rows.Scan(&v.ID, &v.Title, &v.CreatedAt); e != nil {
			writeInternalError(w, e)
			return
		}
		out = append(out, v)
	}
	if e = rows.Err(); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"revisions": out})
}
func (s *Server) restore(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Revision  int   `json:"revision"`
		VersionID int64 `json:"versionId"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	id := chi.URLParam(r, "id")
	if _, e := s.loadOwnedPost(r.Context(), id, u.ID); isNotFound(e) {
		notFound(w)
		return
	} else if e != nil {
		writeInternalError(w, e)
		return
	}
	var raw []byte
	if e := s.DB.QueryRow(r.Context(), `SELECT snapshot FROM revisions WHERE post_id=$1 AND id=$2`, id, in.VersionID).Scan(&raw); isNotFound(e) {
		notFound(w)
		return
	} else if e != nil {
		writeInternalError(w, e)
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var restored domain.Snapshot
	if e = json.Unmarshal(raw, &restored); e != nil {
		writeInternalError(w, e)
		return
	}
	tag, e := tx.Exec(r.Context(), `UPDATE posts SET draft=$3,draft_summary=$5,revision=revision+1,updated_at=now() WHERE id=$1 AND author_id=$2 AND revision=$4`, id, u.ID, raw, in.Revision, encodeJSON(domain.SummarizeSnapshot(restored)))
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 409, "Draft revision changed", "revision_conflict")
		return
	}
	s.commitPostAndRespond(w, r, tx, id, u.ID)
}

func (s *Server) commitPostAndRespond(w http.ResponseWriter, r *http.Request, tx pgx.Tx, id, owner string) {
	p, e := scanPostRow(tx.QueryRow(r.Context(), postSelect+`WHERE p.id=$1 AND p.author_id=$2`, id, owner), false)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, p)
}

func scanPostSummary(row scanner) (domain.PostSummary, error) {
	var post domain.PostSummary
	var summary []byte
	e := row.Scan(&post.ID, &summary, &post.Revision, &post.CreatedAt, &post.UpdatedAt, &post.PublishedAt, &post.ReservedSlug, &post.IsPublished, &post.Author.ID, &post.Author.Username, &post.Author.Name, &post.Author.Bio, &post.Author.Avatar, &post.Likes, &post.Comments)
	if e != nil {
		return post, e
	}
	e = json.Unmarshal(summary, &post.SnapshotSummary)
	return post, e
}
