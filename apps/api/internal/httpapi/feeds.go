package httpapi

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"html"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jot-project/jot/apps/api/internal/domain"
)

type rssItem struct {
	Title       string   `xml:"title"`
	Link        string   `xml:"link"`
	GUID        string   `xml:"guid"`
	PubDate     string   `xml:"pubDate"`
	Author      string   `xml:"dc:creator"`
	Description string   `xml:"description"`
	Content     string   `xml:"content:encoded"`
	Categories  []string `xml:"category"`
}
type rssFeed struct {
	XMLName   xml.Name `xml:"rss"`
	Version   string   `xml:"version,attr"`
	ContentNS string   `xml:"xmlns:content,attr"`
	DCNS      string   `xml:"xmlns:dc,attr"`
	Channel   struct {
		Title       string    `xml:"title"`
		Link        string    `xml:"link"`
		Description string    `xml:"description"`
		Items       []rssItem `xml:"item"`
	} `xml:"channel"`
}

func postURL(origin, username, slug string) string {
	return origin + "/@" + url.PathEscape(username) + "/" + url.PathEscape(slug)
}
func (s *Server) feed(w http.ResponseWriter, r *http.Request) {
	s.writeFeed(w, r, "Jot", s.Config.Origin, "Recent public posts on Jot", "")
}
func (s *Server) authorFeed(w http.ResponseWriter, r *http.Request) {
	var u domain.User
	e := s.DB.QueryRow(r.Context(), `SELECT id,username,name,bio FROM users WHERE username=$1`, chi.URLParam(r, "username")).Scan(&u.ID, &u.Username, &u.Name, &u.Bio)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	s.writeFeed(w, r, u.Name, s.Config.Origin+"/@"+url.PathEscape(u.Username), u.Bio, u.ID)
}

// writeFeed renders the latest 50 public posts as RSS 2.0; encoding/xml escapes every value. Readers treat
// <description> as HTML, so the plain-text bio, subtitle and excerpt are HTML-escaped first; content:encoded
// carries the sanitized rendered post.
func (s *Server) writeFeed(w http.ResponseWriter, r *http.Request, title, link, description, authorID string) {
	rows, e := s.DB.Query(r.Context(), `SELECT p.published,p.published_at,u.username,u.name FROM posts p JOIN users u ON u.id=p.author_id WHERE p.published IS NOT NULL AND p.published_summary->>'visibility'='public' AND($1='' OR p.author_id::text=$1) ORDER BY p.published_at DESC,p.id LIMIT 50`, authorID)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer rows.Close()
	var out rssFeed
	out.Version, out.ContentNS, out.DCNS = "2.0", "http://purl.org/rss/1.0/modules/content/", "http://purl.org/dc/elements/1.1/"
	out.Channel.Title, out.Channel.Link, out.Channel.Description = title, link, html.EscapeString(description)
	out.Channel.Items = []rssItem{}
	for rows.Next() {
		var raw []byte
		var at time.Time
		var username, name string
		if e = rows.Scan(&raw, &at, &username, &name); e != nil {
			writeInternalError(w, e)
			return
		}
		var sn domain.Snapshot
		if e = json.Unmarshal(raw, &sn); e != nil {
			writeInternalError(w, e)
			return
		}
		link := postURL(s.Config.Origin, username, sn.Slug)
		description := sn.Subtitle
		if description == "" {
			description = domain.SummarizeSnapshot(sn).Excerpt
		}
		out.Channel.Items = append(out.Channel.Items, rssItem{Title: sn.Title, Link: link, GUID: link, PubDate: at.UTC().Format(time.RFC1123Z), Author: name, Description: html.EscapeString(description), Content: domain.RenderHTML(sn.Content, s.Config.Origin), Categories: sn.Tags})
	}
	if e = rows.Err(); e != nil {
		writeInternalError(w, e)
		return
	}
	body, e := xml.Marshal(out)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = w.Write(append([]byte(xml.Header), body...))
}

func (s *Server) sitemap(w http.ResponseWriter, r *http.Request) {
	type entry struct {
		Username  string    `json:"username"`
		Slug      string    `json:"slug"`
		UpdatedAt time.Time `json:"updatedAt"`
	}
	rows, e := s.DB.Query(r.Context(), `SELECT u.username,p.published_summary->>'slug',p.published_at FROM posts p JOIN users u ON u.id=p.author_id WHERE p.published IS NOT NULL AND p.published_summary->>'visibility'='public' ORDER BY p.published_at DESC,p.id LIMIT 50000`)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer rows.Close()
	out := []entry{}
	for rows.Next() {
		var v entry
		if e = rows.Scan(&v.Username, &v.Slug, &v.UpdatedAt); e != nil {
			writeInternalError(w, e)
			return
		}
		out = append(out, v)
	}
	if e = rows.Err(); e != nil {
		writeInternalError(w, e)
		return
	}
	writePublicJSON(w, r, out)
}

