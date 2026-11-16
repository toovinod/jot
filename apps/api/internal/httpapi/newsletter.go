package httpapi

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/domain"
)

var errEmailUnverified = errors.New("Verify your account email before sending newsletters")
var errNewsletterBudget = errors.New("Newsletter delivery budget reached. Limit: 500 deliveries per hour and 2000 per day")

func (s *Server) enqueueNewsletter(ctx context.Context, tx pgx.Tx, author domain.User, postID string, snapshot domain.Snapshot, version int64) error {
	var verified bool
	// The author lock serializes budgets across simultaneous publishes of different posts.
	if e := tx.QueryRow(ctx, `SELECT email_verified FROM users WHERE id=$1 FOR UPDATE`, author.ID).Scan(&verified); e != nil {
		return e
	}
	if !verified {
		return errEmailUnverified
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
		return errNewsletterBudget
	}
	var hourly, daily int
	e = tx.QueryRow(ctx, `SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour'),count(*) FROM jobs WHERE user_id=$1 AND kind='newsletter' AND created_at>now()-interval '1 day'`, author.ID).Scan(&hourly, &daily)
	if e != nil {
		return e
	}
	if hourly+len(ids) > 500 || daily+len(ids) > 2000 {
		return errNewsletterBudget
	}
	payload := map[string]any{"postId": postID, "title": snapshot.Title, "subtitle": snapshot.Subtitle, "url": s.Config.Origin + "/@" + author.Username + "/" + snapshot.Slug, "author": author.Name}
	_, e = tx.Exec(ctx, `INSERT INTO jobs(id,kind,user_id,payload,idempotency_key) SELECT gen_random_uuid(),'newsletter',$1,$2::jsonb || jsonb_build_object('subscriptionId',id::text,'email',email,'unsubscribeToken',unsubscribe_token),$3||id::text FROM subscriptions WHERE author_id=$1 AND id=ANY($4::uuid[]) AND active AND confirmed ON CONFLICT(idempotency_key) DO NOTHING`, author.ID, encodeJSON(payload), fmt.Sprintf("newsletter:%s:%d:", postID, version), ids)
	return e
}
