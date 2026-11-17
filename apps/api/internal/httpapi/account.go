package httpapi

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

// deleteMe removes the account and everything it owns. Foreign keys cascade from users to posts, revisions,
// comments, likes, bookmarks, views, subscriptions, sessions, tokens, jobs, media rows and the custom domain.
func (s *Server) deleteMe(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	if expected := r.Header.Get("X-Jot-User-ID"); expected != "" && expected != u.ID {
		writeError(w, 409, "Your signed-in account changed. Reload before deleting.", "identity_changed")
		return
	}
	var in struct {
		Password string `json:"password"`
	}
	if !decodeJSONBody(w, r, &in) {
		return
	}
	if !s.limiter.allow("delete-account:"+u.ID, time.Now(), 5, 15*time.Minute) {
		writeError(w, 429, "Too many attempts; try later", "rate_limit")
		return
	}
	var hash string
	if e := s.DB.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1`, u.ID).Scan(&hash); e != nil {
		writeInternalError(w, e)
		return
	}
	if len(in.Password) > 72 || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		writeError(w, 403, "That password is not correct", "invalid_password")
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	// Uploads lock the user row before reserving a media row, so once this lock is held no new row can appear
	// unseen; deleting with RETURNING collects every key that the account still owns.
	_, e = tx.Exec(r.Context(), `SELECT 1 FROM users WHERE id=$1 FOR UPDATE`, u.ID)
	var keys []string
	if e == nil {
		var rows pgx.Rows
		if rows, e = tx.Query(r.Context(), `DELETE FROM media_assets WHERE user_id=$1 RETURNING key`, u.ID); e == nil {
			keys, e = pgx.CollectRows(rows, pgx.RowTo[string])
		}
	}
	if e == nil {
		_, e = tx.Exec(r.Context(), `DELETE FROM users WHERE id=$1`, u.ID)
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	s.removeMedia(keys)
	s.setSessionCookie(w, "", time.Now().Add(-time.Hour))
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// removeMedia deletes stored files after their rows are gone and returns the keys it could not remove. Each of those
// is logged as "Media cleanup failed"; rows no longer charge quota. The budget stays below the HTTP write timeout.
func (s *Server) removeMedia(keys []string) []string {
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
	defer cancel()
	failed := []string{}
	fail := func(key string, e error) {
		slog.Error("Media cleanup failed", "key", key, "error", e)
		failed = append(failed, key)
	}
	valid := []string{}
	for _, key := range keys {
		if mediaPattern.MatchString(key) {
			valid = append(valid, key)
		} else {
			fail(key, errors.New("unexpected media key"))
		}
	}
	if s.Config.S3Bucket != "" {
		client := s.storageClient()
		// DeleteObjects accepts at most 1000 keys per request.
		for start := 0; start < len(valid); start += 1000 {
			batch := valid[start:min(start+1000, len(valid))]
			objects := make([]types.ObjectIdentifier, len(batch))
			for i, key := range batch {
				objects[i] = types.ObjectIdentifier{Key: aws.String(key)}
			}
			out, e := client.DeleteObjects(ctx, &s3.DeleteObjectsInput{Bucket: aws.String(s.Config.S3Bucket), Delete: &types.Delete{Objects: objects, Quiet: aws.Bool(true)}})
			if e != nil {
				for _, key := range batch {
					fail(key, e)
				}
				continue
			}
			for _, item := range out.Errors {
				fail(aws.ToString(item.Key), fmt.Errorf("%s: %s", aws.ToString(item.Code), aws.ToString(item.Message)))
			}
		}
		return failed
	}
	for _, key := range valid {
		e := ctx.Err()
		if e == nil {
			if e = os.Remove(filepath.Join(s.Config.UploadDir, key)); os.IsNotExist(e) {
				e = nil
			}
		}
		if e != nil {
			fail(key, e)
		}
	}
	return failed
}

// exportPosts writes a zip with one Markdown file per draft plus published/ copies of live posts.
func (s *Server) exportPosts(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	if !s.limiter.allow("export:"+u.ID, time.Now(), 10, time.Hour) {
		writeError(w, 429, "Too many exports; try later", "rate_limit")
		return
	}
	// Read everything first so a slow client cannot hold a database connection while the archive downloads.
	type exportRow struct {
		id               string
		draft, published []byte
		publishedAt      *time.Time
		updated          time.Time
	}
	rows, e := s.DB.Query(r.Context(), `SELECT id,draft,published,published_at,updated_at FROM posts WHERE author_id=$1 ORDER BY created_at,id`, u.ID)
	var posts []exportRow
	if e == nil {
		posts, e = pgx.CollectRows(rows, func(row pgx.CollectableRow) (exportRow, error) {
			var p exportRow
			return p, row.Scan(&p.id, &p.draft, &p.published, &p.publishedAt, &p.updated)
		})
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="jot-`+u.Username+`.zip"`)
	z := zip.NewWriter(w)
	seen := map[string]bool{}
	add := func(name, id string, sn domain.Snapshot, status string, publishedAt *time.Time, modified time.Time) error {
		// A slug can itself look like another post's fallback name, so keep counting until the name is free.
		unique := name
		for n := 1; seen[unique]; n++ {
			unique = name + "-" + id[:8]
			if n > 1 {
				unique += "-" + strconv.Itoa(n)
			}
		}
		name = unique
		seen[name] = true
		f, e := z.CreateHeader(&zip.FileHeader{Name: name + ".md", Method: zip.Deflate, Modified: modified})
		if e == nil {
			_, e = f.Write([]byte(markdownFile(sn, status, publishedAt, s.Config.Origin)))
		}
		return e
	}
	for _, p := range posts {
		var sn domain.Snapshot
		if e = json.Unmarshal(p.draft, &sn); e != nil {
			break
		}
		status := "draft"
		if len(p.published) > 0 {
			status = "published"
		}
		name := sn.Slug
		if name == "" {
			name = "untitled-" + p.id[:8]
		}
		if e = add(name, p.id, sn, status, p.publishedAt, p.updated); e == nil && len(p.published) > 0 {
			var live domain.Snapshot
			if e = json.Unmarshal(p.published, &live); e == nil {
				e = add("published/"+live.Slug, p.id, live, "published", p.publishedAt, p.updated)
			}
		}
		if e != nil {
			break
		}
	}
	if e != nil {
		// Headers are already sent; an unfinished archive signals the failure to the client.
		slog.Error("export failed", "error", e)
		return
	}
	if e = z.Close(); e != nil {
		slog.Error("export failed", "error", e)
	}
}
func markdownFile(sn domain.Snapshot, status string, publishedAt *time.Time, origin string) string {
	quote := func(v string) string { return string(encodeJSON(v)) }
	tags := []string(sn.Tags)
	if tags == nil {
		tags = []string{}
	}
	lines := []string{"---", "title: " + quote(sn.Title), "subtitle: " + quote(sn.Subtitle), "slug: " + quote(sn.Slug), "tags: " + string(encodeJSON(tags)), "status: " + status}
	if publishedAt != nil {
		lines = append(lines, "publishedAt: "+quote(publishedAt.UTC().Format(time.RFC3339)))
	}
	return strings.Join(lines, "\n") + "\n---\n\n" + domain.RenderMarkdown(sn.Content, origin)
}

