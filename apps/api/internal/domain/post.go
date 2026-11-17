package domain

import (
	"encoding/json"
	"time"
)

// Tags always encodes as a JSON array, so snapshots saved before tags existed still return [].
type Tags []string

func (t Tags) MarshalJSON() ([]byte, error) {
	if t == nil {
		return []byte("[]"), nil
	}
	return json.Marshal([]string(t))
}

type Snapshot struct {
	Title       string     `json:"title"`
	Subtitle    string     `json:"subtitle"`
	Slug        string     `json:"slug"`
	Cover       string     `json:"cover"`
	Content     Node       `json:"content"`
	Appearance  Appearance `json:"appearance"`
	Visibility  string     `json:"visibility"`
	Tags        Tags       `json:"tags"`
	CommentsOff bool       `json:"commentsOff,omitempty"`
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
	Views        int64      `json:"views"`
	ScheduledAt  *time.Time `json:"scheduledAt,omitempty"`
	ShareToken   string     `json:"shareToken,omitempty"`
	// ScheduleError says why the worker cleared a schedule; owner responses only.
	ScheduleError string `json:"scheduleError,omitempty"`
}
type RevisionSummary struct {
	ID        int64     `json:"id"`
	Number    int       `json:"number"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"createdAt"`
}

func EmptySnapshot() Snapshot {
	return Snapshot{Content: Node{Type: "doc", Content: []Node{{Type: "paragraph"}}}, Appearance: Appearance{"sans", "orange", "standard", "system", []string{"header", "cover", "content", "author"}}, Visibility: "public", Tags: Tags{}}
}
