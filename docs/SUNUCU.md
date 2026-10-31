# Sunucu (Oracle Always Free, Frankfurt)

İlk aşamanın tek sunucusu: sesli odalar (LiveKit), HTTPS (Caddy), API (giriş, cüzdan, ses token'ı) ve veritabanı (Postgres). Aylık ücret 0.

| | |
|---|---|
| Adres | `130.61.230.94` · HTTPS: `https://130-61-230-94.sslip.io` (alan adı alınınca değişecek) |
| Makine | VM.Standard.A1.Flex, 1 OCPU / 6 GB, Ubuntu 24.04 ARM (ücretsiz sınır 4 OCPU / 24 GB) |
| Giriş | `ssh -i ~/.ssh/oracle.key ubuntu@130.61.230.94` |
| Dosyalar | `/opt/similar`: `compose.yaml`, `livekit.yaml`, `Caddyfile`, `.env` (anahtarlar, yalnızca sunucuda), `backup.sh`, `restore.sh`, `backups/`, `api/` |
| Şablonlar | `server/infra/`: bu dosyaların git'teki hali ve yeni sunucu kurulumu (`setup.sh`). Canlı sunucudaki dosyayı değiştirmeden önce şablonla karşılaştır. |

## Servisler (`docker compose`, `/opt/similar`)
- **livekit** (`livekit/livekit-server:v1.9.1`, host ağı): HTTP 7880 yalnızca Caddy arkasında; RTC TCP 7881, medya UDP 50000–54999, TURN UDP 3478 ve TURN aktarma UDP 55000–60000.
- **caddy** (`caddy:2.10`): 443'te Let's Encrypt sertifikası, `wss://130-61-230-94.sslip.io` → LiveKit.
- **postgres** (`postgres:17`): yalnızca `127.0.0.1:5432`, dışarıya kapalı.
- **api** (`server/api`, Node 22 + `pg`, `127.0.0.1:7890`): Caddy `/api/*` ve `/token` yollarını buna yollar. Açılışta `migrations/*.sql` dosyalarını sırayla bir kez uygular (`schema_migrations`). Sırlar yalnızca sunucudaki `.env` içinde.

## API
| Çağrı | Ne yapar |
|---|---|
| `GET /api/health` | Herkese açık: veritabanı yanıt veriyor mu, çalışan sürüm (commit), açık kalma süresi. Veritabanı yoksa 503. |
| `GET /api/me` | Hesap ve bakiyeler (jeton, elmas, oyun bakiyesi), telefon, SVIP puanı |
| `GET /api/ledger` | Son 50 işlem, her satırda işlem sonrası bakiye |
| `POST /api/wallet/test-topup` `{amount, ref}` | **Yalnızca test** (`ALLOW_TEST_TOPUP=1`): 1.000 / 5.000 / 10.000 jeton, günde en fazla 50.000. |
| `POST /api/wallet/gift` `{to, amount, ref}` | **Yalnızca test** (`ALLOW_TEST_TOPUP=1`): serbest miktarlı aktarım (Sunucu hesabı ekranı). Gerçek hediye `/api/gifts/send`. |

**Giriş ve oturumlar (`auth.mjs`, `sms.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `POST /api/auth/dev` `{deviceKey, name, device}` | Geliştirme girişi: cihazda tutulan rastgele anahtar (sunucuda yalnızca sha256'sı). `ALLOW_DEV_AUTH=0` ile kapanır. |
| `POST /api/auth/otp/start` `{phone}` | SMS ile 6 haneli kod. Kod yalnız özet olarak saklanır, 5 dakika geçerli; 60 saniyede bir yeni kod, numara başına saatte en fazla 5. Yalnız `OTP_COUNTRIES` (varsayılan `+90`) numaraları: yurt dışı pahalı numaralara SMS dolandırıcılığına kapalı. `0532…`, `532…`, `90532…` yazımları kabul edilir. |
| `POST /api/auth/otp/verify` `{phone, code, name?, deviceKey?, device?}` | Doğru kod oturum açar (`isNew`: yeni hesap). 5 yanlış denemeden sonra yeni kod gerekir. Cihazda geliştirme hesabı varsa telefon o hesaba bağlanır, cüzdan korunur. |
| `POST /api/auth/logout` `{all?}` · `GET /api/sessions` · `POST /api/sessions/revoke` `{id}` | Çıkış (bu cihaz veya hepsi); aktif oturumlar (cihaz adı, son kullanım); başka bir oturumu kapatma |

SMS sağlayıcısı `.env` içinde `SMS_PROVIDER`: `netgsm` (Netgsm REST v2, `NETGSM_USER/PASS/HEADER`) veya `twilio` (`TWILIO_SID/TOKEN/FROM`). Boşsa telefonla giriş 503 döner. Mağaza incelemecisi için `OTP_REVIEW_PHONE` + `OTP_REVIEW_CODE` SMS'siz girer.

**Hediye, sıralama, satın alma (`gifts.mjs`, `catalog.mjs`, `purchases.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `GET /api/catalog` | Herkese açık: hediyeler (ad, fiyat, kategori, SVIP sınırı), adetler, jeton paketleri, SVIP eşikleri. Uygulamadaki veriyle aynı olduğu `app/tests/server-catalog.test.ts` ile denetlenir. |
| `POST /api/gifts/send` `{to, giftId, count, room?, ref}` | Fiyatı sunucu belirler; uygulama yalnız hangi hediye ve kaç adet olduğunu söyler. Jeton → alıcıya bire bir elmas, tek işlemde. SVIP sınırlı hediyeler kontrol edilir. Oda dışındaki hediyede alıcıya bildirim gider. |
| `GET /api/rankings?board=wealth\|charm&period=day\|week\|month` | Servet (gönderilen) ve cazibe (alınan) sıralaması, Türkiye saatine göre gün/hafta/ay, ilk 50 |
| `POST /api/wallet/purchase` | Mağaza satın alımı: Google Play (`token`, hizmet hesabıyla Play Developer API) veya App Store (`transactionId`, App Store Server API, önce üretim sonra sandbox). Her makbuz bir kez yüklenir; başka hesapta kullanılmış makbuz reddedilir; paketin ilk alımında ilk alım hediyesi eklenir; alınan jeton SVIP puanı olur. Play ürünü tüketilir, paket tekrar alınabilir. Ürün kimlikleri `coins_<jeton>` (ör. `coins_1000`). |

**Bildirim, yükleme, ses (`push.mjs`, `media.mjs`, `live.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `POST /api/push/register` `{token, platform}` · `/api/push/unregister` | Expo push anahtarı. Yeni mesaj, yeni takipçi ve oda dışı hediye bildirim gönderir; Expo'nun "kayıtlı değil" dediği anahtarlar silinir. |
| `POST /api/media/upload-url` `{kind, contentType, size}` | S3 uyumlu depolamaya (Cloudflare R2 önerilir) 10 dakikalık imzalı yükleme adresi. Tür ve boyut imzaya dahil: profil fotoğrafı en fazla 5 MB (jpg, png, webp, heic), an en fazla 50 MB (mp4 dahil). Dosya API'den geçmez. `S3_*` ayarları yoksa 503. |
| `GET /token?room=&password=` | Giriş yapmış kullanıcıya 2 saatlik LiveKit token'ı (kimlik = hesap kimliği, ad = hesap adı). Sunucudaki odalarda (`oda-<uuid>`) kapanmış oda, odadan atılma, kara liste, oda sahibiyle karşılıklı engel ve şifre kontrol edilir; prototip odaları (`oda-r1` …) eskisi gibi geçer. |
| `POST /api/livekit/webhook` | LiveKit'ten gelen imzalı olaylar (katıldı, ayrıldı, oda bitti): kim hangi odada. Dışarıdan kapalı (Caddy 404), LiveKit 127.0.0.1'den çağırır. |
| `GET /api/rooms/live` | İçinde insan olan her ses odası ve dinleyici sayısı; `GET /api/rooms` da `listeners` döner ve en kalabalıktan sıralar. |

**Profil ve sosyal (`social.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `PATCH /api/me` | Ad, kullanıcı adı (benzersiz, küçük harf), cinsiyet, doğum tarihi (18 yaş altı reddedilir; bir kez girilir), şehir, hakkında, ilgi alanları (uygulamadaki listeden, en fazla 5), fotoğraf adresi (https) |
| `DELETE /api/me` | Hesap silme: kişisel alanlar, telefon numarası, giriş anahtarı, oturumlar, bildirim anahtarları, takipler, engeller, mesajlar ve kendi odaları gider; hesap kimliği, işlem kaydı, hediye ve satın alma kayıtları (mali kayıt) saklanır. Aynı cihaz veya numara yeniden girerse yeni, boş bir hesap açılır. |
| `GET /api/user?id=` | Herkese açık profil (bakiye, doğum tarihi ve rol yok; yalnız yaş), takipçi/takip sayısı, takip ediyor muyum, engelledim mi. Seni engelleyen kişi için 404. |
| `POST /api/follow` `{to, follow}` · `GET /api/following` | Takip et / bırak; engel varsa takip edilemez; yeni takipte bildirim |
| `POST /api/block` `{to, block}` · `GET /api/blocks` | Engelle / kaldır; engel iki yöndeki takipleri bitirir |
| `POST /api/report` `{type, id, reason, note}` | Şikâyet (kullanıcı, oda, mesaj, an); aynı kişinin aynı hedefe ikinci şikâyeti tek sayılır |

**Mesajlar (`messages.mjs`)**: `POST /api/messages` `{to, text, ref}` (aynı `ref` bir kez kaydedilir; engelde reddedilir; kişi başı dakikada 30; alıcıya bildirim) · `GET /api/messages?with=&before=` (en yeniden eskiye, 50'şer) · `GET /api/conversations` (son mesaj ve okunmamış sayısı) · `POST /api/messages/read` `{with}`. Açık uygulamaya iletim yoklama ile, kapalıyken push ile.

**Odalar (`rooms.mjs`)**: `POST /api/rooms` `{title, announcement, roomType, password}` (herkesin en fazla bir açık odası) · `GET /api/rooms` (açık odalar; sahibiyle engelleştiğin odalar hariç) · `GET /api/room?id=` · `POST /api/rooms/close` (yalnız sahip) · `POST /api/rooms/admin` `{room, user, admin}` (yalnız sahip) · `POST /api/rooms/ban` `{room, user, minutes}` (sahip veya yönetici; `minutes: null` kara liste; yönetici sahibi ya da başka yöneticiyi çıkaramaz) · `POST /api/rooms/unban`.

**Moderasyon (`admin.mjs`, yalnız `role` = `moderator` / `admin`)**: `GET /api/admin/reports?status=open` · `POST /api/admin/reports/handle` `{id, status, banDays}` · `POST /api/admin/ban` `{user, days}` (`null` kaldırır). Askıdaki hesabın her çağrısı 403 döner. Yetkili hesabı şimdilik veritabanından atanır: `UPDATE users SET role = 'moderator' WHERE id = '…'`.

Giriş, sağlık ve katalog dışındaki her çağrı `Authorization: Bearer <oturum>` ister. Cüzdan değişikliklerinde `ref` istek kimliğidir: aynı istek iki kez gelirse (tekrar deneme, çift dokunma, aynı anda iki kopya) bir kez uygulanır. Sınırlar (dakikada): IP başına 20 giriş isteği; oturum başına 120 istek; IP başına toplam 600 (operatörler birçok telefonu tek IP'den çıkarır, bu yüzden IP sınırı geniş). Web'den yalnızca localhost, `*.github.io` ve `ALLOWED_ORIGINS`.

Her istek API kaydına tek satır JSON yazar (yöntem, yol, durum, süre; sorgu dizesi ve anahtar yok). Docker kayıtları 5 × 20 MB ile sınırlı. API `SIGTERM`'de elindeki istekleri bitirip kapanır (kurulumda kesinti yok denecek kadar kısa); Postgres yeniden başlarsa bağlantılar kendiliğinden yenilenir.

## Veritabanı (`server/api/migrations/`)
- **users**: ad, cihaz anahtarı özeti, `coins`, `diamonds`, `game_coins`. Bakiyelerde `CHECK (>= 0)`: kod hatalı olsa bile eksiye düşemez.
- **sessions**: oturum anahtarının özeti, kullanıcı, bitiş zamanı.
- **ledger**: her bakiye değişikliği bir satır (para birimi, miktar, sonraki bakiye, neden, `ref`, karşı taraf). `UNIQUE (user_id, currency, ref)` aynı isteğin iki kez işlenmesini engeller.

Bakiye yalnızca aynı veritabanı işleminde ledger satırıyla birlikte değişir, yani işlem kaydı bakiyeyi her zaman açıklar.
- **002_profiles_social**: `users` tablosuna profil alanları, `role`, `banned_until`, `deleted_at`; `follows`, `blocks`, `reports` (şikâyet kuyruğu).
- **003_messages_rooms**: `messages` (gönderen + `ref` benzersiz, sohbet çifti dizini), `rooms` (sahip başına tek açık oda), `room_admins`, `room_bans`.
- **004_launch**: `users.phone` (benzersiz, E.164) ve `users.svip_xp`; `sessions.device` ve `last_seen_at`; `otp_codes` (kod özeti, deneme ve gönderim sayısı), `push_tokens`, `gift_events` (her hediye, sunucu fiyatıyla; sıralamalar buradan), `purchases` (mağaza işlemi başına bir satır, `UNIQUE (platform, transaction_id)`), `room_presence` (LiveKit webhook'larından kim hangi odada).

## Testler ve kurulum
- `server/api/test/`: her dosya boş bir veritabanı açar, API'yi ayrı bir süreç olarak başlatır (`harness.mjs`), HTTP üzerinden dener, sonra veritabanını siler. `api.test.mjs`: giriş, cüzdan, profil, takip/engel, mesaj, oda/ses token'ı, şikâyet/moderasyon, hesap silme. `launch.test.mjs`: sağlık, telefonla giriş (kod API kaydından okunur), oturumlar, mağaza satın alımı, hediye ve sıralama, push (sahte Expo sunucusuyla), LiveKit webhook, imzalı yükleme adresi (AWS'nin örnek imzasıyla), telefonlu hesap silme. Yerelde: `cd server/api && PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=… npm test`.
- `.github/workflows/server.yml`: `server/**` değişince testler Postgres 17 ile çalışır. Ana dala birleşince API sunucuya kurulur (`/opt/similar/api` + `docker compose up -d --build api`); commit kimliği `version.txt`'ye yazılır ve `/api/health` yeni sürümü bildirene kadar beklenir.
- `.github/workflows/uptime.yml`: 15 dakikada bir canlı API'yi (`/api/health`, veritabanı dahil) ve LiveKit'i (`/` → `OK`) yoklar; düşerse GitHub e-posta atar. Alan adı gelince `API_BASE_URL` depo değişkeni. **Bunun için bir kez** GitHub → Settings → Secrets and variables → Actions → `DEPLOY_SSH_KEY` olarak `~/.ssh/oracle.key` içeriği eklenmeli (adres değişirse `DEPLOY_HOST` değişkeni). Anahtar yoksa kurulum adımı atlanır ve elle kurulum (aşağıda) geçerlidir.
- Bütün ayarlar ve açıklamaları: `server/infra/.env.example` (SMS, ödeme, depolama, yedek, sınırlar). Canlı sunucudaki `.env`'e eksik olanlar eklenir; boş bırakılan özellik kapalı kalır.

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
`/etc/cron.d/similar-backup` her gece 03:30 UTC'de `backup.sh` çalıştırır: `pg_dump` → `backups/similar-YYYY-MM-DD.sql.gz` (bütünlüğü denetlenir), 14 gün saklanır. Yeni `backup.sh` (`server/infra/`): `.env`'de `BACKUP_RCLONE_REMOTE` varsa (ör. `r2:similar-yedek`, `rclone config` ile bir kez tanımlanır) dosya sunucu dışına da kopyalanır ve orada 60 gün durur; `BACKUP_PING_URL` varsa (healthchecks.io gibi) yedek gelmeyince haber verir. **Canlı sunucuda henüz eski betik var**; R2 açılınca yenisiyle değiştirilecek.

Geri yükleme (`restore.sh`): `./restore.sh --check backups/…sql.gz` yedeği geçici bir veritabanına açıp sayar ve siler (ayda bir denenmeli); `./restore.sh backups/…sql.gz` canlı veritabanını değiştirir (önce onay ister ve şimdiki hali ayrı bir dosyaya saklar).

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

## Canlı sunucuya bu sürümle gelecekler
Kod kurulumla (`server.yml`) gider; şunlar sunucuda bir kez elle yapılır:
1. `livekit.yaml`'a webhook bölümü (dinleyici sayıları için): `webhook: {api_key: <LIVEKIT_KEYS'teki anahtar adı>, urls: [http://127.0.0.1:7890/api/livekit/webhook]}`, sonra `docker compose restart livekit`.
2. `compose.yaml`'da API'ye `LIVEKIT_API_URL: http://127.0.0.1:7880` (kaçırılan webhook'ları temizler) ve servislere kayıt sınırı (`server/infra/compose.yaml`'daki `logging`).
3. `Caddyfile`'a webhook yolunu dışarıya kapatan blok (`server/infra/Caddyfile`).
4. Hesaplar geldikçe `.env`'e: `SMS_PROVIDER` ve anahtarları, `GOOGLE_SERVICE_ACCOUNT`, `APPLE_IAP_*`, `S3_*`, `BACKUP_*`. Telefonla giriş açılınca `ALLOW_DEV_AUTH=0`, mağaza ödemesi açılınca `ALLOW_TEST_TOPUP=0`.

## Sırada
1. Alan adı (ör. `rtc.<alan>`) → `.env` `DOMAIN`, `Caddyfile`, `livekit.yaml` `turn.domain`, `API_BASE_URL` değişkeni.
2. Yedekleri Cloudflare R2'ye kopyalama (yeni `backup.sh`).
3. Uygulamanın ekranlarını sunucuya bağlamak: giriş (telefon), cüzdan, hediye paneli (`/api/gifts/send`), sıralamalar, mesajlar, oda listesi, push kaydı, fotoğraf yükleme; istemci fonksiyonları `app/src/lib/api.ts`'de hazır.
4. Native'de gerçek ses ve uygulama içi satın alma (development build).
5. Yük artınca makineyi 4 OCPU / 24 GB'a büyütme (ücretsiz).
