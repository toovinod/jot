package main

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jot-project/jot/apps/api/internal/config"
	"github.com/jot-project/jot/apps/api/internal/database"
	"github.com/jot-project/jot/apps/api/internal/httpapi"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg := config.FromEnv()
	db, e := database.Open(ctx, cfg)
	if e != nil {
		slog.Error("Database connection failed", "error", e)
		os.Exit(1)
	}
	defer db.Close()
	srv := &http.Server{Addr: cfg.Addr, Handler: httpapi.NewServer(db, cfg).Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 65 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	listener, e := net.Listen("tcp", cfg.Addr)
	if e != nil {
		slog.Error("HTTP listener failed", "error", e)
		os.Exit(1)
	}
	slog.Info("Jot API listening", "address", listener.Addr().String())
	if e = runHTTPServer(ctx, srv, listener, 15*time.Second); e != nil {
		slog.Error("HTTP server stopped with an error", "error", e)
		os.Exit(1)
	}
}
