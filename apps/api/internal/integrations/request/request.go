package request

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type PermanentError struct{ Message string }

func (e PermanentError) Error() string { return e.Message }

type TransientError struct {
	StatusCode int
	RetryAfter time.Duration
}

func (e TransientError) Error() string { return fmt.Sprintf("provider status %d", e.StatusCode) }

func parseRetryAfter(value string, now time.Time) time.Duration {
	if seconds, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64); err == nil {
		if seconds <= 0 {
			return 0
		}
		if seconds > 24*60*60 {
			return 24 * time.Hour
		}
		return time.Duration(seconds) * time.Second
	}
	if deadline, err := http.ParseTime(value); err == nil && deadline.After(now) {
		return min(deadline.Sub(now), 24*time.Hour)
	}
	return 0
}

// PostJSON sends payload as JSON. A json.RawMessage is sent byte for byte, so a persisted request replays exactly.
func PostJSON(ctx context.Context, client *http.Client, endpoint, key, idempotency string, payload any) ([]byte, error) {
	b, raw := payload.(json.RawMessage)
	if !raw {
		var e error
		if b, e = json.Marshal(payload); e != nil {
			return nil, e
		}
	}
	req, e := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(b))
	if e != nil {
		return nil, e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	if idempotency != "" {
		req.Header.Set("Idempotency-Key", idempotency)
	}
	requestClient := *client
	requestClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, e := requestClient.Do(req)
	if e != nil {
		return nil, e
	}
	defer resp.Body.Close()
	out, e := io.ReadAll(io.LimitReader(resp.Body, (2<<20)+1))
	if e != nil {
		return nil, e
	}
	if len(out) > 2<<20 {
		return nil, PermanentError{"Provider response exceeded the size limit"}
	}
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return nil, PermanentError{"Provider redirected the request; check provider configuration"}
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		var providerError struct {
			Name string `json:"name"`
		}
		_ = json.Unmarshal(out, &providerError)
		if resp.StatusCode == http.StatusConflict && req.URL.Hostname() == "api.resend.com" && idempotency != "" && providerError.Name == "concurrent_idempotent_requests" {
			return nil, TransientError{StatusCode: resp.StatusCode, RetryAfter: parseRetryAfter(resp.Header.Get("Retry-After"), time.Now())}
		}
		if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != 429 && resp.StatusCode != 408 {
			return nil, PermanentError{"Provider rejected the request; check provider configuration"}
		}
		return nil, TransientError{StatusCode: resp.StatusCode, RetryAfter: parseRetryAfter(resp.Header.Get("Retry-After"), time.Now())}
	}
	return out, nil
}
