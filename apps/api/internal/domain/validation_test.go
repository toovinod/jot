package domain

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTiptapImageDimensions(t *testing.T) {
	cases := []struct {
		name, dimensions string
		valid            bool
	}{
		{"extension defaults", `"width":null,"height":null`, true},
		{"numeric dimensions", `"width":640,"height":480`, true},
		{"pasted HTML dimensions", `"width":"640","height":"480"`, true},
		{"CSS injection", `"width":"expression(alert(1))","height":null`, false},
		{"oversized dimensions", `"width":12001,"height":480`, false},
		{"fractional dimensions", `"width":12.5,"height":480`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			snapshot := EmptySnapshot()
			raw := `{"type":"doc","content":[{"type":"image","attrs":{"src":"https://example.com/photo.png","alt":null,"title":null,` + tc.dimensions + `}}]}`
			if e := json.Unmarshal([]byte(raw), &snapshot.Content); e != nil {
				t.Fatal(e)
			}
			e := ValidateSnapshot(snapshot, false)
			if (e == nil) != tc.valid {
				t.Fatalf("valid=%v error=%v", tc.valid, e)
			}
		})
	}
}

func TestNULRejectedWithoutRejectingEscapedCodeExamples(t *testing.T) {
	s := EmptySnapshot()
	s.Title = "NUL\x00title"
	if ValidateSnapshot(s, false) == nil {
		t.Fatal("NUL title accepted")
	}
	s = EmptySnapshot()
	s.Content.Content[0].Content = []Node{{Type: "text", Text: "body\x00text"}}
	if ValidateSnapshot(s, false) == nil {
		t.Fatal("NUL node text accepted")
	}
	s.Content.Content[0].Content[0].Text = `Literal code: "\u0000"`
	if e := ValidateSnapshot(s, false); e != nil {
		t.Fatalf("literal escaped example rejected: %v", e)
	}
}

func TestSnapshotSummaryPreservesInlineWordsAndBoundsExcerpt(t *testing.T) {
	s := EmptySnapshot()
	s.Content.Content[0].Content = []Node{{Type: "text", Text: "first"}, {Type: "text", Text: "word "}, {Type: "text", Text: strings.Repeat("word ", 440)}}
	summary := SummarizeSnapshot(s)
	if len([]rune(summary.Excerpt)) != 220 || summary.ReadingMinutes != 3 || !strings.HasPrefix(summary.Excerpt, "firstword ") {
		t.Fatalf("incorrect bounded summary: %+v", summary)
	}
}

func TestDocumentTextSeparatesBreaksTasksAndTableCells(t *testing.T) {
	var doc Node
	raw := `{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","content":[{"type":"paragraph","content":[{"type":"text","text":"one"},{"type":"hardBreak"},{"type":"text","text":"two"}]}]},{"type":"taskItem","content":[{"type":"paragraph","content":[{"type":"text","text":"three"}]}]}]},{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"left"}]}]},{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"right"}]}]}]}]}]}`
	if e := json.Unmarshal([]byte(raw), &doc); e != nil {
		t.Fatal(e)
	}
	if got := DocumentText(doc); got != "one\ntwo\nthree\nleft\tright" {
		t.Fatalf("incorrect semantic text: %q", got)
	}
}
