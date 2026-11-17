package httpapi

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jot-project/jot/apps/api/internal/config"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/jobs"
	"github.com/jot-project/jot/apps/api/internal/security"
)

func TestCustomDomainValidation(t *testing.T) {
	s := NewServer(nil, config.Config{Origin: "https://jot.example.com", CustomDomainTarget: "domains.jot.example.com"})
	for host, valid := range map[string]bool{
		"blog.example.org": true, "example.co.uk": true, "a-b.example.io": true,
		"": false, "localhost": false, "example": false, "1.2.3.4": false, "::1": false, "[::1]": false,
		"jot.example.com": false, "evil.jot.example.com": false, "domains.jot.example.com": false,
		"-bad.example.com": false, "bad-.example.com": false, "under_score.example.com": false,
		"blog.example.com:8080": false, "https://blog.example.com": false, "Blog.Example.com": false,
		strings.Repeat("a", 64) + ".com": false, "example.123": false,
	} {
		if got := s.validCustomDomain(host); got != valid {
			t.Fatalf("%q valid=%v want %v", host, got, valid)
		}
	}
	if normalizeHost(" Blog.Example.org.:443 ") != "blog.example.org" {
		t.Fatal("host normalization")
	}
}

func publishPost(t *testing.T, s *Server, c *http.Cookie, p Post) Post {
	t.Helper()
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/publish", map[string]any{"revision": p.Revision, "emailSubscribers": false}, c), 200, &p)
	return p
}
func saveSnapshot(t *testing.T, s *Server, c *http.Cookie, p Post) Post {
	t.Helper()
	return save(t, s, c, p, p.Title, p.Slug)
}
func ownedPost(t *testing.T, s *Server, c *http.Cookie, id string) Post {
	t.Helper()
	var p Post
	decodeResponse(t, request(t, s, "GET", "/api/posts/"+id, nil, c), 200, &p)
	return p
}

