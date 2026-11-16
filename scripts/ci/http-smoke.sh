#!/usr/bin/env bash
set -euo pipefail
cleanup() {
  kill "${api_pid:-}" "${web_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
apps/api/bin/jot > /tmp/jot-ci-api.log 2>&1 &
api_pid=$!
bun run --cwd apps/web start > /tmp/jot-ci-web.log 2>&1 &
web_pid=$!
for attempt in $(seq 1 60); do
  if curl --fail --silent http://localhost:3000/api/health > /dev/null; then
    bun run test:integration
    exit 0
  fi
  if ! kill -0 "$api_pid" "$web_pid" 2>/dev/null; then
    echo "A service exited before it was ready" >&2
    exit 1
  fi
  sleep 1
done
echo "Services did not become ready within 60 seconds" >&2
exit 1
