package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jot-project/jot/apps/api/internal/domain"
	"github.com/jot-project/jot/apps/api/internal/integrations/openai"
)

// maxAIInputBytes fits a long post (about 20,000 words). With 10 suggestions an hour that bounds one author to about
// 1.2 MB of suggestion input an hour; a chat adds its prompt, context, title and history, so 40 chats an hour bound it
// to about 11 MB.
const maxAIInputBytes = 120000

// Chat limits match aiChatLimits in packages/contracts. Chats get their own hourly budget, larger than the one for
// suggestions, so a back-and-forth conversation stays usable.
const (
	maxAIPromptBytes      = 4000
	maxAIContextBytes     = 60000
	maxAIChatTurns        = 12
	maxAIChatTurnBytes    = 8000
	aiSuggestionsPerHour  = 10
	aiChatMessagesPerHour = 40
)

type aiJobRequest struct {
	PostID   string            `json:"postId"`
	Mode     string            `json:"mode"`
	Text     string            `json:"text"`
	Prompt   string            `json:"prompt"`
	Context  string            `json:"context"`
	Title    string            `json:"title"`
	Subtitle string            `json:"subtitle"`
	Scope    string            `json:"scope"`
	History  []openai.ChatTurn `json:"history"`
}

// problem says what is wrong with the request, or returns "" when it is valid.
func (in aiJobRequest) problem() string {
	if in.Mode != "chat" {
		if !oneOf(in.Mode, "grammar", "structure", "review") || len(strings.TrimSpace(in.Text)) == 0 || len(in.Text) > maxAIInputBytes || !domain.ValidText(in.Text) {
			return "Choose a supported AI mode and 1–120,000 bytes of text"
		}
		if in.Prompt != "" || in.Context != "" || in.Title != "" || in.Subtitle != "" || in.Scope != "" || len(in.History) > 0 {
			return "Only chat mode takes a prompt, context, title, subtitle, scope or history"
		}
		return ""
	}
	switch {
	case strings.TrimSpace(in.Prompt) == "":
		return "Write a prompt for jot ai"
	case len(in.Prompt) > maxAIPromptBytes:
		return "The prompt is longer than 4,000 bytes"
	case !domain.ValidText(in.Prompt):
		return "The prompt contains a NUL character"
	case len(in.Context) > maxAIContextBytes:
		return "The context is longer than 60,000 bytes; attach a shorter excerpt"
	case !domain.ValidText(in.Context):
		return "The context contains a NUL character"
	case len(in.Text) > maxAIInputBytes:
		return "The text is longer than 120,000 bytes; select a shorter part of the page"
	case !domain.ValidText(in.Text):
		return "The text contains a NUL character"
	// Titles and subtitles use the same limits as saving a post, so every saved page can chat.
	case utf8.RuneCountInString(in.Title) > 200 || !domain.ValidText(in.Title):
		return "The title must be at most 200 characters without NUL characters"
	case utf8.RuneCountInString(in.Subtitle) > 500 || !domain.ValidText(in.Subtitle):
		return "The subtitle must be at most 500 characters without NUL characters"
	case !oneOf(in.Scope, "page", "selection"):
		return `The scope must be "page" or "selection"`
	case len(in.History) > maxAIChatTurns:
		return "The history has more than 12 turns"
	}
	for i, turn := range in.History {
		n := "History turn " + strconv.Itoa(i+1)
		switch {
		case !oneOf(turn.Role, "user", "assistant"):
			return n + ` has role "` + turn.Role + `"; use "user" or "assistant"`
		case turn.Content == "":
			return n + " is empty"
		case len(turn.Content) > maxAIChatTurnBytes:
			return n + " is longer than 8,000 bytes"
		case !domain.ValidText(turn.Content):
			return n + " contains a NUL character"
		}
	}
	return ""
}

