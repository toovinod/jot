package request

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestPostJSONRejectsRedirectWithoutReplayingPrivateBody(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if calls > 1 {
			t.Fatalf("private payload followed provider redirect to %s", r.URL)
		}
		data, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(data), "private writing") {
			t.Fatal("missing source payload")
		}
		return &http.Response{StatusCode: http.StatusTemporaryRedirect, Header: http.Header{"Location": []string{"https://other.example/collect"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})}
	_, err := PostJSON(context.Background(), client, "https://provider.example/request", "secret", "key", map[string]string{"text": "private writing"})
	var permanent PermanentError
	if !errors.As(err, &permanent) || calls != 1 {
		t.Fatalf("expected permanent redirect rejection, calls=%d error=%v", calls, err)
	}
	if client.CheckRedirect != nil {
		t.Fatal("shared HTTP client was mutated")
	}
}

func TestPostJSONClassifiesResendRetriesAndBoundsResponses(t *testing.T) {
	cases := []struct {
		name        string
		status      int
		body, retry string
		transient   bool
		delay       time.Duration
	}{
		{"concurrent key", 409, `{"name":"concurrent_idempotent_requests"}`, "90", true, 90 * time.Second},
		{"different payload", 409, `{"name":"invalid_idempotent_request"}`, "", false, 0},
		{"rate limited", 429, `{}`, "600", true, 10 * time.Minute},
		{"bad credentials", 401, `{}`, "", false, 0},
		{"oversized success", 200, strings.Repeat("x", (2<<20)+1), "", false, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: tc.status, Header: http.Header{"Retry-After": []string{tc.retry}}, Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})}
			_, err := PostJSON(context.Background(), client, "https://api.resend.com/emails", "test", "same-key", map[string]string{"text": "Hello"})
			var transient TransientError
			var permanent PermanentError
			if tc.transient {
				if !errors.As(err, &transient) || transient.RetryAfter != tc.delay {
					t.Fatalf("expected retry after %s, error=%v", tc.delay, err)
				}
			} else if !errors.As(err, &permanent) {
				t.Fatalf("expected permanent error: %v", err)
			}
		})
	}
}
func TestRetryAfterSupportsDatesAndBoundsMalformedValues(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	for _, tc := range []struct {
		value string
		want  time.Duration
	}{
		{now.Add(5 * time.Minute).Format(http.TimeFormat), 5 * time.Minute},
		{"-10", 0}, {"garbage", 0}, {"999999999999", 24 * time.Hour},
	} {
		if got := parseRetryAfter(tc.value, now); got != tc.want {
			t.Errorf("retryAfter(%q)=%s want%s", tc.value, got, tc.want)
		}
	}
}
