package jobs

import (
	"context"
	"errors"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/publishing"
)

// maxScheduleAttempts is how many passes (one a minute) may fail before a schedule is cleared.
const maxScheduleAttempts = 5

// PublishDue publishes posts whose schedule has passed, through the same code path as the publish route.
// The draft as saved at that moment goes live. A refused publication clears its schedule and records why.
// Any other failure is retried on later passes, skipped for the rest of this one so later posts still publish,
// and cleared with a reason after maxScheduleAttempts.
func (s *Worker) PublishDue(ctx context.Context) error {
	failed := []string{}
	for range 50 {
		done, e := s.publishNext(ctx, &failed)
		if done || e != nil {
			return e
		}
	}
	return nil
}
func (s *Worker) publishNext(ctx context.Context, failed *[]string) (bool, error) {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return false, e
	}
	defer tx.Rollback(ctx)
	var id string
	var revision int
	var email bool
	var u domain.User
	e = tx.QueryRow(ctx, `SELECT p.id,p.revision,p.schedule_email,u.id,u.username,u.name,u.bio,u.avatar FROM posts p JOIN users u ON u.id=p.author_id WHERE p.scheduled_at<=now() AND p.id<>ALL($1::uuid[]) ORDER BY p.scheduled_at FOR UPDATE OF p SKIP LOCKED LIMIT 1`, *failed).Scan(&id, &revision, &email, &u.ID, &u.Username, &u.Name, &u.Bio, &u.Avatar)
	if errors.Is(e, pgx.ErrNoRows) {
		return true, nil
	}
	if e != nil {
		return false, e
	}
	e = publishing.Publish(ctx, tx, s.Config, u, id, revision, email)
	var refusal publishing.Error
	if errors.As(e, &refusal) {
		_ = tx.Rollback(ctx)
		slog.Warn("Scheduled publication refused", "post", id, "code", refusal.Code)
		_, e = s.DB.Exec(ctx, `UPDATE posts SET scheduled_at=NULL,schedule_email=false,schedule_attempts=0,schedule_error=$2 WHERE id=$1 AND scheduled_at<=now()`, id, refusal.Message)
		return false, e
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		_ = tx.Rollback(ctx)
		slog.Warn("Scheduled publication failed", "post", id, "error", e)
		*failed = append(*failed, id)
		_, e = s.DB.Exec(ctx, `UPDATE posts SET schedule_attempts=schedule_attempts+1,scheduled_at=CASE WHEN schedule_attempts+1>=$2 THEN NULL ELSE scheduled_at END,schedule_email=schedule_email AND schedule_attempts+1<$2,schedule_error=CASE WHEN schedule_attempts+1>=$2 THEN 'Scheduled publishing failed repeatedly. Schedule it again or publish it now.' END WHERE id=$1 AND scheduled_at<=now()`, id, maxScheduleAttempts)
	}
	return false, e
}
