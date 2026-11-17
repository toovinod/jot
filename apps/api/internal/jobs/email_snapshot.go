package jobs

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jot-project/jot/apps/api/internal/integrations/resend"
)

// maxEmailRequestBytes bounds one persisted provider request. A post at the 500,000-byte text limit renders to at
// most about 3.5 MB of HTML and text when every character needs escaping, so supported documents fit; documents
// whose links or markup push past the bound send the summary and link instead (see deliverSubscriptionEmail).
const maxEmailRequestBytes = 4 << 20

func (s *Worker) emailClient() resend.Client {
	return resend.Client{APIKey: s.Config.ResendKey, From: s.Config.EmailFrom, Origin: s.Config.Origin, HTTP: s.Client}
}

func (s *Worker) deliverEmailSnapshot(ctx context.Context, job *Job, message resend.Message) error {
	snapshot := job.Payload["resendRequest"]
	if snapshot == "" {
		encoded, err := encodeEmailRequest(message)
		if err != nil {
			return err
		}
		snapshot = encoded
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

// encodeEmailRequest serializes a message without escaping <, > and &, which would triple the size of rendered HTML.
func encodeEmailRequest(message resend.Message) (string, error) {
	var b bytes.Buffer
	encoder := json.NewEncoder(&b)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(message); err != nil {
		return "", err
	}
	return strings.TrimSuffix(b.String(), "\n"), nil
}

func validEmailRequest(snapshot string) bool {
	return len(snapshot) <= maxEmailRequestBytes && json.Valid([]byte(snapshot)) && strings.HasPrefix(strings.TrimSpace(snapshot), "{")
}
