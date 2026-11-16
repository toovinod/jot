package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"
)

func runHTTPServer(ctx context.Context, server *http.Server, listener net.Listener, shutdownTimeout time.Duration) error {
	serveErrors := make(chan error, 1)
	go func() { serveErrors <- server.Serve(listener) }()
	var serveError error
	select {
	case serveError = <-serveErrors:
		if errors.Is(serveError, http.ErrServerClosed) {
			serveError = nil
		}
	case <-ctx.Done():
	}
	shutdownContext, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	// Shutdown closes the listener before it drains requests, so await it here.
	shutdownError := server.Shutdown(shutdownContext)
	if shutdownError != nil {
		_ = server.Close()
	}
	return errors.Join(serveError, shutdownError)
}
