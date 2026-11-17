package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeErrorsExplainTheProblem(t *testing.T) {
	type body struct {
		Title string `json:"title"`
		Count int    `json:"count"`
	}
	cases := []struct {
		name, input, code, contains string
		status                      int
		limit                       int64
	}{
		{"unknown field", `{"title":"a","tags":[]}`, "unknown_field", `"tags"`, 400, 1 << 20},
		{"wrong type", `{"count":"three"}`, "invalid_request", `"count"`, 400, 1 << 20},
		{"broken json", `{"title":`, "invalid_request", "not valid JSON", 400, 1 << 20},
		{"too large", `{"title":"` + strings.Repeat("a", 200) + `"}`, "too_large", "too large", 413, 64},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r := httptest.NewRequest("POST", "/", strings.NewReader(c.input))
			var v body
			if decodeJSONBodyLimit(w, r, &v, c.limit) {
				t.Fatal("expected decode to fail")
			}
			var out map[string]string
			if e := json.Unmarshal(w.Body.Bytes(), &out); e != nil {
				t.Fatal(e)
			}
			if w.Code != c.status || out["code"] != c.code || !strings.Contains(out["error"], c.contains) {
				t.Fatalf("got %d %v", w.Code, out)
			}
		})
	}
}
