package httpapi

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jot-project/jot/apps/api/internal/config"
	"github.com/jot-project/jot/apps/api/internal/domain"
)

type observedUploadBody struct{ read bool }

func (b *observedUploadBody) Read(p []byte) (int, error) { b.read = true; return 0, io.EOF }
func (b *observedUploadBody) Close() error               { return nil }
func uploadRequest(body io.ReadCloser, ctx context.Context) *http.Request {
	r := httptest.NewRequest("POST", "/api/uploads", nil)
	r.Body = body
	r.Header.Set("Content-Type", "multipart/form-data; boundary=test")
	return r.WithContext(context.WithValue(ctx, userKey, domain.User{ID: "test"}))
}
func TestUploadAdmissionRejectsBeforeReadingBody(t *testing.T) {
	s := NewServer(nil, config.Config{})
	for i := 0; i < maxConcurrentUploads; i++ {
		s.uploadSlots <- struct{}{}
	}
	body := &observedUploadBody{}
	w := httptest.NewRecorder()
	s.upload(w, uploadRequest(body, context.Background()))
	if w.Code != 429 || body.read {
		t.Fatalf("overflow upload code=%d bodyRead=%v", w.Code, body.read)
	}
	if len(s.uploadSlots) != maxConcurrentUploads {
		t.Fatal("overflow changed occupied slots")
	}
}
func TestUploadAdmissionReleasesInvalidAndCancelledRequests(t *testing.T) {
	s := NewServer(nil, config.Config{})
	body := &observedUploadBody{}
	w := httptest.NewRecorder()
	s.upload(w, uploadRequest(body, context.Background()))
	if w.Code != 400 || len(s.uploadSlots) != 0 {
		t.Fatal("invalid upload leaked admission slot")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	body = &observedUploadBody{}
	w = httptest.NewRecorder()
	s.upload(w, uploadRequest(body, ctx))
	if w.Code != 408 || body.read || len(s.uploadSlots) != 0 {
		t.Fatal("cancelled upload read body or retained a slot")
	}
}
