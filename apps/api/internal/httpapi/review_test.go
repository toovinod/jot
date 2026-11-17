package httpapi

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/xml"
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

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jot-project/jot/apps/api/internal/config"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/security"
)

// A 1x1 lossless WebP image.
const tinyWebP = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="

func TestCleanupPrunesEveryExpiredViewBatch(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	p := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Old reads", "old-reads"))
	ctx := context.Background()
	if _, e := s.DB.Exec(ctx, `INSERT INTO post_views(post_id,viewer_key,day) SELECT $1,'k'||g,current_date-5 FROM generate_series(1,2500) g`, p.ID); e != nil {
		t.Fatal(e)
	}
	if _, e := s.DB.Exec(ctx, `INSERT INTO post_views(post_id,viewer_key,day) VALUES($1,'today',current_date)`, p.ID); e != nil {
		t.Fatal(e)
	}
	if e := jobWorker(s).CleanupExpiredData(ctx); e != nil {
		t.Fatal(e)
	}
	var old, current int
	if e := s.DB.QueryRow(ctx, `SELECT count(*) FILTER(WHERE day<current_date-1),count(*) FILTER(WHERE day=current_date) FROM post_views`).Scan(&old, &current); e != nil || old != 0 || current != 1 {
		t.Fatalf("old=%d current=%d error=%v", old, current, e)
	}
}

func TestAnonymousViewerKeyIgnoresAgentAndRotatesDaily(t *testing.T) {
	s := NewServer(nil, config.Config{})
	key := s.anonymousViewerKey("203.0.113.9", "2026-11-17")
	if len(key) != 64 || strings.Contains(key, "203.0.113") || key == security.HashToken("anonymous:203.0.113.9") {
		t.Fatalf("key is not a keyed hash: %q", key)
	}
	if key != s.anonymousViewerKey("203.0.113.9", "2026-11-17") {
		t.Fatal("key not stable within a day")
	}
	if key == s.anonymousViewerKey("203.0.113.9", "2026-11-18") || key == s.anonymousViewerKey("203.0.113.10", "2026-11-17") {
		t.Fatal("key does not rotate daily or separate addresses")
	}
	if key == NewServer(nil, config.Config{}).anonymousViewerKey("203.0.113.9", "2026-11-17") {
		t.Fatal("key is guessable without the process secret")
	}
	if s.anonymousViewerKey("2001:db8:1:2::1", "d") != s.anonymousViewerKey("2001:db8:1:2:ffff::9", "d") {
		t.Fatal("IPv6 addresses in one /64 counted separately")
	}
	if s.anonymousViewerKey("2001:db8:1:2::1", "d") == s.anonymousViewerKey("2001:db8:1:3::1", "d") {
		t.Fatal("different IPv6 /64 networks share a key")
	}
}

func TestSharedViewHashSecretDedupesAcrossReplicas(t *testing.T) {
	secret := strings.Repeat("s", 32)
	a, b := NewServer(nil, config.Config{ViewHashSecret: secret}), NewServer(nil, config.Config{ViewHashSecret: secret})
	key := a.anonymousViewerKey("203.0.113.9", "2026-11-17")
	if key != b.anonymousViewerKey("203.0.113.9", "2026-11-17") {
		t.Fatal("replicas sharing VIEW_HASH_SECRET key the same reader differently")
	}
	if key == a.anonymousViewerKey("203.0.113.9", "2026-11-18") {
		t.Fatal("shared secret stopped the daily rotation")
	}
	if key == NewServer(nil, config.Config{ViewHashSecret: strings.Repeat("t", 32)}).anonymousViewerKey("203.0.113.9", "2026-11-17") || key == NewServer(nil, config.Config{}).anonymousViewerKey("203.0.113.9", "2026-11-17") {
		t.Fatal("key does not depend on the configured secret")
	}
}

func TestViewsIgnoreUserAgentRotationAndCollapseIPv6(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	p := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Counted", "counted"))
	view := func(remote, agent string) {
		r := httptest.NewRequest("POST", "/api/posts/"+p.ID+"/view", nil)
		r.RemoteAddr = remote
		r.Header.Set("Origin", s.Config.Origin)
		r.Header.Set("User-Agent", agent)
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		decodeResponse(t, w, 204, nil)
	}
	for _, agent := range []string{"a", "b", "c"} {
		view("192.0.2.1:1000", agent)
	}
	view("192.0.2.2:1000", "a")
	view("[2001:db8:1:2::1]:1000", "a")
	view("[2001:db8:1:2::ffff]:1000", "b")
	if got := ownedPost(t, s, c, p.ID).Views; got != 3 {
		t.Fatalf("views=%d want 3", got)
	}
}

