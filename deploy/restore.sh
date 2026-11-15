#!/usr/bin/env bash
# Restore a database dump produced by backup.sh.
#   bash deploy/restore.sh deploy/backups/db_2026-10-25_0100.dump
set -euo pipefail
cd "$(dirname "$0")/.."
DB_DUMP=${1:?usage: restore.sh <db_dump>}
COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"

read -r -p "This REPLACES the current database. Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "Aborted."; exit 1; }

$COMPOSE stop api
$COMPOSE exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < "$DB_DUMP"
$COMPOSE start api
echo "✅ Restore complete."
