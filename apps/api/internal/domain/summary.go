package domain

import (
	"strings"
	"time"
)

type SnapshotSummary struct {
	Title          string `json:"title"`
	Subtitle       string `json:"subtitle"`
	Slug           string `json:"slug"`
	Cover          string `json:"cover"`
	Visibility     string `json:"visibility"`
	Excerpt        string `json:"excerpt"`
	ReadingMinutes int    `json:"readingMinutes"`
}

type PostSummary struct {
	SnapshotSummary
	ID           string     `json:"id"`
	Author       User       `json:"author"`
	Revision     int        `json:"revision"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	PublishedAt  *time.Time `json:"publishedAt,omitempty"`
	ReservedSlug string     `json:"reservedSlug,omitempty"`
	IsPublished  bool       `json:"isPublished"`
	Likes        int        `json:"likes"`
	Comments     int        `json:"comments"`
}

func SummarizeSnapshot(snapshot Snapshot) SnapshotSummary {
	text := strings.TrimSpace(DocumentText(snapshot.Content))
	runes := []rune(text)
	if len(runes) > 220 {
		runes = runes[:220]
	}
	minutes := (len(strings.Fields(text)) + 219) / 220
	if minutes < 1 {
		minutes = 1
	}
	return SnapshotSummary{Title: snapshot.Title, Subtitle: snapshot.Subtitle, Slug: snapshot.Slug, Cover: snapshot.Cover, Visibility: snapshot.Visibility, Excerpt: string(runes), ReadingMinutes: minutes}
}

func DocumentText(node Node) string {
	if node.Type == "hardBreak" {
		return "\n"
	}
	if node.Type == "text" {
		return node.Text
	}
	separator := ""
	if oneOf(node.Type, "doc", "bulletList", "orderedList", "taskList", "listItem", "taskItem", "blockquote", "table", "tableCell", "tableHeader") {
		separator = "\n"
	}
	if node.Type == "tableRow" {
		separator = "\t"
	}
	var text strings.Builder
	for i, child := range node.Content {
		if i > 0 {
			text.WriteString(separator)
		}
		text.WriteString(DocumentText(child))
	}
	return text.String()
}
