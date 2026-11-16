package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jot-project/jot/apps/api/internal/config"
	"github.com/jot-project/jot/apps/api/internal/database"
	"github.com/jot-project/jot/apps/api/internal/jobs"
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
	slog.Info("Jot worker started")
	if e = jobs.New(db, &cfg).Run(ctx); e != nil {
		slog.Error("Worker failed", "error", e)
		os.Exit(1)
	}
}
