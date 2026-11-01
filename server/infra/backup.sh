#!/usr/bin/env bash
# Nightly database backup (/etc/cron.d/similar-backup, 03:30 UTC, as root):
#   pg_dump → /opt/similar/backups/similar-YYYY-MM-DD.sql.gz, kept 14 days on the server.
# BACKUP_RCLONE_REMOTE in .env (e.g. r2:similar-yedek) also copies it off the server with rclone and keeps
# 60 days there. BACKUP_PING_URL is called when it worked, and with /fail when it didn't, so a missed
# backup is noticed (healthchecks.io and similar).
set -euo pipefail
cd "$(dirname "$0")"

# .env is in docker's format (values may contain spaces), so read single keys instead of sourcing it.
get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
DB_USER=$(get POSTGRES_USER)
DB_NAME=$(get POSTGRES_DB)
DB_NAME=${DB_NAME:-$DB_USER}
REMOTE=$(get BACKUP_RCLONE_REMOTE)
PING=$(get BACKUP_PING_URL)

ok=0
finish() {
  if [ -n "$PING" ]; then
    if [ "$ok" = 1 ]; then curl -fsS -m 10 "$PING" >/dev/null || true; else curl -fsS -m 10 "$PING/fail" >/dev/null || true; fi
  fi
}
trap finish EXIT

mkdir -p backups
out="backups/similar-$(date -u +%F).sql.gz"
docker compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges | gzip -9 > "$out.tmp"
gzip -t "$out.tmp"
mv "$out.tmp" "$out"
find backups -name 'similar-*.sql.gz' -mtime +14 -delete

if [ -n "$REMOTE" ]; then
  rclone copy "$out" "$REMOTE"
  rclone delete --min-age 60d "$REMOTE" --include 'similar-*.sql.gz'
fi

ok=1
echo "$(date -u +%FT%TZ) backup $out $(du -h "$out" | cut -f1)${REMOTE:+ → $REMOTE}"
