package domain

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func document(t *testing.T, raw string) Node {
	t.Helper()
	var n Node
	if e := json.Unmarshal([]byte(raw), &n); e != nil {
		t.Fatal(e)
	}
	return n
}

func TestRenderHTMLEscapesTextAndEmitsOnlySafeURLs(t *testing.T) {
	doc := document(t, `{"type":"doc","content":[
		{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"<script>alert(1)</script>"}]},
		{"type":"paragraph","content":[{"type":"text","text":"bad","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]},{"type":"text","text":" good","marks":[{"type":"bold"},{"type":"link","attrs":{"href":"https://example.com/?a=\"x\""}}]}]},
		{"type":"image","attrs":{"src":"/media/abc.png","alt":"\" onerror=\"x"}},
		{"type":"image","attrs":{"src":"data:image/svg+xml,<svg/>"}},
		{"type":"codeBlock","attrs":{"language":"go"},"content":[{"type":"text","text":"if a < b {}"}]},
		{"type":"codeBlock","attrs":{"language":"x\" onclick=\"y"},"content":[{"type":"text","text":"plain"}]},
		{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableHeader","attrs":{"colspan":2},"content":[{"type":"paragraph","content":[{"type":"text","text":"head"}]}]}]}]}
	]}`)
	got := RenderHTML(doc, "https://jot.example")
	for _, want := range []string{
		"<h2>&lt;script&gt;alert(1)&lt;/script&gt;</h2>",
		`<p>bad<a href="https://example.com/?a=&#34;x&#34;"><strong> good</strong></a></p>`,
		`<img src="https://jot.example/media/abc.png" alt="&#34; onerror=&#34;x"`,
		`<pre><code class="language-go">if a &lt; b {}</code></pre>`,
		"<pre><code>plain</code></pre>",
		`<th colspan="2"><p>head</p></th>`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in %s", want, got)
		}
	}
	if strings.Contains(got, "javascript:") || strings.Contains(got, "data:") || strings.Contains(got, "<script") {
		t.Fatalf("unsafe output: %s", got)
	}
}

func TestRenderMarkdownKeepsStructureAndLanguage(t *testing.T) {
	doc := document(t, `{"type":"doc","content":[
		{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Title *star*"}]},
		{"type":"paragraph","content":[{"type":"text","text":"bold","marks":[{"type":"bold"}]},{"type":"text","text":" and "},{"type":"text","text":"link","marks":[{"type":"link","attrs":{"href":"https://example.com/a b"}}]},{"type":"text","text":" "},{"type":"text","text":"x`+"`"+`y","marks":[{"type":"code"}]}]},
		{"type":"orderedList","attrs":{"start":3},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"three"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"nested"}]}]}]}]}]},
		{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"done"}]}]}]},
		{"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"quoted"}]}]},
		{"type":"codeBlock","attrs":{"language":"sql"},"content":[{"type":"text","text":"SELECT 1;"}]},
		{"type":"image","attrs":{"src":"/media/abc.png","alt":"cover"}},
		{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"a|b"}]}]}]},{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"c"}]}]}]}]}
	]}`)
	got := RenderMarkdown(doc, "https://jot.example")
	for _, want := range []string{
		`### Title \*star\*`,
		"**bold** and [link](<https://example.com/a%20b>) `` x`y ``",
		"3. three\n   - nested",
		"- [x] done",
		"> quoted",
		"```sql\nSELECT 1;\n```",
		"![cover](<https://jot.example/media/abc.png>)",
		"| a\\|b |\n| --- |\n| c |",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in:\n%s", want, got)
		}
	}
}

func TestTagValidationAndLegacySnapshots(t *testing.T) {
	cases := []struct {
		tags  Tags
		valid bool
	}{
		{nil, true},
		{Tags{"go", "postgres-14"}, true},
		{Tags{"a", "b", "c", "d", "e"}, true},
		{Tags{"a", "b", "c", "d", "e", "f"}, false},
		{Tags{"Go"}, false},
		{Tags{"has space"}, false},
		{Tags{""}, false},
		{Tags{strings.Repeat("a", 25)}, false},
		{Tags{"go", "go"}, false},
	}
	for _, tc := range cases {
		s := EmptySnapshot()
		s.Tags = tc.tags
		if e := ValidateSnapshot(s, false); (e == nil) != tc.valid {
			t.Fatalf("tags %v valid=%v error=%v", tc.tags, tc.valid, e)
		}
	}
	var legacy Snapshot
	if e := json.Unmarshal([]byte(`{"title":"old","content":{"type":"doc"}}`), &legacy); e != nil {
		t.Fatal(e)
	}
	out, _ := json.Marshal(legacy)
	if !strings.Contains(string(out), `"tags":[]`) || strings.Contains(string(out), "commentsOff") {
		t.Fatalf("legacy snapshot JSON: %s", out)
	}
	summary, _ := json.Marshal(SummarizeSnapshot(legacy))
	if !strings.Contains(string(summary), `"tags":[]`) {
		t.Fatalf("legacy summary JSON: %s", summary)
	}
	if EmptySnapshot().Appearance.Font != "sans" {
		t.Fatal("default font must be sans")
	}
}

func TestRenderMarkdownFencesLongBacktickRunsInLinearTime(t *testing.T) {
	text := "a``b" + strings.Repeat("`", MaxDocumentText-4)
	doc := Node{Type: "doc", Content: []Node{{Type: "codeBlock", Content: []Node{{Type: "text", Text: text}}}}}
	start := time.Now()
	got := RenderMarkdown(doc, "https://jot.example")
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("fence building took %s", elapsed)
	}
	fence := strings.Repeat("`", MaxDocumentText-3)
	if got != fence+"\n"+text+"\n"+fence+"\n" {
		t.Fatal("fence is not one backtick longer than the longest run")
	}
	if got := RenderMarkdown(Node{Type: "doc", Content: []Node{{Type: "codeBlock", Content: []Node{{Type: "text", Text: "x"}}}}}, ""); got != "```\nx\n```\n" {
		t.Fatalf("short code block fence changed: %q", got)
	}
}
