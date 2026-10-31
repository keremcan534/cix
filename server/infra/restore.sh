#!/usr/bin/env bash
# Restoring a backup (run in /opt/similar as root):
#   ./restore.sh --check backups/similar-2026-10-30.sql.gz   loads it into a scratch database, counts the
#                                                           rows, drops it. The live data is not touched.
#   ./restore.sh backups/similar-2026-10-30.sql.gz           REPLACES the live database with the backup:
#                                                           stops the API, recreates the database, loads
#                                                           the file, starts the API. Asks first.
# Try --check once a month: a backup is only proven when it has been restored.
set -euo pipefail
cd "$(dirname "$0")"

get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
DB_USER=$(get POSTGRES_USER)
DB_NAME=$(get POSTGRES_DB)
DB_NAME=${DB_NAME:-$DB_USER}
psql() { docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -U "$DB_USER" "$@"; }

check=0
if [ "${1:-}" = "--check" ]; then check=1; shift; fi
file=${1:?kullanım: ./restore.sh [--check] backups/similar-YYYY-MM-DD.sql.gz}
[ -f "$file" ] || { echo "dosya yok: $file"; exit 1; }
gzip -t "$file"

if [ "$check" = 1 ]; then
  scratch=restore_check
  psql -d postgres -c "DROP DATABASE IF EXISTS $scratch" -c "CREATE DATABASE $scratch"
  gunzip -c "$file" | psql -d "$scratch" >/dev/null
  psql -d "$scratch" -At -c "SELECT 'kullanıcı ' || count(*) FROM users" -c "SELECT 'işlem kaydı ' || count(*) FROM ledger" -c "SELECT 'son işlem ' || coalesce(max(created_at)::text, '-') FROM ledger"
  psql -d postgres -c "DROP DATABASE $scratch"
  echo "yedek sağlam: $file"
  exit 0
fi

read -r -p "Canlı veritabanı ($DB_NAME) $file ile DEĞİŞTİRİLECEK. Yazarak onayla (evet): " answer
[ "$answer" = "evet" ] || { echo "vazgeçildi"; exit 1; }
# The current state first, under its own name (not today's backup, which may be the file being restored),
# in case the wrong file was chosen.
mkdir -p backups
before="backups/before-restore-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges | gzip > "$before"
echo "şimdiki hali saklandı: $before"
docker compose stop api
psql -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\""
gunzip -c "$file" | psql -d "$DB_NAME" >/dev/null
docker compose start api
echo "geri yüklendi: $file"
