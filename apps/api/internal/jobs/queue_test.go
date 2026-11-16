package jobs

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jot-project/jot/apps/api/internal/config"
	"github.com/jot-project/jot/apps/api/internal/database"
	"github.com/jot-project/jot/apps/api/internal/integrations/request"
)

func testWorker(t *testing.T) *Worker {
	t.Helper()
	url := os.Getenv("JOT_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("JOT_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	base, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	schema := "jobs_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err = base.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		base.Close()
		t.Fatal(err)
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		_, _ = base.Exec(context.Background(), `DROP SCHEMA `+schema+` CASCADE`)
		base.Close()
	})
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	return New(db, &config.Config{})
}
func insertJob(t *testing.T, w *Worker) string {
	t.Helper()
	id := uuid.NewString()
	_, err := w.DB.Exec(context.Background(), `INSERT INTO jobs(id,kind,payload,idempotency_key)VALUES($1,'ai','{"mode":"grammar","text":"source"}',$2)`, id, id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}
func TestExpiredLeaseCannotCompleteAndActiveLeaseIsNotRevoked(t *testing.T) {
	w := testWorker(t)
	id := insertJob(t, w)
	ctx := context.Background()
	job, err := w.Claim(ctx)
	if err != nil || job == nil {
		t.Fatalf("claim:%v", err)
	}
	_, err = w.DB.Exec(ctx, `UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1`, id)
	if err != nil {
		t.Fatal(err)
	}
	if err = w.Finish(ctx, job, "stale result", nil); err != nil {
		t.Fatal(err)
	}
	var status string
	var result *string
	if err = w.DB.QueryRow(ctx, `SELECT status,result FROM jobs WHERE id=$1`, id).Scan(&status, &result); err != nil {
		t.Fatal(err)
	}
	if status != "running" || result != nil {
		t.Fatal("expired owner completed its lease")
	}
	_, err = w.DB.Exec(ctx, `UPDATE jobs SET first_attempt_at=now()-interval '23 hours 1 second',lease_until=now()+interval '1 minute' WHERE id=$1`, id)
	if err != nil {
		t.Fatal(err)
	}
	next, err := w.Claim(ctx)
	if err != nil || next != nil {
		t.Fatalf("unexpected claim:%v", err)
	}
	if err = w.DB.QueryRow(ctx, `SELECT status FROM jobs WHERE id=$1`, id).Scan(&status); err != nil || status != "running" {
		t.Fatalf("active lease revoked: status=%s error=%v", status, err)
	}
}
func TestFinishPersistsProviderDelayAndHonorsRetryDeadline(t *testing.T) {
	for _, tc := range []struct {
		name   string
		age    time.Duration
		status string
	}{
		{"retry later", 0, "pending"}, {"beyond window", 23*time.Hour - time.Minute, "failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := testWorker(t)
			id := insertJob(t, w)
			ctx := context.Background()
			job, err := w.Claim(ctx)
			if err != nil || job == nil {
				t.Fatalf("claim:%v", err)
			}
			job.FirstAttempt = time.Now().Add(-tc.age)
			if err = w.Finish(ctx, job, "", request.TransientError{StatusCode: 429, RetryAfter: 10 * time.Minute}); err != nil {
				t.Fatal(err)
			}
			var status string
			var at time.Time
			if err = w.DB.QueryRow(ctx, `SELECT status,available_at FROM jobs WHERE id=$1`, id).Scan(&status, &at); err != nil {
				t.Fatal(err)
			}
			if status != tc.status {
				t.Fatalf("status=%s want%s", status, tc.status)
			}
			if status == "pending" && time.Until(at) < 9*time.Minute {
				t.Fatal("provider retry delay ignored")
			}
		})
	}
}
