package domain

import (
	"html"
	"regexp"
	"strconv"
	"strings"
)

var languagePattern = regexp.MustCompile(`^[A-Za-z0-9_+#.-]{1,40}$`)

// absoluteURL returns a safe URL with uploaded /media/ paths made absolute, or "" when unsafe.
func absoluteURL(raw, origin string, image bool) string {
	if raw == "" || !IsSafeURL(raw, image) {
		return ""
	}
	if strings.HasPrefix(raw, "/media/") {
		return origin + raw
	}
	return raw
}
func codeLanguage(n Node) string {
	language, _ := n.Attrs["language"].(string)
	if !languagePattern.MatchString(language) {
		return ""
	}
	return language
}
func attrInt(n Node, key string, fallback int) int {
	if f, ok := n.Attrs[key].(float64); ok && f == float64(int(f)) {
		return int(f)
	}
	return fallback
}

// RenderHTML turns a document into HTML for email and feeds. All text is escaped and only safe URLs are emitted.
func RenderHTML(n Node, origin string) string {
	var b strings.Builder
	renderHTML(&b, n, origin)
	return b.String()
}
func renderHTML(b *strings.Builder, n Node, origin string) {
	wrap := func(open, close string) {
		b.WriteString(open)
		for _, c := range n.Content {
			renderHTML(b, c, origin)
		}
		b.WriteString(close)
	}
	switch n.Type {
	case "text":
		b.WriteString(htmlMarks(n, origin))
	case "paragraph":
		wrap("<p>", "</p>")
	case "heading":
		level := strconv.Itoa(min(max(attrInt(n, "level", 2), 1), 6))
		wrap("<h"+level+">", "</h"+level+">")
	case "bulletList", "taskList":
		wrap("<ul>", "</ul>")
	case "orderedList":
		if start := attrInt(n, "start", 1); start > 1 {
			wrap(`<ol start="`+strconv.Itoa(start)+`">`, "</ol>")
		} else {
			wrap("<ol>", "</ol>")
		}
	case "listItem":
		wrap("<li>", "</li>")
	case "taskItem":
		box := "[ ] "
		if checked, _ := n.Attrs["checked"].(bool); checked {
			box = "[x] "
		}
		wrap("<li>"+box, "</li>")
	case "blockquote":
		wrap("<blockquote>", "</blockquote>")
	case "codeBlock":
		class := ""
		if language := codeLanguage(n); language != "" {
			class = ` class="language-` + html.EscapeString(language) + `"`
		}
		b.WriteString("<pre><code" + class + ">" + html.EscapeString(DocumentText(n)) + "</code></pre>")
	case "hardBreak":
		b.WriteString("<br>")
	case "horizontalRule":
		b.WriteString("<hr>")
	case "image":
		src, _ := n.Attrs["src"].(string)
		if src = absoluteURL(src, origin, true); src != "" {
			alt, _ := n.Attrs["alt"].(string)
			b.WriteString(`<img src="` + html.EscapeString(src) + `" alt="` + html.EscapeString(alt) + `" style="max-width:100%;height:auto">`)
		}
	case "table":
		wrap("<table>", "</table>")
	case "tableRow":
		wrap("<tr>", "</tr>")
	case "tableCell", "tableHeader":
		tag := "td"
		if n.Type == "tableHeader" {
			tag = "th"
		}
		spans := ""
		for _, key := range []string{"colspan", "rowspan"} {
			if v := attrInt(n, key, 1); v > 1 {
				spans += ` ` + key + `="` + strconv.Itoa(v) + `"`
			}
		}
		wrap("<"+tag+spans+">", "</"+tag+">")
	default:
		wrap("", "")
	}
}
func htmlMarks(n Node, origin string) string {
	text := html.EscapeString(n.Text)
	for _, m := range n.Marks {
		switch m.Type {
		case "bold":
			text = "<strong>" + text + "</strong>"
		case "italic":
			text = "<em>" + text + "</em>"
		case "strike":
			text = "<s>" + text + "</s>"
		case "code":
			text = "<code>" + text + "</code>"
		case "underline":
			text = "<u>" + text + "</u>"
		}
	}
	for _, m := range n.Marks {
		href, _ := m.Attrs["href"].(string)
		if href = absoluteURL(href, origin, false); m.Type == "link" && href != "" {
			text = `<a href="` + html.EscapeString(href) + `">` + text + "</a>"
		}
	}
	return text
}

