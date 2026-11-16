package jobs

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jot-project/jot/apps/api/internal/config"
)

type Worker struct {
	DB     *pgxpool.Pool
	Config *config.Config
	Client *http.Client
}

func New(db *pgxpool.Pool, c *config.Config) *Worker {
	return &Worker{DB: db, Config: c, Client: &http.Client{Timeout: 45 * time.Second}}
}

func (s *Worker) Run(ctx context.Context) error {
	timer := time.NewTicker(time.Second)
	defer timer.Stop()
	lastCleanup := time.Time{}
	for {
		if time.Since(lastCleanup) > 10*time.Minute {
			cleanup, cancel := context.WithTimeout(ctx, 10*time.Second)
			e := s.CleanupExpiredData(cleanup)
			cancel()
			if e != nil {
				slog.Warn("Expired data cleanup failed", "error", e)
			}
			lastCleanup = time.Now()
		}
		select {
		case <-ctx.Done():
			return nil
		default:
		}
		j, e := s.Claim(ctx)
		if e != nil {
			slog.Error("job claim failed", "error", e)
			select {
			case <-ctx.Done():
				return nil
			case <-timer.C:
			}
			continue
		}
		if j == nil {
			select {
			case <-ctx.Done():
				return nil
			case <-timer.C:
			}
			continue
		}
		jobCtx, cancel := context.WithTimeout(ctx, 55*time.Second)
		result, workErr := s.Execute(jobCtx, j)
		cancel()
		finishCtx, finishCancel := context.WithTimeout(context.Background(), 5*time.Second)
		e = s.Finish(finishCtx, j, result, workErr)
		finishCancel()
		if e != nil {
			slog.Error("job completion failed", "job", j.ID, "error", e)
		}
		if workErr != nil {
			slog.Warn("job attempt failed", "job", j.ID, "kind", j.Kind, "attempt", j.Attempts)
		}
	}
}

type permanentError struct{ message string }

func (e permanentError) Error() string { return e.message }
func (s *Worker) Execute(ctx context.Context, j *Job) (string, error) {
	if j.Kind == "ai" {
		return s.generateAISuggestion(ctx, j)
	}
	if j.Kind == "verification" || j.Kind == "password" {
		return "", s.deliverAccountEmail(ctx, j)
	}
	if j.Kind == "newsletter" || j.Kind == "confirmation" {
		return "", s.deliverSubscriptionEmail(ctx, j)
	}
	return "", permanentError{"Unknown job type"}
}
