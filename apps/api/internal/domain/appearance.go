package domain

type Appearance struct {
	Font   string   `json:"font"`
	Accent string   `json:"accent"`
	Width  string   `json:"width"`
	Theme  string   `json:"theme"`
	Layout []string `json:"layout"`
}
