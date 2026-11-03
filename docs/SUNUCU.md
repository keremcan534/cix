# Sunucu (Oracle Always Free, Frankfurt)

İlk aşamanın tek sunucusu: sesli odalar (LiveKit), HTTPS (Caddy), API (giriş, cüzdan, ses token'ı) ve veritabanı (Postgres). Aylık ücret 0.

| | |
|---|---|
| Adres | `130.61.230.94` · HTTPS: `https://130-61-230-94.sslip.io` (alan adı alınınca değişecek) |
| Makine | VM.Standard.A1.Flex, 1 OCPU / 6 GB, Ubuntu 24.04 ARM (ücretsiz sınır 4 OCPU / 24 GB) |
| Giriş | `ssh -i ~/.ssh/oracle.key ubuntu@130.61.230.94` |
| Dosyalar | `/opt/similar`: `compose.yaml`, `livekit.yaml`, `Caddyfile`, `.env` (anahtarlar, yalnızca sunucuda), `backup.sh`, `restore.sh`, `backups/`, `api/`, `finance/` (finans paneli) |
| Şablonlar | `server/infra/`: bu dosyaların git'teki hali ve yeni sunucu kurulumu (`setup.sh`). `compose.yaml`, `Caddyfile` ve `backup.sh` otomatik kurulumla (`server.yml`) git'teki hale getirilir; önceki hali `<dosya>.bak` olarak kalır. `.env` ve `livekit.yaml`'a dokunulmaz. |

## Servisler (`docker compose`, `/opt/similar`)
- **livekit** (`livekit/livekit-server:v1.9.1`, host ağı): HTTP 7880 yalnızca Caddy arkasında; RTC TCP 7881, medya UDP 50000–54999, TURN UDP 3478 ve TURN aktarma UDP 55000–60000.
- **caddy** (`caddy:2.10`): 443'te Let's Encrypt sertifikası, `wss://130-61-230-94.sslip.io` → LiveKit.
- **postgres** (`postgres:17`): yalnızca `127.0.0.1:5432`, dışarıya kapalı.
- **api** (`server/api`, Node 22 + `pg`, `127.0.0.1:7890`): Caddy `/api/*` ve `/token` yollarını buna yollar. Açılışta `migrations/*.sql` dosyalarını sırayla bir kez uygular (`schema_migrations`). Sırlar yalnızca sunucudaki `.env` içinde.
- **finance** (Finance Control, Node 24 + SQLite, `127.0.0.1:4300`, `financedata` birimi): finans paneli, `https://panel.130-61-230-94.sslip.io`. Ayrıntı: aşağıda **Finans paneli**.

## API
| Çağrı | Ne yapar |
|---|---|
| `GET /api/health` | Herkese açık: veritabanı yanıt veriyor mu, çalışan sürüm (commit), açık kalma süresi ve `warnings` (alarm kodları, yalnız kod; boşsa her şey yolunda). Veritabanı yoksa 503. Ayrıntı: **Hata izleme ve acil durum**. |
| `GET /api/config` | Herkese açık, 30 sn önbellekli: uygulamanın en düşük sürümü (`APP_MIN_VERSION`), güncelleme adresi (`APP_UPDATE_URL`), duyuru (`APP_NOTICE`) ve geçici kapalı özellikler (`FEATURES_OFF`). Kapalı özelliğin çağrıları 503 "Bu özellik geçici olarak kapalı" döner (`features.mjs`). |
| `GET /api/admin/alerts` | Yalnız yönetici: alarmların ayrıntısı (değer, eşik, hangi hesap), eşikler, finans aktarımının durumu, son 5xx hataları. |
| `GET /api/me` | Hesap ve bakiyeler (jeton, elmas, oyun bakiyesi), telefon, İnci puanı |
| `GET /api/ledger` | Son 50 işlem, her satırda işlem sonrası bakiye |
| `POST /api/wallet/test-topup` `{amount, ref}` | **Yalnızca test** (`ALLOW_TEST_TOPUP=1`): 1.000 / 5.000 / 10.000 jeton, günde en fazla 50.000. |
| `POST /api/wallet/gift` `{to, amount, ref}` | **Yalnızca test** (`ALLOW_TEST_TOPUP=1`): serbest miktarlı aktarım (Sunucu hesabı ekranı). Gerçek hediye `/api/gifts/send`. |
| `POST /api/wallet/spend` `{amount, reason, ref}` | Uygulama içi jetonla alım (VIP, mağaza, oyun girişi): jetonu sunucu bir kez düşer, yetmezse 409. Ne alındığını (hak) henüz sunucu tutmaz; uygulama tutar. |

**Giriş ve oturumlar (`auth.mjs`, `sms.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `POST /api/auth/dev` `{deviceKey, name, device}` | Geliştirme girişi: cihazda tutulan rastgele anahtar (sunucuda yalnızca sha256'sı). `ALLOW_DEV_AUTH=0` ile kapanır. |
| `POST /api/auth/otp/start` `{phone}` | SMS ile 6 haneli kod. Kod yalnız özet olarak saklanır, 5 dakika geçerli; 60 saniyede bir yeni kod, numara başına saatte en fazla 5. Yalnız `OTP_COUNTRIES` (varsayılan `+90`) numaraları: yurt dışı pahalı numaralara SMS dolandırıcılığına kapalı. `0532…`, `532…`, `90532…` yazımları kabul edilir. |
| `POST /api/auth/otp/verify` `{phone, code, name?, deviceKey?, device?}` | Doğru kod oturum açar (`isNew`: yeni hesap). 5 yanlış denemeden sonra yeni kod gerekir. Cihazda geliştirme hesabı varsa telefon o hesaba bağlanır, cüzdan korunur. |
| `POST /api/auth/google` `{idToken, deviceKey?, device?}` | Google ile giriş: Google'ın verdiği kimlik belgesi sunucuda doğrulanır (Google'ın imza anahtarları, `GOOGLE_CLIENT_IDS`, süre, onaylı e-posta). Her Google hesabı tek bir hesaba bağlıdır (`isNew`: yeni hesap). Cihazda geliştirme hesabı varsa Google o hesaba bağlanır, cüzdan korunur. `GOOGLE_CLIENT_IDS` boşsa 503. Ayrıntı: **Google ile giriş**. |
| `POST /api/auth/logout` `{all?}` · `GET /api/sessions` · `POST /api/sessions/revoke` `{id}` | Çıkış (bu cihaz veya hepsi); aktif oturumlar (cihaz adı, son kullanım); başka bir oturumu kapatma |

SMS sağlayıcısı `.env` içinde `SMS_PROVIDER`: `netgsm` (Netgsm REST v2, `NETGSM_USER/PASS/HEADER`) veya `twilio` (`TWILIO_SID/TOKEN/FROM`). Boşsa telefonla giriş 503 döner. Mağaza incelemecisi için `OTP_REVIEW_PHONE` + `OTP_REVIEW_CODE` SMS'siz girer.

**Hediye, sıralama, satın alma (`gifts.mjs`, `catalog.mjs`, `purchases.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `GET /api/catalog` | Herkese açık: hediyeler (ad, fiyat, kategori, İnci sınırı), adetler, jeton paketleri, İnci eşikleri ve `purchases` (`testTopup`: ücretsiz test paketleri açık mı, `stores.android` / `stores.ios`: bu sunucu o mağazanın ödemesini doğrulayabiliyor mu). Uygulama gerçek paketleri yalnız doğrulanabilen mağazada, test paketlerini yalnız `testTopup` açıkken gösterir. Uygulamadaki veriyle aynı olduğu `app/tests/server-catalog.test.ts` ile denetlenir. |
| `POST /api/gifts/send` `{to, giftId, count, room?, ref}` | Fiyatı sunucu belirler; uygulama yalnız hangi hediye ve kaç adet olduğunu söyler. Jeton → alıcıya bire bir elmas, tek işlemde. İnci sınırlı hediyeler kontrol edilir. Oda dışındaki hediyede alıcıya bildirim gider. |
| `GET /api/rankings?board=wealth\|charm&period=day\|week\|month` | Cömertlik (gönderilen) ve Yankı (alınan) sıralaması, Türkiye saatine göre gün/hafta/ay, ilk 50 |
| `POST /api/wallet/purchase` | Mağaza satın alımı: Google Play (`token`, hizmet hesabıyla Play Developer API) veya App Store (`transactionId`, App Store Server API, önce üretim sonra sandbox). Her makbuz bir kez yüklenir; başka hesapta kullanılmış makbuz reddedilir; paketin ilk alımında ilk alım hediyesi eklenir; alınan jeton İnci puanı olur. Play ürünü tüketilir, paket tekrar alınabilir. Ürün kimlikleri `coins_<jeton>` (ör. `coins_1000`). |

**Jeton kaynağı, elmas kilidi, Jeton Noktası (`wallet.mjs`, `jeton.mjs`)**

Her jeton yüklemesi bir **parti** olur: kanal (Google Play, App Store, İlk alım hediyesi, Jeton Noktası, Toptan alım, Elmas bozdurma, Elmastan çevrildi, Önceki bakiye), tarih, kimden geldiği ve kilit süresi. Harcamada önce mağaza jetonu kullanılır (`COIN_SPEND_ORDER=fifo` ile en eski önce); defter satırı hangi partilerden düştüğünü yazar. Hediyede alıcının elması, ödeyen partinin kilidini alır: **mağaza jetonu 7 gün** (`LOCK_DAYS_STORE`, iade süresi), **Jeton Noktası jetonu 1 gün** (`LOCK_DAYS_JETON`). Jeton Noktası mağazadan aldığı jetonu satarsa kilit 7 gün kalır (mağaza jetonu bankadan geçirilerek kısaltılamaz). Kilitli elmas bakiyede görünür ama çevrilemez, bozdurulamaz, çekilemez.

| Çağrı | Ne yapar |
|---|---|
| `GET /api/wallet/earnings` | Gelir: toplam elmas, **çekilebilir**, **kilitli** ve kilitlerin listesi (miktar, kanal, kimden, hangi hediye, açılış zamanı). |
| `GET /api/wallet/coins` | Jetonlarım nereden geldi: kanal başına kalan, son 50 parti. |
| `POST /api/wallet/exchange` `{diamonds, ref}` | Gelir > Çevir: yalnız çekilebilir elmas; çıkan jeton "Elmastan çevrildi" partisi (1 gün kilit). |
| `GET /api/jeton/banks` · `GET /api/jeton/transfers` | Jeton Noktası hesapları; benim gönderdiğim/aldığım aktarımlar. |
| `POST /api/jeton/transfer` `{to, coins, paymentRef?, note?, ref}` | Yalnız Jeton Noktası: parası dışarıda ödenmiş jetonu kişiye aktarır (`paymentRef`: dekont/havale no). |
| `POST /api/jeton/sell-diamonds` `{bank, diamonds, ref}` | Anında bozdur: yayıncı çekilebilir elmasını Jeton Noktası'na satar; banka değer + %3 jeton alır, yayıncıya değeri (TL) öder. |
| `POST /api/admin/jeton/bank` `{user, enabled}` | Yalnız yönetici (`admin`): hesabı Jeton Noktası yapar / geri alır. Moderatör paraya dokunamaz. |
| `POST /api/admin/jeton/wholesale` `{bank, coins, paymentRef, ref}` | Yalnız yönetici: yönetimden Jeton Noktası'na toptan jeton (%2 indirimli fiyat sunucuda hesaplanır; dekont zorunlu). |
| `POST /api/admin/purchases/refund` `{purchase}` | Yalnız yönetici: mağaza iadesi/ters ibraz. Satın alınan jetondan harcanmamış kısmı (Jeton Noktası üzerinden geçmiş olsa da) ve henüz kilitli elmasları geri alır; kilidi açılmış elmas `unrecoveredDiamonds` olarak raporlanır. İnci puanı düşer. |
| `GET /api/admin/wallet/audit?user=` | Yalnız yönetici: bir hesabın bütün para kaydı (satın almalar, partiler, kilitler, aktarımlar, defter, yönetici işlemleri). Anlaşmazlıkta buradan bakılır. |

Kim yükledi, kim aldı, kim aktardı, kimin adına, hangi IP'den, hangi dekontla: aktarımlar `coin_transfers`'ta, yönetici işlemleri `audit_events`'te, her bakiye değişikliği `ledger`'da (kanal, işlemi yapan, ayrıntı). Bu üç tablo **değiştirilemez ve silinemez** (veritabanı tetikleyicisi; API dahil).

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
| `DELETE /api/me` | Hesap silme (uygulamada Ayarlar → Hesabı sil, iki kez sorulur): kişisel alanlar, telefon numarası, giriş anahtarı, Google bağlantısı, oturumlar, bildirim anahtarları, takipler, engeller, mesajlar ve kendi odaları gider; hesap kimliği, işlem kaydı, hediye ve satın alma kayıtları (mali kayıt) saklanır. Aynı cihaz, numara veya Google hesabı yeniden girerse yeni, boş bir hesap açılır. |
| `GET /api/user?id=` | Herkese açık profil (bakiye, doğum tarihi ve rol yok; yalnız yaş), takipçi/takip sayısı, takip ediyor muyum, engelledim mi. Seni engelleyen kişi için 404. |
| `POST /api/follow` `{to, follow}` · `GET /api/following` | Takip et / bırak; engel varsa takip edilemez; yeni takipte bildirim |
| `POST /api/block` `{to, block}` · `GET /api/blocks` | Engelle / kaldır; engel iki yöndeki takipleri bitirir |
| `POST /api/report` `{type, id, reason, note}` | Şikâyet (kullanıcı, oda, mesaj, an); aynı kişinin aynı hedefe ikinci şikâyeti tek sayılır. Uygulamada profil, sohbet ve oda menüsündeki **Şikâyet et** sebep sordurup buraya gönderir (sohbette mesaj, odada oda adı not olarak eklenir). |

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
- **006_coin_sources**: `users.role`'e `coins_bank`; `coin_lots` (jeton partileri: kanal, kalan, kilit, satın alma/aktarım/kaynak parti), `diamond_locks` (hediye elmasının kilidi, iade edilince `reversed`), `coin_transfers` (toptan, Jeton Noktası satışı, elmas bozdurma; dekont, işlemi yapan, IP), `audit_events` (yönetici işlemleri), `ledger`'a `channel`, `actor`, `detail`. Eski bakiyeler "Önceki bakiye" partisi olur (7 gün kilit). (`005` ajans göçü için ayrıldı.)
- **009_sign_in_identities**: `auth_identities` (giriş sağlayıcısı + o sağlayıcıdaki kimlik → hesap; şimdilik yalnız `google`). Bir Google hesabı tek hesaba, bir hesap tek Google hesabına bağlanır; hesap silinince satır da silinir.

## Testler ve kurulum
- `server/api/test/`: her dosya boş bir veritabanı açar, API'yi ayrı bir süreç olarak başlatır (`harness.mjs`), HTTP üzerinden dener, sonra veritabanını siler. `api.test.mjs`: giriş, cüzdan, profil, takip/engel, mesaj, oda/ses token'ı, şikâyet/moderasyon, hesap silme. `launch.test.mjs`: sağlık, telefonla giriş (kod API kaydından okunur), oturumlar, mağaza satın alımı, hediye ve sıralama, push (sahte Expo sunucusuyla), LiveKit webhook, imzalı yükleme adresi (AWS'nin örnek imzasıyla), telefonlu hesap silme. `coins.test.mjs`: jeton kanalı ve partiler, 7 gün / 1 gün elmas kilidi, Çevir'in kilitli elmasa kapalı olması, Jeton Noktası açma (yalnız yönetici), toptan alım, Jeton Noktası satışı (aynı anda iki kopya dahil), kilit mirası, harcama sırası, anında bozdur, iade (Jeton Noktası üzerinden geçen dahil), değiştirilemez kayıtlar, denetim görünümü, partilerin bakiyeye eşitliği. `config.test.mjs`: `/api/config` ve önbelleği, kapalı özelliklerin 503'ü, `warnings`, `/api/admin/alerts` yetkisi. `alerts.test.mjs`: disk, 5xx, finans aktarımı ve para alarmları; sahte bir Sentry sunucusuna giden raporlar (telefon, oturum anahtarı yok; aynı hata bir kez). `reporting.test.mjs`: Sentry adresi, maskeleme, hata satırları. `google.test.mjs`: Google ile giriş (sahte Google anahtarlarıyla): yeni hesap, aynı Google hesabının aynı hesaba dönmesi, Android istemcisi, sahte/süresi geçmiş/başka uygulamaya ait belgelerin reddi, cihaz hesabına bağlama, aynı anda iki istek, askıdaki hesap, silinen hesap. `google-off.test.mjs`: ayar boşken 503 ve giriş sınırı. Yerelde: `cd server/api && PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=… npm test`.
- `.github/workflows/server.yml`: `server/**` değişince testler Postgres 17 ile çalışır. Ana dala birleşince sunucuya kurulur: `compose.yaml`, `Caddyfile`, `backup.sh`, API (`/opt/similar/api`) ve finans paneli (`/opt/similar/finance`), sonra `docker compose up -d --build` ve Caddy yeniden yüklenir; commit kimliği `version.txt`'ye yazılır ve `/api/health` yeni sürümü bildirene kadar beklenir.
- `.github/workflows/uptime.yml`: 15 dakikada bir canlı API'yi (`/api/health`, veritabanı dahil) ve LiveKit'i (`/` → `OK`) yoklar; düşerse ya da `warnings` boş değilse GitHub e-posta atar. Alan adı gelince `API_BASE_URL` depo değişkeni. **Bunun için bir kez** GitHub → Settings → Secrets and variables → Actions → `DEPLOY_SSH_KEY` olarak `~/.ssh/oracle.key` içeriği eklenmeli (adres değişirse `DEPLOY_HOST` değişkeni). Anahtar yoksa kurulum adımı atlanır ve elle kurulum (aşağıda) geçerlidir.
- Bütün ayarlar ve açıklamaları: `server/infra/.env.example` (SMS, ödeme, depolama, yedek, sınırlar). Canlı sunucudaki `.env`'e eksik olanlar eklenir; boş bırakılan özellik kapalı kalır.

Kod değişince: `scp -r -i ~/.ssh/oracle.key server/api ubuntu@130.61.230.94:/opt/similar/` ve sunucuda `sudo docker compose up -d --build api`. Uçtan uca kontrol: `node server/api/smoke-test.mjs` (iki atılabilir test hesabı açar).

## Finans paneli (Finance Control)
Ayrı depodaki panel (`keremcan534/similarclup-finance-control`) aynı sunucuda çalışır ve API'deki bütün para hareketlerini otomatik alır.

- **Adres:** `https://panel.130-61-230-94.sslip.io` (alan adı gelince `panel.<alan>`). Caddy dışarıya yalnızca bunu açar; panelin kendi girişi (iki adımlı doğrulama açılmalı) korur.
- **Kurulum:** otomatik kurulum (`server.yml`) panel deposunu indirir, `server/infra/finance/Dockerfile` ile birlikte `/opt/similar/finance`'e koyar, `.env`'e `COMPOSE_PROFILES=finance` ekler (panel servisi bundan önce kapalı durur) ve `docker compose up -d --build` yapar; sonunda panelin açıldığını yoklar. Panel deposu gizliyse GitHub'da `FINANCE_REPO_TOKEN` sırrı (o depoyu okuyabilen bir anahtar) gerekir.
- **İlk giriş:** `.env`'de `FC_ADMIN_EMAIL` / `FC_ADMIN_PASSWORD` doluysa o hesap açılır. Boşsa panel kendisi üretir: `sudo docker compose exec finance cat /data/giris-bilgileri.txt`. Girince şifre değiştirilip iki adımlı doğrulama açılır, sonra bu dosya silinir (`sudo docker compose exec finance rm /data/giris-bilgileri.txt`).
- **Bağlantı (bir kez):**
  1. Panelde **Ödeme kanalları**na `google` (Google Play), `apple` (App Store) ve `jeton_noktasi` (Jeton Noktası toptan satışı) kodlarıyla kanal tanımlanır. Tanımsız kanaldaki satış panelde reddedilir; API onu bekletir ve kanal açılınca kendisi yeniden gönderir.
  2. **Entegrasyonlar → similarclub → Anahtar üret**; anahtar bir kez gösterilir.
  3. Sunucuda `.env`'e `FINANCE_API_KEY=<anahtar>`, sonra `sudo docker compose up -d api`. API kaydında `finance sync on` görünür.
- **Ne gider** (`server/api/finance-sync.mjs`): mağaza satın alımı (paket liste fiyatı, TL) ve ilk alım hediyesi, hediye (gönderen, alan yayıncı olarak, jeton), uygulama içi harcama, mağaza iadesi, Jeton Noktası toptan alımı (bankanın ödediği fiyat), elmas → jeton çevirme/bozdurma, test yüklemeleri (gelir sayılmaz, "promosyon" olarak). Jeton Noktası → kullanıcı aktarımları gitmez: yeni jeton yaratmaz, yalnızca el değiştirir.
- **Nasıl** gider: API işlem kaydını (ledger) sırayla okur, 30 sn'de bir, 60 sn'den eski satırları paketler (`finance_sync` imleci). Panel kapalıysa hiçbir şey kaybolmaz, sıradaki turda kaldığı yerden devam eder. Reddedilen olay `finance_sync_failed`'a girer ve artan aralıkla (en çok 6 saatte bir) yeniden denenir. Her olayın kendi anahtarı var, iki kez giderse panel ikinciyi "zaten var" diye geçer.
- **Durum:** yönetici hesabıyla `GET /api/admin/finance-sync` → açık mı, son başarılı tur, geride kalan satır sayısı, son hata, bekleyen reddedilmiş olaylar.
- **Yedek:** `backup.sh` her gece panelin kendi yedek aracıyla tutarlı bir kopya alır, bütünlüğünü ve denetim zincirini kontrol eder → `backups/finance-YYYY-MM-DD.db.gz` (14 gün; R2 açılınca dışarıya da).

## Uygulama bağlantısı
- `app/.env.local`: `EXPO_PUBLIC_API_URL=https://130-61-230-94.sslip.io` ve `EXPO_PUBLIC_LIVEKIT_URL=wss://130-61-230-94.sslip.io`. Bu dosya git'e girmez; yoksa uygulama tamamen yerel prototip verisiyle çalışır. GitHub Pages yayınında açmak için değişkenlerin derlemeye verilmesi gerekir.
- `lib/api.ts`: giriş (cihaz anahtarı ve oturum AsyncStorage'da; Google ile giriş `lib/google-sign-in.ts` + `lib/live/account.ts`), bakiye, işlem kaydı, test yüklemesi, hediye, ses token'ı.
- Ayarlar → **Sunucu hesabı** (`app/sunucu-hesabi.tsx`): sunucudaki hesap, bakiye ve işlem kaydı; test yüklemesi ve hesap kimliğiyle hediye gönderme. Uygulamanın diğer ekranları (cüzdan, hediye paneli, Oyun Salonu) **henüz yerel bakiyeyi kullanıyor**.
- Ses (web): `lib/voice-setup.web.ts` gerçek motoru (`lib/livekit-engine.ts`, `livekit-client`) takar; ilk odada cihaz sunucuya giriş yapar, odaya hesap kimliğiyle katılır. Oda adı LiveKit'te `oda-<oda id>`.
- Native: ses henüz simülasyon. `@livekit/react-native` + config plugin + development build gerekiyor (`docs/ODA_OTURUMU.md`).

## Ağ
Portlar iki yerde açık olmalı: Oracle'da **similar-vcn → Default Security List** ve sunucunun iptables'ı (`netfilter-persistent` ile kalıcı). Açık: TCP 22, 80, 443, 7881, 5349; UDP 3478, 50000–60000.

## Yedek
`/etc/cron.d/similar-backup` her gece 03:30 UTC'de `backup.sh` çalıştırır: `pg_dump` → `backups/similar-YYYY-MM-DD.sql.gz` (bütünlüğü denetlenir), 14 gün saklanır; finans paneli çalışıyorsa onun veritabanı da → `backups/finance-YYYY-MM-DD.db.gz`. Yeni `backup.sh` (`server/infra/`): `.env`'de `BACKUP_RCLONE_REMOTE` varsa (ör. `r2:similar-yedek`, `rclone config` ile bir kez tanımlanır) dosya sunucu dışına da kopyalanır ve orada 60 gün durur; `BACKUP_PING_URL` varsa (healthchecks.io gibi) yedek gelmeyince haber verir. **Canlı sunucuda henüz eski betik var**; otomatik kurulum ilk çalıştığında yenisiyle değişir.

Geri yükleme (`restore.sh`): `./restore.sh --check backups/…sql.gz` yedeği geçici bir veritabanına açıp sayar ve siler (ayda bir denenmeli); `./restore.sh backups/…sql.gz` canlı veritabanını değiştirir (önce onay ister ve şimdiki hali ayrı bir dosyaya saklar).

## Hata izleme ve acil durum
Bir şey ters gittiğinde haber almak ve uygulamayı mağazaya yeni sürüm göndermeden yönetmek için. Hepsi isteğe bağlı: ayar boşsa ilgili parça kapalı durur, uygulama ve sunucu eskisi gibi çalışır.

### Hangi e-postalar gelir
| Kimden | Ne zaman | Kurulum |
|---|---|---|
| GitHub (Actions) | API veya LiveKit 15 dakikadır yanıt vermiyor ya da `/api/health` bir alarm kodu bildiriyor (aşağıdaki tablo). E-posta "Uptime" iş akışının başarısız olduğunu söyler; kodlar iş akışının kaydında yazar. | Hazır. E-posta, iş akışını en son değiştiren GitHub hesabına gider; GitHub → Settings → Notifications → Actions açık olmalı. |
| Sentry | Uygulamada çökme veya yakalanan hata (hangi sürüm, hangi güncelleme, hangi hesap kimliği), sunucuda beklenmeyen hata, her 5xx yanıtı, finans aktarımı / bildirim / mağaza doğrulama hataları. Aynı hata sunucudan 10 dakikada bir kez gelir. | Bir kez: aşağıda **Sentry**. |
| healthchecks.io | Gecelik yedek alınmadı veya hata verdi. | Bir kez: aşağıda **Yedek alarmı**. |

Raporlarda telefon numarası, mesaj metni, oturum anahtarı ve adreslerin sorgu kısmı (oda şifresi gibi) yoktur; kişi yalnızca sunucu hesap kimliğiyle görünür.

### Bir özelliği geçici kapatmak
Bir hata para kaybettiriyorsa önce özelliği kapatın, sonra düzeltin. Sunucuda:
```bash
cd /opt/similar
sudo nano .env                      # FEATURES_OFF=gifts,topup   (virgülle, boşluksuz)
sudo docker compose up -d api       # yalnız API yeniden başlar, birkaç saniye
```
Sunucu o andan itibaren bu çağrıları "Bu özellik geçici olarak kapalı" (503) diye reddeder. Telefonlar en geç bir dakika içinde (uygulama öne gelince) öğrenir: ilgili düğme sakin bir açıklama gösterir, oda / oyun / Jeton Noktası ekranı yerine "kısa bir mola verdi" yazar; bakiye ve geçmiş görünmeye devam eder. Yeniden açmak için `FEATURES_OFF=` (boş) ve aynı komut.

| Ad | Neyi kapatır |
|---|---|
| `gifts` | Hediye gönderme (oda içi ve profil) |
| `purchases` | Mağazadan jeton satın alma (Google Play / App Store) |
| `topup` | Test jetonu yükleme (test APK'sı) |
| `exchange` | Elmas → jeton çevirme ve Jeton Noktası'na elmas bozdurma |
| `jeton` | Jeton Noktası aktarımları ve toptan alım |
| `games` | Oyun Salonu (yalnız uygulamada; oyunlar sunucudan geçmiyor) |
| `dm` | Yeni özel mesaj gönderme (eski mesajlar okunur) |
| `rooms` | Yeni oda açma ve odaya girme (içerideki kişi, bağlantısı kopmadıkça odada kalır) |

Bilinmeyen ad yok sayılır ve API kaydında `FEATURES_OFF: unknown …` uyarısı çıkar.

### Herkesi güncellemeye zorlamak
`.env`'de `APP_MIN_VERSION=1.1.0` ve `APP_UPDATE_URL=https://…` (Google Play sayfası ya da APK'nın indirildiği GitHub sürüm sayfası), sonra `sudo docker compose up -d api`. Sürümü bundan düşük olan uygulama kapatılamayan bir "Güncelleme gerekli" penceresi gösterir, düğmesi bu adresi açar. Karşılaştırılan sürüm `app/app.json` içindeki `version`'dır. **Dikkat:** henüz yayınlanmamış bir sürümü yazarsanız herkes kilitlenir; önce yeni sürüm mağazada / GitHub'da olmalı. Kaldırmak için `APP_MIN_VERSION=` (boş).

Herkese kısa bir duyuru için `APP_NOTICE=Bu gece 02:00–02:30 arası bakım var.` (en fazla 300 harf). Kişi kapatabilir; metin değişince yeniden görünür.

### Hızlı düzeltme göndermek
- **Sunucu hatası:** düzeltme ana dala birleşince otomatik kurulur (`server.yml`); acelesi varsa yukarıdaki elle kopyalama.
- **Uygulama hatası (yalnız kod, yazı, resim):** mağazaya yeni sürüm göndermeden "uzaktan güncelleme" (Expo EAS Update). Telefon güncellemeyi arka planda indirir, uygulama bir sonraki açılışta yeni haliyle başlar.
- **Yeni sürüm gerekir:** yeni bir paket (native modül), izin, `app.json` eklentisi ya da `version` değiştiyse. `version` değişince eski telefonlar yeni güncellemeleri almaz (`runtimeVersion` sürüme bağlı); onlara `APP_MIN_VERSION` ile yeni sürüm aldırılır.

**Uzaktan güncellemeyi bir kez kurmak** (bilgisayarda, `app/` klasöründe):
1. https://expo.dev adresinden ücretsiz hesap açın.
2. `npx eas-cli@latest login` (hesabın e-postası ve şifresi).
3. `npx eas-cli@latest init` → projeyi Expo'da açar ve `app.json`'a proje kimliğini yazar.
4. `npx eas-cli@latest update:configure` → `app.json`'a güncelleme adresini yazar. `app.json` değişikliğini commit edin.
5. Yeni APK: `npx eas-cli@latest build --profile preview --platform android` (mağaza için `--profile production`). Uzaktan güncelleme **yalnız bu adımdan sonra EAS ile derlenen** uygulamalara gelir; GitHub'daki önizleme APK'sı (`preview.yml`) güncelleme almaz.

**Her düzeltmede:**
```bash
cd app
npm run update -- preview "Hediye panelindeki hata düzeltildi"      # test telefonları
npm run update -- production "Hediye panelindeki hata düzeltildi"   # mağaza sürümü
```
Bu komut `eas update`'i `eas.json`'daki profilin ayarlarıyla (sunucu adresi dahil) çalıştırır. Doğrudan `eas update` yazmayın: profil ayarlarını okumaz ve sunucu adresi olmayan bir güncelleme telefonları çevrimdışı prototipe düşürür. Yanlış giden bir güncelleme expo.dev → proje → Updates'ten ya da `npx eas-cli@latest update:republish` ile önceki güncellemeye döndürülür.

### Sentry
1. https://sentry.io adresinden ücretsiz hesap açın; iki proje oluşturun: **React Native** (uygulama) ve **Node.js** (sunucu). Her birinin **DSN** adresini kopyalayın (Settings → Client Keys). DSN gizli değildir.
2. Sunucu: `.env`'e `SENTRY_DSN=<Node DSN>`, sonra `sudo docker compose up -d api`. API kaydında `error reporting on → …` görünür.
3. Uygulama: `app/eas.json`'da `preview` ve `production` profillerinin `env` bölümüne `"EXPO_PUBLIC_SENTRY_DSN": "<React Native DSN>"`, sonra yeni derleme ya da `npm run update`. Ortam (`preview` / `production`) profilden gelir.
4. Sentry'de proje → Alerts: "yeni hata" kuralı varsayılan olarak açık, e-posta hesabın adresine gider.

Derlemeler Sentry hesabı olmadan da çalışır: kaynak haritası yükleme kapalı (`SENTRY_DISABLE_AUTO_UPLOAD`), bu yüzden uygulama hatalarında satır yerleri sıkıştırılmış kod gibi görünür. İleride istenirse EAS'a `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` sırları eklenip bu ayar kaldırılır.

### Alarm kodları (`/api/health` → `warnings`)
Herkese açık yanıtta yalnız kod vardır; değer, eşik ve ilgili hesaplar yönetici hesabıyla `GET /api/admin/alerts`'te. Eşikler `.env`'de (`server/infra/.env.example`); sonuç 60 sn önbellekte tutulur.

| Kod | Anlamı | Eşik (varsayılan) |
|---|---|---|
| `disk_low` | Sunucu diskinde boş yer azaldı (eski yedekler, Docker kayıtları) | `ALERT_DISK_FREE_PCT` (%15 altı) |
| `errors_5xx` | Son 15 dakikada çok sayıda sunucu hatası | `ALERT_5XX_15M` (20'den fazla) |
| `finance_sync_stale` | Finans paneline aktarım uzun süredir başarılı olmadı (panel kapalı / anahtar yanlış) | `ALERT_FINANCE_STALE_MIN` (15 dk) |
| `finance_sync_failed` | Panelin reddettiği para olayları bekliyor | 1 ve üstü |
| `refunds_high` | Son bir saatte çok sayıda mağaza iadesi | `ALERT_REFUNDS_1H` (3'ten fazla) |
| `diamonds_spike` | Bir hesaba son bir saatte olağandışı çok elmas geldi | `ALERT_DIAMONDS_1H` (500.000'den fazla) |
| `test_topups_high` | Son bir saatte çok fazla test jetonu yüklendi | `ALERT_TEST_TOPUP_1H` (500.000'den fazla) |
| `alerts_error` | Alarmlar okunamadı (çoğu zaman veritabanı) | — |

Alarm geldiğinde: `GET /api/admin/alerts` ile ayrıntıya bakın; para alarmıysa ilgili özelliği kapatın, hesabı `GET /api/admin/wallet/audit?user=` ile inceleyin.

### Yedek alarmı (healthchecks.io)
1. https://healthchecks.io adresinden ücretsiz hesap açın → **Add Check**: ad `similar-yedek`, Period **1 day**, Grace **2 hours**.
2. Verilen adresi (`https://hc-ping.com/…`) sunucuda `.env`'e `BACKUP_PING_URL=` olarak yazın. Yeniden başlatma gerekmez; `backup.sh` her gece okur.
3. Yedek başarılıysa betik bu adrese, başarısızsa `…/fail`'e haber verir; hiç haber gelmezse ya da hata gelirse healthchecks.io e-posta atar. Bu yeni `backup.sh` ile çalışır (yukarıda **Yedek**).

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
2. `compose.yaml` ve `Caddyfile` artık otomatik kurulumla gelir (`LIVEKIT_API_URL`, kayıt sınırı, webhook yolunun kapatılması, finans paneli). `DEPLOY_SSH_KEY` yoksa bu iki dosya `server/infra/`'dan elle kopyalanır, sonra `sudo docker compose up -d --build` ve `sudo docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.
3. Finans paneli bağlantısı (yukarıda **Finans paneli**: kanallar, anahtar, `FINANCE_API_KEY`).
4. Hesaplar geldikçe `.env`'e: `GOOGLE_CLIENT_IDS` (aşağıda **Google ile giriş**), `SMS_PROVIDER` ve anahtarları, `GOOGLE_SERVICE_ACCOUNT`, `APPLE_IAP_*`, `S3_*`, `BACKUP_*`. Telefonla giriş açılınca `ALLOW_DEV_AUTH=0`, mağaza ödemesi açılınca `ALLOW_TEST_TOPUP=0`. Kilit süreleri değişecekse `LOCK_DAYS_STORE` (varsayılan 7) ve `LOCK_DAYS_JETON` (1).
5. İlk Jeton Noktası hesabını bir yönetici açar (`POST /api/admin/jeton/bank`); yönetici hesabı şimdilik veritabanından atanır (`UPDATE users SET role = 'admin' …`).

## Test APK'sı (canlı mod)
`EXPO_PUBLIC_API_URL` dolu olan uygulama (EAS `preview` APK'sı) paylaşılması gerekenleri sunucudan yürütür (`app/src/lib/live`): hesap ve profil, jeton ve elmas bakiyesi, test yüklemesi, hediyeler, Gelir kilitleri ve Çevir, odalar, özel mesajlar, takip. Odada kimin olduğu, kimin hangi mikrofonda oturduğu (her telefonun kendi `seat` özelliği), kimin konuştuğu ve oda içi sohbet/hediye animasyonu LiveKit üzerinden telefonlar arasında gider; para hiçbir zaman bu yoldan geçmez, hediye önce `/api/gifts/send` ile ödenir. Bunun için sunucuda:
- `.env`: `ALLOW_DEV_AUTH=1` (cihazla hesap) ve `ALLOW_TEST_TOPUP=1` (ücretsiz test jetonu). Yayında ikisi de 0.
- API bu sürüme güncellenmiş olmalı (yeni `/api/wallet/spend`, token'da `canUpdateOwnMetadata`). GitHub'da `DEPLOY_SSH_KEY` sırrı yoksa otomatik kurulum çalışmaz; ya sır eklenir ya da `server/api` sunucuya elle kopyalanıp `docker compose up -d --build api` yapılır.
- Dinleyici sayıları için yukarıdaki webhook adımı (yoksa oda listesinde sayı 0 görünür, odalar yine çalışır).

## Google ile giriş
Açılınca canlı Android uygulamasının karşılama ekranında **Google ile devam et** görünür (cihazla "Hesap oluştur" yerine). Ayar yoksa uygulama cihazla girişe devam eder; web önizlemesinde düğme yoktur. Bir kez yapılır:

1. **Proje:** [console.cloud.google.com](https://console.cloud.google.com) → üstten proje seç (Play Console'a bağlı proje varsa o; yoksa **Yeni proje**, ad: Similar Club).
2. **İzin ekranı:** **APIs & Services → OAuth consent screen** (yeni arayüzde **Google Auth Platform → Branding**). Kullanıcı türü **External**; uygulama adı *Similar Club*, destek e-postası, geliştirici e-postası. Kapsam olarak yalnız `email`, `profile`, `openid` (bunlar inceleme istemez). **Audience** bölümünde yayın durumu **In production** yapılır; **Testing**'de kalırsa yalnız eklenen test kullanıcıları girebilir.
3. **Web istemcisi:** **Credentials → Create credentials → OAuth client ID → Web application**, ad: *Similar Club sunucu*. Adres alanları boş kalır. Çıkan **Client ID** (`…apps.googleusercontent.com`) kopyalanır. Uygulama da sunucu da bunu kullanır.
4. **Android istemcisi (GitHub'daki test APK'sı için):** yine **Create credentials → OAuth client ID → Android**. Paket adı `com.similarclub.app`, SHA-1:
   `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
   GitHub'daki APK (`preview.yml`), `expo prebuild`'in oluşturduğu standart hata ayıklama anahtarıyla (`android/app/debug.keystore`) imzalanır; bu anahtar her derlemede aynıdır, SHA-1 değişmez. Kontrol etmek istersen: `keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android` ya da indirilen APK için `apksigner verify --print-certs similar-club.apk`. Bu istemcinin kimliğinin uygulamaya yazılması gerekmez; Google, telefondaki uygulamanın imzasını bununla tanır.
5. **Play Store'a çıkınca:** Play Console → uygulama → **Test et ve yayınla → Kurulum → Uygulama bütünlüğü → Uygulama imzalama** sayfasındaki **Uygulama imzalama anahtarı sertifikası** SHA-1'i ile 4. adımdaki gibi ikinci bir Android istemcisi açılır (aynı paket adı). EAS ile kendi yükleme anahtarınla derlersen onun SHA-1'i için de bir tane. Web istemcisi aynı kalır.
6. **Sunucu:** `/opt/similar/.env` içine `GOOGLE_CLIENT_IDS=<web client id>` (istersen virgülle Android istemcisinin kimliği de), sonra `cd /opt/similar && sudo docker compose up -d api`.
7. **Uygulama:** GitHub → depo → **Settings → Secrets and variables → Actions → Variables → New repository variable**: ad `GOOGLE_WEB_CLIENT_ID`, değer 3. adımdaki web client id. Sonraki APK derlemesinde düğme görünür (değişken boşsa görünmez).

Nasıl çalışır: telefon Google'dan bir kimlik belgesi alır, sunucu bunu Google'ın anahtarlarıyla doğrular ve hesabı açar. Aynı Google hesabı her telefonda aynı hesabı açar. Telefonda önceden cihazla açılmış bir hesap varsa Google ona bağlanır; jeton ve elmaslar korunur. Hesap silinince Google bağlantısı da silinir; aynı Google hesabıyla yeniden girilirse yeni, boş bir hesap açılır. Telefonda "Google ile giriş bu sürüm için henüz ayarlanmadı" görünürse 4. adımdaki SHA-1 ya da paket adı eksik veya yanlıştır (Google'da değişikliğin yayılması birkaç dakika sürebilir).

## Sırada
1. Alan adı (ör. `rtc.<alan>`) → `.env` `DOMAIN`, `Caddyfile`, `livekit.yaml` `turn.domain`, `API_BASE_URL` değişkeni.
2. Yedekleri Cloudflare R2'ye kopyalama (yeni `backup.sh`).
3. Uygulamanın ekranlarını sunucuya bağlamak: giriş (telefon), cüzdan, hediye paneli (`/api/gifts/send`), sıralamalar, mesajlar, oda listesi, push kaydı, fotoğraf yükleme; istemci fonksiyonları `app/src/lib/api.ts`'de hazır.
4. Native'de gerçek ses ve uygulama içi satın alma (development build).
5. Yük artınca makineyi 4 OCPU / 24 GB'a büyütme (ücretsiz).
