package resend

import "html"

func renderEmail(title, body, action, actionURL, unsubscribeURL string) string {
	message := "<main style=\"font-family:system-ui;max-width:600px;margin:auto\"><h1>" + html.EscapeString(title) + "</h1><p style=\"white-space:pre-wrap\">" + html.EscapeString(body) + "</p><p><a href=\"" + html.EscapeString(actionURL) + "\">" + html.EscapeString(action) + "</a></p>"
	if unsubscribeURL != "" {
		message += "<p><a href=\"" + html.EscapeString(unsubscribeURL) + "\">Unsubscribe</a></p>"
	}
	return message + "</main>"
}