// aiChatLimitMessage says when the writer can chat again, given the minutes until the hourly budget frees a slot.
func aiChatLimitMessage(minutes int) string {
	wait := "about " + strconv.Itoa(minutes) + " minutes"
	if minutes <= 1 {
		wait = "a minute"
	}
	return "Chat limit reached (40 messages an hour); try again in " + wait
}

func (s *Server) createAI(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	if s.Config.OpenAIKey == "" {
		writeError(w, 503, "AI suggestions are not configured", "ai_unavailable")
		return
	}
	var in aiJobRequest
	if !decodeJSONBody(w, r, &in) {
		return
	}
	if problem := in.problem(); problem != "" {
		writeError(w, 400, problem, "validation")
		return
	}
	if _, e := uuid.Parse(in.PostID); e != nil {
		notFound(w)
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		writeInternalError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var ownedPostID string
	// Retain the post until enqueue commits so deletion cannot miss newly created work.
	e = tx.QueryRow(r.Context(), `SELECT id FROM posts WHERE id=$1 AND author_id=$2 FOR KEY SHARE`, in.PostID, u.ID).Scan(&ownedPostID)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}

	if _, e = tx.Exec(r.Context(), `SELECT id FROM users WHERE id=$1 FOR UPDATE`, u.ID); e != nil {
		writeInternalError(w, e)
		return
	}
	chat := in.Mode == "chat"
	limit := aiSuggestionsPerHour
	if chat {
		limit = aiChatMessagesPerHour
	}
	// The budget is full while the limit-th newest job of its kind is under an hour old; minutes says when it ages out.
	var minutes int
	e = tx.QueryRow(r.Context(), `SELECT ceil(extract(epoch FROM created_at+interval '1 hour'-now())/60)::int FROM jobs WHERE kind='ai' AND user_id=$1 AND created_at>now()-interval '1 hour' AND (payload->>'mode' IS NOT DISTINCT FROM 'chat')=$2 ORDER BY created_at DESC OFFSET $3 LIMIT 1`, u.ID, chat, limit-1).Scan(&minutes)
	if e == nil {
		if chat {
			writeError(w, 429, aiChatLimitMessage(minutes), "rate_limit")
		} else {
			writeError(w, 429, "AI limit reached; try again in an hour", "rate_limit")
		}
		return
	}
	if !isNotFound(e) {
		writeInternalError(w, e)
		return
	}
	id := uuid.NewString()
	payload := map[string]string{"postId": in.PostID, "mode": in.Mode, "text": in.Text}
	if chat {
		payload["prompt"], payload["context"], payload["title"], payload["subtitle"] = in.Prompt, in.Context, in.Title, in.Subtitle
		payload["scope"], payload["history"] = in.Scope, string(encodeJSON(in.History))
	}
	_, e = tx.Exec(r.Context(), `INSERT INTO jobs(id,kind,user_id,payload,idempotency_key) VALUES($1,'ai',$2,$3,$4)`, id, u.ID, encodeJSON(payload), "ai:"+id)
	if e != nil {
		writeInternalError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		writeInternalError(w, e)
		return
	}
	writeJSON(w, 202, map[string]string{"id": id})
}
func (s *Server) getAI(w http.ResponseWriter, r *http.Request) {
	u, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if _, e := uuid.Parse(id); e != nil {
		notFound(w)
		return
	}
	var status string
	var result, jobError *string
	e := s.DB.QueryRow(r.Context(), `SELECT status,result,error FROM jobs WHERE id=$1 AND user_id=$2 AND kind='ai'`, id, u.ID).Scan(&status, &result, &jobError)
	if isNotFound(e) {
		notFound(w)
		return
	}
	if e != nil {
		writeInternalError(w, e)
		return
	}
	out := map[string]any{"id": id, "status": status}
	if result != nil {
		out["result"] = *result
	}
	if jobError != nil {
		out["error"] = *jobError
	}
	writeJSON(w, 200, out)
}
