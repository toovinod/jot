package jobs

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jot-project/jot/apps/api/internal/config"
)

type Worker struct {
	DB     *pgxpool.Pool
	Config *config.Config
	Client *http.Client
}

// AI jobs can write a whole post, which takes the provider minutes, so they get a longer deadline
// (and a matching lease in Claim) than email and the other short jobs.
const (
	jobTimeout   = 55 * time.Second
	aiJobTimeout = 4*time.Minute + 30*time.Second
)

func timeoutFor(kind string) time.Duration {
	if kind == "ai" {
		return aiJobTimeout
	}
	return jobTimeout
}

func New(db *pgxpool.Pool, c *config.Config) *Worker {
	return &Worker{DB: db, Config: c, Client: &http.Client{Timeout: 45 * time.Second}}
}

// aiLanes is how many AI jobs run at once. AI jobs run beside the email lane and the scheduled publishing pass,
// so a slow provider answer never delays sign-in, password reset or newsletter email, or a scheduled post.
const aiLanes = 2

// Run works the queue until ctx is cancelled. Cancelling also cancels in-flight jobs, which are recorded with
// Finish, and Run returns once every lane has stopped.
func (s *Worker) Run(ctx context.Context) error {
	var wg sync.WaitGroup
	for range aiLanes {
		wg.Go(func() { s.runLane(ctx, true) })
	}
	wg.Go(func() { s.runMaintenance(ctx) })
	s.runLane(ctx, false)
	wg.Wait()
	return nil
}

// runMaintenance publishes due scheduled posts every minute and cleans up expired data every 10 minutes.
func (s *Worker) runMaintenance(ctx context.Context) {
	timer := time.NewTicker(time.Minute)
	defer timer.Stop()
	lastCleanup := time.Time{}
	for {
		publish, cancel := context.WithTimeout(ctx, 30*time.Second)
		e := s.PublishDue(publish)
		cancel()
		if e != nil {
			slog.Warn("Scheduled publication pass failed", "error", e)
		}
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
			return
		case <-timer.C:
		}
	}
}

// runLane claims and runs AI jobs one at a time when ai is true, and every other kind otherwise.
func (s *Worker) runLane(ctx context.Context, ai bool) {
	timer := time.NewTicker(time.Second)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		j, e := s.ClaimLane(ctx, ai)
		if e != nil {
			slog.Error("job claim failed", "ai", ai, "error", e)
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
			}
			continue
		}
		if j == nil {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
			}
			continue
		}
		jobCtx, cancel := context.WithTimeout(ctx, timeoutFor(j.Kind))
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
		return s.deliverSubscriptionEmail(ctx, j)
	}
	return "", permanentError{"Unknown job type"}
}
