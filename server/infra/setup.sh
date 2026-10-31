#!/usr/bin/env bash
# A new server from scratch (Ubuntu 22.04/24.04, x86 or ARM), from a copy of the repo on it:
#   sudo DOMAIN=rtc.similarclub.com server/infra/setup.sh
# Installs Docker, opens the ports, puts the files in /opt/similar, makes the secrets once, schedules the
# nightly backup and automatic security updates, and starts everything. Safe to run again: an existing
# .env, the database and the certificates are kept. The domain's A record must already point here.
set -euo pipefail
: "${DOMAIN:?DOMAIN=alan.adı ile çalıştır (ör. DOMAIN=rtc.similarclub.com)}"
[ "$(id -u)" = 0 ] || { echo "root olarak çalıştır (sudo)"; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
DIR=/opt/similar

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl openssl iptables-persistent unattended-upgrades rclone
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
dpkg-reconfigure -f noninteractive unattended-upgrades

# Ports: web (80, 443), LiveKit RTC over TCP (7881), TURN (3478/udp), media and relays (50000–60000/udp).
# On Oracle Cloud add the same ports to the VCN security list too.
for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p tcp --dport 7881" "-p udp --dport 3478" "-p udp --dport 50000:60000"; do
  # shellcheck disable=SC2086
  iptables -C INPUT $rule -j ACCEPT 2>/dev/null || iptables -I INPUT $rule -j ACCEPT
done
netfilter-persistent save

install -d -m 755 "$DIR" "$DIR/backups"
install -m 644 "$HERE/compose.yaml" "$HERE/Caddyfile" "$DIR/"
install -m 755 "$HERE/backup.sh" "$HERE/restore.sh" "$DIR/"
# The API's source; after this, the deploy job (server.yml) keeps it current.
if [ ! -d "$DIR/api" ]; then
  cp -r "$HERE/../api" "$DIR/api"
  rm -rf "$DIR/api/node_modules" "$DIR/api/test"
fi

if [ ! -f "$DIR/.env" ]; then
  key="API$(openssl rand -hex 6)"
  secret=$(openssl rand -hex 32)
  sed -e "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
      -e "s|^LIVEKIT_KEYS=.*|LIVEKIT_KEYS=$key: $secret|" \
      "$HERE/.env.example" > "$DIR/.env"
  chmod 600 "$DIR/.env"
  echo "yeni .env yazıldı: $DIR/.env (SMS, ödeme ve depolama anahtarlarını sonra ekle)"
fi
key=$(grep -E '^LIVEKIT_KEYS=' "$DIR/.env" | cut -d= -f2- | cut -d: -f1)
sed -e "s|__DOMAIN__|$DOMAIN|" -e "s|__LIVEKIT_KEY__|$key|" "$HERE/livekit.yaml" > "$DIR/livekit.yaml"

echo "30 3 * * * root $DIR/backup.sh >> /var/log/similar-backup.log 2>&1" > /etc/cron.d/similar-backup

cd "$DIR"
docker compose up -d --build
echo "hazır. kontrol: curl https://$DOMAIN/api/health  ve  curl https://$DOMAIN/  (OK)"
