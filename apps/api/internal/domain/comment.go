package domain

import (
	"time"
)

type Comment struct {
	ID        string    `json:"id"`
	Body      string    `json:"body"`
	Author    User      `json:"author"`
	CreatedAt time.Time `json:"createdAt"`
}
