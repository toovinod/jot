#!/bin/sh
set -eu
if [ "${APP_ENV:-development}" = production ]; then
  if [ -z "${APP_DB_PASSWORD:-}" ] || [ "$APP_DB_PASSWORD" = jot ] \
    || [ -z "${POSTGRES_PASSWORD:-}" ] || [ "$POSTGRES_PASSWORD" = jot-admin-development ]; then
    echo "Production database passwords must replace the development defaults." >&2
    exit 1
  fi
fi
if [ "${1:-}" = --check ]; then
  exit 0
fi
exec docker-entrypoint.sh "$@"
