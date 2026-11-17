package domain

import (
	"time"
)

type Comment struct {
	ID        string    `json:"id"`
	Body      string    `json:"body"`
	Author    User      `json:"author"`
	CreatedAt time.Time `json:"createdAt"`
	ParentID  *string   `json:"parentId,omitempty"`
}

// BlockedReader is a reader the author blocked from commenting on any of the author's posts.
type BlockedReader struct {
	User      User      `json:"user"`
	BlockedAt time.Time `json:"blockedAt"`
}
