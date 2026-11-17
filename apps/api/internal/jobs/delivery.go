package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/integrations/openai"
	"github.com/jot-project/jot/apps/api/internal/security"
)

func (s *Worker) generateAISuggestion(ctx context.Context, j *Job) (string, error) {
	if e := s.validateJobLease(ctx, j); e != nil {
		return "", e
	}
	if s.Config.OpenAIKey == "" {
		return "", permanentError{"AI provider is not configured"}
	}
	var exists bool
	if e := s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM posts WHERE id::text=$1 AND author_id::text=$2)`, j.Payload["postId"], j.UserID).Scan(&exists); e != nil {
		return "", e
	}
	if !exists {
		return "", permanentError{"Source post was removed"}
	}
	if e := s.validateJobLease(ctx, j); e != nil {
		return "", e
	}
	// The shared client gives up after 45 seconds; a long answer needs the AI job's own deadline.
	long := &http.Client{Timeout: aiJobTimeout, Transport: s.Client.Transport}
	client := openai.Client{APIKey: s.Config.OpenAIKey, Model: s.Config.OpenAIModel, HTTP: long}
	if j.Payload["mode"] == "chat" {
		var history []openai.ChatTurn
		if e := json.Unmarshal([]byte(j.Payload["history"]), &history); e != nil {
			return "", permanentError{"Chat history could not be read"}
		}
		result, e := client.Chat(ctx, openai.ChatRequest{Prompt: j.Payload["prompt"], Context: j.Payload["context"], Text: j.Payload["text"], Title: j.Payload["title"], Subtitle: j.Payload["subtitle"], Scope: j.Payload["scope"], History: history})
		if e != nil {
			return "", e
		}
		b, _ := json.Marshal(result)
		return string(b), nil
	}
	return client.Suggest(ctx, j.Payload["mode"], j.Payload["text"])
}
func (s *Worker) deliverSubscriptionEmail(ctx context.Context, j *Job) (string, error) {
	if e := s.validateJobLease(ctx, j); e != nil {
		return "", e
	}
	if !s.Config.EmailEnabled() {
		return "", permanentError{"Email provider is not configured"}
	}
	if time.Since(j.FirstAttempt) >= 23*time.Hour {
		return "", permanentError{"Email idempotency window expired"}
	}
	var allowed bool
	var currentToken string
	query := `SELECT active AND confirmed,unsubscribe_token FROM subscriptions WHERE id=$1`
	if j.Kind == "confirmation" {
		query = `SELECT NOT active AND confirm_hash=$2 AND confirm_expires>now(),unsubscribe_token FROM subscriptions WHERE id=$1`
	}
	var e error
	if j.Kind == "confirmation" {
		e = s.DB.QueryRow(ctx, query, j.Payload["subscriptionId"], security.HashToken(j.Payload["confirmToken"])).Scan(&allowed, &currentToken)
	} else {
		e = s.DB.QueryRow(ctx, query, j.Payload["subscriptionId"]).Scan(&allowed, &currentToken)
	}
	if errors.Is(e, pgx.ErrNoRows) || e == nil && !allowed {
		return "", permanentError{"Subscription is inactive or confirmation expired"}
	}
	if e != nil {
		return "", e
	}
	if currentToken == "" || currentToken != j.Payload["unsubscribeToken"] {
		return "", permanentError{"Subscription membership changed"}
	}
	var content *domain.Snapshot
	if j.Kind == "newsletter" {
		e = s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM posts WHERE id=$1 AND published IS NOT NULL AND published->>'visibility'='public')`, j.Payload["postId"]).Scan(&allowed)
		if e != nil {
			return "", e
		}
		if !allowed {
			return "", permanentError{"Publication removed"}
		}
		if content, e = s.newsletterContent(ctx, j); e != nil {
			return "", e
		}
	}
	if e := s.validateJobLease(ctx, j); e != nil {
		return "", e
	}
	client := s.emailClient()
	message := client.SubscriptionMessage(j.Kind, j.Payload, content)
	if encoded, _ := encodeEmailRequest(message); content != nil && len(encoded) > maxEmailRequestBytes {
		// A post whose rendering exceeds the bounded request is sent as the summary and link rather than failing.
		// The job records it in payload.contentOmitted, which retries keep, and in its result.
		slog.Warn("Newsletter too large for one email; sending the summary and link", "job", j.ID, "post", j.Payload["postId"], "bytes", len(encoded))
		message = client.SubscriptionMessage(j.Kind, j.Payload, nil)
		if e = s.markContentOmitted(ctx, j); e != nil {
			return "", e
		}
	}
	return j.Payload["contentOmitted"], s.deliverEmailSnapshot(ctx, j, message)
}

const contentOmittedNote = "Post too large for one email; sent the summary and link"

func (s *Worker) markContentOmitted(ctx context.Context, j *Job) error {
	tag, e := s.DB.Exec(ctx, `UPDATE jobs SET payload=payload||jsonb_build_object('contentOmitted',$3::text),updated_at=now() WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_until>now()`, j.ID, j.LeaseToken, contentOmittedNote)
	if e != nil {
		return e
	}
	if tag.RowsAffected() == 0 {
		return permanentError{"Job was cancelled or its lease expired"}
	}
	j.Payload["contentOmitted"] = contentOmittedNote
	return nil
}

// newsletterContent loads the exact published edition the newsletter was queued for. Jobs queued before
// editions were recorded in the payload, or whose edition is gone, send the summary and link only.
func (s *Worker) newsletterContent(ctx context.Context, j *Job) (*domain.Snapshot, error) {
	version, e := strconv.ParseInt(j.Payload["version"], 10, 64)
	if e != nil || j.Payload["resendRequest"] != "" {
		return nil, nil
	}
	var raw []byte
	e = s.DB.QueryRow(ctx, `SELECT snapshot FROM revisions WHERE id=$1 AND post_id::text=$2`, version, j.Payload["postId"]).Scan(&raw)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, nil
	}
	var sn domain.Snapshot
	if e == nil {
		e = json.Unmarshal(raw, &sn)
	}
	if e != nil {
		return nil, e
	}
	return &sn, nil
}
func (s *Worker) deliverAccountEmail(ctx context.Context, j *Job) error {
	if e := s.validateJobLease(ctx, j); e != nil {
		return e
	}
	if !s.Config.EmailEnabled() {
		return permanentError{"Email provider is not configured"}
	}
	var active bool
	e := s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM account_tokens WHERE token_hash=$1 AND user_id=$2 AND kind=$3 AND expires_at>now())`, security.HashToken(j.Payload["token"]), j.UserID, j.Kind).Scan(&active)
	if e != nil {
		return e
	}
	if !active {
		return permanentError{"Account email link expired or was used"}
	}
	if e := s.validateJobLease(ctx, j); e != nil {
		return e
	}
	client := s.emailClient()
	return s.deliverEmailSnapshot(ctx, j, client.AccountMessage(j.Kind, j.Payload))
}
