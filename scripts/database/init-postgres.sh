#!/bin/sh
set -eu
psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE jot LOGIN PASSWORD :'app_password';
CREATE DATABASE jot OWNER jot;
SQL
