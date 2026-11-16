package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/integrations/resend"
)

const maxEmailRequestBytes = 64 * 1024

func (s *Worker) emailClient() resend.Client {
	return resend.Client{APIKey: s.Config.ResendKey, From: s.Config.EmailFrom, Origin: s.Config.Origin, HTTP: s.Client}
}

func (s *Worker) deliverEmailSnapshot(ctx context.Context, job *Job, message resend.Message) error {
	snapshot := job.Payload["resendRequest"]
	if snapshot == "" {
		encoded, err := json.Marshal(message)
		if err != nil {
			return err
		}
		snapshot = string(encoded)
	}
	if !validEmailRequest(snapshot) {
		return permanentError{"Stored email request is invalid or too large"}
	}
	var stored string
	err := s.DB.QueryRow(ctx, `UPDATE jobs SET payload=jsonb_set(payload,'{resendRequest}',to_jsonb(COALESCE(NULLIF(payload->>'resendRequest',''),$3::text)),true),updated_at=now() WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_until>now() RETURNING payload->>'resendRequest'`, job.ID, job.LeaseToken, snapshot).Scan(&stored)
	if errors.Is(err, pgx.ErrNoRows) {
		return permanentError{"Job was cancelled or its lease expired"}
	}
	if err != nil {
		return err
	}
	if !validEmailRequest(stored) {
		return permanentError{"Stored email request is invalid or too large"}
	}
	job.Payload["resendRequest"] = stored
	return s.emailClient().SendMessage(ctx, json.RawMessage(stored), job.IdempotencyKey)
}

func validEmailRequest(snapshot string) bool {
	return len(snapshot) <= maxEmailRequestBytes && json.Valid([]byte(snapshot)) && strings.HasPrefix(strings.TrimSpace(snapshot), "{")
}