var markdownURL = strings.NewReplacer(" ", "%20", "<", "%3C", ">", "%3E")
var markdownEscaper = strings.NewReplacer(`\`, `\\`, "`", "\\`", "*", `\*`, "_", `\_`, "[", `\[`, "]", `\]`, "<", `\<`, ">", `\>`, "~", `\~`, "|", `\|`)

// RenderMarkdown turns a document into Markdown for exports and plain-text email.
func RenderMarkdown(n Node, origin string) string {
	return strings.TrimSpace(markdownBlocks(n.Content, origin, "\n\n")) + "\n"
}
func markdownBlocks(nodes []Node, origin, separator string) string {
	parts := []string{}
	for _, c := range nodes {
		if s := markdownBlock(c, origin); s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, separator)
}
func markdownBlock(n Node, origin string) string {
	switch n.Type {
	case "paragraph":
		return markdownInline(n.Content, origin)
	case "heading":
		return strings.Repeat("#", min(max(attrInt(n, "level", 2), 1), 6)) + " " + markdownInline(n.Content, origin)
	case "bulletList", "orderedList", "taskList":
		items := []string{}
		for i, item := range n.Content {
			marker := "- "
			if n.Type == "orderedList" {
				marker = strconv.Itoa(attrInt(n, "start", 1)+i) + ". "
			}
			if item.Type == "taskItem" {
				if checked, _ := item.Attrs["checked"].(bool); checked {
					marker += "[x] "
				} else {
					marker += "[ ] "
				}
			}
			body := markdownBlocks(item.Content, origin, "\n")
			items = append(items, marker+strings.ReplaceAll(body, "\n", "\n"+strings.Repeat(" ", len(marker))))
		}
		return strings.Join(items, "\n")
	case "blockquote":
		lines := strings.Split(markdownBlocks(n.Content, origin, "\n\n"), "\n")
		for i, line := range lines {
			lines[i] = strings.TrimRight("> "+line, " ")
		}
		return strings.Join(lines, "\n")
	case "codeBlock":
		text := DocumentText(n)
		// The fence is one backtick longer than the longest run in the code, and at least three.
		longest, run := 0, 0
		for i := 0; i < len(text); i++ {
			if text[i] == '`' {
				run++
				longest = max(longest, run)
			} else {
				run = 0
			}
		}
		fence := strings.Repeat("`", max(3, longest+1))
		return fence + codeLanguage(n) + "\n" + text + "\n" + fence
	case "horizontalRule":
		return "---"
	case "image":
		src, _ := n.Attrs["src"].(string)
		if src = absoluteURL(src, origin, true); src == "" {
			return ""
		}
		alt, _ := n.Attrs["alt"].(string)
		return "![" + markdownEscaper.Replace(alt) + "](<" + markdownURL.Replace(src) + ">)"
	case "table":
		rows := []string{}
		for i, row := range n.Content {
			cells := []string{}
			for _, cell := range row.Content {
				cells = append(cells, strings.ReplaceAll(markdownBlocks(cell.Content, origin, " "), "\n", " "))
			}
			rows = append(rows, "| "+strings.Join(cells, " | ")+" |")
			if i == 0 {
				rows = append(rows, "|"+strings.Repeat(" --- |", len(cells)))
			}
		}
		return strings.Join(rows, "\n")
	}
	return markdownBlocks(n.Content, origin, "\n\n")
}
func markdownInline(nodes []Node, origin string) string {
	var b strings.Builder
	for _, n := range nodes {
		if n.Type == "hardBreak" {
			b.WriteString("  \n")
			continue
		}
		text := markdownEscaper.Replace(n.Text)
		for _, m := range n.Marks {
			if m.Type == "code" {
				text = "`" + n.Text + "`"
				if strings.Contains(n.Text, "`") {
					text = "`` " + n.Text + " ``"
				}
			}
		}
		for _, m := range n.Marks {
			switch m.Type {
			case "bold":
				text = "**" + text + "**"
			case "italic":
				text = "_" + text + "_"
			case "strike":
				text = "~~" + text + "~~"
			case "link":
				href, _ := m.Attrs["href"].(string)
				if href = absoluteURL(href, origin, false); href != "" {
					text = "[" + text + "](<" + markdownURL.Replace(href) + ">)"
				}
			}
		}
		b.WriteString(text)
	}
	return b.String()
}