func TestRemoveMediaBatchesS3DeletesAndReportsEveryFailure(t *testing.T) {
	s := NewServer(nil, config.Config{S3Bucket: "images", S3Endpoint: "https://storage.example.com", S3Region: "auto", S3AccessKey: "key", S3SecretKey: "secret"})
	good, bad := strings.Repeat("a", 64)+".png", strings.Repeat("b", 64)+".jpg"
	requests := 0
	var method, query, sent string
	s.storageHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests++
		var body []byte
		if r.Body != nil {
			body, _ = io.ReadAll(r.Body)
		}
		method, query, sent = r.Method, r.URL.RawQuery, string(body)
		reply := `<?xml version="1.0" encoding="UTF-8"?><DeleteResult><Deleted><Key>` + good + `</Key></Deleted><Error><Key>` + bad + `</Key><Code>AccessDenied</Code><Message>denied</Message></Error></DeleteResult>`
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/xml"}}, Body: io.NopCloser(strings.NewReader(reply)), Request: r}, nil
	})}
	failed := s.removeMedia([]string{good, bad, "../escape"})
	if requests != 1 || method != "POST" || !strings.Contains(query, "delete") || !strings.Contains(sent, good) || !strings.Contains(sent, bad) {
		t.Fatalf("expected one batched delete, got %d: %s", requests, sent)
	}
	if strings.Join(failed, ",") != "../escape,"+bad {
		t.Fatalf("failed keys %v", failed)
	}
}

func TestRemoveMediaReportsLocalFailures(t *testing.T) {
	dir := t.TempDir()
	s := NewServer(nil, config.Config{UploadDir: dir})
	removed, missing, stuck := strings.Repeat("a", 64)+".png", strings.Repeat("b", 64)+".png", strings.Repeat("c", 64)+".png"
	if e := os.WriteFile(filepath.Join(dir, removed), []byte("x"), 0600); e != nil {
		t.Fatal(e)
	}
	// A non-empty directory cannot be removed with os.Remove.
	if e := os.MkdirAll(filepath.Join(dir, stuck, "child"), 0700); e != nil {
		t.Fatal(e)
	}
	failed := s.removeMedia([]string{removed, missing, stuck})
	if _, e := os.Stat(filepath.Join(dir, removed)); !os.IsNotExist(e) || strings.Join(failed, ",") != stuck {
		t.Fatalf("failed keys %v", failed)
	}
}

