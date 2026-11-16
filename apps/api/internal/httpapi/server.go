package httpapi

import (
	"context"
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
}
type contextKey int

const userKey contextKey = 1

func NewServer(p *pgxpool.Pool, c config.Config) *Server {
	prefixes, _ := config.ParseTrustedProxies(c.TrustedProxyCIDRs)
	s := &Server{DB: p, Config: &c, limiter: &rateLimiter{entries: map[string]rateEntry{}}, trustedProxies: prefixes, uploadSlots: make(chan struct{}, maxConcurrentUploads)}
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
		writeJSON(w, 200, map[string]bool{"aiEnabled": s.Config.OpenAIKey != "", "emailEnabled": s.Config.EmailEnabled()})
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
	r.Get("/api/authors/{username}", s.author)
	r.Get("/api/posts", s.listPosts)
	r.Post("/api/posts", s.createPost)
	r.Get("/api/posts/{id}", s.getPost)
	r.Put("/api/posts/{id}", s.savePost)
	r.Delete("/api/posts/{id}", s.deletePost)
	r.Post("/api/posts/{id}/publish", s.publish)
	r.Post("/api/posts/{id}/unpublish", s.unpublish)
	r.Get("/api/posts/{id}/revisions", s.revisions)
	r.Post("/api/posts/{id}/restore", s.restore)
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
