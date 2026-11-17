package resend

import (
	"net/mail"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestNewsletterLinksAndFooter(t *testing.T) {
	c := Client{Origin: "https://jot.example.com"}
	m := c.SubscriptionMessage("newsletter", map[string]string{"title": "Letter", "subtitle": "Sub", "url": "https://jot.example.com/@ada/letter", "author": "Ada <Lovelace>", "email": "reader@example.com", "unsubscribeToken": "tok"}, nil)
	unsubscribe := "https://jot.example.com/subscriptions/unsubscribe?token=tok"
	for _, want := range []string{`<a href="https://jot.example.com/@ada/letter">read on the web</a>`, `you&#39;re getting this because you subscribed to Ada &lt;Lovelace&gt;. <a href="` + unsubscribe + `">unsubscribe</a>`} {
		if !strings.Contains(m.HTML, want) {
			t.Fatalf("html missing %q in %s", want, m.HTML)
		}
	}
	for _, want := range []string{"read on the web: https://jot.example.com/@ada/letter", "you're getting this because you subscribed to Ada <Lovelace>. unsubscribe: " + unsubscribe} {
		if !strings.Contains(m.Text, want) {
			t.Fatalf("text missing %q in %s", want, m.Text)
		}
	}
	if strings.Contains(m.HTML, "Read publication") || m.Headers["List-Unsubscribe"] != "<https://jot.example.com/api/subscriptions/one-click?token=tok>" || m.Headers["List-Unsubscribe-Post"] != "List-Unsubscribe=One-Click" {
		t.Fatalf("headers or old link text: %+v", m.Headers)
	}
	confirm := c.SubscriptionMessage("confirmation", map[string]string{"author": "Ada", "email": "reader@example.com", "unsubscribeToken": "tok", "confirmToken": "c"}, nil)
	if !strings.Contains(confirm.HTML, "Confirm subscription") || !strings.Contains(confirm.HTML, ">Unsubscribe</a>") || strings.Contains(confirm.HTML, "getting this") {
		t.Fatalf("confirmation email changed: %s", confirm.HTML)
	}
}

func TestNewsletterFromNamesAuthorViaInstance(t *testing.T) {
	cases := []struct{ from, author, want string }{
		{"Jot <posts@example.com>", "Harper", `"Harper via Jot" <posts@example.com>`},
		{"posts@example.com", "Harper", `"Harper via jot" <posts@example.com>`},
		{"Jot <posts@example.com>", "", "Jot <posts@example.com>"},
		{"not an address", "Harper", "not an address"},
	}
	for _, tc := range cases {
		m := Client{From: tc.from}.SubscriptionMessage("newsletter", map[string]string{"author": tc.author, "email": "reader@example.com"}, nil)
		if m.From != tc.want {
			t.Fatalf("from %q author %q: got %q want %q", tc.from, tc.author, m.From, tc.want)
		}
	}
	hostile := "Eve\r\nBcc: victim@example.com\" <evil@example.com>, " + strings.Repeat("x", 200)
	m := Client{From: "Jot <posts@example.com>"}.SubscriptionMessage("newsletter", map[string]string{"author": hostile, "email": "reader@example.com"}, nil)
	parsed, e := mail.ParseAddress(m.From)
	if e != nil || parsed.Address != "posts@example.com" || strings.ContainsAny(parsed.Name, "\r\n\"<>") || !strings.HasPrefix(parsed.Name, "Eve Bcc: victim@example.com evil@example.com , ") || !strings.HasSuffix(parsed.Name, " via Jot") || utf8.RuneCountInString(parsed.Name) > maxSenderNameRunes+len(" via Jot") {
		t.Fatalf("unsafe sender %q parsed as %+v (%v)", m.From, parsed, e)
	}
	if confirm := (Client{From: "Jot <posts@example.com>"}).SubscriptionMessage("confirmation", map[string]string{"author": "Harper"}, nil); confirm.From != "Jot <posts@example.com>" {
		t.Fatalf("confirmation sender changed: %q", confirm.From)
	}
}
