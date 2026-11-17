package httpapi

import (
	"context"
	"crypto/rand"
	"net"
	"net/http"
	"net/netip"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jot-project/jot/apps/api/internal/config"
)

type Server struct {
	DB                *pgxpool.Pool
	Config            *config.Config
	limiter           *rateLimiter
	trustedProxies    []netip.Prefix
	uploadSlots       chan struct{}
	storageHTTPClient s3.HTTPClient
	lookupTXT         func(context.Context, string) ([]string, error)
	responses         *responseCache
	viewSecret        []byte
}
type contextKey int

const userKey contextKey = 1

func NewServer(p *pgxpool.Pool, c config.Config) *Server {
	prefixes, _ := config.ParseTrustedProxies(c.TrustedProxyCIDRs)
	viewSecret := []byte(c.ViewHashSecret)
	if len(viewSecret) == 0 {
		viewSecret = make([]byte, 32)
		_, _ = rand.Read(viewSecret)
	}
	s := &Server{DB: p, Config: &c, limiter: &rateLimiter{}, trustedProxies: prefixes, uploadSlots: make(chan struct{}, maxConcurrentUploads), lookupTXT: net.DefaultResolver.LookupTXT, viewSecret: viewSecret, responses: &responseCache{entries: map[string]cachedResponse{}}}
	return s
}
func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Recoverer, middleware.Timeout(60*time.Second))
	r.Use(s.security)
	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, c := context.WithTimeout(r.Context(), 2*time.Second)
		defer c()
		if s.DB.Ping(ctx) != nil {
			writeError(w, 503, "Database unavailable", "unavailable")
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})
	r.Get("/api/config", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"aiEnabled": s.Config.OpenAIKey != "", "emailEnabled": s.Config.EmailEnabled(), "domainTarget": s.Config.CustomDomainTarget})
	})
	r.Post("/api/auth/verification/request", s.requestVerification)
	r.Post("/api/auth/verification/confirm", s.confirmVerification)
	r.Post("/api/auth/password/request", s.requestPassword)
	r.Post("/api/auth/password/reset", s.resetPassword)
	r.Post("/api/auth/signup", s.signup)
	r.Post("/api/auth/login", s.login)
	r.Post("/api/auth/logout", s.logout)
	r.Get("/api/me", s.me)
	r.Patch("/api/me", s.updateMe)
	r.Delete("/api/me", s.deleteMe)
	r.Get("/api/me/export", s.exportPosts)
	r.Get("/api/me/subscribers", s.subscribers)
	r.Delete("/api/me/subscribers/{id}", s.removeSubscriber)
	r.Get("/api/me/blocked", s.blockedReaders)
	r.Post("/api/me/blocked", s.blockReader)
	r.Delete("/api/me/blocked/{userId}", s.unblockReader)
	r.Get("/api/me/domain", s.getDomain)
	r.Put("/api/me/domain", s.putDomain)
	r.Delete("/api/me/domain", s.deleteDomain)
	r.Post("/api/me/domain/verify", s.verifyDomain)
	r.Get("/api/domains/resolve", s.resolveDomain)
	r.Get("/api/domains/allowed", s.allowedDomain)
	r.Get("/api/authors/{username}", s.author)
	r.Get("/api/authors/{username}/rss", s.cached(s.authorFeed))
	r.Get("/api/rss", s.cached(s.feed))
	r.Get("/api/sitemap", s.cached(s.sitemap))
	r.Get("/api/posts", s.listPosts)
	r.Post("/api/posts", s.createPost)
	r.Get("/api/posts/{id}", s.getPost)
	r.Put("/api/posts/{id}", s.savePost)
	r.Delete("/api/posts/{id}", s.deletePost)
	r.Post("/api/posts/{id}/publish", s.publish)
	r.Post("/api/posts/{id}/unpublish", s.unpublish)
	r.Get("/api/posts/{id}/revisions", s.revisions)
	r.Post("/api/posts/{id}/restore", s.restore)
	r.Post("/api/posts/{id}/schedule", s.schedule)
	r.Delete("/api/posts/{id}/schedule", s.unschedule)
	r.Post("/api/posts/{id}/share", s.share)
	r.Delete("/api/posts/{id}/share", s.unshare)
	r.Get("/api/shared/{token}", s.sharedDraft)
	r.Post("/api/posts/{id}/view", s.view)
	r.Get("/api/public/{username}/{slug}", s.publicPost)
	r.Get("/api/posts/{id}/engagement", s.engagement)
	r.Put("/api/posts/{id}/like", s.like)
	r.Put("/api/posts/{id}/bookmark", s.bookmark)
	r.Post("/api/posts/{id}/comments", s.addComment)
	r.Delete("/api/posts/{id}/comments/{commentId}", s.deleteComment)
	r.Post("/api/uploads", s.upload)
	r.Get("/media/{key}", s.media)
	r.Post("/api/ai/jobs", s.createAI)
	r.Get("/api/ai/jobs/{id}", s.getAI)
	r.Post("/api/authors/{username}/subscribe", s.subscribe)
	r.Post("/api/subscriptions/confirm", s.confirm)
	r.Post("/api/subscriptions/unsubscribe", s.unsubscribe)
	r.Post("/api/subscriptions/one-click", s.unsubscribe)
	return r
}