func TestScheduleWindowAndDuePublication(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	p := save(t, s, c, newPost(t, s, c), "Later", "later")
	schedule := func(at time.Time, revision int) *httptest.ResponseRecorder {
		return request(t, s, "POST", "/api/posts/"+p.ID+"/schedule", map[string]any{"at": at, "emailSubscribers": false, "revision": revision}, c)
	}
	decodeResponse(t, schedule(time.Now().Add(time.Minute), p.Revision), 400, nil)
	decodeResponse(t, schedule(time.Now().AddDate(1, 0, 1), p.Revision), 400, nil)
	decodeResponse(t, schedule(time.Now().Add(time.Hour), p.Revision-1), 409, nil)
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/schedule", map[string]any{"at": time.Now().Add(time.Hour), "emailSubscribers": true, "revision": p.Revision}, c), 400, nil)
	var scheduled Post
	decodeResponse(t, schedule(time.Now().Add(time.Hour), p.Revision), 200, &scheduled)
	if scheduled.ScheduledAt == nil || scheduled.Published != nil {
		t.Fatal("schedule not recorded")
	}
	var mine struct {
		Posts []domain.PostSummary `json:"posts"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts?scope=mine", nil, c), 200, &mine)
	if len(mine.Posts) != 1 || mine.Posts[0].ScheduledAt == nil {
		t.Fatal("library summary lacks scheduledAt")
	}
	var cancelled Post
	decodeResponse(t, request(t, s, "DELETE", "/api/posts/"+p.ID+"/schedule", nil, c), 200, &cancelled)
	if cancelled.ScheduledAt != nil {
		t.Fatal("schedule not cancelled")
	}
	decodeResponse(t, schedule(time.Now().Add(time.Hour), p.Revision), 200, &scheduled)
	// The draft saved after scheduling is what goes live.
	p = save(t, s, c, scheduled, "Later, edited", "later")
	if _, e := s.DB.Exec(context.Background(), `UPDATE posts SET scheduled_at=now()-interval '1 second' WHERE id=$1`, p.ID); e != nil {
		t.Fatal(e)
	}
	if e := jobWorker(s).PublishDue(context.Background()); e != nil {
		t.Fatal(e)
	}
	live := ownedPost(t, s, c, p.ID)
	if live.Published == nil || live.Published.Title != "Later, edited" || live.ScheduledAt != nil {
		t.Fatalf("due post not published: %+v", live.Published)
	}
	decodeResponse(t, request(t, s, "GET", "/api/public/"+author.Username+"/later", nil, nil), 200, nil)
	// A refused scheduled publication clears its schedule rather than retrying forever.
	q := save(t, s, c, newPost(t, s, c), "Broken", "broken")
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+q.ID+"/schedule", map[string]any{"at": time.Now().Add(time.Hour), "emailSubscribers": false, "revision": q.Revision}, c), 200, &q)
	if _, e := s.DB.Exec(context.Background(), `UPDATE posts SET scheduled_at=now()-interval '1 second',draft=jsonb_set(draft,'{title}','""') WHERE id=$1`, q.ID); e != nil {
		t.Fatal(e)
	}
	if e := jobWorker(s).PublishDue(context.Background()); e != nil {
		t.Fatal(e)
	}
	if q = ownedPost(t, s, c, q.ID); q.Published != nil || q.ScheduledAt != nil {
		t.Fatal("invalid scheduled draft published or kept retrying")
	}
}

func TestShareTokenFlow(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	_, other := account(t, s)
	p := save(t, s, c, newPost(t, s, c), "Private draft", "private-draft")
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/share", nil, other), 404, nil)
	var shared struct {
		Token string `json:"token"`
	}
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/share", nil, c), 200, &shared)
	if len(shared.Token) != 43 || strings.ContainsAny(shared.Token, "+/=") {
		t.Fatalf("token is not 32 bytes of base64url: %q", shared.Token)
	}
	if ownedPost(t, s, c, p.ID).ShareToken != shared.Token {
		t.Fatal("owner response lacks share token")
	}
	w := request(t, s, "GET", "/api/shared/"+shared.Token, nil, nil)
	var draft struct {
		domain.Snapshot
		Author    domain.User `json:"author"`
		UpdatedAt time.Time   `json:"updatedAt"`
	}
	decodeResponse(t, w, 200, &draft)
	if draft.Title != "Private draft" || draft.Author.ID != author.ID || draft.UpdatedAt.IsZero() || w.Header().Get("X-Robots-Tag") != "noindex" || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("shared draft response incorrect")
	}
	if strings.Contains(w.Body.String(), "shareToken") || strings.Contains(w.Body.String(), `"revision"`) {
		t.Fatal("shared draft exposed owner fields")
	}
	old := shared.Token
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/share", nil, c), 200, &shared)
	decodeResponse(t, request(t, s, "GET", "/api/shared/"+old, nil, nil), 404, nil)
	decodeResponse(t, request(t, s, "DELETE", "/api/posts/"+p.ID+"/share", nil, c), 200, nil)
	decodeResponse(t, request(t, s, "GET", "/api/shared/"+shared.Token, nil, nil), 404, nil)
	decodeResponse(t, request(t, s, "GET", "/api/shared/not-a-token", nil, nil), 404, nil)
	if ownedPost(t, s, c, p.ID).ShareToken != "" {
		t.Fatal("revoked token still returned")
	}
}

func TestCommentRepliesAndCommentsOff(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	_, reader := account(t, s)
	p := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Talk", "talk"))
	other := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Other", "other"))
	var top, reply, foreign domain.Comment
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/comments", map[string]any{"body": "top"}, reader), 201, &top)
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/comments", map[string]any{"body": "reply", "parentId": top.ID}, c), 201, &reply)
	if reply.ParentID == nil || *reply.ParentID != top.ID {
		t.Fatal("reply lost parent")
	}
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/comments", map[string]any{"body": "nested", "parentId": reply.ID}, reader), 400, nil)
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+other.ID+"/comments", map[string]any{"body": "elsewhere"}, reader), 201, &foreign)
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/comments", map[string]any{"body": "cross", "parentId": foreign.ID}, reader), 400, nil)
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/comments", map[string]any{"body": "bad", "parentId": "nope"}, reader), 400, nil)
	var engagement struct {
		Comments    []domain.Comment `json:"comments"`
		CommentsOff bool             `json:"commentsOff"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts/"+p.ID+"/engagement", nil, nil), 200, &engagement)
	if len(engagement.Comments) != 2 || engagement.CommentsOff {
		t.Fatalf("engagement %+v", engagement)
	}
	for _, comment := range engagement.Comments {
		if (comment.ID == reply.ID) != (comment.ParentID != nil) {
			t.Fatal("parentId missing or wrong in engagement")
		}
	}
	p.CommentsOff = true
	p = publishPost(t, s, c, saveSnapshot(t, s, c, p))
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/comments", map[string]any{"body": "late"}, reader), 403, nil)
	w := request(t, s, "POST", "/api/posts/"+p.ID+"/comments", map[string]any{"body": "late", "parentId": top.ID}, c)
	if w.Code != 403 || !strings.Contains(w.Body.String(), "comments_off") {
		t.Fatalf("reply allowed with comments off: %d %s", w.Code, w.Body.String())
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts/"+p.ID+"/engagement", nil, nil), 200, &engagement)
	if !engagement.CommentsOff || len(engagement.Comments) != 2 {
		t.Fatal("comments off not reported")
	}
	decodeResponse(t, request(t, s, "DELETE", "/api/posts/"+p.ID+"/comments/"+top.ID, nil, c), 200, nil)
	decodeResponse(t, request(t, s, "GET", "/api/posts/"+p.ID+"/engagement", nil, nil), 200, &engagement)
	if len(engagement.Comments) != 0 {
		t.Fatal("deleting a comment kept its replies")
	}
}

func TestViewsDedupePerViewerAndIgnoreAuthor(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	_, reader := account(t, s)
	draft := save(t, s, c, newPost(t, s, c), "Draft", "draft")
	p := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Read me", "read-me"))
	view := func(id, agent string, cookie *http.Cookie) {
		r := httptest.NewRequest("POST", "/api/posts/"+id+"/view", nil)
		r.Header.Set("Origin", s.Config.Origin)
		r.Header.Set("User-Agent", agent)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		decodeResponse(t, w, 204, nil)
	}
	views := func(id string) int64 { return ownedPost(t, s, c, id).Views }
	view(p.ID, "a", c)
	view(draft.ID, "a", nil)
	if views(p.ID) != 0 || views(draft.ID) != 0 {
		t.Fatal("author or unpublished view counted")
	}
	view(p.ID, "a", nil)
	view(p.ID, "a", nil)
	view(p.ID, "b", nil)
	view(p.ID, "a", reader)
	view(p.ID, "b", reader)
	// One anonymous reader (the user agent is not part of the key) plus one signed-in reader.
	if got := views(p.ID); got != 2 {
		t.Fatalf("views=%d want 2", got)
	}
	var public Post
	decodeResponse(t, request(t, s, "GET", "/api/public/"+p.Author.Username+"/read-me", nil, nil), 200, &public)
	var feed struct {
		Posts []domain.PostSummary `json:"posts"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts", nil, nil), 200, &feed)
	if public.Views != 2 || len(feed.Posts) != 1 || feed.Posts[0].Views != 2 || feed.Posts[0].LiveVisibility != "public" {
		t.Fatal("views missing from public responses")
	}
	var stored string
	if e := s.DB.QueryRow(context.Background(), `SELECT viewer_key FROM post_views LIMIT 1`).Scan(&stored); e != nil || len(stored) != 64 || strings.Contains(stored, "192.0.2") {
		t.Fatal("viewer key is not a hash")
	}
	for i := 0; i < 30; i++ {
		request(t, s, "POST", "/api/posts/"+p.ID+"/view", nil, nil)
	}
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/view", nil, nil), 429, nil)
}

func TestAccountDeletionRequiresPasswordAndRemovesEverything(t *testing.T) {
	s := testServer(t)
	u, c := account(t, s)
	_, reader := account(t, s)
	p := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Gone", "gone"))
	readerPost := publishPost(t, s, reader, save(t, s, reader, newPost(t, s, reader), "Stays", "stays"))
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/comments", map[string]any{"body": "reader note"}, reader), 201, nil)
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+readerPost.ID+"/comments", map[string]any{"body": "author note"}, c), 201, nil)
	var b bytes.Buffer
	_ = png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile("file", "a.png")
	_, _ = part.Write(b.Bytes())
	_ = form.Close()
	r := httptest.NewRequest("POST", "/api/uploads", &body)
	r.Header.Set("Origin", s.Config.Origin)
	r.Header.Set("Content-Type", form.FormDataContentType())
	r.AddCookie(c)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	var uploaded struct {
		URL string `json:"url"`
	}
	decodeResponse(t, w, 201, &uploaded)
	file := filepath.Join(s.Config.UploadDir, strings.TrimPrefix(uploaded.URL, "/media/"))
	decodeResponse(t, request(t, s, "DELETE", "/api/me", map[string]string{"password": "wrong-password-here"}, c), 403, nil)
	decodeResponse(t, request(t, s, "GET", "/api/me", nil, c), 200, nil)
	w = request(t, s, "DELETE", "/api/me", map[string]string{"password": "correct-horse-password"}, c)
	decodeResponse(t, w, 200, nil)
	if cookies := w.Result().Cookies(); len(cookies) != 1 || cookies[0].Value != "" {
		t.Fatal("session cookie not cleared")
	}
	decodeResponse(t, request(t, s, "GET", "/api/me", nil, c), 401, nil)
	var left int
	if e := s.DB.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM users WHERE id=$1)+(SELECT count(*) FROM posts WHERE author_id=$1)+(SELECT count(*) FROM comments WHERE user_id=$1 OR post_id=$2)+(SELECT count(*) FROM media_assets WHERE user_id=$1)+(SELECT count(*) FROM sessions WHERE user_id=$1)`, u.ID, p.ID).Scan(&left); e != nil || left != 0 {
		t.Fatalf("account data left behind: %d %v", left, e)
	}
	if _, e := os.Stat(file); !os.IsNotExist(e) {
		t.Fatal("uploaded file not removed")
	}
	decodeResponse(t, request(t, s, "GET", "/api/public/"+readerPost.Author.Username+"/stays", nil, nil), 200, nil)
}

func TestSubscribersListAndRemove(t *testing.T) {
	s := testServer(t)
	u, c := account(t, s)
	_, other := account(t, s)
	for i, state := range []string{"true,true", "true,true", "true,true", "false,false"} {
		token := security.RandomToken()
		_, e := s.DB.Exec(context.Background(), `INSERT INTO subscriptions(id,author_id,email,confirmed,active,confirm_hash,unsubscribe_hash,unsubscribe_token,confirm_expires) VALUES(gen_random_uuid(),$1,$2,`+state+`,'c',$3,$4,now())`, u.ID, string(rune('a'+i))+"@example.com", security.HashToken(token), token)
		if e != nil {
			t.Fatal(e)
		}
	}
	var page struct {
		Total int `json:"total"`
		Items []struct {
			ID        string    `json:"id"`
			Email     string    `json:"email"`
			CreatedAt time.Time `json:"createdAt"`
		} `json:"items"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/me/subscribers?limit=2", nil, c), 200, &page)
	if page.Total != 3 || len(page.Items) != 2 || page.Items[0].Email == "" {
		t.Fatalf("page %+v", page)
	}
	decodeResponse(t, request(t, s, "GET", "/api/me/subscribers?offset=2", nil, c), 200, &page)
	if page.Total != 3 || len(page.Items) != 1 {
		t.Fatalf("offset page %+v", page)
	}
	decodeResponse(t, request(t, s, "DELETE", "/api/me/subscribers/"+page.Items[0].ID, nil, other), 404, nil)
	decodeResponse(t, request(t, s, "DELETE", "/api/me/subscribers/"+page.Items[0].ID, nil, c), 200, nil)
	decodeResponse(t, request(t, s, "GET", "/api/me/subscribers", nil, c), 200, &page)
	if page.Total != 2 || len(page.Items) != 2 {
		t.Fatal("subscriber not removed")
	}
	decodeResponse(t, request(t, s, "GET", "/api/me/subscribers", nil, other), 200, &page)
	if page.Total != 0 || page.Items == nil {
		t.Fatal("subscribers leaked across authors or items is null")
	}
}

func TestRevisionNumbersCountEditionsFromOne(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	p := save(t, s, c, newPost(t, s, c), "One", "editions")
	for _, title := range []string{"One", "Two", "Three"} {
		p.Title = title
		p = publishPost(t, s, c, saveSnapshot(t, s, c, p))
	}
	var versions struct {
		Revisions []Revision `json:"revisions"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts/"+p.ID+"/revisions", nil, c), 200, &versions)
	if len(versions.Revisions) != 3 || versions.Revisions[0].Number != 3 || versions.Revisions[0].Title != "Three" || versions.Revisions[2].Number != 1 {
		t.Fatalf("revisions %+v", versions.Revisions)
	}
}

func TestCustomDomainFlow(t *testing.T) {
	s := testServer(t)
	u, c := account(t, s)
	_, other := account(t, s)
	put := func(cookie *http.Cookie, d string) *httptest.ResponseRecorder {
		return request(t, s, "PUT", "/api/me/domain", map[string]string{"domain": d}, cookie)
	}
	decodeResponse(t, put(c, "blog.example.org"), 503, nil)
	if w := request(t, s, "GET", "/api/me/domain", nil, c); w.Code != 200 || strings.TrimSpace(w.Body.String()) != "null" {
		t.Fatal("disabled domain should be null")
	}
	s.Config.CustomDomainTarget = "domains.jot.test"
	var cfg map[string]any
	decodeResponse(t, request(t, s, "GET", "/api/config", nil, nil), 200, &cfg)
	if cfg["domainTarget"] != "domains.jot.test" {
		t.Fatal("config lacks domainTarget")
	}
	decodeResponse(t, put(c, "127.0.0.1"), 400, nil)
	decodeResponse(t, put(c, "localhost"), 400, nil)
	var d customDomain
	decodeResponse(t, put(c, " Blog.Example.org. "), 200, &d)
	if d.Domain != "blog.example.org" || d.Verified || d.TXTName != "_jot.blog.example.org" || !strings.HasPrefix(d.TXTValue, "jot-verify=") || d.Target != "domains.jot.test" {
		t.Fatalf("domain %+v", d)
	}
	decodeResponse(t, request(t, s, "GET", "/api/domains/resolve?host=blog.example.org", nil, nil), 404, nil)
	decodeResponse(t, request(t, s, "GET", "/api/domains/allowed?domain=blog.example.org", nil, nil), 404, nil)
	records := []string{"something-else"}
	s.lookupTXT = func(_ context.Context, name string) ([]string, error) {
		if name != "_jot.blog.example.org" {
			t.Fatalf("looked up %s", name)
		}
		return records, nil
	}
	decodeResponse(t, request(t, s, "POST", "/api/me/domain/verify", nil, c), 400, nil)
	records = append(records, d.TXTValue)
	decodeResponse(t, request(t, s, "POST", "/api/me/domain/verify", nil, c), 200, &d)
	if !d.Verified {
		t.Fatal("not verified")
	}
	var resolved map[string]string
	decodeResponse(t, request(t, s, "GET", "/api/domains/resolve?host=BLOG.example.org:443", nil, nil), 200, &resolved)
	if resolved["username"] != u.Username {
		t.Fatal("resolve returned wrong user")
	}
	decodeResponse(t, request(t, s, "GET", "/api/domains/allowed?domain=blog.example.org", nil, nil), 200, nil)
	// Another account can claim the name, but cannot verify it while it is connected elsewhere.
	var claim customDomain
	decodeResponse(t, put(other, "blog.example.org"), 200, &claim)
	records = []string{claim.TXTValue}
	decodeResponse(t, request(t, s, "POST", "/api/me/domain/verify", nil, other), 409, nil)
	decodeResponse(t, put(c, "blog.example.org"), 200, &d)
	if !d.Verified {
		t.Fatal("repeating the same domain cleared verification")
	}
	decodeResponse(t, request(t, s, "DELETE", "/api/me/domain", nil, c), 200, nil)
	decodeResponse(t, request(t, s, "GET", "/api/domains/resolve?host=blog.example.org", nil, nil), 404, nil)
}

func TestTagsFeedsSitemapAndExport(t *testing.T) {
	s := testServer(t)
	u, c := account(t, s)
	p := newPost(t, s, c)
	p.Tags = domain.Tags{"postgres", "scaling"}
	p.Subtitle = "Reads <fast> & cheap"
	p.Content.Content[0].Content = []domain.Node{{Type: "text", Text: "Body <script>x</script>"}}
	tagged := publishPost(t, s, c, save(t, s, c, p, "Tagged & <bold>", "tagged"))
	hidden := newPost(t, s, c)
	hidden.Visibility = "unlisted"
	hidden.Tags = domain.Tags{"postgres"}
	publishPost(t, s, c, save(t, s, c, hidden, "Hidden", "hidden"))
	save(t, s, c, newPost(t, s, c), "Only a draft", "")
	bad := newPost(t, s, c)
	bad.Tags = domain.Tags{"Bad Tag"}
	in := map[string]any{}
	_ = json.Unmarshal(encodeJSON(bad.Snapshot), &in)
	in["revision"] = bad.Revision
	decodeResponse(t, request(t, s, "PUT", "/api/posts/"+bad.ID, in, c), 400, nil)
	var list struct {
		Posts []domain.PostSummary `json:"posts"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts?tag=postgres", nil, nil), 200, &list)
	if len(list.Posts) != 1 || list.Posts[0].ID != tagged.ID || len(list.Posts[0].Tags) != 2 {
		t.Fatalf("tag feed %+v", list.Posts)
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts?tag=missing", nil, nil), 200, &list)
	if len(list.Posts) != 0 {
		t.Fatal("unmatched tag returned posts")
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts?tag=Bad%20Tag", nil, nil), 400, nil)
	decodeResponse(t, request(t, s, "GET", "/api/posts?scope=mine&q=only", nil, c), 200, &list)
	if len(list.Posts) != 1 || list.Posts[0].Title != "Only a draft" || list.Posts[0].LiveVisibility != "" {
		t.Fatal("library search ignored q")
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts?scope=mine&q=hidden", nil, c), 200, &list)
	if len(list.Posts) != 1 || list.Posts[0].LiveVisibility != "unlisted" {
		t.Fatal("liveVisibility missing for unlisted post")
	}
	// Snapshots stored before tags existed still return [].
	legacy := newPost(t, s, c)
	if _, e := s.DB.Exec(context.Background(), `UPDATE posts SET draft=draft-'tags',draft_summary=draft_summary-'tags' WHERE id=$1`, legacy.ID); e != nil {
		t.Fatal(e)
	}
	if w := request(t, s, "GET", "/api/posts/"+legacy.ID, nil, c); !strings.Contains(w.Body.String(), `"tags":[]`) {
		t.Fatal("legacy post tags not []")
	}
	var page struct {
		Posts []domain.PostSummary `json:"posts"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/authors/"+u.Username+"?limit=1&offset=0", nil, nil), 200, &page)
	if len(page.Posts) != 1 {
		t.Fatal("author page limit ignored")
	}
	decodeResponse(t, request(t, s, "GET", "/api/authors/"+u.Username+"?limit=1&offset=1", nil, nil), 200, &page)
	if len(page.Posts) != 0 {
		t.Fatal("author page offset ignored or unlisted post listed")
	}

	for _, path := range []string{"/api/rss", "/api/authors/" + u.Username + "/rss"} {
		w := request(t, s, "GET", path, nil, nil)
		body := w.Body.String()
		if w.Code != 200 || !strings.HasPrefix(w.Header().Get("Content-Type"), "application/rss+xml") || !strings.HasPrefix(body, "<?xml") {
			t.Fatalf("%s: %d %s", path, w.Code, body)
		}
		for _, want := range []string{"<title>Tagged &amp; &lt;bold&gt;</title>", "<category>postgres</category>", "&lt;p&gt;Body &amp;lt;script&amp;gt;x&amp;lt;/script&amp;gt;&lt;/p&gt;", `xmlns:content="http://purl.org/rss/1.0/modules/content/"`, "<content:encoded>"} {
			if !strings.Contains(body, want) {
				t.Fatalf("%s missing %q in %s", path, want, body)
			}
		}
		if strings.Contains(body, "Hidden") || strings.Contains(body, "Only a draft") || strings.Contains(body, "<script>") {
			t.Fatal("feed leaked unlisted, draft or unescaped content")
		}
	}
	decodeResponse(t, request(t, s, "GET", "/api/authors/nobody_here/rss", nil, nil), 404, nil)
	var entries []map[string]any
	decodeResponse(t, request(t, s, "GET", "/api/sitemap", nil, nil), 200, &entries)
	if len(entries) != 1 || entries[0]["username"] != u.Username || entries[0]["slug"] != "tagged" || entries[0]["updatedAt"] == "" {
		t.Fatalf("sitemap %+v", entries)
	}

	w := request(t, s, "GET", "/api/me/export", nil, c)
	if w.Code != 200 || w.Header().Get("Content-Type") != "application/zip" {
		t.Fatalf("export %d", w.Code)
	}
	archive, e := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if e != nil {
		t.Fatal(e)
	}
	files := map[string]string{}
	for _, f := range archive.File {
		rc, _ := f.Open()
		data, _ := io.ReadAll(rc)
		rc.Close()
		files[f.Name] = string(data)
	}
	if len(files) != 7 {
		t.Fatalf("export files %v", len(files))
	}
	md := files["tagged.md"]
	for _, want := range []string{"---\ntitle: \"Tagged \\u0026 \\u003cbold\\u003e\"", `tags: ["postgres","scaling"]`, "status: published", "publishedAt: ", "Body \\<script\\>x\\</script\\>"} {
		if !strings.Contains(md, want) {
			t.Fatalf("export missing %q in %s", want, md)
		}
	}
	if !strings.Contains(files["published/tagged.md"], "status: published") || !strings.Contains(files["only-a-draft.md"]+files["untitled-"+legacy.ID[:8]+".md"], "status: draft") {
		t.Fatalf("export names %v", func() []string {
			names := []string{}
			for name := range files {
				names = append(names, name)
			}
			return names
		}())
	}
}

func TestSignupQueuesVerificationAndNewsletterCarriesPost(t *testing.T) {
	s := testServer(t)
	s.Config.ResendKey = "test"
	s.Config.EmailFrom = "Jot <test@example.com>"
	u, c := account(t, s)
	j, e := jobWorker(s).Claim(context.Background())
	if e != nil || j == nil || j.Kind != "verification" || j.UserID != u.ID {
		t.Fatalf("signup did not queue verification: %v", e)
	}
	_ = jobWorker(s).Finish(context.Background(), j, "", nil)
	if _, e = s.DB.Exec(context.Background(), `UPDATE users SET email_verified=true WHERE id=$1`, u.ID); e != nil {
		t.Fatal(e)
	}
	_, e = s.DB.Exec(context.Background(), `INSERT INTO subscriptions(id,author_id,email,confirmed,active,confirm_hash,unsubscribe_hash,unsubscribe_token,confirm_expires) VALUES(gen_random_uuid(),$1,'reader@example.com',true,true,'c','u','secret',now())`, u.ID)
	if e != nil {
		t.Fatal(e)
	}
	p := newPost(t, s, c)
	p.Content.Content = []domain.Node{{Type: "paragraph", Content: []domain.Node{{Type: "text", Text: "Full <body> here"}}}, {Type: "image", Attrs: map[string]any{"src": "/media/" + strings.Repeat("a", 64) + ".png"}}}
	p = save(t, s, c, p, "Letter", "letter")
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/publish", map[string]any{"revision": p.Revision, "emailSubscribers": true}, c), 200, &p)
	j, e = jobWorker(s).Claim(context.Background())
	if e != nil || j == nil || j.Kind != "newsletter" {
		t.Fatalf("newsletter claim %v", e)
	}
	var sent map[string]any
	jobWorker(s).Client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		_ = json.NewDecoder(r.Body).Decode(&sent)
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":"sent"}`))}, nil
	})}
	if e = executeEmail(s, context.Background(), j); e != nil {
		t.Fatal(e)
	}
	html, _ := sent["html"].(string)
	text, _ := sent["text"].(string)
	if !strings.Contains(html, "<p>Full &lt;body&gt; here</p>") || !strings.Contains(html, `src="http://localhost:3000/media/`) || !strings.Contains(text, "Full \\<body\\> here") {
		t.Fatalf("newsletter lacks rendered post: %s", html)
	}
}

func TestBlockedReadersCannotCommentAndTheirCommentsHide(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	reader, rc := account(t, s)
	other, oc := account(t, s)
	p := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Talk", "talk"))
	q := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "More", "more"))
	elsewhere := publishPost(t, s, oc, save(t, s, oc, newPost(t, s, oc), "Elsewhere", "elsewhere"))
	comment := func(cookie *http.Cookie, id, body string, parent *domain.Comment, status int) domain.Comment {
		t.Helper()
		in := map[string]any{"body": body}
		if parent != nil {
			in["parentId"] = parent.ID
		}
		var out domain.Comment
		w := request(t, s, "POST", "/api/posts/"+id+"/comments", in, cookie)
		if status == 403 && !strings.Contains(w.Body.String(), `"code":"blocked"`) {
			t.Fatalf("expected blocked code: %s", w.Body.String())
		}
		decodeResponse(t, w, status, &out)
		return out
	}
	readerTop := comment(rc, p.ID, "reader thread", nil, 201)
	comment(oc, p.ID, "reply to reader", &readerTop, 201)
	otherTop := comment(oc, p.ID, "other thread", nil, 201)
	comment(rc, p.ID, "reader reply", &otherTop, 201)
	visible := func(id string) (int, int) {
		t.Helper()
		var engagement struct {
			Comments []domain.Comment `json:"comments"`
		}
		decodeResponse(t, request(t, s, "GET", "/api/posts/"+id+"/engagement", nil, nil), 200, &engagement)
		for _, cm := range engagement.Comments {
			if cm.Author.ID == reader.ID {
				t.Fatalf("blocked reader comment visible: %+v", cm)
			}
		}
		return len(engagement.Comments), ownedPost(t, s, c, id).Comments
	}
	var blocked []struct {
		User      domain.User `json:"user"`
		BlockedAt time.Time   `json:"blockedAt"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/me/blocked", nil, c), 200, &blocked)
	if blocked == nil || len(blocked) != 0 {
		t.Fatal("empty block list must be []")
	}
	decodeResponse(t, request(t, s, "GET", "/api/me/blocked", nil, nil), 401, nil)
	decodeResponse(t, request(t, s, "POST", "/api/me/blocked", map[string]any{"userId": author.ID}, c), 400, nil)
	decodeResponse(t, request(t, s, "POST", "/api/me/blocked", map[string]any{"userId": "00000000-0000-0000-0000-000000000000"}, c), 404, nil)
	decodeResponse(t, request(t, s, "POST", "/api/me/blocked", map[string]any{"userId": "nope"}, c), 404, nil)
	var first, again struct {
		User      domain.User `json:"user"`
		BlockedAt time.Time   `json:"blockedAt"`
	}
	decodeResponse(t, request(t, s, "POST", "/api/me/blocked", map[string]any{"userId": reader.ID}, c), 200, &first)
	decodeResponse(t, request(t, s, "POST", "/api/me/blocked", map[string]any{"userId": reader.ID}, c), 200, &again)
	if first.User.ID != reader.ID || first.User.Username != reader.Username || first.BlockedAt.IsZero() || !again.BlockedAt.Equal(first.BlockedAt) {
		t.Fatalf("block not idempotent: %+v %+v", first, again)
	}
	decodeResponse(t, request(t, s, "POST", "/api/me/blocked", map[string]any{"userId": other.ID}, c), 200, nil)
	decodeResponse(t, request(t, s, "GET", "/api/me/blocked", nil, c), 200, &blocked)
	if len(blocked) != 2 || blocked[0].User.ID != other.ID || blocked[1].User.ID != reader.ID {
		t.Fatalf("block list not newest first: %+v", blocked)
	}
	decodeResponse(t, request(t, s, "DELETE", "/api/me/blocked/"+other.ID, nil, c), 200, nil)
	decodeResponse(t, request(t, s, "DELETE", "/api/me/blocked/"+other.ID, nil, c), 200, nil)
	decodeResponse(t, request(t, s, "DELETE", "/api/me/blocked/nope", nil, c), 404, nil)
	// The reader's thread (with its reply) and the reader's reply elsewhere are hidden; other's thread stays.
	if shown, count := visible(p.ID); shown != 1 || count != 1 {
		t.Fatalf("blocked comments shown=%d count=%d want 1", shown, count)
	}
	comment(rc, p.ID, "again", nil, 403)
	comment(rc, q.ID, "other post", nil, 403)
	comment(rc, p.ID, "reply", &otherTop, 403)
	comment(rc, elsewhere.ID, "another author", nil, 201)
	decodeResponse(t, request(t, s, "PUT", "/api/posts/"+p.ID+"/like", map[string]any{"active": true}, rc), 200, nil)
	decodeResponse(t, request(t, s, "PUT", "/api/posts/"+p.ID+"/bookmark", map[string]any{"active": true}, rc), 200, nil)
	var readerList []any
	decodeResponse(t, request(t, s, "GET", "/api/me/blocked", nil, rc), 200, &readerList)
	if len(readerList) != 0 {
		t.Fatal("block list leaked to another account")
	}
	decodeResponse(t, request(t, s, "DELETE", "/api/me/blocked/"+reader.ID, nil, c), 200, nil)
	if shown, count := func() (int, int) {
		var engagement struct {
			Comments []domain.Comment `json:"comments"`
		}
		decodeResponse(t, request(t, s, "GET", "/api/posts/"+p.ID+"/engagement", nil, nil), 200, &engagement)
		return len(engagement.Comments), ownedPost(t, s, c, p.ID).Comments
	}(); shown != 4 || count != 4 {
		t.Fatalf("unblocking did not restore comments: shown=%d count=%d", shown, count)
	}
	comment(rc, p.ID, "welcome back", nil, 201)
}

// realisticDocument builds headings, paragraphs, lists and code like a long technical post.
func realisticDocument(words int) domain.Node {
	vocabulary := strings.Fields("we watched the read path slow down during peak traffic so we checked the query plan again and found the new index was never used because statistics were stale")
	doc := domain.Node{Type: "doc"}
	text := func(n int, offset int) string {
		parts := make([]string, n)
		for i := range parts {
			parts[i] = vocabulary[(i+offset)%len(vocabulary)]
		}
		return strings.Join(parts, " ")
	}
	for written := 0; written < words; {
		section := len(doc.Content)
		doc.Content = append(doc.Content, domain.Node{Type: "heading", Attrs: map[string]any{"level": float64(2)}, Content: []domain.Node{{Type: "text", Text: text(6, section)}}})
		for i := 0; i < 4 && written < words; i++ {
			doc.Content = append(doc.Content, domain.Node{Type: "paragraph", Content: []domain.Node{
				{Type: "text", Text: text(60, i) + " "},
				{Type: "text", Text: "replication lag", Marks: []domain.Mark{{Type: "bold"}}},
				{Type: "text", Text: " " + text(38, i+3)},
			}})
			written += 100
		}
		doc.Content = append(doc.Content, domain.Node{Type: "bulletList", Content: []domain.Node{
			{Type: "listItem", Content: []domain.Node{{Type: "paragraph", Content: []domain.Node{{Type: "text", Text: text(12, section)}}}}},
			{Type: "listItem", Content: []domain.Node{{Type: "paragraph", Content: []domain.Node{{Type: "text", Text: text(12, section+1)}}}}},
		}}, domain.Node{Type: "codeBlock", Attrs: map[string]any{"language": "sql"}, Content: []domain.Node{{Type: "text", Text: "SELECT id, total FROM orders WHERE region = 'eu' ORDER BY created_at DESC LIMIT 50;"}}})
		written += 24
	}
	return doc
}

func TestLongDocumentsSaveAndOtherBodiesStayBounded(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	p := newPost(t, s, c)
	p.Content = realisticDocument(80000)
	p = save(t, s, c, p, "A very long post", "a-very-long-post")
	p = publishPost(t, s, c, p)
	if words := len(strings.Fields(domain.DocumentText(p.Content))); words < 79000 {
		t.Fatalf("long post lost words: %d", words)
	}
	decodeResponse(t, request(t, s, "GET", "/api/public/"+author.Username+"/a-very-long-post", nil, nil), 200, nil)
	// The largest document the validator accepts must also fit the save request.
	q := newPost(t, s, c)
	q.Content = domain.Node{Type: "doc", Content: []domain.Node{{Type: "paragraph"}}}
	for range (domain.MaxDocumentNodes - 2) / 2 {
		q.Content.Content = append(q.Content.Content, domain.Node{Type: "paragraph", Content: []domain.Node{{Type: "text", Text: strings.Repeat("a", 20), Marks: []domain.Mark{{Type: "bold"}}}}})
	}
	if e := domain.ValidateSnapshot(q.Snapshot, false); e != nil {
		t.Fatal(e)
	}
	if size := len(encodeJSON(q.Snapshot)); size <= 2<<20 {
		t.Fatalf("fixture should exceed the default body limit, got %d bytes", size)
	}
	save(t, s, c, q, "Largest", "largest")
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/comments", map[string]any{"body": strings.Repeat("x", 3<<20)}, c), 413, nil)
}

func TestAIAcceptsLongSelections(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	p := newPost(t, s, c)
	s.Config.OpenAIKey = "test-key"
	decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", map[string]string{"postId": p.ID, "mode": "grammar", "text": strings.Repeat("a", 120001)}, c), 400, nil)
	decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", map[string]string{"postId": p.ID, "mode": "grammar", "text": strings.Repeat("a", 120000)}, c), 202, nil)
}

func TestAIChatValidatesAndHasItsOwnBudget(t *testing.T) {
	s := testServer(t)
	u, c := account(t, s)
	p := newPost(t, s, c)
	s.Config.OpenAIKey = "test-key"
	chat := func(prompt string) map[string]any {
		return map[string]any{"postId": p.ID, "mode": "chat", "prompt": prompt, "context": "notes on tea", "text": "", "title": "Tea", "subtitle": "", "scope": "page", "history": []map[string]string{{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}}}
	}
	var failure map[string]string
	decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", map[string]any{"postId": p.ID, "mode": "chat", "prompt": "hi", "text": "", "scope": "everything", "history": []any{}}, c), 400, &failure)
	if failure["code"] != "validation" || !strings.Contains(failure["error"], "scope") {
		t.Fatalf("unclear validation error %v", failure)
	}
	decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", map[string]any{"postId": p.ID, "mode": "grammar", "text": "Source", "prompt": "hi"}, c), 400, nil)
	var id struct {
		ID string `json:"id"`
	}
	decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", chat("write an intro about tea"), c), 202, &id)
	var payload map[string]string
	if e := s.DB.QueryRow(context.Background(), `SELECT payload FROM jobs WHERE id=$1`, id.ID).Scan(&payload); e != nil {
		t.Fatal(e)
	}
	if payload["mode"] != "chat" || payload["prompt"] != "write an intro about tea" || payload["context"] != "notes on tea" || payload["title"] != "Tea" || payload["subtitle"] != "" || payload["scope"] != "page" || payload["history"] != `[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}]` {
		t.Fatalf("chat payload %v", payload)
	}
	for range 10 {
		decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", map[string]string{"postId": p.ID, "mode": "grammar", "text": "Source"}, c), 202, nil)
	}
	decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", map[string]string{"postId": p.ID, "mode": "grammar", "text": "Source"}, c), 429, nil)
	decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", chat("and a title?"), c), 202, nil)
	_, e := s.DB.Exec(context.Background(), `INSERT INTO jobs(id,kind,user_id,payload,idempotency_key,status,created_at) SELECT gen_random_uuid(),'ai',$1,'{"mode":"chat"}','chat-'||g,'completed',now()-interval '50 minutes' FROM generate_series(1,38) g`, u.ID)
	if e != nil {
		t.Fatal(e)
	}
	decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", chat("one more"), c), 429, &failure)
	if failure["code"] != "rate_limit" || !strings.HasSuffix(failure["error"], "try again in about 10 minutes") {
		t.Fatalf("chat limit should say when to try again: %v", failure)
	}
}

func TestAIChatJobStoresReplyAndEdit(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	p := newPost(t, s, c)
	s.Config.OpenAIKey = "test-key"
	jobWorker(s).Client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		var body struct {
			Input []map[string]string `json:"input"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if len(body.Input) != 5 || body.Input[1]["role"] != "assistant" || body.Input[2]["content"] != "Context (reference material the writer attached):\n\nformal notes" || body.Input[4]["content"] != "make it formal" {
			t.Fatalf("chat history not sent in order: %v", body.Input)
		}
		output := `{"reply":"made the greeting formal.","edit":"Good morning.","title":"Ignored for a selection","subtitle":null}`
		response := `{"status":"completed","output":[{"content":[{"type":"output_text","text":` + string(encodeJSON(output)) + `}]}]}`
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(response)), Header: make(http.Header)}, nil
	})}
	var id struct {
		ID string `json:"id"`
	}
	in := map[string]any{"postId": p.ID, "mode": "chat", "prompt": "make it formal", "context": "formal notes", "text": "hey", "title": "Greetings", "subtitle": "", "scope": "selection", "history": []map[string]string{{"role": "assistant", "content": "hi, what should we write?"}}}
	decodeResponse(t, request(t, s, "POST", "/api/ai/jobs", in, c), 202, &id)
	j, e := jobWorker(s).Claim(context.Background())
	if e != nil || j == nil {
		t.Fatalf("claim: %v", e)
	}
	result, workErr := jobWorker(s).Execute(context.Background(), j)
	if e = jobWorker(s).Finish(context.Background(), j, result, workErr); e != nil || workErr != nil {
		t.Fatal(e, workErr)
	}
	var job struct {
		Status string `json:"status"`
		Result string `json:"result"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/ai/jobs/"+id.ID, nil, c), 200, &job)
	if job.Status != "completed" || job.Result != `{"reply":"made the greeting formal.","edit":"Good morning.","title":null,"subtitle":null}` {
		t.Fatalf("chat job %+v", job)
	}
}

func TestNewsletterCarriesLongPostsAndMarksOmittedContent(t *testing.T) {
	s := testServer(t)
	s.Config.ResendKey = "test"
	s.Config.EmailFrom = "Jot <test@example.com>"
	u, c := account(t, s)
	ctx := context.Background()
	if _, e := s.DB.Exec(ctx, `UPDATE users SET email_verified=true WHERE id=$1`, u.ID); e != nil {
		t.Fatal(e)
	}
	if _, e := s.DB.Exec(ctx, `UPDATE jobs SET status='completed'`); e != nil {
		t.Fatal(e)
	}
	_, e := s.DB.Exec(ctx, `INSERT INTO subscriptions(id,author_id,email,confirmed,active,confirm_hash,unsubscribe_hash,unsubscribe_token,confirm_expires) VALUES(gen_random_uuid(),$1,'reader@example.com',true,true,'c','u','secret',now())`, u.ID)
	if e != nil {
		t.Fatal(e)
	}
	send := func(content domain.Node, slug string) (string, *jobs.Job) {
		t.Helper()
		p := newPost(t, s, c)
		p.Content = content
		p = save(t, s, c, p, "Long letter", slug)
		decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/publish", map[string]any{"revision": p.Revision, "emailSubscribers": true}, c), 200, &p)
		j, e := jobWorker(s).Claim(ctx)
		if e != nil || j == nil || j.Kind != "newsletter" {
			t.Fatalf("newsletter claim %v", e)
		}
		var sent string
		jobWorker(s).Client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body, _ := io.ReadAll(r.Body)
			sent = string(body)
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":"sent"}`))}, nil
		})}
		result, e := jobWorker(s).Execute(ctx, j)
		if e != nil {
			t.Fatal(e)
		}
		if e = jobWorker(s).Finish(ctx, j, result, nil); e != nil {
			t.Fatal(e)
		}
		return sent, j
	}
	// A long post near the 500,000-byte text limit, with ordinary structure, carries its whole body.
	long := realisticDocument(85000)
	long.Content = append(long.Content, domain.Node{Type: "paragraph", Content: []domain.Node{{Type: "text", Text: "the very last <line> & \"quote\""}}})
	if size := len(domain.DocumentText(long)); size < 450000 || size > domain.MaxDocumentText {
		t.Fatalf("fixture text is %d bytes", size)
	}
	sent, j := send(long, "long-letter")
	var message struct{ HTML, Text string }
	if e := json.Unmarshal([]byte(sent), &message); e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(message.HTML, "the very last &lt;line&gt; &amp; &#34;quote&#34;") || !strings.Contains(message.Text, `the very last \<line\> & "quote"`) {
		t.Fatalf("long newsletter lost its body (%d bytes sent)", len(sent))
	}
	var result, note *string
	if e := s.DB.QueryRow(ctx, `SELECT result,payload->>'contentOmitted' FROM jobs WHERE id=$1`, j.ID).Scan(&result, &note); e != nil || note != nil || (result != nil && *result != "") {
		t.Fatalf("full newsletter marked as omitted: %v %v %v", result, note, e)
	}
	// Text at the limit made only of characters that need escaping still fits.
	escaped := domain.Node{Type: "doc", Content: []domain.Node{{Type: "paragraph", Content: []domain.Node{{Type: "text", Text: strings.Repeat(`<&">`, domain.MaxDocumentText/4)}}}}}
	sent, j = send(escaped, "escaped-letter")
	if e := s.DB.QueryRow(ctx, `SELECT payload->>'contentOmitted' FROM jobs WHERE id=$1`, j.ID).Scan(&note); e != nil || note != nil || !strings.Contains(sent, strings.Repeat(`&lt;&amp;&#34;&gt;`, 1000)) {
		t.Fatalf("escaped post at the text limit did not fit (%d bytes): %v %v", len(sent), note, e)
	}
	// A post whose rendering cannot fit the bounded request sends the summary and link, visibly.
	huge := domain.Node{Type: "doc"}
	href := "https://example.com/" + strings.Repeat("a", 1900)
	for i := range 2500 {
		huge.Content = append(huge.Content, domain.Node{Type: "paragraph", Content: []domain.Node{{Type: "text", Text: "link " + strconv.Itoa(i), Marks: []domain.Mark{{Type: "link", Attrs: map[string]any{"href": href}}}}}})
	}
	sent, j = send(huge, "huge-letter")
	if strings.Contains(sent, href) || !strings.Contains(sent, "huge-letter") {
		t.Fatalf("oversized newsletter was not reduced to the summary and link (%d bytes)", len(sent))
	}
	if e := s.DB.QueryRow(ctx, `SELECT result,payload->>'contentOmitted' FROM jobs WHERE id=$1`, j.ID).Scan(&result, &note); e != nil || note == nil || *note == "" || result == nil || *result != *note {
		t.Fatalf("omitted content not recorded on the job: %v %v %v", result, note, e)
	}
}
