package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jot-project/jot/apps/api/internal/integrations/openai"
)

func TestAIJobRequestValidation(t *testing.T) {
	chat := func(change func(*aiJobRequest)) aiJobRequest {
		in := aiJobRequest{Mode: "chat", Prompt: "make it shorter", Text: "A draft.", Scope: "page", History: []openai.ChatTurn{{Role: "user", Content: "hi"}, {Role: "assistant", Content: "hello"}}}
		change(&in)
		return in
	}
	turns := func(n int) []openai.ChatTurn {
		h := make([]openai.ChatTurn, n)
		for i := range h {
			h[i] = openai.ChatTurn{Role: "user", Content: "turn"}
		}
		return h
	}
	cases := []struct {
		name, problem string
		in            aiJobRequest
	}{
		{"suggestion", "", aiJobRequest{Mode: "grammar", Text: "Source"}},
		{"suggestion with empty chat fields", "", aiJobRequest{Mode: "review", Text: "Source", History: []openai.ChatTurn{}}},
		{"suggestion with prompt", "Only chat mode", aiJobRequest{Mode: "grammar", Text: "Source", Prompt: "hi"}},
		{"suggestion with scope", "Only chat mode", aiJobRequest{Mode: "grammar", Text: "Source", Scope: "page"}},
		{"suggestion with history", "Only chat mode", aiJobRequest{Mode: "grammar", Text: "Source", History: turns(1)}},
		{"suggestion with context", "Only chat mode", aiJobRequest{Mode: "grammar", Text: "Source", Context: "notes"}},
		{"suggestion with title", "Only chat mode", aiJobRequest{Mode: "grammar", Text: "Source", Title: "Tea"}},
		{"suggestion with subtitle", "Only chat mode", aiJobRequest{Mode: "grammar", Text: "Source", Subtitle: "Tea"}},
		{"suggestion without text", "supported AI mode", aiJobRequest{Mode: "grammar", Text: " "}},
		{"unknown mode", "supported AI mode", aiJobRequest{Mode: "poem", Text: "Source"}},
		{"chat", "", chat(func(*aiJobRequest) {})},
		{"chat on an empty page", "", chat(func(in *aiJobRequest) { in.Text, in.History = "", nil })},
		{"chat at the limits", "", chat(func(in *aiJobRequest) {
			in.Prompt, in.Context, in.Text, in.History = strings.Repeat("p", 4000), strings.Repeat("c", 60000), strings.Repeat("t", 120000), turns(12)
			in.Title, in.Subtitle = strings.Repeat("é", 200), strings.Repeat("é", 500)
			in.History[0].Content = strings.Repeat("c", 8000)
		})},
		{"blank prompt", "Write a prompt", chat(func(in *aiJobRequest) { in.Prompt = " \n" })},
		{"long prompt", "prompt is longer than 4,000 bytes", chat(func(in *aiJobRequest) { in.Prompt = strings.Repeat("p", 4001) })},
		{"NUL prompt", "prompt contains a NUL", chat(func(in *aiJobRequest) { in.Prompt = "a\x00" })},
		{"long context", "context is longer than 60,000 bytes", chat(func(in *aiJobRequest) { in.Context = strings.Repeat("c", 60001) })},
		{"NUL context", "context contains a NUL", chat(func(in *aiJobRequest) { in.Context = "a\x00" })},
		{"long title", "title must be at most 200 characters", chat(func(in *aiJobRequest) { in.Title = strings.Repeat("t", 201) })},
		{"NUL title", "title must be", chat(func(in *aiJobRequest) { in.Title = "\x00" })},
		{"long subtitle", "subtitle must be at most 500 characters", chat(func(in *aiJobRequest) { in.Subtitle = strings.Repeat("s", 501) })},
		{"long text", "longer than 120,000 bytes", chat(func(in *aiJobRequest) { in.Text = strings.Repeat("t", 120001) })},
		{"NUL text", "text contains a NUL", chat(func(in *aiJobRequest) { in.Text = "a\x00" })},
		{"missing scope", `"page" or "selection"`, chat(func(in *aiJobRequest) { in.Scope = "" })},
		{"unknown scope", `"page" or "selection"`, chat(func(in *aiJobRequest) { in.Scope = "document" })},
		{"long history", "more than 12 turns", chat(func(in *aiJobRequest) { in.History = turns(13) })},
		{"bad role", `History turn 2 has role "system"`, chat(func(in *aiJobRequest) { in.History[1].Role = "system" })},
		{"empty turn", "History turn 1 is empty", chat(func(in *aiJobRequest) { in.History[0].Content = "" })},
		{"long turn", "History turn 2 is longer than 8,000 bytes", chat(func(in *aiJobRequest) { in.History[1].Content = strings.Repeat("c", 8001) })},
		{"NUL turn", "History turn 1 contains a NUL", chat(func(in *aiJobRequest) { in.History[0].Content = "\x00" })},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := c.in.problem()
			if c.problem == "" && got != "" || c.problem != "" && !strings.Contains(got, c.problem) {
				t.Fatalf("got %q, want %q", got, c.problem)
			}
		})
	}
}

func TestAIJobRequestRejectsUnknownTurnFields(t *testing.T) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/", strings.NewReader(`{"mode":"chat","history":[{"role":"user","content":"hi","name":"x"}]}`))
	var in aiJobRequest
	if decodeJSONBody(w, r, &in) {
		t.Fatal("expected decode to fail")
	}
	var out map[string]string
	if e := json.Unmarshal(w.Body.Bytes(), &out); e != nil {
		t.Fatal(e)
	}
	if w.Code != 400 || out["code"] != "unknown_field" || !strings.Contains(out["error"], `"name"`) {
		t.Fatalf("got %d %v", w.Code, out)
	}
}

func TestAIChatLimitMessageSaysWhenToTryAgain(t *testing.T) {
	for minutes, want := range map[int]string{1: "try again in a minute", 2: "try again in about 2 minutes", 60: "try again in about 60 minutes"} {
		if got := aiChatLimitMessage(minutes); !strings.HasSuffix(got, want) || !strings.Contains(got, "40 messages an hour") {
			t.Fatalf("%d minutes: %q", minutes, got)
		}
	}
}
