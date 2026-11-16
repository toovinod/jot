package jobs

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
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
	return (openai.Client{APIKey: s.Config.OpenAIKey, Model: s.Config.OpenAIModel, HTTP: s.Client}).Suggest(ctx, j.Payload["mode"], j.Payload["text"])
}
func (s *Worker) deliverSubscriptionEmail(ctx context.Context, j *Job) error {
	if e := s.validateJobLease(ctx, j); e != nil {
		return e
	}
	if !s.Config.EmailEnabled() {
		return permanentError{"Email provider is not configured"}
	}
	if time.Since(j.FirstAttempt) >= 23*time.Hour {
		return permanentError{"Email idempotency window expired"}
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
		return permanentError{"Subscription is inactive or confirmation expired"}
	}
	if e != nil {
		return e
	}
	if currentToken == "" || currentToken != j.Payload["unsubscribeToken"] {
		return permanentError{"Subscription membership changed"}
	}
	if j.Kind == "newsletter" {
		e = s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM posts WHERE id=$1 AND published IS NOT NULL AND published->>'visibility'='public')`, j.Payload["postId"]).Scan(&allowed)
		if e != nil {
			return e
		}
		if !allowed {
			return permanentError{"Publication removed"}
		}
	}
	if e := s.validateJobLease(ctx, j); e != nil {
		return e
	}
	client := s.emailClient()
	return s.deliverEmailSnapshot(ctx, j, client.SubscriptionMessage(j.Kind, j.Payload))
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