func (s *Server) subscribers(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	type subscriber struct {
		ID        string    `json:"id"`
		Email     string    `json:"email"`
		CreatedAt time.Time `json:"createdAt"`
	}
	out := struct {
		Total int          `json:"total"`
		Items []subscriber `json:"items"`
	}{Items: []subscriber{}}
	if e := s.DB.QueryRow(r.Context(), `SELECT count(*) FROM subscriptions WHERE author_id=$1 AND active AND confirmed`, u.ID).Scan(&out.Total); e != nil {
		writeInternalError(w, e)
		return
	}
	q := r.URL.Query()
	rows, e := s.DB.Query(r.Context(), `SELECT id,email,created_at FROM subscriptions WHERE author_id=$1 AND active AND confirmed ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`, u.ID, integer(q.Get("limit"), 50, 1, 500), integer(q.Get("offset"), 0, 0, 1000000))
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var v subscriber
		if e = rows.Scan(&v.ID, &v.Email, &v.CreatedAt); e != nil {
			writeInternalError(w, e)
			return
		}
		out.Items = append(out.Items, v)
	}
	if e = rows.Err(); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, out)
}

// removeSubscriber deletes the reader's address and cancels mail still queued for it.
func (s *Server) removeSubscriber(w http.ResponseWriter, r *http.Request) {
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
	tag, e := tx.Exec(r.Context(), `DELETE FROM subscriptions WHERE id=$1 AND author_id=$2`, id, u.ID)
	if e == nil && tag.RowsAffected() == 0 {
		notFound(w)
		return
	}
	if e == nil {
		_, e = tx.Exec(r.Context(), `UPDATE jobs SET status='failed',error='Subscriber removed',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE kind IN('newsletter','confirmation') AND payload->>'subscriptionId'=$1 AND status IN('pending','running')`, id)
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
