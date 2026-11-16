package jobs

import "context"

// CleanupExpiredData bounds each maintenance pass so it cannot hold a large deletion lock.
func (s *Worker) CleanupExpiredData(ctx context.Context) error {
	queries := []string{
		`DELETE FROM sessions WHERE token_hash IN(SELECT token_hash FROM sessions WHERE expires_at<now() LIMIT 1000)`,
		`DELETE FROM account_tokens WHERE token_hash IN(SELECT token_hash FROM account_tokens WHERE expires_at<now()-interval '1 day' LIMIT 1000)`,
		`DELETE FROM jobs WHERE id IN(SELECT id FROM jobs WHERE status IN('completed','failed') AND ((kind='ai' AND updated_at<now()-interval '1 day') OR(kind<>'ai' AND updated_at<now()-interval '30 days')) LIMIT 1000)`,
		`UPDATE jobs SET status='failed',error='Job expired before processing',updated_at=now(),lease_token=NULL,lease_until=NULL WHERE status='pending' AND created_at<now()-interval '7 days' AND id IN(SELECT id FROM jobs WHERE status='pending' AND created_at<now()-interval '7 days' LIMIT 1000)`,
	}
	for _, query := range queries {
		if _, e := s.DB.Exec(ctx, query); e != nil {
			return e
		}
	}
	return nil
}
