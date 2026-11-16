package domain

import (
	"time"
)

type Snapshot struct {
	Title      string     `json:"title"`
	Subtitle   string     `json:"subtitle"`
	Slug       string     `json:"slug"`
	Cover      string     `json:"cover"`
	Content    Node       `json:"content"`
	Appearance Appearance `json:"appearance"`
	Visibility string     `json:"visibility"`
}
type Post struct {
	Snapshot
	ID           string     `json:"id"`
	Author       User       `json:"author"`
	ReservedSlug string     `json:"reservedSlug,omitempty"`
	Revision     int        `json:"revision"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	PublishedAt  *time.Time `json:"publishedAt,omitempty"`
	Published    *Snapshot  `json:"published,omitempty"`
	Likes        int        `json:"likes"`
	Comments     int        `json:"comments"`
}
type RevisionSummary struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"createdAt"`
}

func EmptySnapshot() Snapshot {
	return Snapshot{Content: Node{Type: "doc", Content: []Node{{Type: "paragraph"}}}, Appearance: Appearance{"serif", "orange", "standard", "system", []string{"header", "cover", "content", "author"}}, Visibility: "public"}
}
