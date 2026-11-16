package domain

import (
	"errors"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var usernamePattern = regexp.MustCompile(`^[a-z0-9_]{3,32}$`)

func oneOf(s string, values ...string) bool {
	for _, v := range values {
		if s == v {
			return true
		}
	}
	return false
}
func IsSafeURL(s string, image bool) bool {
	if len(s) > 2000 {
		return false
	}
	if s == "" {
		return true
	}
	if strings.HasPrefix(s, "/media/") && !strings.ContainsAny(s, "\\\r\n?#") {
		return true
	}
	u, e := url.Parse(s)
	if e != nil || u.Host == "" && u.Scheme != "mailto" {
		return false
	}
	if image {
		return u.Scheme == "https" || u.Scheme == "http"
	}
	return oneOf(u.Scheme, "https", "http", "mailto")
}
func ValidateSnapshot(s Snapshot, publish bool) error {
	if !ValidText(s.Title) || !ValidText(s.Subtitle) {
		return errors.New("Text cannot contain the NUL character")
	}
	if utf8.RuneCountInString(s.Title) > 200 || utf8.RuneCountInString(s.Subtitle) > 500 || len(s.Slug) > 100 || (!slugPattern.MatchString(s.Slug) && s.Slug != "") || !IsSafeURL(s.Cover, true) {
		return errors.New("Invalid title, slug, subtitle or cover URL")
	}
	if publish && (strings.TrimSpace(s.Title) == "" || s.Slug == "") {
		return errors.New("A title and slug are required to publish")
	}
	a := s.Appearance
	if !oneOf(a.Font, "serif", "sans", "mono") || !oneOf(a.Accent, "orange", "green", "blue", "violet", "rose") || !oneOf(a.Width, "narrow", "standard", "wide") || !oneOf(a.Theme, "system", "light", "dark") || len(a.Layout) != 4 || !oneOf(s.Visibility, "public", "unlisted") {
		return errors.New("Invalid appearance or visibility")
	}
	seen := map[string]bool{}
	for _, v := range a.Layout {
		if seen[v] || !oneOf(v, "header", "cover", "content", "author") {
			return errors.New("Invalid section layout")
		}
		seen[v] = true
	}
	if s.Content.Type != "doc" {
		return errors.New("Content must be a document")
	}
	count := 0
	size := 0
	return validateNode(s.Content, 0, &count, &size)
}
func validateNode(n Node, depth int, count, size *int) error {
	*count++
	*size += len(n.Text)
	if !ValidText(n.Text) {
		return errors.New("Text cannot contain the NUL character")
	}
	if depth > 32 || *count > 20000 || *size > 500000 || !oneOf(n.Type, "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "hardBreak", "horizontalRule", "image", "table", "tableRow", "tableCell", "tableHeader", "taskList", "taskItem") {
		return errors.New("Unsupported or oversized document")
	}
	if n.Type == "text" && (len(n.Content) > 0 || len(n.Text) == 0) {
		return errors.New("Invalid text node")
	}
	if n.Type != "text" && n.Text != "" {
		return errors.New("Text belongs in text nodes")
	}
	for k, v := range n.Attrs {
		if value, ok := v.(string); ok && !ValidText(value) {
			return errors.New("Text cannot contain the NUL character")
		}
		switch k {
		case "src":
			s, ok := v.(string)
			if !ok || n.Type != "image" || !IsSafeURL(s, true) || s == "" {
				return errors.New("Invalid image URL")
			}
		case "width", "height":
			if n.Type != "image" || !validImageDimension(v) {
				return errors.New("Invalid image dimension")
			}
		case "href":
			return errors.New("Links must be marks")
		case "level":
			f, ok := v.(float64)
			if !ok || f < 1 || f > 6 || f != float64(int(f)) {
				return errors.New("Invalid heading")
			}
		case "colspan", "rowspan":
			f, ok := v.(float64)
			if !ok || f < 1 || f > 100 || f != float64(int(f)) {
				return errors.New("Invalid table span")
			}
		case "type":
			if v != nil {
				str, ok := v.(string)
				if !ok || n.Type != "orderedList" || !oneOf(str, "1", "a", "A", "i", "I") {
					return errors.New("Invalid ordered list type")
				}
			}
		case "start":
			f, ok := v.(float64)
			if !ok || f < 1 || f > 100000 {
				return errors.New("Invalid list start")
			}
		case "checked":
			if _, ok := v.(bool); !ok {
				return errors.New("Invalid task state")
			}
		case "alt", "title", "language":
			if s, ok := v.(string); v != nil && (!ok || len(s) > 1000) {
				return errors.New("Invalid text attribute")
			}
		case "colwidth":
			if v != nil {
				list, ok := v.([]any)
				if !ok || len(list) > 100 {
					return errors.New("Invalid column widths")
				}
				for _, w := range list {
					f, ok := w.(float64)
					if !ok || f < 0 || f > 4000 {
						return errors.New("Invalid column width")
					}
				}
			}
		case "textAlign":
			if str, ok := v.(string); !ok || !oneOf(str, "left", "center", "right", "justify") {
				return errors.New("Invalid alignment")
			}
		default:
			return errors.New("Unsupported document attribute")
		}
	}
	if n.Type == "image" {
		if src, _ := n.Attrs["src"].(string); src == "" {
			return errors.New("Image source is required")
		}
	}
	if len(n.Marks) > 6 {
		return errors.New("Too many text marks")
	}
	seenMarks := map[string]bool{}
	for _, m := range n.Marks {
		if seenMarks[m.Type] {
			return errors.New("Duplicate text mark")
		}
		seenMarks[m.Type] = true
		if !oneOf(m.Type, "bold", "italic", "strike", "code", "underline", "link") {
			return errors.New("Unsupported text mark")
		}
		for k, v := range m.Attrs {
			if value, ok := v.(string); ok && !ValidText(value) {
				return errors.New("Text cannot contain the NUL character")
			}
			s, ok := v.(string)
			if v != nil && (!ok || len(s) > 2000) {
				return errors.New("Invalid link")
			}
			if m.Type != "link" || !oneOf(k, "href", "target", "rel", "class") {
				return errors.New("Unsupported mark attribute")
			}
			if k == "href" && !IsSafeURL(s, false) {
				return errors.New("Unsafe link URL")
			}
		}
		if m.Type == "link" {
			s, _ := m.Attrs["href"].(string)
			if s == "" {
				return errors.New("Missing link URL")
			}
		}
	}
	if n.Type != "text" && len(n.Marks) > 0 {
		return errors.New("Marks belong on text nodes")
	}
	for _, c := range n.Content {
		if !allowedChild(n.Type, c.Type) {
			return errors.New("Invalid document node placement")
		}

		if e := validateNode(c, depth+1, count, size); e != nil {
			return e
		}
	}
	return nil
}

func allowedChild(parent, child string) bool {
	switch parent {
	case "doc", "blockquote", "tableCell", "tableHeader", "listItem", "taskItem":
		return oneOf(child, "paragraph", "heading", "bulletList", "orderedList", "blockquote", "codeBlock", "horizontalRule", "image", "table", "taskList")
	case "paragraph", "heading":
		return oneOf(child, "text", "hardBreak")
	case "codeBlock":
		return child == "text"
	case "bulletList", "orderedList":
		return child == "listItem"
	case "taskList":
		return child == "taskItem"
	case "table":
		return child == "tableRow"
	case "tableRow":
		return oneOf(child, "tableCell", "tableHeader")
	}
	return false
}

func ValidUsername(v string) bool { return usernamePattern.MatchString(v) }

func validImageDimension(value any) bool {
	if value == nil {
		return true
	}
	switch v := value.(type) {
	case float64:
		return v >= 1 && v <= 12000 && v == float64(int(v))
	case string:
		n, e := strconv.Atoi(v)
		return e == nil && n >= 1 && n <= 12000
	}
	return false
}

func ValidText(value string) bool { return !strings.ContainsRune(value, '\x00') }
