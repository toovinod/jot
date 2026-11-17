package resend

import "html"

// renderEmail escapes every value except contentHTML, which must come from domain.RenderHTML. A footer, when set,
// introduces a lowercase unsubscribe link; otherwise the link stands alone.
func renderEmail(title, body, contentHTML, action, actionURL, footer, unsubscribeURL string) string {
	message := "<main style=\"font-family:system-ui;max-width:600px;margin:auto\"><h1>" + html.EscapeString(title) + "</h1><p style=\"white-space:pre-wrap\">" + html.EscapeString(body) + "</p>" + contentHTML + "<p><a href=\"" + html.EscapeString(actionURL) + "\">" + html.EscapeString(action) + "</a></p>"
	if unsubscribeURL != "" && footer != "" {
		message += "<p>" + html.EscapeString(footer) + " <a href=\"" + html.EscapeString(unsubscribeURL) + "\">unsubscribe</a></p>"
	} else if unsubscribeURL != "" {
		message += "<p><a href=\"" + html.EscapeString(unsubscribeURL) + "\">Unsubscribe</a></p>"
	}
	return message + "</main>"
}
