package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func queuedNewsletter(t *testing.T, worker *Worker, currentToken, payloadToken string) *Job {
	t.Helper()
	ctx := context.Background()
	author, post, subscription, id := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	_, err := worker.DB.Exec(ctx, `INSERT INTO users(id,email,password_hash,username,name)VALUES($1,'author@example.com','test','author','Author')`, author)
	if err != nil {
		t.Fatal(err)
	}
	_, err = worker.DB.Exec(ctx, `INSERT INTO posts(id,author_id,draft,published)VALUES($1,$2,'{}','{"visibility":"public"}')`, post, author)
	if err != nil {
		t.Fatal(err)
	}
	_, err = worker.DB.Exec(ctx, `INSERT INTO subscriptions(id,author_id,email,confirmed,active,confirm_hash,unsubscribe_hash,unsubscribe_token,confirm_expires)VALUES($1,$2,'reader@example.com',true,true,'confirm','new-hash',$3,now()+interval '1 day')`, subscription, author, currentToken)
	if err != nil {
		t.Fatal(err)
	}
	payload := map[string]string{"postId": post, "subscriptionId": subscription, "email": "reader@example.com", "unsubscribeToken": payloadToken, "title": "Old newsletter", "url": "https://example.com/@author/story"}
	raw, _ := json.Marshal(payload)
	_, err = worker.DB.Exec(ctx, `INSERT INTO jobs(id,kind,user_id,payload,idempotency_key)VALUES($1,'newsletter',$2,$3,$4)`, id, author, raw, "newsletter:"+id)
	if err != nil {
		t.Fatal(err)
	}
	job, err := worker.Claim(ctx)
	if err != nil || job == nil {
		t.Fatalf("claim:%v", err)
	}
	worker.Config.ResendKey = "test-secret-key"
	worker.Config.EmailFrom = "test@example.com"
	worker.Config.Origin = "https://example.com"
	return job
}
func TestNewsletterRejectsOldSubscriptionGeneration(t *testing.T) {
	worker := testWorker(t)
	job := queuedNewsletter(t, worker, "new-token", "old-token")
	ctx := context.Background()
	calls := 0
	worker.Client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":"sent"}`))}, nil
	})}
	_, err := worker.Execute(ctx, job)
	var permanent permanentError
	if !errors.As(err, &permanent) || calls != 0 {
		t.Fatalf("old membership was delivered: calls=%d error=%v", calls, err)
	}
	if err = worker.Finish(ctx, job, "", err); err != nil {
		t.Fatal(err)
	}
	var status string
	if err = worker.DB.QueryRow(ctx, `SELECT status FROM jobs WHERE id=$1`, job.ID).Scan(&status); err != nil || status != "failed" {
		t.Fatalf("stale membership not terminal: status=%s error=%v", status, err)
	}
}
func TestAIRejectsOrphanedSourcePostBeforeProvider(t *testing.T) {
	worker := testWorker(t)
	id := insertJob(t, worker)
	ctx := context.Background()
	job, err := worker.Claim(ctx)
	if err != nil || job == nil {
		t.Fatalf("claim:%v", err)
	}
	worker.Config.OpenAIKey = "test"
	calls := 0
	worker.Client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return nil, errors.New("unexpected provider call")
	})}
	_, err = worker.Execute(ctx, job)
	var permanent permanentError
	if !errors.As(err, &permanent) || calls != 0 {
		t.Fatalf("orphaned source was sent: calls=%d error=%v", calls, err)
	}
	if err = worker.Finish(ctx, job, "", err); err != nil {
		t.Fatal(err)
	}
	var status string
	if err = worker.DB.QueryRow(ctx, `SELECT status FROM jobs WHERE id=$1`, id).Scan(&status); err != nil || status != "failed" {
		t.Fatalf("orphaned source not terminal: status=%s error=%v", status, err)
	}
}

func TestEmailRetriesReplaySnapshotAcrossConfigurationAndTemplateChanges(t *testing.T) {
	worker := testWorker(t)
	job := queuedNewsletter(t, worker, "same-token", "same-token")
	ctx := context.Background()
	bodies := []string{}
	keys := []string{}
	worker.Client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		data, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		bodies = append(bodies, string(data))
		keys = append(keys, r.Header.Get("Idempotency-Key"))
		status := 503
		if len(bodies) > 1 {
			status = 200
		}
		return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":"sent"}`))}, nil
	})}
	_, workErr := worker.Execute(ctx, job)
	if workErr == nil {
		t.Fatal("first provider response should retry")
	}
	if err := worker.Finish(ctx, job, "", workErr); err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := worker.DB.QueryRow(ctx, `SELECT payload->>'resendRequest' FROM jobs WHERE id=$1`, job.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != bodies[0] || strings.Contains(stored, worker.Config.ResendKey) {
		t.Fatal("exact request was not stored safely before delivery")
	}
	if _, err := worker.DB.Exec(ctx, `UPDATE jobs SET available_at=now() WHERE id=$1`, job.ID); err != nil {
		t.Fatal(err)
	}
	retry, err := worker.Claim(ctx)
	if err != nil || retry == nil {
		t.Fatalf("claim:%v", err)
	}
	worker.Config.EmailFrom = "changed@example.com"
	worker.Config.Origin = "https://changed.example.com"
	message := worker.emailClient().SubscriptionMessage(retry.Kind, retry.Payload, nil)
	message.HTML = "A new template introduced by a deployment"
	if err = worker.deliverEmailSnapshot(ctx, retry, message); err != nil {
		t.Fatal(err)
	}
	if len(bodies) != 2 || bodies[0] != bodies[1] || keys[0] == "" || keys[0] != keys[1] {
		t.Fatal("retry body or idempotency key changed across a rollout")
	}
	if err = worker.Finish(ctx, retry, "", nil); err != nil {
		t.Fatal(err)
	}
}
