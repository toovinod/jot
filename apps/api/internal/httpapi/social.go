package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/netip"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/security"
)

func (s *Server) publishedExists(r *http.Request, id string) (bool, error) {
	if _, e := uuid.Parse(id); e != nil {
		return false, nil
	}
	var ok bool
	e := s.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM posts WHERE id=$1 AND published IS NOT NULL)`, id).Scan(&ok)
	return ok, e
}

// commentsOff reports whether the live copy disables comments; pgx.ErrNoRows means the post is not published.
func (s *Server) commentsOff(r *http.Request, id string) (bool, error) {
	if _, e := uuid.Parse(id); e != nil {
		return false, pgx.ErrNoRows
	}
	var off bool
	e := s.DB.QueryRow(r.Context(), `SELECT COALESCE(published->'commentsOff'='true'::jsonb,false) FROM posts WHERE id=$1 AND published IS NOT NULL`, id).Scan(&off)
	return off, e
}

// commenterBlocked is true when the author of post p blocked the writer of comment c.
const commenterBlocked = `EXISTS(SELECT 1 FROM comment_blocks b WHERE b.author_id=p.author_id AND b.blocked_user_id=c.user_id)`

func (s *Server) engagement(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	off, e := s.commentsOff(r, id)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
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
	// The newest 100 threads, then up to 50 newest replies for each, so one busy thread cannot crowd out the others
	// and no reply arrives without its thread. Replies point only at top-level comments. Comments by readers the
	// author blocked are left out, and so are replies to them because their thread is.
	const commentColumns = `c.id,c.body,c.created_at,c.parent_id,u.id,u.username,u.name,u.bio,u.avatar`
	comments, e := s.comments(r, `SELECT `+commentColumns+` FROM comments c JOIN posts p ON p.id=c.post_id JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND c.parent_id IS NULL AND NOT `+commenterBlocked+` ORDER BY c.created_at DESC LIMIT 100`, id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	threads := make([]string, len(comments))
	for i, c := range comments {
		threads[i] = c.ID
	}
	replies, e := s.comments(r, `SELECT `+commentColumns+` FROM unnest($1::uuid[]) t(id) CROSS JOIN LATERAL(SELECT c.* FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.parent_id=t.id AND NOT `+commenterBlocked+` ORDER BY c.created_at DESC LIMIT 50) c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC`, threads)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	comments = append(comments, replies...)
	writeJSON(w, 200, map[string]any{"liked": liked, "bookmarked": bookmarked, "likes": likes, "comments": comments, "commentsOff": off})
}
func (s *Server) comments(r *http.Request, query string, arg any) ([]domain.Comment, error) {
	rows, e := s.DB.Query(r.Context(), query, arg)
	if e != nil {
		return nil, e
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Comment, error) {
		var c domain.Comment
		return c, row.Scan(&c.ID, &c.Body, &c.CreatedAt, &c.ParentID, &c.Author.ID, &c.Author.Username, &c.Author.Name, &c.Author.Bio, &c.Author.Avatar)
	})
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
		Body     string  `json:"body"`
		ParentID *string `json:"parentId"`
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
	off, e := s.commentsOff(r, id)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if off {
		writeError(w, 403, "Comments are turned off for this post", "comments_off")
		return
	}
	var blocked bool
	if e = s.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM comment_blocks b JOIN posts p ON p.author_id=b.author_id WHERE p.id=$1 AND b.blocked_user_id=$2)`, id, u.ID).Scan(&blocked); e != nil {
		writeInternalError(w, e)
		return
	}
	if blocked {
		writeError(w, 403, "The author has blocked you from commenting on their posts", "blocked")
		return
	}
	if in.ParentID != nil {
		var top bool
		if _, e = uuid.Parse(*in.ParentID); e == nil {
			e = s.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM comments WHERE id=$1 AND post_id=$2 AND parent_id IS NULL)`, *in.ParentID, id).Scan(&top)
		}
		if e != nil || !top {
			writeError(w, 400, "Replies can only answer a top-level comment on this post", "invalid_parent")
			return
		}
	}
	c := domain.Comment{ID: uuid.NewString(), Body: in.Body, Author: u, ParentID: in.ParentID}
	e = s.DB.QueryRow(r.Context(), `INSERT INTO comments(id,post_id,user_id,body,parent_id) SELECT $1,id,$3,$4,$5 FROM posts WHERE id=$2 AND published IS NOT NULL RETURNING created_at`, c.ID, id, u.ID, c.Body, in.ParentID).Scan(&c.CreatedAt)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if p, ok := e.(*pgconn.PgError); ok && p.Code == "23503" {
		writeError(w, 400, "Replies can only answer a top-level comment on this post", "invalid_parent")
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

// view counts one read per viewer per post per day. The author's own visits and unpublished posts are ignored.
func (s *Server) view(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, e := uuid.Parse(id); e != nil {
		notFound(w)
		return
	}
	ip := s.clientIP(r)
	if !s.limiter.allow("view:"+ip, time.Now(), 30, time.Minute) {
		writeError(w, 429, "Too many requests; try again shortly", "rate_limit")
		return
	}
	day := time.Now().UTC().Format(time.DateOnly)
	viewer := s.anonymousViewerKey(ip, day)
	var viewerID *string
	if u, ok := user(r); ok {
		viewer, viewerID = security.HashToken("user:"+u.ID), &u.ID
	}
	_, e := s.DB.Exec(r.Context(), `WITH seen AS(INSERT INTO post_views(post_id,viewer_key,day) SELECT id,$2,$4::date FROM posts WHERE id=$1 AND published IS NOT NULL AND author_id IS DISTINCT FROM $3::uuid ON CONFLICT DO NOTHING RETURNING post_id) UPDATE posts SET views=views+1 WHERE id IN(SELECT post_id FROM seen)`, id, viewer, viewerID, day)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	w.WriteHeader(204)
}

// anonymousViewerKey keys a signed-out reader by client address only, so rotating the user agent does not add reads.
// IPv6 addresses collapse to their /64, which one household or device usually holds. The HMAC uses VIEW_HASH_SECRET
// (or a per-process random secret when it is empty) mixed with the UTC day, so stored keys rotate daily and cannot
// be matched by hashing guessed addresses.
func (s *Server) anonymousViewerKey(ip, day string) string {
	if addr, e := netip.ParseAddr(ip); e == nil && addr.Is6() {
		ip = netip.PrefixFrom(addr, 64).Masked().Addr().String()
	}
	mac := hmac.New(sha256.New, s.viewSecret)
	mac.Write([]byte(day + "\n" + ip))
	return hex.EncodeToString(mac.Sum(nil))
}

const blockedReaderSelect = `SELECT u.id,u.username,u.name,u.bio,u.avatar,b.created_at FROM comment_blocks b JOIN users u ON u.id=b.blocked_user_id WHERE b.author_id=$1`

// blockedReaders lists the readers the signed-in author blocked, newest first.
func (s *Server) blockedReaders(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	rows, e := s.DB.Query(r.Context(), blockedReaderSelect+` ORDER BY b.created_at DESC,u.id`, u.ID)
	var out []domain.BlockedReader
	if e == nil {
		out, e = pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.BlockedReader, error) {
			var v domain.BlockedReader
			return v, row.Scan(&v.User.ID, &v.User.Username, &v.User.Name, &v.User.Bio, &v.User.Avatar, &v.BlockedAt)
		})
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, out)
}

// blockReader stops a reader from commenting on the author's posts and hides that reader's comments there.
// Blocking an already blocked reader keeps the original time.
func (s *Server) blockReader(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		UserID string `json:"userId"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	parsed, e := uuid.Parse(in.UserID)
	if e != nil {
		notFound(w)
		return
	}
	id := parsed.String()
	if id == u.ID {
		writeError(w, 400, "You can't block yourself", "validation")
		return
	}
	if _, e = s.DB.Exec(r.Context(), `INSERT INTO comment_blocks(author_id,blocked_user_id) SELECT $1,id FROM users WHERE id=$2 ON CONFLICT DO NOTHING`, u.ID, id); e != nil {
		writeInternalError(w, e)
		return
	}
	var v domain.BlockedReader
	e = s.DB.QueryRow(r.Context(), blockedReaderSelect+` AND b.blocked_user_id=$2`, u.ID, id).Scan(&v.User.ID, &v.User.Username, &v.User.Name, &v.User.Bio, &v.User.Avatar, &v.BlockedAt)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, v)
}
func (s *Server) unblockReader(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "userId")
	if _, e := uuid.Parse(id); e != nil {
		notFound(w)
		return
	}
	if _, e := s.DB.Exec(r.Context(), `DELETE FROM comment_blocks WHERE author_id=$1 AND blocked_user_id=$2`, u.ID, id); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
