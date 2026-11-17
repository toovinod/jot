package jobs

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jot-project/jot/apps/api/internal/security"
)

func TestEmailIsDeliveredWhileAnAIJobIsInFlight(t *testing.T) {
	w := testWorker(t)
	ctx := context.Background()
	user, post, aiID, emailID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users(id,email,password_hash,username,name)VALUES($1,'writer@example.com','test','writer','Writer')`, []any{user}},
		{`INSERT INTO posts(id,author_id,draft)VALUES($1,$2,'{}')`, []any{post, user}},
		// The AI job is due first, so a single loop would take it before the email.
		{`INSERT INTO jobs(id,kind,user_id,payload,idempotency_key,available_at)VALUES($1,'ai',$2,jsonb_build_object('mode','grammar','text','source','postId',$3::text),$4,now()-interval '1 minute')`, []any{aiID, user, post, aiID}},
		{`INSERT INTO account_tokens(token_hash,user_id,kind,expires_at)VALUES($1,$2,'verification',now()+interval '1 hour')`, []any{security.HashToken("token"), user}},
		{`INSERT INTO jobs(id,kind,user_id,payload,idempotency_key)VALUES($1,'verification',$2,'{"token":"token","email":"writer@example.com"}',$3)`, []any{emailID, user, emailID}},
	} {
		if _, err := w.DB.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	w.Config.OpenAIKey = "test"
	w.Config.ResendKey = "test-secret-key"
	w.Config.EmailFrom = "test@example.com"
	w.Config.Origin = "https://example.com"
	aiStarted := make(chan struct{})
	var once sync.Once
	w.Client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host == "api.openai.com" {
			// A slow provider: the answer only ends when the worker shuts down.
			once.Do(func() { close(aiStarted) })
			<-r.Context().Done()
			return nil, r.Context().Err()
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":"sent"}`))}, nil
	})}
	runCtx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- w.Run(runCtx) }()
	defer func() {
		cancel()
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			t.Error("Run did not return after shutdown")
		}
	}()
	select {
	case <-aiStarted:
	case <-time.After(10 * time.Second):
		t.Fatal("AI job never reached the provider")
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		var status string
		if err := w.DB.QueryRow(ctx, `SELECT status FROM jobs WHERE id=$1`, emailID).Scan(&status); err != nil {
			t.Fatal(err)
		}
		if status == "completed" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("verification email waited behind the AI job: status=%s", status)
		}
		time.Sleep(50 * time.Millisecond)
	}
}
