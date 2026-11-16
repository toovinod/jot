#!/usr/bin/env bash
set -euo pipefail
web_fixture=""
api_fixture=""
output=""
cleanup() {
  if [ -n "$web_fixture" ]; then rm -f "$web_fixture"; fi
  if [ -n "$api_fixture" ]; then rm -f "$api_fixture"; fi
  if [ -n "$output" ]; then rm -rf "$output"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
web_fixture=$(mktemp apps/web/.env.context.XXXXXX)
api_fixture=$(mktemp apps/api/.env.context.XXXXXX)
output=$(mktemp -d)
printf '%s\n' 'JOT_CONTEXT_TEST=not-a-real-secret' > "$web_fixture"
printf '%s\n' 'JOT_CONTEXT_TEST=not-a-real-secret' > "$api_fixture"
docker buildx build --quiet --file - --output "type=local,dest=$output" . <<'DOCKERFILE'
FROM scratch
COPY apps /apps
COPY .env.example /sample/.env.example
DOCKERFILE
test ! -e "$output/apps/web/$(basename "$web_fixture")"
test ! -e "$output/apps/api/$(basename "$api_fixture")"
test -f "$output/sample/.env.example"
echo "Docker build context excludes nested private environment files."
