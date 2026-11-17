// Package publishing makes drafts live. The HTTP publish route and the scheduled-publish worker share it.
package publishing

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jot-project/jot/apps/api/internal/config"
	"github.com/jot-project/jot/apps/api/internal/domain"
)

// Error is a publication refusal with the HTTP status and code the API reports for it.
type Error struct {
	Status        int
	Message, Code string
}

func (e Error) Error() string { return e.Message }

var ErrEmailUnverified = Error{403, "Verify your account email before sending newsletters", "email_unverified"}
var ErrNewsletterBudget = Error{429, "Newsletter delivery budget reached. Limit: 500 deliveries per hour and 2000 per day", "newsletter_budget"}
var ErrRevision = Error{409, "Draft revision changed; reload before publishing", "revision_conflict"}

// Check reports whether a draft may go live now.
func Check(c *config.Config, sn domain.Snapshot, reservedSlug *string, email bool) error {
	if e := domain.ValidateSnapshot(sn, true); e != nil {
		return Error{400, e.Error(), "validation"}
	}
	if email && (sn.Visibility != "public" || !c.EmailEnabled()) {
		return Error{400, "Email delivery requires a public post and configured email provider", "email_unavailable"}
	}
	if reservedSlug != nil && *reservedSlug != sn.Slug {
		return Error{400, "Published post slugs remain stable", "stable_slug"}
	}
	return nil
}

// Publish makes the post's current draft live inside tx, records the edition and optionally queues the newsletter.
// It clears any pending schedule and its recorded failure. The caller commits; pgx.ErrNoRows means the post is not the author's.
func Publish(ctx context.Context, tx pgx.Tx, c *config.Config, author domain.User, id string, revision int, email bool) error {
	var raw []byte
	var current int
	var reservedSlug *string
	if e := tx.QueryRow(ctx, `SELECT draft,revision,first_published_slug FROM posts WHERE id=$1 AND author_id=$2 FOR UPDATE`, id, author.ID).Scan(&raw, &current, &reservedSlug); e != nil {
		return e
	}
	if current != revision {
		return ErrRevision
	}
	var sn domain.Snapshot
	if e := json.Unmarshal(raw, &sn); e != nil {
		return e
	}
	if e := Check(c, sn, reservedSlug, email); e != nil {
		return e
	}
	summary, _ := json.Marshal(domain.SummarizeSnapshot(sn))
	_, e := tx.Exec(ctx, `UPDATE posts SET published=$3,published_summary=$5,first_published_slug=COALESCE(first_published_slug,$4),published_at=now(),updated_at=now(),revision=revision+1,scheduled_at=NULL,schedule_email=false,schedule_attempts=0,schedule_error=NULL WHERE id=$1 AND author_id=$2`, id, author.ID, raw, sn.Slug, summary)
	if p, ok := e.(*pgconn.PgError); ok && p.Code == "23505" {
		return Error{409, "This slug is reserved by another post; choose another", "slug_conflict"}
	}
	if e != nil {
		return e
	}
	if sn.Visibility == "unlisted" {
		if _, e = tx.Exec(ctx, `UPDATE jobs SET status='failed',error='Publication is no longer public',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE kind='newsletter' AND payload->>'postId'=$1 AND status IN('pending','running')`, id); e != nil {
			return e
		}
	}
	var version int64
	if e = tx.QueryRow(ctx, `INSERT INTO revisions(post_id,snapshot) VALUES($1,$2) RETURNING id`, id, raw).Scan(&version); e != nil {
		return e
	}
	if email {
		return EnqueueNewsletter(ctx, tx, c, author, id, sn, version)
	}
	return nil
}

// EnqueueNewsletter queues one delivery per confirmed subscriber within the author's sending budget.
func EnqueueNewsletter(ctx context.Context, tx pgx.Tx, c *config.Config, author domain.User, postID string, snapshot domain.Snapshot, version int64) error {
	var verified bool
	// The author lock serializes budgets across simultaneous publishes of different posts.
	if e := tx.QueryRow(ctx, `SELECT email_verified FROM users WHERE id=$1 FOR UPDATE`, author.ID).Scan(&verified); e != nil {
		return e
	}
	if !verified {
		return ErrEmailUnverified
	}
	rows, e := tx.Query(ctx, `SELECT id::text FROM subscriptions WHERE author_id=$1 AND active AND confirmed LIMIT 501`, author.ID)
	if e != nil {
		return e
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	if len(ids) > 500 {
		return ErrNewsletterBudget
	}
	var hourly, daily int
	e = tx.QueryRow(ctx, `SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour'),count(*) FROM jobs WHERE user_id=$1 AND kind='newsletter' AND created_at>now()-interval '1 day'`, author.ID).Scan(&hourly, &daily)
	if e != nil {
		return e
	}
	if hourly+len(ids) > 500 || daily+len(ids) > 2000 {
		return ErrNewsletterBudget
	}
	payload, _ := json.Marshal(map[string]any{"postId": postID, "version": strconv.FormatInt(version, 10), "title": snapshot.Title, "subtitle": snapshot.Subtitle, "url": c.Origin + "/@" + author.Username + "/" + snapshot.Slug, "author": author.Name})
	_, e = tx.Exec(ctx, `INSERT INTO jobs(id,kind,user_id,payload,idempotency_key) SELECT gen_random_uuid(),'newsletter',$1,$2::jsonb || jsonb_build_object('subscriptionId',id::text,'email',email,'unsubscribeToken',unsubscribe_token),$3||id::text FROM subscriptions WHERE author_id=$1 AND id=ANY($4::uuid[]) AND active AND confirmed ON CONFLICT(idempotency_key) DO NOTHING`, author.ID, payload, fmt.Sprintf("newsletter:%s:%d:", postID, version), ids)
	return e
}
