package resend

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/jot-project/jot/apps/api/internal/integrations/request"
)

type Client struct {
	APIKey, From, Origin string
	HTTP                 *http.Client
}

type Message struct {
	From    string            `json:"from"`
	To      []string          `json:"to"`
	Subject string            `json:"subject"`
	Text    string            `json:"text"`
	HTML    string            `json:"html"`
	Headers map[string]string `json:"headers,omitempty"`
}

func (c Client) SubscriptionMessage(kind string, payload map[string]string) Message {
	unsubscribeToken := payload["unsubscribeToken"]
	unsub := c.Origin + "/subscriptions/unsubscribe?token=" + url.QueryEscape(unsubscribeToken)
	oneClick := c.Origin + "/api/subscriptions/one-click?token=" + url.QueryEscape(unsubscribeToken)
	subject := "Confirm your subscription to " + payload["author"]
	action := "Confirm subscription"
	actionURL := c.Origin + "/subscriptions/confirm?token=" + url.QueryEscape(payload["confirmToken"])
	message := "Please confirm that you want to receive this author's new public posts."
	if kind == "newsletter" {
		subject = payload["title"]
		action = "Read publication"
		actionURL = payload["url"]
		message = payload["subtitle"]
	}
	text := subject + "\n\n" + message + "\n\n" + action + ": " + actionURL + "\n\nUnsubscribe: " + unsub
	htmlBody := renderEmail(subject, message, action, actionURL, unsub)
	return Message{From: c.From, To: []string{payload["email"]}, Subject: subject, Text: text, HTML: htmlBody, Headers: map[string]string{"List-Unsubscribe": "<" + oneClick + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}}
}
func (c Client) AccountMessage(kind string, payload map[string]string) Message {
	path := "/auth/verify"
	subject := "Verify your Jot email"
	if kind == "password" {
		path = "/auth/reset"
		subject = "Reset your Jot password"
	}
	actionURL := c.Origin + path + "?token=" + url.QueryEscape(payload["token"])
	message := "This link expires in one hour. If you did not request this, ignore this email."
	text := subject + ": " + actionURL + "\n\n" + message
	return Message{From: c.From, To: []string{payload["email"]}, Subject: subject, Text: text, HTML: renderEmail(subject, message, subject, actionURL, "")}
}

func (c Client) SendMessage(ctx context.Context, message json.RawMessage, idempotency string) error {
	_, err := request.PostJSON(ctx, c.HTTP, "https://api.resend.com/emails", c.APIKey, idempotency, message)
	return err
}
