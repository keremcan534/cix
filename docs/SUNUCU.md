# Sunucu (Oracle Always Free, Frankfurt)

İlk aşamanın tek sunucusu: sesli odalar (LiveKit), HTTPS (Caddy), API (giriş, cüzdan, ses token'ı) ve veritabanı (Postgres). Aylık ücret 0.

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
- **api** (`server/api`, Node 22 + `pg`, `127.0.0.1:7890`): Caddy `/api/*` ve `/token` yollarını buna yollar. Açılışta `migrations/*.sql` dosyalarını sırayla bir kez uygular (`schema_migrations`). Sırlar yalnızca sunucudaki `.env` içinde.

## API
| Çağrı | Ne yapar |
|---|---|
| `POST /api/auth/dev` `{deviceKey, name}` | Geliştirme girişi: cihazda tutulan rastgele anahtar (sunucuda yalnızca sha256'sı). İlk seferde hesap açar. 30 günlük oturum döner. |
| `GET /api/me` | Hesap ve bakiyeler (jeton, elmas, oyun bakiyesi) |
| `GET /api/ledger` | Son 50 işlem, her satırda işlem sonrası bakiye |
| `POST /api/wallet/test-topup` `{amount, ref}` | **Yalnızca test** (`ALLOW_TEST_TOPUP=1`): 1.000 / 5.000 / 10.000 jeton, günde en fazla 50.000. Gerçek ödeme geldiğinde kapatılacak. |
| `POST /api/wallet/gift` `{to, amount, ref}` | Gönderenin jetonu alıcıya bire bir elmas olur, tek işlemde (iki satır kilitlenir, id sırasıyla) |
| `GET /token?room=` | Giriş yapmış kullanıcıya 2 saatlik LiveKit token'ı (kimlik = hesap kimliği, ad = hesap adı) |

Giriş dışındaki her çağrı `Authorization: Bearer <oturum>` ister. Cüzdan değişikliklerinde `ref` istek kimliğidir: aynı istek iki kez gelirse (tekrar deneme, çift dokunma, aynı anda iki kopya) bir kez uygulanır. Sınırlar: IP başına dakikada 10 giriş, 120 diğer istek; web'den yalnızca localhost ve `*.github.io` kaynakları.

## Veritabanı (`server/api/migrations/001_users_wallet.sql`)
- **users**: ad, cihaz anahtarı özeti, `coins`, `diamonds`, `game_coins`. Bakiyelerde `CHECK (>= 0)`: kod hatalı olsa bile eksiye düşemez.
- **sessions**: oturum anahtarının özeti, kullanıcı, bitiş zamanı.
- **ledger**: her bakiye değişikliği bir satır (para birimi, miktar, sonraki bakiye, neden, `ref`, karşı taraf). `UNIQUE (user_id, currency, ref)` aynı isteğin iki kez işlenmesini engeller.

Bakiye yalnızca aynı veritabanı işleminde ledger satırıyla birlikte değişir, yani işlem kaydı bakiyeyi her zaman açıklar. SMS ve Google/Apple girişi sonradan `users` tablosuna sütun olarak eklenecek.

Kod değişince: `scp -r -i ~/.ssh/oracle.key server/api ubuntu@130.61.230.94:/opt/similar/` ve sunucuda `sudo docker compose up -d --build api`. Uçtan uca kontrol: `node server/api/smoke-test.mjs` (iki atılabilir test hesabı açar).

## Uygulama bağlantısı
- `app/.env.local`: `EXPO_PUBLIC_API_URL=https://130-61-230-94.sslip.io` ve `EXPO_PUBLIC_LIVEKIT_URL=wss://130-61-230-94.sslip.io`. Bu dosya git'e girmez; yoksa uygulama tamamen yerel prototip verisiyle çalışır. GitHub Pages yayınında açmak için değişkenlerin derlemeye verilmesi gerekir.
- `lib/api.ts`: giriş (cihaz anahtarı ve oturum AsyncStorage'da), bakiye, işlem kaydı, test yüklemesi, hediye, ses token'ı.
- Ayarlar → **Sunucu hesabı** (`app/sunucu-hesabi.tsx`): sunucudaki hesap, bakiye ve işlem kaydı; test yüklemesi ve hesap kimliğiyle hediye gönderme. Uygulamanın diğer ekranları (cüzdan, hediye paneli, casino) **henüz yerel bakiyeyi kullanıyor**.
- Ses (web): `lib/voice-setup.web.ts` gerçek motoru (`lib/livekit-engine.ts`, `livekit-client`) takar; ilk odada cihaz sunucuya giriş yapar, odaya hesap kimliğiyle katılır. Oda adı LiveKit'te `oda-<oda id>`.
- Native: ses henüz simülasyon. `@livekit/react-native` + config plugin + development build gerekiyor (`docs/ODA_OTURUMU.md`).

## Ağ
Portlar iki yerde açık olmalı: Oracle'da **similar-vcn → Default Security List** ve sunucunun iptables'ı (`netfilter-persistent` ile kalıcı). Açık: TCP 22, 80, 443, 7881, 5349; UDP 3478, 50000–60000.

## Yedek
`/etc/cron.d/similar-backup` her gece 03:30 UTC'de `backup.sh` çalıştırır: `pg_dump` → `backups/similar-YYYY-MM-DD.sql.gz`, 14 gün saklanır. **Henüz sunucu dışına kopyalanmıyor**; Cloudflare R2 hesabı açılınca eklenecek.

## Doğrulama (28.10.2026)
- `https://130-61-230-94.sslip.io` → `OK`; 7881 dışarıdan açık, 5432 kapalı.
- `lk load-test` (2 konuşan, 10 dinleyici, 20 sn, genel adres üzerinden): 20/20 ses akışı, %0 kayıp.
- Web önizleme: oda açınca token alındı, LiveKit'e katıldı; sunucudaki test konuşmacısının sesi tarayıcıda çaldı; oda değiştirince eski odadan çıkıp yenisine katıldı. Tarayıcı mikrofonunun yayını henüz denenmedi.
- API (`smoke-test.mjs`, 12/12): kayıt, aynı cihazla aynı hesap, girişsiz istek reddi, test yüklemesi, aynı isteğin bir kez işlenmesi (aynı anda iki kopya dahil), yetersiz bakiye, kendine hediye reddi, işlem kaydı, girişsiz/girişli ses token'ı.
- Web önizleme: Sunucu hesabı ekranında otomatik giriş, 5.000 test yüklemesi, 100 jetonluk hediye; ses odasına hesap kimliğiyle katılım.

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
3. Uygulamanın cüzdan, hediye paneli ve casino ekranlarını sunucu bakiyesine taşımak (hediye fiyatları sunucuda); gerçek ödeme gelince test yüklemesini kapatmak.
4. SMS veya Google/Apple girişi; native'de gerçek ses (development build).
5. Yük artınca makineyi 4 OCPU / 24 GB'a büyütme (ücretsiz).
