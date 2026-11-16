package main

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"sync"
	"testing"
	"time"
)

type pipeListener struct {
	connection net.Conn
	closed     chan struct{}
	once       sync.Once
	mu         sync.Mutex
	accepted   bool
}

func (l *pipeListener) Accept() (net.Conn, error) {
	l.mu.Lock()
	if !l.accepted {
		l.accepted = true
		l.mu.Unlock()
		return l.connection, nil
	}
	l.mu.Unlock()
	<-l.closed
	return nil, net.ErrClosed
}
func (l *pipeListener) Close() error   { l.once.Do(func() { close(l.closed) }); return nil }
func (l *pipeListener) Addr() net.Addr { return pipeAddress{} }

type pipeAddress struct{}

func (pipeAddress) Network() string { return "pipe" }
func (pipeAddress) String() string  { return "pipe" }

func pipeRequest(t *testing.T, handler http.Handler, timeout time.Duration) (context.CancelFunc, <-chan struct{}, <-chan error, <-chan error) {
	t.Helper()
	serverConnection, clientConnection := net.Pipe()
	listener := &pipeListener{connection: serverConnection, closed: make(chan struct{})}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(func() { cancel(); _ = clientConnection.Close(); _ = serverConnection.Close(); _ = listener.Close() })
	runnerResult := make(chan error, 1)
	go func() { runnerResult <- runHTTPServer(ctx, &http.Server{Handler: handler}, listener, timeout) }()
	requestResult := make(chan error, 1)
	go func() {
		_, e := io.WriteString(clientConnection, "GET / HTTP/1.1\r\nHost: jot.test\r\nConnection: close\r\n\r\n")
		if e == nil {
			var response *http.Response
			response, e = http.ReadResponse(bufio.NewReader(clientConnection), nil)
			if e == nil {
				_, e = io.Copy(io.Discard, response.Body)
				_ = response.Body.Close()
			}
		}
		requestResult <- e
	}()
	return cancel, listener.closed, runnerResult, requestResult
}

func TestShutdownWaitsForActiveRequest(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	var releaseOnce sync.Once
	t.Cleanup(func() { releaseOnce.Do(func() { close(release) }) })
	cancel, listenerClosed, result, requestResult := pipeRequest(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-release
		_, _ = io.WriteString(w, "finished")
	}), 2*time.Second)
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("request did not start")
	}
	cancel()
	select {
	case <-listenerClosed:
	case <-time.After(time.Second):
		t.Fatal("shutdown did not close listener")
	}
	select {
	case e := <-result:
		t.Fatalf("server runner returned before request finished: %v", e)
	case <-time.After(50 * time.Millisecond):
	}
	releaseOnce.Do(func() { close(release) })
	select {
	case e := <-requestResult:
		if e != nil {
			t.Fatalf("in-flight response failed: %v", e)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("request did not complete")
	}
	select {
	case e := <-result:
		if e != nil {
			t.Fatalf("graceful shutdown failed: %v", e)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("server runner did not finish draining")
	}
}

func TestShutdownTimeoutClosesActiveRequest(t *testing.T) {
	entered := make(chan struct{})
	requestCancelled := make(chan struct{})
	cancel, _, result, _ := pipeRequest(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-r.Context().Done()
		close(requestCancelled)
	}), 25*time.Millisecond)
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("request did not start")
	}
	cancel()
	select {
	case e := <-result:
		if !errors.Is(e, context.DeadlineExceeded) {
			t.Fatalf("expected shutdown timeout, got %v", e)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("server runner did not enforce shutdown timeout")
	}
	select {
	case <-requestCancelled:
	case <-time.After(time.Second):
		t.Fatal("timed-out connection remained open")
	}
}
