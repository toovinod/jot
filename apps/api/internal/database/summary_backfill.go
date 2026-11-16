package database

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/domain"
)

func backfillPostSummaries(ctx context.Context, tx pgx.Tx) error {
	var after *string
	for {
		rows, e := tx.Query(ctx, `SELECT id,draft,published FROM posts WHERE($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 10`, after)
		if e != nil {
			return e
		}
		type legacyPost struct {
			id               string
			draft, published []byte
		}
		posts := []legacyPost{}
		for rows.Next() {
			var post legacyPost
			if e = rows.Scan(&post.id, &post.draft, &post.published); e != nil {
				rows.Close()
				return e
			}
			posts = append(posts, post)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return e
		}
		if len(posts) == 0 {
			return nil
		}
		batch := &pgx.Batch{}
		for _, post := range posts {
			var draft domain.Snapshot
			if e = json.Unmarshal(post.draft, &draft); e != nil {
				return e
			}
			draftSummary, e := json.Marshal(domain.SummarizeSnapshot(draft))
			if e != nil {
				return e
			}
			var publishedSummary []byte
			if len(post.published) > 0 {
				var published domain.Snapshot
				if e = json.Unmarshal(post.published, &published); e != nil {
					return e
				}
				publishedSummary, e = json.Marshal(domain.SummarizeSnapshot(published))
				if e != nil {
					return e
				}
			}
			batch.Queue(`UPDATE posts SET draft_summary=$2,published_summary=$3 WHERE id=$1`, post.id, draftSummary, publishedSummary)
		}
		if e = tx.SendBatch(ctx, batch).Close(); e != nil {
			return e
		}
		last := posts[len(posts)-1].id
		after = &last
	}
}
