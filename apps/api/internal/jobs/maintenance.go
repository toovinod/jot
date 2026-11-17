package jobs

import (
	"context"
	"time"
)

// CleanupExpiredData deletes in batches of 1000 so no statement holds a large deletion lock. Each query repeats
// until a batch comes back short, within a time budget that leaves room before the pass context expires.
func (s *Worker) CleanupExpiredData(ctx context.Context) error {
	queries := []string{
		`DELETE FROM sessions WHERE token_hash IN(SELECT token_hash FROM sessions WHERE expires_at<now() LIMIT 1000)`,
		`DELETE FROM account_tokens WHERE token_hash IN(SELECT token_hash FROM account_tokens WHERE expires_at<now()-interval '1 day' LIMIT 1000)`,
		`DELETE FROM jobs WHERE id IN(SELECT id FROM jobs WHERE status IN('completed','failed') AND ((kind='ai' AND updated_at<now()-interval '1 day') OR(kind<>'ai' AND updated_at<now()-interval '30 days')) LIMIT 1000)`,
		`DELETE FROM post_views WHERE (post_id,viewer_key,day) IN(SELECT post_id,viewer_key,day FROM post_views WHERE day<current_date-1 LIMIT 1000)`,
		`UPDATE jobs SET status='failed',error='Job expired before processing',updated_at=now(),lease_token=NULL,lease_until=NULL WHERE status='pending' AND created_at<now()-interval '7 days' AND id IN(SELECT id FROM jobs WHERE status='pending' AND created_at<now()-interval '7 days' LIMIT 1000)`,
	}
	deadline := time.Now().Add(5 * time.Second)
	for _, query := range queries {
		for {
			tag, e := s.DB.Exec(ctx, query)
			if e != nil {
				return e
			}
			if tag.RowsAffected() < 1000 || time.Now().After(deadline) {
				break
			}
		}
	}
	return nil
}
