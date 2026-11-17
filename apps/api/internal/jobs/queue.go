package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/integrations/request"
)

type Job struct {
	ID, Kind, UserID, LeaseToken, IdempotencyKey string
	Payload                                      map[string]string
	Attempts                                     int
	FirstAttempt                                 time.Time
}

func (s *Worker) Claim(ctx context.Context) (*Job, error) {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	_, e = tx.Exec(ctx, `UPDATE jobs SET status='failed',error='Delivery retry window expired',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE (status='pending' OR (status='running' AND (lease_until IS NULL OR lease_until<now()))) AND (attempts>=5 OR first_attempt_at<now()-interval '23 hours')`)
	if e != nil {
		return nil, e
	}
	j := Job{}
	raw := []byte{}
	lease := uuid.NewString()
	e = tx.QueryRow(ctx, `WITH next AS(SELECT id FROM jobs WHERE ((status='pending' AND available_at<=now()) OR(status='running' AND lease_until<now())) AND attempts<5 AND (first_attempt_at IS NULL OR first_attempt_at>now()-interval '23 hours') ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE jobs j SET status='running',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,now()),lease_until=now()+CASE WHEN j.kind='ai' THEN interval '5 minutes' ELSE interval '2 minutes' END,lease_token=$1,updated_at=now() FROM next WHERE j.id=next.id RETURNING j.id,j.kind,COALESCE(j.user_id::text,''),j.payload,j.attempts,j.first_attempt_at,j.idempotency_key`, lease).Scan(&j.ID, &j.Kind, &j.UserID, &raw, &j.Attempts, &j.FirstAttempt, &j.IdempotencyKey)
	if errors.Is(e, pgx.ErrNoRows) {
		if e = tx.Commit(ctx); e != nil {
			return nil, e
		}
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	j.LeaseToken = lease
	if e = json.Unmarshal(raw, &j.Payload); e != nil {
		return nil, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	return &j, nil
}
func RetryDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if attempt > 5 {
		attempt = 5
	}
	return time.Duration(1<<uint(attempt)) * time.Second * 15
}
func (s *Worker) Finish(ctx context.Context, j *Job, result string, workErr error) error {
	status := "completed"
	var msg *string
	next := time.Now()
	if workErr != nil {
		safe := "Provider request failed; retrying"
		status = "pending"
		if j.Attempts >= 5 || time.Since(j.FirstAttempt) >= 23*time.Hour {
			status = "failed"
			safe = "Job failed after bounded retries"
		}
		var permanent permanentError
		var providerPermanent request.PermanentError
		if errors.As(workErr, &providerPermanent) {
			status = "failed"
			safe = providerPermanent.Error()
		}
		if errors.As(workErr, &permanent) {
			status = "failed"
			safe = permanent.Error()
		}
		delay := RetryDelay(j.Attempts)
		var transient request.TransientError
		if errors.As(workErr, &transient) && transient.RetryAfter > delay {
			delay = transient.RetryAfter
		}
		if status == "pending" && next.Add(delay).After(j.FirstAttempt.Add(23*time.Hour)) {
			status = "failed"
			safe = "Provider retry falls outside the job retry window"
		}
		msg = &safe
		next = next.Add(delay)
	}
	_, e := s.DB.Exec(ctx, `UPDATE jobs SET status=$3,result=$4,error=$5,available_at=$6,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now()`, j.ID, j.LeaseToken, status, result, msg, next)
	return e
}

func (s *Worker) validateJobLease(ctx context.Context, j *Job) error {
	var active bool
	e := s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM jobs WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_until>now())`, j.ID, j.LeaseToken).Scan(&active)
	if e != nil {
		return e
	}
	if !active {
		return permanentError{"Job was cancelled or its lease expired"}
	}
	return nil
}
