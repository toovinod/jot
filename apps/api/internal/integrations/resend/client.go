package resend

import (
	"context"
	"encoding/json"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"unicode"

	"github.com/jot-project/jot/apps/api/internal/domain"
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

// SubscriptionMessage builds a confirmation or newsletter email. A newsletter with content carries the full post.
func (c Client) SubscriptionMessage(kind string, payload map[string]string, content *domain.Snapshot) Message {
	unsubscribeToken := payload["unsubscribeToken"]
	unsub := c.Origin + "/subscriptions/unsubscribe?token=" + url.QueryEscape(unsubscribeToken)
	oneClick := c.Origin + "/api/subscriptions/one-click?token=" + url.QueryEscape(unsubscribeToken)
	subject := "Confirm your subscription to " + payload["author"]
	action := "Confirm subscription"
	actionURL := c.Origin + "/subscriptions/confirm?token=" + url.QueryEscape(payload["confirmToken"])
	message := "Please confirm that you want to receive this author's new public posts."
	footer, unsubscribeLine := "", "Unsubscribe: "+unsub
	if kind == "newsletter" {
		subject = payload["title"]
		action = "read on the web"
		actionURL = payload["url"]
		message = payload["subtitle"]
		footer = "you're getting this because you subscribed to " + payload["author"] + "."
		unsubscribeLine = footer + " unsubscribe: " + unsub
	}
	contentHTML, contentText := "", ""
	if kind == "newsletter" && content != nil {
		contentHTML, contentText = domain.RenderHTML(content.Content, c.Origin), "\n\n"+domain.RenderMarkdown(content.Content, c.Origin)
	}
	text := subject + "\n\n" + message + contentText + "\n\n" + action + ": " + actionURL + "\n\n" + unsubscribeLine
	htmlBody := renderEmail(subject, message, contentHTML, action, actionURL, footer, unsub)
	from := c.From
	if kind == "newsletter" {
		from = newsletterFrom(c.From, payload["author"])
	}
	return Message{From: from, To: []string{payload["email"]}, Subject: subject, Text: text, HTML: htmlBody, Headers: map[string]string{"List-Unsubscribe": "<" + oneClick + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}}
}

// maxSenderNameRunes bounds the author part of a newsletter sender name.
const maxSenderNameRunes = 64

// newsletterFrom names the sender "<author> via <instance>" on the configured EMAIL_FROM address. The instance is
// EMAIL_FROM's display name, or "jot". The author name loses control characters, quotes and angle brackets, and
// net/mail quotes or encodes the result, so it cannot add headers or addresses. An unparsable EMAIL_FROM or an
// empty author name keeps EMAIL_FROM unchanged.
func newsletterFrom(from, author string) string {
	address, e := mail.ParseAddress(from)
	if e != nil {
		return from
	}
	author = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || strings.ContainsRune(`"<>`, r) {
			return ' '
		}
		return r
	}, author)
	author = strings.Join(strings.Fields(author), " ")
	if runes := []rune(author); len(runes) > maxSenderNameRunes {
		author = strings.TrimSpace(string(runes[:maxSenderNameRunes]))
	}
	if author == "" {
		return from
	}
	instance := address.Name
	if instance == "" {
		instance = "jot"
	}
	return (&mail.Address{Name: author + " via " + instance, Address: address.Address}).String()
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
	return Message{From: c.From, To: []string{payload["email"]}, Subject: subject, Text: text, HTML: renderEmail(subject, message, "", subject, actionURL, "", "")}
}

func (c Client) SendMessage(ctx context.Context, message json.RawMessage, idempotency string) error {
	_, err := request.PostJSON(ctx, c.HTTP, "https://api.resend.com/emails", c.APIKey, idempotency, message)
	return err
}
