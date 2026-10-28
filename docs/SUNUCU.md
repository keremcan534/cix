# Sunucu (Oracle Always Free, Frankfurt)

İlk aşamanın tek sunucusu: sesli odalar (LiveKit), HTTPS (Caddy) ve veritabanı (Postgres). Aylık ücret 0.

| | |
|---|---|
| Adres | `130.61.230.94` · HTTPS: `https://130-61-230-94.sslip.io` (alan adı alınınca değişecek) |
| Makine | VM.Standard.A1.Flex, 1 OCPU / 6 GB, Ubuntu 24.04 ARM (ücretsiz sınır 4 OCPU / 24 GB) |
| Giriş | `ssh -i ~/.ssh/oracle.key ubuntu@130.61.230.94` |
| Dosyalar | `/opt/similar`: `compose.yaml`, `livekit.yaml`, `Caddyfile`, `.env` (anahtarlar, yalnızca sunucuda), `backup.sh`, `backups/` |

## Servisler (`docker compose`, `/opt/similar`)
- **livekit** (`livekit/livekit-server:v1.9.1`, host ağı): HTTP 7880 yalnızca Caddy arkasında; RTC TCP 7881, medya UDP 50000–54999, TURN UDP 3478 ve TURN aktarma UDP 55000–60000.
- **caddy** (`caddy:2.10`): 443'te Let's Encrypt sertifikası, `wss://130-61-230-94.sslip.io` → LiveKit.
- **postgres** (`postgres:17`): yalnızca `127.0.0.1:5432`, dışarıya kapalı.

- **token** (`node:22-alpine`, `127.0.0.1:7890`, kod: `server/token/index.mjs`): Caddy `/token` yolunu buna yollar. `GET /token?room=&identity=&name=` → 2 saatlik LiveKit token'ı. Sır yalnızca sunucudaki `.env` içinde (`LIVEKIT_KEYS`). **Prototip:** giriş kontrolü yok, yalnızca oda/kimlik biçimi, IP başına dakikada 30 istek ve web kaynağı (localhost, `*.github.io`) sınırı var. Gerçek backend'de token yalnızca giriş yapmış kullanıcıya verilmeli.

Kod değişince: `scp -i ~/.ssh/oracle.key server/token/index.mjs ubuntu@130.61.230.94:/opt/similar/token/` ve sunucuda `sudo docker compose restart token`.

## Uygulama bağlantısı
- Web: `app/.env.local` içinde `EXPO_PUBLIC_LIVEKIT_URL=wss://130-61-230-94.sslip.io` varsa `lib/voice-setup.web.ts` gerçek motoru (`lib/livekit-engine.ts`, `livekit-client`) takar; yoksa simülasyon kalır. `.env.local` git'e girmez; GitHub Pages yayınında açmak için değişkenin derlemeye verilmesi gerekir.
- Oda adı LiveKit'te `oda-<oda id>`; kimlik tarayıcı başına rastgele (`similarclub:voice-id`).
- Native: henüz simülasyon. `@livekit/react-native` + config plugin + development build gerekiyor (`docs/ODA_OTURUMU.md`).

## Ağ
Portlar iki yerde açık olmalı: Oracle'da **similar-vcn → Default Security List** ve sunucunun iptables'ı (`netfilter-persistent` ile kalıcı). Açık: TCP 22, 80, 443, 7881, 5349; UDP 3478, 50000–60000.

## Yedek
`/etc/cron.d/similar-backup` her gece 03:30 UTC'de `backup.sh` çalıştırır: `pg_dump` → `backups/similar-YYYY-MM-DD.sql.gz`, 14 gün saklanır. **Henüz sunucu dışına kopyalanmıyor**; Cloudflare R2 hesabı açılınca eklenecek.

## Doğrulama (28.10.2026)
- `https://130-61-230-94.sslip.io` → `OK`; 7881 dışarıdan açık, 5432 kapalı.
- `lk load-test` (2 konuşan, 10 dinleyici, 20 sn, genel adres üzerinden): 20/20 ses akışı, %0 kayıp.
- Web önizleme: oda açınca token alındı, LiveKit'e katıldı; sunucudaki test konuşmacısının sesi tarayıcıda çaldı; oda değiştirince eski odadan çıkıp yenisine katıldı. Tarayıcı mikrofonunun yayını henüz denenmedi.

## Sık işler
```bash
cd /opt/similar
sudo docker compose ps                 # durum
sudo docker compose logs -f livekit    # kayıtlar
sudo docker compose pull && sudo docker compose up -d   # güncelleme
```
Sistem güvenlik güncellemeleri `unattended-upgrades` ile otomatik.

## Sırada
1. Alan adı (ör. `rtc.<alan>`) → `Caddyfile` ve `livekit.yaml` içindeki `turn.domain` güncellenir.
2. Yedekleri Cloudflare R2'ye kopyalama.
3. Backend (giriş, token'ı yalnızca giriş yapana verme, oda/hediye/cüzdan kayıtları) ve native'de gerçek ses (development build).
4. Yük artınca makineyi 4 OCPU / 24 GB'a büyütme (ücretsiz).