func TestEngagementKeepsEveryThreadWhenOneIsBusy(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	p := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Busy", "busy"))
	ctx := context.Background()
	// An older quiet thread, then a newer thread with more replies than any single response could hold.
	_, e := s.DB.Exec(ctx, `INSERT INTO comments(id,post_id,user_id,body,created_at) VALUES('00000000-0000-0000-0000-00000000000a',$1,$2,'quiet',now()-interval '2 days'),('00000000-0000-0000-0000-00000000000b',$1,$2,'busy',now()-interval '1 day')`, p.ID, author.ID)
	if e == nil {
		_, e = s.DB.Exec(ctx, `INSERT INTO comments(id,post_id,user_id,body,parent_id,created_at) SELECT gen_random_uuid(),$1,$2,'reply','00000000-0000-0000-0000-00000000000b',now()-interval '1 hour'+g*interval '1 second' FROM generate_series(1,1200) g`, p.ID, author.ID)
	}
	if e != nil {
		t.Fatal(e)
	}
	var engagement struct {
		Comments []domain.Comment `json:"comments"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts/"+p.ID+"/engagement", nil, nil), 200, &engagement)
	tops, replies := map[string]bool{}, 0
	for _, comment := range engagement.Comments {
		if comment.ParentID == nil {
			tops[comment.ID] = true
		}
	}
	for _, comment := range engagement.Comments {
		if comment.ParentID != nil {
			replies++
			if !tops[*comment.ParentID] {
				t.Fatal("reply returned without its thread")
			}
		}
	}
	if len(tops) != 2 || replies != 50 {
		t.Fatalf("threads=%d replies=%d", len(tops), replies)
	}
}

func TestFailingScheduledPostDoesNotBlockLaterPosts(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	ctx := context.Background()
	stuck := save(t, s, c, newPost(t, s, c), "Stuck", "stuck")
	later := save(t, s, c, newPost(t, s, c), "Later", "later")
	for _, p := range []Post{stuck, later} {
		decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/schedule", map[string]any{"at": time.Now().Add(time.Hour), "emailSubscribers": false, "revision": p.Revision}, c), 200, nil)
	}
	// An unreadable draft fails with an internal error, not a publication refusal.
	if _, e := s.DB.Exec(ctx, `UPDATE posts SET scheduled_at=now()-interval '2 minutes',draft='"broken"'::jsonb WHERE id=$1`, stuck.ID); e != nil {
		t.Fatal(e)
	}
	if _, e := s.DB.Exec(ctx, `UPDATE posts SET scheduled_at=now()-interval '1 minute' WHERE id=$1`, later.ID); e != nil {
		t.Fatal(e)
	}
	if e := jobWorker(s).PublishDue(ctx); e != nil {
		t.Fatal(e)
	}
	if live := ownedPost(t, s, c, later.ID); live.Published == nil {
		t.Fatal("a failing scheduled post blocked a later one")
	}
	for range 4 {
		if e := jobWorker(s).PublishDue(ctx); e != nil {
			t.Fatal(e)
		}
	}
	var scheduled bool
	var attempts int
	var reason string
	if e := s.DB.QueryRow(ctx, `SELECT scheduled_at IS NOT NULL,schedule_attempts,COALESCE(schedule_error,'') FROM posts WHERE id=$1`, stuck.ID).Scan(&scheduled, &attempts, &reason); e != nil {
		t.Fatal(e)
	}
	if scheduled || attempts != 5 || reason == "" {
		t.Fatalf("scheduled=%v attempts=%d reason=%q", scheduled, attempts, reason)
	}
}

func TestRefusedScheduleKeepsOwnerOnlyReason(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	ctx := context.Background()
	p := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Live", "live"))
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/schedule", map[string]any{"at": time.Now().Add(time.Hour), "emailSubscribers": false, "revision": p.Revision}, c), 200, &p)
	if _, e := s.DB.Exec(ctx, `UPDATE posts SET scheduled_at=now()-interval '1 second',draft=jsonb_set(draft,'{title}','""') WHERE id=$1`, p.ID); e != nil {
		t.Fatal(e)
	}
	if e := jobWorker(s).PublishDue(ctx); e != nil {
		t.Fatal(e)
	}
	p = ownedPost(t, s, c, p.ID)
	if p.ScheduledAt != nil || p.ScheduleError == "" {
		t.Fatalf("refusal reason missing: %+v", p.ScheduleError)
	}
	var mine struct {
		Posts []domain.PostSummary `json:"posts"`
	}
	decodeResponse(t, request(t, s, "GET", "/api/posts?scope=mine", nil, c), 200, &mine)
	if len(mine.Posts) != 1 || mine.Posts[0].ScheduleError != p.ScheduleError {
		t.Fatal("library summary lacks scheduleError")
	}
	for _, path := range []string{"/api/public/" + author.Username + "/live", "/api/posts", "/api/authors/" + author.Username} {
		if w := request(t, s, "GET", path, nil, nil); w.Code != 200 || strings.Contains(w.Body.String(), "scheduleError") {
			t.Fatalf("%s exposed scheduleError: %d", path, w.Code)
		}
	}
	p = save(t, s, c, p, "Live again", "live")
	var rescheduled Post
	decodeResponse(t, request(t, s, "POST", "/api/posts/"+p.ID+"/schedule", map[string]any{"at": time.Now().Add(time.Hour), "emailSubscribers": false, "revision": p.Revision}, c), 200, &rescheduled)
	if rescheduled.ScheduleError != "" {
		t.Fatal("scheduling again kept the old reason")
	}
	if _, e := s.DB.Exec(ctx, `UPDATE posts SET schedule_error='old' WHERE id=$1`, p.ID); e != nil {
		t.Fatal(e)
	}
	if published := publishPost(t, s, c, rescheduled); published.ScheduleError != "" || ownedPost(t, s, c, p.ID).ScheduleError != "" {
		t.Fatal("publishing kept the old reason")
	}
}

type poolWatchingRecorder struct {
	*httptest.ResponseRecorder
	pool     *pgxpool.Pool
	acquired int32
}

func (w *poolWatchingRecorder) Write(b []byte) (int, error) {
	w.acquired = max(w.acquired, w.pool.Stat().AcquiredConns())
	return w.ResponseRecorder.Write(b)
}

func TestExportReleasesDatabaseBeforeWriting(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	// Incompressible bodies make the archive flush to the client while posts are still being processed.
	for i := range 3 {
		p := newPost(t, s, c)
		p.Content.Content[0].Content = []domain.Node{{Type: "text", Text: ""}}
		for range 300 {
			p.Content.Content[0].Content[0].Text += security.RandomToken()
		}
		save(t, s, c, p, "Post", "post-"+string(rune('a'+i)))
	}
	r := httptest.NewRequest("GET", "/api/me/export", nil)
	r.AddCookie(c)
	w := &poolWatchingRecorder{ResponseRecorder: httptest.NewRecorder(), pool: s.DB}
	s.Handler().ServeHTTP(w, r)
	if w.Code != 200 || w.Body.Len() == 0 {
		t.Fatalf("export %d", w.Code)
	}
	if w.acquired != 0 {
		t.Fatalf("export held %d database connections while writing", w.acquired)
	}
}

func TestPublicPostOmitsPublishedDuplicate(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Public", "public"))
	w := request(t, s, "GET", "/api/public/"+author.Username+"/public", nil, nil)
	if w.Code != 200 || strings.Contains(w.Body.String(), `"published"`) {
		t.Fatalf("public post exposed published: %s", w.Body.String())
	}
}

func TestVerifiedCustomDomainOriginOnlyForViewAndSubscribe(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	other, otherCookie := account(t, s)
	s.Config.CustomDomainTarget = "domains.jot.test"
	s.Config.ResendKey, s.Config.EmailFrom = "test", "Jot <test@example.com>"
	p := publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Mine", "mine"))
	q := publishPost(t, s, otherCookie, save(t, s, otherCookie, newPost(t, s, otherCookie), "Theirs", "theirs"))
	ctx := context.Background()
	if _, e := s.DB.Exec(ctx, `INSERT INTO custom_domains(user_id,domain,verify_token,verified_at) VALUES($1,'blog.example.org','t',now()),($2,'pending.example.org','t',NULL)`, author.ID, other.ID); e != nil {
		t.Fatal(e)
	}
	send := func(origin, method, path string, body any, cookie *http.Cookie) int {
		r := httptest.NewRequest(method, path, bytes.NewReader(encodeJSON(body)))
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		return w.Code
	}
	email := map[string]string{"email": "reader@example.com"}
	for _, tc := range []struct {
		origin, method, path string
		body                 any
		want                 int
	}{
		{"https://blog.example.org", "POST", "/api/posts/" + p.ID + "/view", nil, 204},
		{"https://blog.example.org", "POST", "/api/authors/" + author.Username + "/subscribe", email, 200},
		{"https://blog.example.org", "POST", "/api/posts/" + q.ID + "/view", nil, 403},
		{"https://blog.example.org", "POST", "/api/authors/" + other.Username + "/subscribe", email, 403},
		{"http://blog.example.org", "POST", "/api/posts/" + p.ID + "/view", nil, 403},
		{"https://blog.example.org:8443", "POST", "/api/posts/" + p.ID + "/view", nil, 403},
		{"https://BLOG.example.org", "POST", "/api/posts/" + p.ID + "/view", nil, 403},
		{"https://evil.blog.example.org", "POST", "/api/posts/" + p.ID + "/view", nil, 403},
		{"https://pending.example.org", "POST", "/api/posts/" + q.ID + "/view", nil, 403},
		{"https://blog.example.org", "POST", "/api/posts/" + p.ID + "/comments", map[string]string{"body": "hi"}, 403},
		{"https://blog.example.org", "PUT", "/api/posts/" + p.ID + "/like", map[string]bool{"active": true}, 403},
		{"https://blog.example.org", "POST", "/api/posts", nil, 403},
	} {
		if got := send(tc.origin, tc.method, tc.path, tc.body, otherCookie); got != tc.want {
			t.Fatalf("%s %s from %s: %d want %d", tc.method, tc.path, tc.origin, got, tc.want)
		}
	}
	s.Config.CustomDomainTarget = ""
	if got := send("https://blog.example.org", "POST", "/api/posts/"+p.ID+"/view", nil, nil); got != 403 {
		t.Fatalf("custom domain origin allowed while domains are off: %d", got)
	}
}

func TestUploadAcceptsWebP(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	data, _ := base64.StdEncoding.DecodeString(tinyWebP)
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile("file", "image.webp")
	_, _ = part.Write(data)
	_ = form.Close()
	r := httptest.NewRequest("POST", "/api/uploads", &body)
	r.Header.Set("Origin", s.Config.Origin)
	r.Header.Set("Content-Type", form.FormDataContentType())
	r.AddCookie(c)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	var out struct {
		URL string `json:"url"`
	}
	decodeResponse(t, w, 201, &out)
	if !strings.HasSuffix(out.URL, ".webp") {
		t.Fatalf("url %s", out.URL)
	}
	served := request(t, s, "GET", out.URL, nil, nil)
	if served.Code != 200 || served.Header().Get("Content-Type") != "image/webp" || !bytes.Equal(served.Body.Bytes(), data) {
		t.Fatalf("media %d %s", served.Code, served.Header().Get("Content-Type"))
	}
}

func TestFeedsAndSitemapAreCachedBriefly(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "First", "first"))
	paths := []string{"/api/rss", "/api/authors/" + author.Username + "/rss", "/api/sitemap"}
	before := map[string]string{}
	for _, path := range paths {
		w := request(t, s, "GET", path, nil, nil)
		if w.Code != 200 {
			t.Fatalf("%s %d", path, w.Code)
		}
		before[path] = w.Body.String()
	}
	publishPost(t, s, c, save(t, s, c, newPost(t, s, c), "Second", "second"))
	for _, path := range paths {
		w := request(t, s, "GET", path, nil, nil)
		if w.Body.String() != before[path] || w.Header().Get("Content-Type") == "" {
			t.Fatalf("%s not served from cache", path)
		}
	}
	etag := request(t, s, "GET", "/api/sitemap", nil, nil).Header().Get("ETag")
	r := httptest.NewRequest("GET", "/api/sitemap", nil)
	r.Header.Set("If-None-Match", etag)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if etag == "" || w.Code != 304 {
		t.Fatalf("cached sitemap ignored If-None-Match: %d", w.Code)
	}
	s.responses.mu.Lock()
	for key, entry := range s.responses.entries {
		entry.expires = time.Now().Add(-time.Second)
		s.responses.entries[key] = entry
	}
	s.responses.mu.Unlock()
	for _, path := range paths {
		if w := request(t, s, "GET", path, nil, nil); !strings.Contains(w.Body.String(), "second") {
			t.Fatalf("%s still stale after expiry", path)
		}
	}
}

func TestRateLimiterEvictsOldestWhenFull(t *testing.T) {
	l := rateLimiter{}
	now := time.Now()
	if !l.allow("view:long", now, 1, time.Hour) {
		t.Fatal("first counter rejected")
	}
	for i := range rateLimiterKeysPerPurpose - 1 {
		l.allow("view:"+string(rune(i+1)), now, 5, time.Minute)
	}
	if !l.allow("view:newcomer", now, 5, time.Minute) {
		t.Fatal("full low-value store refused a new key")
	}
	if len(l.stores["view"]) > rateLimiterKeysPerPurpose {
		t.Fatal("unbounded limiter map")
	}
	if l.allow("view:long", now, 1, time.Hour) {
		t.Fatal("eviction dropped the longest-lived counter")
	}
}

func TestRateLimiterSecurityCountersSurviveKeyChurn(t *testing.T) {
	l := rateLimiter{}
	now := time.Now()
	if !l.allow("login:victim", now, 1, 15*time.Minute) || l.allow("login:victim", now, 1, 15*time.Minute) {
		t.Fatal("login counter did not limit")
	}
	// Churned counters start later, so the victim's counter is the one closest to expiry.
	later := now.Add(time.Second)
	for i := range 2 * rateLimiterKeysPerPurpose {
		l.allow("login:"+strconv.Itoa(i), later, 15, 15*time.Minute)
		l.allow("view:"+strconv.Itoa(i), later, 30, time.Minute)
	}
	if l.allow("login:victim", later, 1, 15*time.Minute) {
		t.Fatal("churning new keys reset an exhausted login counter")
	}
	if l.allow("login:newcomer", later, 15, 15*time.Minute) {
		t.Fatal("full security store admitted a new key instead of failing closed")
	}
	if !l.allow("signup:203.0.113.9", later, 10, time.Hour) || !l.allow("view:newcomer", later, 30, time.Minute) {
		t.Fatal("one full store blocked another purpose")
	}
	if !l.allow("login:newcomer", later.Add(15*time.Minute), 15, 15*time.Minute) {
		t.Fatal("expired counters were not reclaimed")
	}
	for purpose, store := range l.stores {
		if len(store) > rateLimiterKeysPerPurpose {
			t.Fatalf("unbounded %s store: %d", purpose, len(store))
		}
	}
}

func TestFeedDescriptionsArePlainTextNotMarkup(t *testing.T) {
	s := testServer(t)
	author, c := account(t, s)
	if _, e := s.DB.Exec(context.Background(), `UPDATE users SET bio='<b onmouseover=x>bio</b>' WHERE id=$1`, author.ID); e != nil {
		t.Fatal(e)
	}
	subtitled := newPost(t, s, c)
	subtitled.Subtitle = `<img src=x onerror=alert(1)>`
	publishPost(t, s, c, save(t, s, c, subtitled, "Subtitled", "subtitled"))
	excerpted := newPost(t, s, c)
	excerpted.Content = domain.Node{Type: "doc", Content: []domain.Node{{Type: "paragraph", Content: []domain.Node{{Type: "text", Text: "<script>x</script> & more"}}}}}
	publishPost(t, s, c, save(t, s, c, excerpted, "Excerpted", "excerpted"))
	w := request(t, s, "GET", "/api/authors/"+author.Username+"/rss", nil, nil)
	var feed struct {
		Channel struct {
			Description string `xml:"description"`
			Items       []struct {
				Description string `xml:"description"`
			} `xml:"item"`
		} `xml:"channel"`
	}
	if e := xml.Unmarshal(w.Body.Bytes(), &feed); e != nil || len(feed.Channel.Items) != 2 {
		t.Fatalf("feed: %v %s", e, w.Body.String())
	}
	got := []string{feed.Channel.Description, feed.Channel.Items[0].Description, feed.Channel.Items[1].Description}
	want := []string{"&lt;b onmouseover=x&gt;bio&lt;/b&gt;", "&lt;script&gt;x&lt;/script&gt; &amp; more", "&lt;img src=x onerror=alert(1)&gt;"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("description %d decoded to %q, want HTML-escaped %q", i, got[i], want[i])
		}
	}
}

func TestExportNamesStayUniqueWhenSlugsCollideWithSuffixes(t *testing.T) {
	s := testServer(t)
	_, c := account(t, s)
	first, second, third := newPost(t, s, c), newPost(t, s, c), newPost(t, s, c)
	// The first draft claims the name the third would fall back to; the untitled draft collides with a slug too.
	save(t, s, c, first, "First", "dup-"+third.ID[:8])
	save(t, s, c, second, "Second", "dup")
	save(t, s, c, third, "Third", "dup")
	untitled := newPost(t, s, c)
	claimer := newPost(t, s, c)
	save(t, s, c, claimer, "Claimer", "untitled-"+untitled.ID[:8])
	if _, e := s.DB.Exec(context.Background(), `UPDATE posts SET created_at=now()-interval '1 day' WHERE id=$1`, claimer.ID); e != nil {
		t.Fatal(e)
	}
	w := request(t, s, "GET", "/api/me/export", nil, c)
	archive, e := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if e != nil {
		t.Fatal(e)
	}
	seen := map[string]bool{}
	for _, f := range archive.File {
		if seen[f.Name] {
			t.Fatalf("duplicate export name %q", f.Name)
		}
		seen[f.Name] = true
	}
	if len(seen) != 5 {
		t.Fatalf("export files %v", seen)
	}
}
