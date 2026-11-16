package openai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/jot-project/jot/apps/api/internal/integrations/request"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestSuggestRejectsIncompleteAndRefusedResponses(t *testing.T) {
	cases := []struct{ name, body string }{
		{"token limit", `{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[{"content":[{"type":"output_text","text":"A suggestion cut off mid"}]}]}`},
		{"provider rejected", `{"status":"failed","error":{"code":"invalid_prompt"},"output":[]}`},
		{"refusal", `{"status":"completed","output":[{"content":[{"type":"refusal","refusal":"Not allowed"}]}]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			client := Client{APIKey: "test", Model: "gpt-6-luna", HTTP: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})}}
			result, err := client.Suggest(context.Background(), "grammar", "Source writing")
			var permanent request.PermanentError
			if result != "" || !errors.As(err, &permanent) || calls != 1 {
				t.Fatalf("expected safe permanent failure, result=%q error=%v calls=%d", result, err, calls)
			}
		})
	}
}
func TestSuggestAcceptsOnlyCompletedTextAndDisablesStorage(t *testing.T) {
	client := Client{APIKey: "test", Model: "gpt-6-luna", HTTP: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		var body struct {
			Model string `json:"model"`
			Store *bool  `json:"store"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Model != "gpt-6-luna" || body.Store == nil || *body.Store {
			t.Fatal("expected GPT-6 Luna with provider storage disabled")
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"status":"completed","output":[{"content":[{"type":"output_text","text":"Reviewed suggestion"}]}]}`))}, nil
	})}}
	result, err := client.Suggest(context.Background(), "grammar", "Source writing")
	if err != nil || result != "Reviewed suggestion" {
		t.Fatalf("result=%q error=%v", result, err)
	}
}