type cachedResponse struct {
	header  http.Header
	body    []byte
	expires time.Time
}

// maxCachedResponseBytes bounds the bodies the cache holds; one feed can carry 50 full posts.
const maxCachedResponseBytes = 8 << 20

type responseCache struct {
	mu      sync.Mutex
	entries map[string]cachedResponse
	bytes   int
	// pending holds the build in progress for each path, so concurrent misses wait for it instead of each
	// rebuilding the same response.
	pending map[string]*pendingResponse
}
type pendingResponse struct {
	done   chan struct{}
	status int
	entry  cachedResponse
}
type capturedResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (c *capturedResponse) Header() http.Header         { return c.header }
func (c *capturedResponse) WriteHeader(status int)      { c.status = status }
func (c *capturedResponse) Write(b []byte) (int, error) { return c.body.Write(b) }

// cached serves a successful public response from memory for 60 seconds, keyed by path, so crawlers and feed
// readers do not each rebuild 50 rendered posts or the whole sitemap. At most 1000 paths and 8 MiB of bodies are
// kept; when full, expired entries are dropped and a response that still does not fit is served uncached.
// Concurrent misses for one path share a single build. A failed build is not shared: each waiter then builds its
// own response, so one reader's cancelled request cannot fail the others.
func (s *Server) cached(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key, now := r.URL.Path, time.Now()
		c := s.responses
		c.mu.Lock()
		entry, ok := c.entries[key]
		if ok && now.Before(entry.expires) {
			c.mu.Unlock()
			serveCached(w, r, entry)
			return
		}
		if p := c.pending[key]; p != nil {
			c.mu.Unlock()
			select {
			case <-p.done:
			case <-r.Context().Done():
				return
			}
			if p.status == 200 {
				serveCached(w, r, p.entry)
				return
			}
			captured := &capturedResponse{header: http.Header{}, status: 200}
			next(captured, r)
			copyResponse(w, captured.header, captured.status, captured.body.Bytes())
			return
		}
		p := &pendingResponse{done: make(chan struct{})}
		if c.pending == nil {
			c.pending = map[string]*pendingResponse{}
		}
		c.pending[key] = p
		c.mu.Unlock()
		captured := &capturedResponse{header: http.Header{}, status: 200}
		func() {
			// Release waiters before writing to this client, and even if the handler panics; a zero status
			// sends them to build their own response.
			defer func() {
				c.mu.Lock()
				delete(c.pending, key)
				c.mu.Unlock()
				close(p.done)
			}()
			next(captured, r)
			entry = cachedResponse{header: captured.header, body: captured.body.Bytes(), expires: now.Add(time.Minute)}
			if captured.status == 200 {
				c.mu.Lock()
				c.store(key, entry, now)
				c.mu.Unlock()
				p.status, p.entry = 200, entry
			}
		}()
		if captured.status != 200 {
			copyResponse(w, captured.header, captured.status, entry.body)
			return
		}
		serveCached(w, r, entry)
	}
}

// store keeps entry when it fits the path and byte bounds after expired entries are dropped. Callers hold mu.
func (c *responseCache) store(key string, entry cachedResponse, now time.Time) {
	if old, ok := c.entries[key]; ok {
		c.bytes -= len(old.body)
		delete(c.entries, key)
	}
	size := len(entry.body)
	if len(c.entries) >= 1000 || c.bytes+size > maxCachedResponseBytes {
		for k, v := range c.entries {
			if !now.Before(v.expires) {
				c.bytes -= len(v.body)
				delete(c.entries, k)
			}
		}
	}
	if len(c.entries) < 1000 && c.bytes+size <= maxCachedResponseBytes {
		c.entries[key] = entry
		c.bytes += size
	}
}
func serveCached(w http.ResponseWriter, r *http.Request, entry cachedResponse) {
	if etag := entry.header.Get("ETag"); etag != "" && r.Header.Get("If-None-Match") == etag {
		copyResponse(w, entry.header, 304, nil)
		return
	}
	copyResponse(w, entry.header, 200, entry.body)
}
func copyResponse(w http.ResponseWriter, header http.Header, status int, body []byte) {
	for k, v := range header {
		w.Header()[k] = append([]string(nil), v...)
	}
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
