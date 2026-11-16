package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/jot-project/jot/apps/api/internal/config"
	"github.com/jot-project/jot/apps/api/internal/database"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	cfg := config.FromEnv()
	if directURL := os.Getenv("DATABASE_URL_UNPOOLED"); directURL != "" {
		cfg.DatabaseURL = directURL
	}
	db, e := database.Open(ctx, cfg)
	if e != nil {
		slog.Error("Database connection failed", "error", e)
		os.Exit(1)
	}
	defer db.Close()
	if e = database.Migrate(ctx, db); e != nil {
		slog.Error("Migration failed", "error", e)
		os.Exit(1)
	}
	slog.Info("Database migrations applied")
}
