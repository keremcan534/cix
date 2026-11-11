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
| `GET /api/config` | Herkese açık, 30 sn önbellekli: uygulamanın en düşük sürümü (`APP_MIN_VERSION`), güncelleme adresi (`APP_UPDATE_URL`), duyuru (`APP_NOTICE`) ve geçici kapalı özellikler (`FEATURES_OFF`). Kapalı özelliğin çağrıları 503 "Bu özellik geçici olarak kapalı" döner (`features.mjs`). Ayrıca hangi giriş yolları açık `signIn: {dev, google, email}` ve telefon nasıl doğrulanabilir `verify: {sms, whatsapp}`; ayarı yapılmamış olan `false`. |
| `GET /api/admin/alerts` | Yalnız yönetici: alarmların ayrıntısı (değer, eşik, hangi hesap), eşikler, finans aktarımının durumu, son 5xx hataları. |
| `GET /api/me` | Hesap ve bakiyeler (jeton, elmas, oyun bakiyesi), telefon, İnci puanı; `email` (e-postayla giriş adresi ya da `null`), `identities` (bağlı giriş yolları, ör. `["email","google"]`), `phoneVerified` |
| `GET /api/ledger` | Son 50 işlem, her satırda işlem sonrası bakiye |
| `POST /api/wallet/test-topup` `{amount, ref}` | **Yalnızca test** (`ALLOW_TEST_TOPUP=1`): 1.000 / 5.000 / 10.000 jeton. Test yüklemesi, test satın alması ve mağaza test satın alması (ilk alım hediyesi dahil) aynı günlük sınırı paylaşır: hesap başına `TEST_TOPUP_DAILY` (varsayılan 50.000). |
| `POST /api/wallet/gift` `{to, amount, ref}` | **Yalnızca test** (`ALLOW_TEST_TOPUP=1`): serbest miktarlı aktarım (Sunucu hesabı ekranı). Gerçek hediye `/api/gifts/send`. |
| `POST /api/wallet/spend` `{amount, reason, ref}` | Eski uygulamaların jetonla alımı. Mağaza ürünü (`Mağaza: …`, `Çıkartma paketi: …`, `Mikrofon efekti: …`, `Rütbe: …`) artık `POST /api/shop/buy` gibi işlenir ve hak sunucuya yazılır; tanınmayan ya da fiyatı tutmayan ürün `409 update_required` alır, jeton düşmez. Ayrıntı: **Mağaza ve rütbe**. |

**Giriş ve oturumlar (`auth.mjs`, `sms.mjs`, `mail.mjs`, `whatsapp.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `POST /api/auth/dev` `{deviceKey, name, device}` | Geliştirme girişi: cihazda tutulan rastgele anahtar (sunucuda yalnızca sha256'sı). Yalnızca `ALLOW_DEV_AUTH=1` iken açık; satır yoksa kapalı (403). |
| `POST /api/auth/otp/start` `{phone}` → `{sent, retryAfter, challenge}` | **Telefonla giriş, `PHONE_SIGN_IN=1` olmadan kapalı** (503 `{feature: "phone"}`; SMS açık olsa da: Ayarlar'da doğrulanan numara yalnız rozettir, giriş yolu olmaz). SMS ile 6 haneli kod. Kod yalnız özet olarak saklanır, 5 dakika geçerli; bağlantı başına 60 saniyede bir yeni kod, numara başına saatte bağlantı başına 5 ve toplam 10, bütün numaralara saatte en fazla `OTP_GLOBAL_PER_HOUR` (varsayılan 300; `0` = SMS tamamen kapalı, 503 `{feature: "sms"}`; aşılınca 429 ve API kaydına uyarı). Yalnız `OTP_COUNTRIES` (varsayılan `+90`) numaraları: yurt dışı pahalı numaralara SMS dolandırıcılığına kapalı. `0532…`, `532…`, `90532…`, `0090…`, `+90 0532…` yazımları aynı numaradır. |
| `POST /api/auth/otp/verify` `{phone, code, challenge, name?, deviceKey?, deviceInfo?, device?}` | Doğru kod oturum açar (`isNew`: yeni hesap). `challenge` start'ın verdiğidir: her istek kendi kodunu alır, başkasının aynı numaraya kod istemesi sizin kodunuzu ne değiştirir ne yakar. 5 yanlış denemeden sonra yeni kod gerekir. Cihazda geliştirme hesabı varsa telefon o hesaba bağlanır, cüzdan korunur. Google ya da e-postayla giren hesabın numarası 409 (giriş yolu değil). Yeni hesap telefon başına bir hesap kuralına uyar ve cihaz bilgisi ister. |
| `POST /api/auth/google` `{idToken, deviceKey?, device?}` | Google ile giriş: Google'ın verdiği kimlik belgesi sunucuda doğrulanır (Google'ın imza anahtarları, `GOOGLE_CLIENT_IDS`, süre, onaylı e-posta). Her Google hesabı tek bir hesaba bağlıdır (`isNew`: yeni hesap). Cihazda geliştirme hesabı varsa Google o hesaba bağlanır, cüzdan korunur. `GOOGLE_CLIENT_IDS` boşsa 503. Ayrıntı: **Google ile giriş**. |
| `POST /api/auth/email/start` `{email}` → `{sent, retryAfter, challenge}` | E-postaya 6 haneli kod. Kod `EMAIL_CODE_MINUTES` (10) dakika geçerli; bağlantı başına 60 sn'de bir yeni kod, adres başına saatte bağlantı başına 5 ve toplam 20 (`+etiket` ve Gmail noktaları aynı adres sayılır), bütün adreslere saatte `EMAIL_GLOBAL_PER_HOUR` (60), bağlantı başına saatte `EMAIL_IP_PER_HOUR` (10) e-posta (IPv6'da /64 tek bağlantı). Yazım, tek kullanımlık adres sağlayıcıları ve alan adının e-posta alıp almadığı (MX) önce denetlenir: yanlış adres kotayı yemez. Adresin hesabı olup olmadığını söylemez. `MAIL_PROVIDERS` boşsa 503 `{feature: "email"}`. Ayrıntı: **E-posta ile giriş**. |
| `POST /api/auth/email/verify` `{email, code, challenge, deviceKey?, deviceInfo?, device?}` → `{session, user, isNew}` | Doğru kod oturum açar (`challenge` start'ın verdiği). İlk girişte adres şuna bağlanır: aynı **Gmail** adresli Google hesabıyla giren tek hesap (`EMAIL_LINK_GOOGLE`), yoksa cihazdaki geliştirme hesabı, yoksa yeni hesap. Başka alan adındaki adres bir Google hesabında kayıtlıysa kendiliğinden bağlanmaz: 409 `{code: "use_google"}` (Google ile girip adresi Ayarlar'dan ekleyin); tersi de 409 `{code: "use_email"}`. Yeni hesap cihaz bilgisi ister (yoksa 400). |
| `POST /api/me/email/start` `{email}` · `POST /api/me/email/verify` `{email, code, challenge}` → `{user}` | Ayarlar → e-posta ekle / değiştir: kod yeni adrese gider, doğru kodla hesabın giriş adresi olur (eskisinin yerine; eski adrese "adresin değişti" bildirimi gider). Var olan adresi değiştirmek son 10 dakikada giriş ister: daha eski oturum 403 `{code: "reauth_required"}` (çalınan oturum hesabı başka adrese taşıyamasın). Başka hesabın adresi (e-postayla ya da Google ile) 409 "Bu e-posta başka bir hesaba bağlı". |
| `POST /api/me/phone/start` `{phone}` · `POST /api/me/phone/verify` `{phone, code, challenge}` → `{user}` | Ayarlar → telefonunu doğrula, SMS ile (aynı kod kuralları). Doğru kodla numara hesabın doğrulanmış telefonu olur; başka hesaptaysa 409. Var olan numarayı değiştirmek (SMS ya da WhatsApp) son 10 dakikada giriş ister (403 `reauth_required`). `SMS_PROVIDER` boşsa ya da `OTP_GLOBAL_PER_HOUR=0` ise 503 `{feature: "sms"}`. |
| `POST /api/me/phone/whatsapp` → `{link, expiresIn: 600}` · `GET /api/me/phone/status` → `{phone, pending, result}` | Ücretsiz WhatsApp doğrulaması: `link` bizim numaraya hazır "SC-XXXXXX" mesajıyla WhatsApp'ı açar; kişi gönderir, uygulama durumu sorar. `result`: `null` (bekleniyor), `verified`, `taken` (numara başka hesapta), `country` (`OTP_COUNTRIES` dışı), `no_number`, `expired` (10 dk). Hesap başına saatte 5. Ayrıntı: **WhatsApp ile telefon doğrulama**. |
| `GET` / `POST /api/webhooks/whatsapp` | Meta'nın çağrıları: kurulum el sıkışması (`hub.verify_token` = `WHATSAPP_VERIFY_TOKEN`, cevap `hub.challenge` düz metin) ve gelen mesajlar (yalnız `WHATSAPP_APP_SECRET` ile imzalıysa, `X-Hub-Signature-256`). WhatsApp kapalıysa 503 `{feature: "whatsapp"}`. |
| `POST /api/auth/logout` `{all?}` · `GET /api/sessions` · `POST /api/sessions/revoke` `{id}` | Çıkış (bu cihaz veya hepsi); aktif oturumlar (cihaz adı, son kullanım); başka bir oturumu kapatma |

SMS sağlayıcısı `.env` içinde `SMS_PROVIDER`: `netgsm` (Netgsm REST v2, `NETGSM_USER/PASS/HEADER`) veya `twilio` (`TWILIO_SID/TOKEN/FROM`). Boşsa SMS kapalıdır (503); telefonla giriş ayrıca `PHONE_SIGN_IN=1` ister (yoksa 503 `{feature: "phone"}`). Mağaza incelemecisi için `OTP_REVIEW_PHONE` + `OTP_REVIEW_CODE` SMS'siz girer; bu kod değişmediği için bir saatte `OTP_REVIEW_MAX_TRIES` (varsayılan 10) yanlış denemeden sonra numara bir saat kilitlenir (doğru kod da girmez). Elle açmak: `DELETE FROM otp_review_lock;`. E-postayla giriş için aynısı `OTP_REVIEW_EMAIL` + `OTP_REVIEW_EMAIL_CODE` (e-posta gitmez; bu adres cihaz kuralına takılmaz).

**Telefon başına bir hesap** (`ONE_ACCOUNT_PER_DEVICE=1`, varsayılan): e-postayla, Google ile ya da (açıksa) telefonla yeni hesap açılırken telefonda hâlâ girilebilen canlı bir hesap varsa 409 `{error, code: "device_has_account", method: "google" | "email" | "phone"}`. `method` o hesabın nasıl girdiğini söyler, adresini asla. Yalnız cihaz anahtarlı geliştirme hesabı sayılmaz (uygulama yeniden kurulunca anahtarı kaybolur). Hesap silinince telefon serbest kalır. Kod sınırlarının üstünde bağlantı (IP) başına saatte `OTP_IP_PER_HOUR` (30) kod, SMS ve e-posta birlikte; gönderilemeyen kod da sayılır.

**Yanlış kodlar** hangi koda olursa olsun gün boyu sayılır: bir adrese / numaraya bir bağlantıdan `OTP_FAILS_PER_IP_DAY` (10) yanlış kod o bağlantıya, herkesten `OTP_FAILS_PER_DAY` (30) yanlış kod herkese bir gün kilitler (429 "Çok fazla yanlış kod denendi, yarın tekrar dene", API kaydına uyarı; Google ile giriş etkilenmez). Elle açmak: `DELETE FROM otp_failures;`. Eski kod, gönderim, yanlış kod ve WhatsApp kayıtları 10 dakikada bir silinir.

**Hediye, sıralama, satın alma (`gifts.mjs`, `catalog.mjs`, `purchases.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `GET /api/catalog` | Herkese açık: hediyeler (ad, fiyat, kategori, İnci sınırı), adetler, jeton paketleri, İnci eşikleri ve `purchases` (`testTopup`: ücretsiz test paketleri açık mı, `stores.android` / `stores.ios`: bu sunucu o mağazanın ödemesini doğrulayabiliyor mu). Uygulama gerçek paketleri yalnız doğrulanabilen mağazada, test paketlerini yalnız `testTopup` açıkken gösterir. Uygulamadaki veriyle aynı olduğu `app/tests/server-catalog.test.ts` ile denetlenir. |
| `POST /api/gifts/send` `{to, giftId, count, room?, ref}` | Fiyatı sunucu belirler; uygulama yalnız hangi hediye ve kaç adet olduğunu söyler. Jeton → alıcıya bire bir elmas, tek işlemde. İnci sınırlı hediyeler kontrol edilir. Oda dışındaki hediyede alıcıya bildirim gider. |
| `GET /api/rankings?board=wealth\|charm&period=day\|week\|month` | Cömertlik (gönderilen) ve Yankı (alınan) sıralaması, Türkiye saatine göre gün/hafta/ay, ilk 50 |
| `POST /api/wallet/purchase` | Mağaza satın alımı: Google Play (`token`, hizmet hesabıyla Play Developer API) veya App Store (`transactionId`, App Store Server API, önce üretim sonra sandbox). Her makbuz bir kez yüklenir; başka hesapta kullanılmış makbuz reddedilir; paketin ilk alımında ilk alım hediyesi eklenir; alınan jeton İnci puanı olur. Play ürünü tüketilir, paket tekrar alınabilir. Ürün kimlikleri `coins_<jeton>` (ör. `coins_1000`). **Mağaza test satın alması** (Play lisans testçisi `purchaseType 0`, promosyon kodu `1`; App Store sandbox, TestFlight, inceleme) yalnız `ALLOW_SANDBOX_PURCHASES=1` iken yüklenir, o da test jetonu olarak (test kanalı, İnci puanı yok, günlük test sınırı); kapalıyken 402 ve Play ürünü tüketilmez (Google kendisi iade eder). `platform: 'test'` yalnız `ALLOW_TEST_TOPUP=1` iken. |

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
| `POST /api/admin/purchases/refund` `{purchase}` | Yalnız yönetici: mağaza iadesi/ters ibraz. Satın alınan jetondan harcanmamış kısmı (Jeton Noktası üzerinden geçmiş olsa da) ve henüz kilitli elmasları geri alır; kilidi açılmış elmas `unrecoveredDiamonds` olarak raporlanır. O hediyelerin ajans komisyonu da geri alınır (her hediye için eksi bir `refund` gelir kaydı). İnci puanı düşer. İkinci kez 409. |
| `POST /api/admin/purchases/voided-sync` | Yalnız yönetici: Google Play iadelerini şimdi oku. `GOOGLE_SERVICE_ACCOUNT` varken API bunu kendisi de `GOOGLE_VOIDED_POLL_MIN` dakikada bir yapar (varsayılan 60, 0 = kapalı): Play'in iade/ters ibraz/iptal listesindeki her satın alma yukarıdaki iadeyle geri alınır (`refunds.mjs`). Aynı iade iki kez okunursa bir şey değişmez; bizde olmayanlar `unknown` sayılır. Denetim kaydında `source: google_voided`. App Store iadeleri henüz elle (yukarıdaki çağrı). |
| `GET /api/admin/wallet/audit?user=` | Yalnız yönetici: bir hesabın bütün para kaydı (satın almalar, partiler, kilitler, aktarımlar, defter, yönetici işlemleri). Anlaşmazlıkta buradan bakılır. |

**Mağaza ve rütbe (`economy.mjs`, `catalog.mjs` `SHOP`)**

Mağazada satılan her şeyin (çerçeve, giriş efekti, binek, sohbet balonu, özel numara, çıkartma paketi, mikrofon efekti) ve rütbenin sahibi sunucudur. Her satın alma ya da yönetici hediyesi `entitlements`'a bir satır yazar: kim, hangi ürün, ne kadar ödedi, ne zaman başlar ve biter. Satır silinmez ve değiştirilmez, yalnız geri alınır (`revoked_why`: `iade`, `destek`, `hesap silindi`). Bir ürün, geri alınmamışsa, başlamışsa ve bitmemişse geçerlidir; bu her okumada o anki saatle bakılır, ayrı bir iş çalışmaz. Fiyatlar ve süreler `catalog.mjs`'te, uygulamadakiyle aynı (`app/tests/server-catalog.test.ts`); fiyat değişikliği yalnız yeni sürümle olur.

- Alım tek işlemdir: satır, jeton düşmesi ve giyme birlikte olur ya da hiçbiri olmaz. Ret jeton düşürmez.
- **Ödül jetonu** (kanal `odul`: günlük giriş, görevler, İlk adımlar; yüklemesi sonraki adımda gelir) yalnız mağazada harcanır ve önce o harcanır. Hediye, bağ, Jeton Noktası aktarımı ve oyun ödül jetonunu kabul etmez (`409 reward_coins_only`). Ödül jetonuyla alınan ürün Cömertlik puanı vermez.
- **Özel numara** yalnız satın alınmış jetonla alınır ve aynı anda tek sahibi olur (aynı anda iki kişi denerse biri `409 taken` alır, o ödemez). Hesap silinince numara boşa çıkar. Satışı `SHOP_SPECIAL_IDS=1` ile açılır; kapalıyken mağazada görünmez.
- Süreli ürün tekrar alınınca süre eskisinin bittiği yerden uzar; bugünden en çok 365 gün ileri. Kalıcı ürün ikinci kez alınamaz (`409 owned`).
- **Rütbe**: daha yüksek rütbe alınabilir ve öncekiyle aynı anda sürer; yüksek rütbe sürerken düşüğü alınamaz (`409 higher_rank`). VIP seviyesi SVIP puanı ile rütbe × 3'ün büyüğü (en çok 15).
- Uygulamanın gösterdiği fiyat sunucununkinden düşükse `409 price_changed` döner ve yeni fiyat gelir; sunucu her zaman kendi fiyatını alır.
- **İade** (`POST /api/admin/purchases/refund`): iade edilen jetonun gittiği her parti işaretlenir (`coin_lots.refunded_by`). İadeyi yapan kişinin o jetonla aldığı ürünler geri alınır (`iade`). Jeton Noktası'ndan jeton almış başka birinin ürünü kalır; personel incelemesine yazılır (`GET /api/admin/economy/reviews`).
- `shop` özelliği kapanınca alım durur (eski uygulamalar dahil); okuma, giyme ve görünüm açık kalır. Canlı ayarlardaki **Mağazada gizli ürünler** (`shop_hidden`) bir ürünün satışını durdurur; alınmış olan kalır ve giyilir.

| Çağrı | Ne yapar |
|---|---|
| `GET /api/economy` | Kendi ürünlerim (kalan gün), giydiklerim, rütbem, VIP seviyem, ödül jetonum, mağaza listesi ve son alımlarım. |
| `POST /api/shop/buy` `{sku, price, ref}` | Satın al. Aynı `ref` aynı sonucu döner (`replay: true`), ikinci kez ödetmez. |
| `POST /api/shop/equip` `{slot, sku \| null}` | Giy ya da çıkar; yalnız geçerli bir ürün giyilir. |
| `GET /api/looks?ids=a,b` | Başkalarının giydikleri (en çok 50 kişi); oda ve profil bunu gösterir. |
| `GET /api/admin/economy/user?id=` | Yalnız yönetici: bir hesabın bütün ürünleri (geçerli, bitmiş, geri alınmış), ödül jetonu ve iade incelemeleri. |
| `POST /api/admin/economy/grant` `{userId, sku, days?, reason, ref}` | Yalnız yönetici: ücretsiz ürün verir (fiyat 0); denetim kaydına yazılır. |
| `POST /api/admin/economy/revoke` `{id, reason}` | Yalnız yönetici: bir satırı geri alır (`destek`); denetim kaydına yazılır. |
| `GET /api/admin/economy/reviews` | Yalnız yönetici: son 90 günün iade incelemeleri. |

**UK GDPR:** ürün kayıtları (`entitlements`) satın alma kaydıdır: hukuki dayanak sözleşme (Madde 6(1)(b)); hesap silinince geri alınır, mali kayıt olarak saklanır. Giyilenleri (`users.equipped`) odada ve profilde başkaları görür; hesap silinince silinir. Gizlilik politikasının "satın almalar" bölümüne ve işleme kaydına (record of processing) bu iki kayıt eklenmeli.

**Oda süslemesi ve oda kapağı (`room-decor.mjs`, `catalog.mjs` `ROOM_COVERS` / `ROOM_BGS`)**

İkisi ayrı şeydir. **Oda süslemesi** odanın sahnesinin arkasındaki resimdir; **oda kapağı** odanın listelerdeki (Odalar, oda kartı, Mesajlar) resmidir. Birini değiştirmek diğerini değiştirmez. Süslemeyi ve kapağı oda sahibi ya da Süper Yönetici seçer; yalnız oda sahibi öder ve kendi görselini yalnız o yükler, değiştirir, kaldırır. Her değişiklik odadaki telefonlara anında duyurulur (oda yeniden okunur).

- **Ücretsiz** (`rooms.bg_id`): `bg1`–`bg4`, her biri oda seviyesiyle açılır (Lv.1, 2, 4, 7); boş bırakılırsa temanın kendi sahnesi çizilir. Eski uygulamaların seçtiği `cover_id` süsleme değildir: kapak yüklenene kadar listelerde görünen resim olarak kalır, böylece var olan odalar aynı görünür.
- **Ücretli** (`ROOM_BGS`, `entitlements` türü `roombg`): mağaza ürünü gibi süreli sahip olunur (yeniden alınca süre uzar, iade edilen jetonla alınan geri alınır, hesap silinince biter). Görseli uygulamada olmayan süsleme satılmaz (`sale: false`, rafta "yakında"); şu an hiçbirinin görseli yok (`docs/GORSEL_URETIM_LISTESI.md` §14). Deneme sunucusunda `ROOM_BG_PREVIEW=1` hepsini satışa açar.
- **Özel**: oda sahibi canlı ayardaki ücreti öder (varsayılan 5.000 jeton) ve kendi görseli canlı ayardaki gün kadar (varsayılan 30) odanın arka planı olur. Süre içinde görseli ücretsiz değiştirir (dakikada 3, günde 10) ve kaldırabilir; kaldırınca süre işlemeye devam eder. Süre bitince oda son ücretsiz süslemesine döner ve dosya birkaç dakika içinde silinir (`ROOM_DECOR_SWEEP_MS`, varsayılan 10 dk).
- Ödenen şey odaya değil sahibine aittir (`room_decor`, sahip başına bir satır): oda kapatılıp yeniden açılırsa süre ve görsel yeni odada devam eder.
- **Kapak** (`rooms.cover_url`) ücretsizdir; oda kapanınca dosyası silinir.
- Görseller telefonda kırpılır: süsleme 1080 × 1920 (dikey), kapak 800 × 800 (kare). Yükleme türleri `roombg` (en çok 4 MB) ve `roomcover` (en çok 2 MB), JPEG/PNG/WebP.
- **Canlı ayarlar › Oda süslemesi:** `room_decor_off` (`custom`, `paid`: satışı durdurur; alınmışlar kalır), `room_bg_custom_price`, `room_bg_custom_days`. `shop` özelliği kapanınca iki satış da durur.
- **Denetim:** görseller otomatik denetlenmez. Şikâyet edilen odanın kartında (Yönetim › Şikâyetler) **Oda görsellerini göster** ile süsleme ve kapak görülür, kurala aykırıysa kaldırılır. Kaldırılan özel süslemenin süresi de biter, jeton iade edilmez (satın alma metni bunu söyler); işlem nedeniyle birlikte denetim kaydına yazılır (`room_background_remove`, `room_cover_remove`).

| Çağrı | Ne yapar |
|---|---|
| `GET /api/rooms/decor?room=` | Sahip ya da Süper Yönetici: seçili süsleme, ücretsizler (kilitleriyle), ücretli raf (fiyat, sahip olunan süre), özel süslemenin ücreti, günü ve durumu, kapak. |
| `POST /api/rooms/decor/pick` `{room, pick: 'free', bgId}` | Ücretsiz süsleme (`bgId: null` tema görünümü). `pick: 'custom'` ya da ücretli bir `sku`: sahibin elindekilerden biri. |
| `POST /api/rooms/decor/buy` `{room, sku, price, ref}` | Yalnız sahip: ücretli süslemeyi alır; oda hemen gösterir. Aynı `ref` ikinci kez ödetmez. |
| `POST /api/rooms/decor/custom` `{room, url, price, ref}` | Yalnız sahip: yüklediği görsel (`roombg`). Süre dışında satın almadır (`charged: true`), süre içinde ücretsiz değişikliktir. |
| `POST /api/rooms/decor/custom/remove` `{room}` | Yalnız sahip: görseli kaldırır (dosya silinir). |
| `POST /api/rooms/cover` `{room, url \| null}` | Sahip ya da Süper Yönetici: kapağı koyar ya da kaldırır. |
| `GET /api/admin/rooms/background?room=` | Yetkili: odanın özel süslemesi ve kapağı. |
| `POST /api/admin/rooms/background/remove`, `…/cover/remove` `{room, reason}` | Yetkili: görseli kaldırır; denetim kaydına yazılır. |

**UK GDPR:** özel süsleme ve kapak kullanıcının yüklediği içeriktir; odadaki herkes (kapağı listelerde herkes) görür. Değiştirilince, kaldırılınca, süresi bitince, oda kapanınca (kapak) ve hesap silinince dosya depodan silinir; veri kopyasında yer alır (`rooms.decoration`, `rooms.owned[].coverUrl`). Gizlilik politikasının "yüklediğiniz içerik" bölümüne eklenmeli.

**Para çekme (`withdraw.mjs`)**: yayıncı çekilebilir elmasını parayla ister; ödemeyi yönetim uygulama dışında (havale) yapar ve talebi "ödendi" işaretler. Talep açılınca elmas hemen bakiyeden düşer (defterde "Para çekme talebi", kanal `cekim`), iptal veya retle geri gelir; böylece aynı elmas ikinci kez harcanamaz.

| Çağrı | Ne yapar |
|---|---|
| `POST /api/wallet/withdraw` `{diamonds, method, details: {holder, account}, ref}` | Talep: en az 50.000, en çok 5.000.000 elmas, 7 günde en çok 10.000.000; yalnız kilidi açılmış elmas; aynı anda tek bekleyen talep. `method`: `iban` (her ülkenin IBAN'ı, kontrol basamağıyla) veya `other` (serbest hesap bilgisi, 5–120 harf). `holder`: hesap sahibinin adı (3–80). Değer: 5.000 elmas = 1 USD. `FEATURES_OFF=withdraw` yeni talebi kapatır; iptal ve liste açık kalır. |
| `GET /api/wallet/withdrawals` | Kendi taleplerim (durum: Beklemede / Ödendi / Reddedildi / İptal edildi), çekilebilir elmas ve kurallar. |
| `POST /api/wallet/withdrawals/cancel` `{id}` | Yalnız beklemedeyken; elmas geri gelir. |
| `GET /api/admin/withdrawals?status=pending\|paid\|rejected\|cancelled\|all` | Yalnız yönetici: talepler, hesap ve `payable` (ödenebilir mi). `playMoney: true` ise bu sunucuda hiçbir talep ödenemez. |
| `POST /api/admin/withdrawals/decide` `{id, approve, note}` | Yalnız yönetici, kendi talebine değil: `approve: true` ödendi (önce dışarıda ödenir), `false` ret (not zorunlu, elmas geri). Denetim kaydı ve kişiye bildirim. |

**Test jetonu hiçbir zaman paraya dönmez:** jeton ve elmas hediye, Çevir ve Jeton Noktası üzerinden birbirine karıştığı için elmasın tek tek nereden geldiği güvenilir izlenemez. Bu yüzden kural sunucu çapında: `ALLOW_TEST_TOPUP=1` veya `ALLOW_SANDBOX_PURCHASES=1` iken, ya da veritabanında bir kez bile test jetonu (test yüklemesi, test satın alması, mağaza test satın alması) olduysa hiçbir talep "ödendi" yapılamaz, yalnızca reddedilir. Yayın sunucusu test verisi olmayan temiz bir veritabanıyla açılmalı. Çekimler finans paneline gitmez (panelde ödeme türü yok); mağaza test satın alması panele satış değil promosyon olarak gider.

Kim yükledi, kim aldı, kim aktardı, kimin adına, hangi IP'den, hangi dekontla: aktarımlar `coin_transfers`'ta, yönetici işlemleri `audit_events`'te, her bakiye değişikliği `ledger`'da (kanal, işlemi yapan, ayrıntı). Bu üç tablo **değiştirilemez ve silinemez** (veritabanı tetikleyicisi; API dahil).

**Bildirim, yükleme, ses (`push.mjs`, `media.mjs`, `live.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `POST /api/push/register` `{token, platform}` · `/api/push/unregister` | Expo push anahtarı. Yeni mesaj, yeni takipçi ve oda dışı hediye bildirim gönderir; Expo'nun "kayıtlı değil" dediği anahtarlar silinir. |
| `POST /api/media/upload-url` `{kind, contentType, size}` | S3 uyumlu depolamaya (Cloudflare R2 önerilir) 10 dakikalık imzalı yükleme adresi. Tür ve boyut imzaya dahil: profil fotoğrafı en fazla 5 MB (jpg, png, webp, heic), an en fazla 50 MB (mp4 dahil). Dosya API'den geçmez. `S3_*` ayarları yoksa 503. |
| `GET /token?room=&password=` | Giriş yapmış kullanıcıya LiveKit token'ı, `LIVEKIT_TOKEN_TTL_S` saniye (varsayılan 600; bağlı kişininkini LiveKit yeniler). Kimlik her zaman oturumdaki hesap (istekten alınmaz), ad = hesap adı. Yalnız sunucuda var olan, açık oda (`oda-<uuid>`; yoksa 404, kapalıysa 410); odadan atılma, kara liste, oda sahibiyle karşılıklı engel ve şifre kontrol edilir. Prototip odaları (`oda-r1` …) yalnız `ALLOW_PROTOTYPE_ROOMS=1` iken. Oda kapanınca LiveKit'te de biter (`DeleteRoom`), atılan veya kara listeye alınan kişi aramadan hemen çıkarılır (`RemoveParticipant`); ikisi de `LIVEKIT_API_URL` üzerinden. |
| `POST /api/livekit/webhook` | LiveKit'ten gelen imzalı olaylar (katıldı, ayrıldı, oda bitti): kim hangi odada. Dışarıdan kapalı (Caddy 404), LiveKit 127.0.0.1'den çağırır. |
| `GET /api/rooms/live` | İçinde insan olan her ses odası ve dinleyici sayısı; `GET /api/rooms` da `listeners` döner ve en kalabalıktan sıralar. |

**Profil ve sosyal (`social.mjs`)**
| Çağrı | Ne yapar |
|---|---|
| `PATCH /api/me` | Ad, kullanıcı adı (benzersiz, küçük harf), cinsiyet, doğum tarihi (18 yaş altı reddedilir; bir kez girilir), şehir, hakkında, ilgi alanları (uygulamadaki listeden, en fazla 5), fotoğraf adresi (https) |
| `DELETE /api/me` | Hesap silme (uygulamada Ayarlar → Hesabı sil, iki kez sorulur): kişisel alanlar, telefon numarası, giriş anahtarı, Google ve e-posta bağlantısı, bekleyen kodlar, WhatsApp doğrulama denemeleri, oturumlar, bildirim anahtarları, takipler, engeller, mesajlar, iletişim filtresi sayaçları, kendi odaları ve giydikleri gider; mağaza ürünleri geri alınır (özel numara boşa çıkar); hesap kimliği, işlem kaydı, hediye, satın alma ve ürün kayıtları (mali kayıt) saklanır. Aynı cihaz, numara, e-posta veya Google hesabı yeniden girerse yeni, boş bir hesap açılır. |
| `GET /api/user?id=` | Herkese açık profil (bakiye, doğum tarihi ve rol yok; yalnız yaş), takipçi/takip sayısı (toplam; `oneWay`: profilde görünen tek yönlü Takipçi ve Takip, karşılıklı takipleşenler yalnız `friends` içinde), takip ediyor muyum, engelledim mi. Seni engelleyen kişi için 404. |
| `POST /api/follow` `{to, follow}` · `GET /api/following` · `GET /api/followers` | Takip et / bırak; engel varsa takip edilemez; yeni takipte bildirim. Listeler yalnız hesabın sahibine: `?user=` başka biri ise 403 (`lists_private`), gizlilik ayarı ne olursa olsun |
| `POST /api/block` `{to, block}` · `GET /api/blocks` | Engelle / kaldır; engel iki yöndeki takipleri bitirir |
| `POST /api/report` `{type, id, reason, note}` | Şikâyet (kullanıcı, oda, mesaj, an); aynı kişinin aynı hedefe ikinci şikâyeti tek sayılır. Uygulamada profil, sohbet ve oda menüsündeki **Şikâyet et** sebep sordurup buraya gönderir (sohbette mesaj, odada oda adı not olarak eklenir). |

**Uzaklık (`city-coords.mjs`, `distances.mjs`)**: `GET /api/discover`, `GET /api/user` ve `GET /api/moments` (yazan) her kişiye `distance` ekler: bakanın ve kişinin profil şehirleri arasındaki kuş uçuşu uzaklık, yuvarlanmış: aynı şehir `{km: 0, sameCity: true}`, 100 km altı en yakın 10 km (iki şehir arası en az 10), üstü en yakın 50 km. GPS ya da telefon konumu kullanılmaz; koordinatlar sunucudan çıkmaz. Tablo: Türkiye'nin 81 il merkezi ve uygulamadaki diğer ülkelerin (AZ, DE, NL, CY) başlıca şehirleri; şehir serbest metin olduğu için büyük/küçük harf, Türkçe harfsiz yazım, başka adı (İzmit → Kocaeli, München → Münih) ve ilçesiyle yazım ("Kadıköy, İstanbul") tanınır. Şehirlerden biri boşsa, tabloda yoksa (iki yazı aynı değilse) ya da profil bakana gizliyse ("Profilim herkese açık" kapalı ve kişi bakanı takip etmiyor: şehir de gizli) `null`; kendine de `null`.

**Mesajlar (`messages.mjs`)**: `POST /api/messages` `{to, text, ref}` (aynı `ref` bir kez kaydedilir; engelde reddedilir; kişi başı dakikada 30; alıcıya bildirim) · `GET /api/messages?with=&before=` (en yeniden eskiye, 50'şer) · `GET /api/conversations` (son mesaj ve okunmamış sayısı) · `POST /api/messages/read` `{with}`. Açık uygulamaya iletim yoklama ile, kapalıyken push ile.

**Odalar (`rooms.mjs`)**: `POST /api/rooms` `{title, announcement, roomType, password}` (herkesin en fazla bir açık odası) · `GET /api/rooms` (açık odalar; sahibiyle engelleştiğin odalar hariç; LiveKit webhook'ları geliyorsa içinde kimse olmayan, sahibi ya da yöneticisi olmadığın odalar da hariç; oda kapanmaz) · `GET /api/room?id=` · `POST /api/rooms/close` (yalnız sahip) · `POST /api/rooms/admin` `{room, user, admin, super?}` (yalnız sahip; `super` yoksa kişinin derecesi korunur) · `POST /api/rooms/ban` `{room, user, minutes}` (sahip veya yönetici; `minutes: null` kara liste) · `POST /api/rooms/unban` · `POST /api/rooms/update` (şifre yalnız sahip; oda adı ve bülten Süper Yönetici ve üstü; `micCount`, `layoutId`, `micQueue` her yönetici) · `POST /api/rooms/queue` `{room, action: join|leave|approve|reject, user?, seat?}` (mikrofon kuyruğu: katılma ve çıkma herkes, katılma kuyruk açıkken; onay ve ret yönetici; onay kişiyi LiveKit'te o koltuğa oturtur). Dereceler: Oda sahibi > Süper Yönetici > Yönetici > diğerleri; kimse kendi derecesindekine ya da üstündekine işlem yapamaz. Her değişiklikte LiveKit odasının metaverisi sunucudan yazılır: `{lockedSeats, layoutId, micCount, micQueue, queue}`; odadaki her telefon değişikliği o anda görür.

**Oda içi PK (`pk.mjs`)**: `GET /api/rooms/pk?room=` (odanın süren PK'sı, ya da bittikten / iptalden sonra 10 dakika sonucu; yoksa `null`; `now` sunucu saati) · `POST /api/rooms/pk` `{room, mode: solo|team, durationMin: 15|30|60|120, participants | red, blue, ref}` (yalnız sahip veya yönetici; Normal PK 2–20 kişi, Takım PK takım başına 1–8 kişi; herkes şu an mikrofonda olmalı (LiveKit `seat`); odada bir PK; aynı `ref` aynı PK'yı döner; 5 sn geri sayım) · `POST /api/rooms/pk/cancel` `{room}` (sahip veya yönetici). Katılımcılar başlarken sabitlenir. PK sürerken odada ödenen bir hediye, alıcı katılımcıysa jeton değeri kadar puan yazar (`gifts.mjs` aynı işlemde, `room_pk_gifts`, hediye başına bir kez; PK puanı para hareketi değildir). Başlatma ve iptal odanın ses bağlantısına `{type: 'pk'}` ile duyurulur; telefonlar PK'yı yeniden okur. Aynı okuma odanın odalar arası PK'sını da `cross` olarak getirir.

**Odalar arası PK (`pk-cross.mjs`, 049)**: `GET /api/rooms/pk/cross/rooms?room=&q=` (davet edilebilecek açık odalar, en kalabalıktan; kendi odan, PK'daki ya da davetteki odalar ve sahibiyle engelleşilen odalar hariç; `q` 8 haneli oda ID'si ya da adın bir parçası; yalnız sahip veya yönetici) · `POST /api/rooms/pk/cross` `{room, to, durationMin: 15|30|60|120, ref}` (A odasının sahibi veya yöneticisi B'yi davet eder; aynı `ref` aynı daveti döner; B'nin sahibine bildirim, oda daveti almıyorsa gitmez) · `POST /api/rooms/pk/cross/answer` `{room, id, accept}` (B'nin sahibi veya yöneticisi 60 sn içinde; sonra 410) · `POST /api/rooms/pk/cross/end` `{room}` (iki odanın yetkilisi de: davet geri alınır / reddedilir, süren PK iptal olur, kazanan yok). Bir odada aynı anda tek PK (davet dahil, oda içi PK ile birlikte); iki odanın satırı kilitlenerek denetlenir. İki odanın sahipleri (ya da davet eden / kabul eden ile öbür odanın sahibi) engelleşmişse davet ve kabul 403. Kabulden 5 sn sonra iki odada ödenen her hediye kendi odasına jeton değeri kadar puan yazar (`room_cross_pk_gifts`, hediye başına bir kez); ödül yok, puan para hareketi değildir. İzleyen, engellediği ya da onu engelleyen kişilerin hediye satırlarını görmez (skor yine sayar). Oda kapanınca PK biter (`room_closed`). Her değişiklik iki odaya `{type: 'pk'}` ile duyurulur; puanlanan hediye öbür odaya en fazla saniyede bir duyurulur. Kayıtlar iki odanın maç kaydıdır; hesap silinince kimin davet ettiği / kabul ettiği / bitirdiği silinir.

**Oda Sahibi Merkezi (`room-owner.mjs`)**: `GET /api/rooms/owner-stats?room=` (yalnız oda sahibi): bu oturum (sahibin odaya bu girişinden beri; odada değilse son 24 saat, `session: false`) için ziyaretçi, ziyaret, ortalama kalış, aynı anda en çok kişi, şu an odadakiler, yeni üye, odadaki hediyeler (sahibin kendi gönderdikleri hariç), oda seviyesi ve XP'si, son 10 saatin saatlik dinleyicisi. Yeni veri tutulmaz: `presence_log`, `room_presence`, `gift_events`, `room_members` ve sahibin oda XP'sinden sayılır, kimse adıyla gelmez. Sunucuda oda sahibine hediye payı ödenmez (hediyenin elması alıcıya gider, odadaki hediyeler yalnızca oda seviyesini yükseltir), bu yüzden pay gösterilmez.

**Oda katkı sıralaması (`room-contrib.mjs`)**: `GET /api/rooms/contrib?room=&side=sent|received&period=hour|day|week` (giriş yapmış herkes, her sunucu odası için): Cömertlik (`sent`, odada en çok hediye jetonu gönderenler) ve Yankı (`received`, en çok alanlar), bu saat, bugün veya bu hafta; saat, gün (00:00) ve hafta (pazartesi 00:00) Türkiye saatiyle başlar. 1 jeton = 1 puan: hediyenin `gift_events` toplamı (Şanslı hediyede alıcının payı, Sıralama ve Patron koltuğu gibi). Cevap `{ rows, me, since }`: ilk 50 (eşitlikte dönemin ilk hediyesini önce veren/alan önde), kişinin kendi yeri (listede değilse `rank: null`) ve dönemin başı. Silinen hesaplar listeden çıkar; oda kimliği ya da LiveKit adı (`oda-…`) ile yazılmış hediyelerin ikisi de sayılır. Yeni veri tutulmaz.

**Oda takibi (`room-follow.mjs`, 051)**: `POST /api/rooms/follow` `{room}` · `POST /api/rooms/unfollow` `{room}` (ikisi de `{following, followers}` döner; birlikte dakikada 30 istek) · `GET /api/rooms/followed` (takip ettiğim odalar: açık olanlar önce ve en kalabalıktan, sonra kapalılar `closed: true` ile). Kapanıp yeniden açılan oda yeni bir oda kimliği olduğu için takip odanın hesabına (sahibine) yazılır: oda kapansa da kalır, aynı hesabın sonra açtığı oda takipte olur. Kişi kendi odasını takip edemez; sahibiyle engelleşen ya da odadan atılan takip edemez ve odayı listesinde görmez; engel takibi de siler. Kişi başına en fazla 200 oda. `GET /api/room?id=` yanıtına `followers` ve `following` eklenir. **Takip ettiğin oda açıldı**: sahip odasına girince (ses anahtarı isteği; yeni açtığı ya da açık bıraktığı odaya dönüşü) takipçilere oda hesabı başına 6 saatte en fazla bir kez haber gider: gönderim başına tek satır (`room_open_notices`, takipçi başına satır yok), her takipçinin telefonu bunu `GET /api/me/room-invites` içinden (`kind: 'open'`) bildirime çevirir, ayrıca push gider. Oda daveti almayan (Gizlilik › kimse), sahibiyle engelleşen ve odadan atılan almaz; bildirimden sonra takip eden de almaz. Saklama: takip, bırakılana, araya engel girene ya da iki hesaptan biri silinene kadar; açılış bildirimi satırı 8 gün.

**Oda üyeleri listesi (`room-members.mjs`)**: `GET /api/rooms/members/list?room=&filter=all|in|out|pending&offset=` → `{rows, counts, nextOffset, canManage}`; sayfa 50 kişi. Önce oda sahibi, Süper Yönetici ve Yöneticiler, sonra üyeler (odadakiler ve en son girenler üstte); her satırda rol, odada olup olmadığı ve odaya son girişi. Kimin odada olduğu ses odasından okunur (LiveKit katılımcıları, olmazsa webhook kayıtları). `pending` (başvurular) yalnızca üyeleri yönetene (`rules.manageMembers`). Gizlilik: odada olmayan ve oda yetkilisi olmayan birine, bulunduğu odayı gizleyen kişi "odada değil" görünür; son giriş yalnızca kişi son görülmesini gösteriyorsa ve bakan da gösteriyorsa gelir (üyeleri yöneten her zaman görür: otomatik çıkarma kuralı bu tarihe bakar); engelleşenler birbirini listede görmez (üyeleri yöneten hariç). Odadan atılan ya da sahibiyle engelleşen listeyi okuyamaz. Üye olma, ayrılma, onay ve çıkarma `rooms.mjs` içindedir (`POST /api/rooms/members/…`).

**Uğurlu hediyeler (`lucky.mjs`, kurallar `lucky-rules.mjs`)**: `GET /api/lucky` (açık paketler ve olasılıkları, her paketin bugün gönderim alıp almadığı `open`, Cömertlik Lv.2 şartı `allowed`, son 20 gönderimim) · `POST /api/lucky/send` `{giftId, to: [1–20 kişi], count, room, ref}` (18 yaş ve Cömertlik Lv.2; engel varsa 403; aynı `ref` bir kez oynanır). Tek işlemde: alıcı başına fiyatın %20'si elmas (normal hediye gibi `gift_events`, kilit, ajans geliri `lucky_gift`, bağ, PK, oda puanı), kalan %80 "Uygulama içi: Uğurlu hediye" harcaması, hediye başına bir çekiliş (`crypto.randomInt`), ödül **jeton** (kendi kanalı `ugurlu`, 024: her yerde harcanır ama ödenen kısmı Cömertlik puanına sayılmaz; finans paneline `bonus_grant` `ugurlu_odul`). Bir paketin en yüksek ödülü günlük platform limitine sığmazsa paket o gün kapanır (409). Gönderim odaya `{type: 'lucky'}` ile duyurulur. Yönetim: `GET /api/admin/lucky` (ayarlar, bugün/toplam, son 50 gönderim, büyük kazançlar) · `POST /api/admin/lucky/config` `{config, version}` (yalnız `admin`; olasılık toplamı tam %100, fiyat 5–100.000; eski sürümle kayıt 409; her kayıt `sanction_audit_logs`'a). Uygulamada Ayarlar › Yönetim › Uğurlu hediyeler.

**İletişim filtresi (`contact-filter.mjs`)**: Başkalarının okuduğu metinlerde telefon numarası, IBAN, ödeme hesabı (Papara, kripto adresi…), e-posta, bağlantı ve sosyal medya adı ya da kısaltması yazılamaz: mesaj, profil (ad, kullanıcı adı, şehir, hakkında), oda adı ve duyurusu, oda susturma gerekçesi, uygulamadan ajans başvurusu (ad, ülke, bölge), ajans notları ve gerekçeleri, Jeton Noktası satış notu (alıcı okur; dekont numarası filtrelenmez). Metin maskelenmez; istek `400 {error, code: 'contact_blocked', category, field}` ile reddedilir. Birkaç mesaja bölünmüş numara (aynı kişiye 3 dakika içinde yalnız rakam içeren kısa mesajlar) son parçada durur. Girişte gelen ad iletişim bilgisi içeriyorsa hesap "Yeni üye" adıyla açılır. Para çekme bilgileri, şikâyet, itiraz, destek ve yönetim araçları filtrelenmez. Her ret `contact_refusals`'a yazılır (kim, tür, yer, zaman; metnin kendisi hiçbir yerde saklanmaz; 180 gün tutulur, hesap silinince gider); yetkili `GET /api/admin/sanctions/user` yanıtındaki `contactRefusals`'ta görür. Uygulamanın göndermeden reddettikleri (oda ve grup sohbeti, anlar, oda anketi/etkinliği/sorusu, aile ve ajans metinleri) `POST /api/contact/refusals` `{category, place}` ile aynı sayaca yazılır (cevap `{counted: true}`, aşağıdaki uyarı alanlarıyla); gelen bir oda mesajının reddi alıcıya sayılmaz. **Otomatik susturma** (`sanctions.mjs` `contactStrike`, ayrıntı docs/YAPTIRIM.md): son `AUTO_MUTE_WINDOW` dakikada (60) `AUTO_MUTE_REFUSALS` ret (5; `0` kapatır) olunca sistem kişiye `AUTO_MUTE_MINUTES` dakikalık (60) DM dahil genel yazılı susturma verir (`mute_global_text`, gerekçe `contact_sharing`: "Otomatik: iletişim bilgisi paylaşma denemesi"). Bu gerekçeyi yalnızca sistem verir: yönetim panelinin listesinde yoktur, elle verilen yaptırım, ceza kademesi ayarı ve oda susturması bu gerekçeyle `400` alır. Yalnızca DM'i ve oda sohbetini kapatan son susturma (bu kuralınki ya da yetkilinin DM dahil yazılı susturması) bittikten ya da kaldırıldıktan sonraki retler sayılır, susturma sürerken yapılanlar hiç sayılmaz; DM ve oda sohbeti zaten kapalıyken yenisi eklenmez; personel muaftır; aynı anda gelen retler tek susturma doğurur. Son iki denemede ret cevabı (`400 contact_blocked` ve `POST /api/contact/refusals`) `strikesLeft` (2 / 1) ve `muteMinutes` ekler; susturmayı başlatan ret `muted: true, until, muteMinutes, sanction, serverNow` ekler. Kural hata verirse ya da 2 saniyeyi aşarsa ret cevabı onu beklemez. Listeler ve eşikler `DEFAULT_RULES` olarak dışa açık, `setRules` canlı ayardan değiştirir. Örnek derlem: `test/contact-filter-corpus.json`.

**Moderasyon (`admin.mjs`, yalnız `role` = `moderator` / `admin`)**: `GET /api/admin/reports?status=open` · `POST /api/admin/reports/handle` `{id, status, banDays}` · `POST /api/admin/ban` `{user, days}` (`null` kaldırır). Askıdaki hesabın her çağrısı 403 döner. Yetkili hesabı veritabanından atanır; SSH gerekmeden GitHub'da Actions › **Yetki ver** › Run workflow (hesap kimliği: uygulamada Ayarlar › Sunucu hesabı; yetki `admin` / `moderator` / `user`) bunu yapar ve `audit_events`'e yazar. Hesap uygulamayı yeniden açınca Ayarlar › Yönetim görünür.

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
- **010_withdrawals_hardening**: `withdrawals` (para çekme talepleri; hesap başına tek bekleyen), `purchases.sandbox`, `otp_sends` (saatlik SMS sınırı), `otp_review_lock` (inceleme numarası kilidi), `store_refund_sync` (Google Play iade imleci).
- **016_email_sign_in**: `auth_identities`'e `email` sağlayıcısı (adres başına bir hesap, hesap başına bir adres); `otp_codes`, `otp_sends`, `otp_review_lock` iki kanallı (`channel` = `sms` / `email`, `phone` → `target`; `otp_sends`'te e-posta adresi değil özeti); `mail_quota` (sağlayıcının o günkü gönderimi), `phone_claims` (WhatsApp doğrulaması: kodun yalnız özeti, numara yalnız doğrulanınca).
- **017_contact_refusals**: `contact_refusals` (iletişim filtresinin retleri: kullanıcı, tür, yer, zaman; metin yok).
- **018_contact_auto_mute**: `sanction_reasons`'a `contact_sharing` ("İletişim bilgisi paylaşma"; kişi "Otomatik: iletişim bilgisi paylaşma denemesi" görür), otomatik susturmanın gerekçesi; yalnızca sistem verir. Yeniden çalıştırılabilir (`ON CONFLICT DO NOTHING`).
- **020_economy**: `entitlements` (kim, hangi ürün, ödenen jeton, başlangıç, bitiş, geri alma ve nedeni; silinmez, değiştirilmez, yalnız geri alınır; özel numaranın tek sahibi, kalıcı ürünün tek satırı), `users.equipped` (giyilenler), `coin_lots`'a `odul` kanalı ve `refunded_by` (iade edilen jetonun izi; eski iadeler de işaretlenir).
- **023_lucky**: `lucky_config` (yöneticinin paketleri ve olasılıkları, tek satır, sürümlü; yoksa hazır paketler), `lucky_sends` (her gönderim: alıcılar, adet, fiyat, harcanan, alıcılara elmas, ödül, çekilişler ve çekildiği olasılıklar; `UNIQUE (user_id, ref)`).
- **024_lucky_coins**: jeton kanallarına `ugurlu` (Uğurlu hediye ödülleri).
- **025_room_staff_queue**: `rooms.locked_seats` (kilitli mikrofonlar oda boşalınca da kalır), `rooms.mic_queue`, `room_admins.super` (Süper Yönetici), `room_mic_queue` (mikrofon sırası; oda + kişi başına bir satır).

## Testler ve kurulum
- `server/api/test/`: her dosya boş bir veritabanı açar, API'yi ayrı bir süreç olarak başlatır (`harness.mjs`), HTTP üzerinden dener, sonra veritabanını siler. `api.test.mjs`: giriş, cüzdan, profil, takip/engel, mesaj, oda/ses token'ı, şikâyet/moderasyon, hesap silme. `launch.test.mjs`: sağlık, telefonla giriş (kod API kaydından okunur), oturumlar, mağaza satın alımı, hediye ve sıralama, push (sahte Expo sunucusuyla), LiveKit webhook, imzalı yükleme adresi (AWS'nin örnek imzasıyla), telefonlu hesap silme. `coins.test.mjs`: jeton kanalı ve partiler, 7 gün / 1 gün elmas kilidi, Çevir'in kilitli elmasa kapalı olması, Jeton Noktası açma (yalnız yönetici), toptan alım, Jeton Noktası satışı (aynı anda iki kopya dahil), kilit mirası, harcama sırası, anında bozdur, iade (Jeton Noktası üzerinden geçen dahil), değiştirilemez kayıtlar, denetim görünümü, partilerin bakiyeye eşitliği. `config.test.mjs`: `/api/config` ve önbelleği, kapalı özelliklerin 503'ü, `warnings`, `/api/admin/alerts` yetkisi. `alerts.test.mjs`: disk, 5xx, finans aktarımı ve para alarmları; sahte bir Sentry sunucusuna giden raporlar (telefon, oturum anahtarı yok; aynı hata bir kez). `reporting.test.mjs`: Sentry adresi, maskeleme, hata satırları. `google.test.mjs`: Google ile giriş (sahte Google anahtarlarıyla): yeni hesap, aynı Google hesabının aynı hesaba dönmesi, Android istemcisi, sahte/süresi geçmiş/başka uygulamaya ait belgelerin reddi, cihaz hesabına bağlama, aynı anda iki istek, askıdaki hesap, silinen hesap. `google-off.test.mjs`: ayar boşken 503 ve giriş sınırı. `email.test.mjs`: e-postayla giriş (sahte DNS sunucusuyla MX denetimi, kod API kaydından okunur): adres denetimi, kod kuralları, hesap bağlama (cihaz, Google), telefon başına bir hesap, Ayarlar'dan ekleme/değiştirme, hesap silme, inceleme adresi. `email-caps.test.mjs`: Brevo ve Resend (sahte sunucuyla): gönderilen e-posta, günlük kota, yedeğe geçiş, 429 / 502, saatlik ve bağlantı başına sınırlar, `mail_quota_high` / `mail_failing`. `phone-link.test.mjs`: Ayarlar'dan SMS ve WhatsApp ile telefon doğrulama, Meta webhook imzası ve el sıkışması. `withdraw.test.mjs`: para çekme talebi, iptal, ret, kurallar (test sunucusunda). `hardening.test.mjs`: yayın gibi ayarlı sunucu (sahte Google Play, App Store ve LiveKit ile, `fake-stores.mjs`): geliştirme girişi ve test jetonu kapalı, mağaza test satın alması reddi, ödenen çekim, Google Play iadesinin zamanlayıcıyla işlenmesi ve ajans komisyonunun geri alınması, SMS sınırları, odadan atma ve oda kapatma. `sandbox.test.mjs`: `ALLOW_SANDBOX_PURCHASES=1`. `contact-filter.test.mjs`: iletişim filtresi örnek derlemle (engellenecek ve geçecek metinler, bölünmüş numaralar). `contact-filter-api.test.mjs`: filtrelenen her uç (Jeton Noktası notu dahil), ret sayacı ve uygulamanın kendi retleri, filtrelenmeyenler (para çekme, şikâyet, dekont, yönetim); otomatik susturma kapalı (`AUTO_MUTE_REFUSALS=0`). `contact-auto-mute.test.mjs`: 4 retten sonra susturma yok, 5.'de gerekçe, bitiş ve DM ile (sahte LiveKit'te veri izni düşer); susturmada DM ve oda sohbeti kapalı, ses açık; uygulamanın retleri sayılır; susturma sürerken ikincisi yok; bitince ya da yetkili kaldırınca (yetkilinin DM dahil susturması da) sayım sıfırdan başlar, susturma sürerken yapılan retler sonradan sayılmaz; yalnızca oda sohbetini kapatan susturma sayımı sıfırlamaz; 60 dakikadan eski ret sayılmaz; personel muaf; `strikesLeft` değerleri; aynı anda gelen retler tek susturma; dakikalık yazma sınırı aşılınca yazılmayan retler de tek tek sayılır; `contact_sharing` gerekçesi panelde yok, elle, kademe ayarında ve oda susturmasında `400`; LiveKit yavaşken de 5. ret `muted` döner; 018 yeniden çalıştırılabilir; reddedilen metin hiçbir tabloda ve kayıtta yok. Yerelde: `cd server/api && PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=… npm test`.
- `.github/workflows/server.yml`: `server/**` değişince testler Postgres 17 ile çalışır. Ana dala birleşince sunucuya kurulur: `compose.yaml`, `Caddyfile`, `backup.sh`, API (`/opt/similar/api`) ve finans paneli (`/opt/similar/finance`), sonra `docker compose up -d --build` ve Caddy yeniden yüklenir; commit kimliği `version.txt`'ye yazılır ve `/api/health` yeni sürümü bildirene kadar beklenir.
- `.github/workflows/uptime.yml`: 15 dakikada bir canlı API'yi (`/api/health`, veritabanı dahil) ve LiveKit'i (`/` → `OK`) yoklar; düşerse ya da `warnings` boş değilse GitHub e-posta atar. Alan adı gelince `API_BASE_URL` depo değişkeni. **Bunun için bir kez** GitHub → Settings → Secrets and variables → Actions → `DEPLOY_SSH_KEY` olarak `~/.ssh/oracle.key` içeriği eklenmeli (adres değişirse `DEPLOY_HOST` değişkeni). Anahtar yoksa kurulum adımı atlanır ve elle kurulum (aşağıda) geçerlidir.
- Bütün ayarlar ve açıklamaları: `server/infra/.env.example` (SMS, ödeme, depolama, yedek, sınırlar). Canlı sunucudaki `.env`'e eksik olanlar eklenir; boş bırakılan özellik kapalı kalır.

Kod değişince: `scp -r -i ~/.ssh/oracle.key server/api ubuntu@130.61.230.94:/opt/similar/` ve sunucuda `sudo docker compose up -d --build api`. Uçtan uca kontrol: `node server/api/smoke-test.mjs` (iki atılabilir test hesabı açar).

## Finans paneli (Finance Control)
Ayrı depodaki panel (`keremcan534/similarclup-finance-control`) aynı sunucuda çalışır ve API'deki bütün para hareketlerini otomatik alır.

- **Adres:** `https://panel.130-61-230-94.sslip.io` (alan adı gelince `panel.<alan>`). Caddy dışarıya yalnızca bunu açar; panelin kendi girişi (iki adımlı doğrulama açılmalı) korur.
- **Kurulum:** otomatik kurulum (`server.yml`) panel deposunu indirir, `server/infra/finance/Dockerfile` ile birlikte `/opt/similar/finance`'e koyar, `.env`'e `COMPOSE_PROFILES=finance` ekler (panel servisi bundan önce kapalı durur) ve `docker compose up -d --build` yapar; sonunda panelin açıldığını yoklar. Panel deposu gizliyse GitHub'da `FINANCE_REPO_TOKEN` sırrı (o depoyu okuyabilen bir anahtar) gerekir.
- **İlk giriş:** `.env`'de `FC_ADMIN_EMAIL` / `FC_ADMIN_PASSWORD` doluysa o hesap açılır. Boşsa panel kendisi üretir ve `/data/giris-bilgileri.txt`'ye yazar. SSH gerekmeden Actions › **Panel girişi**: `oku` bu girişi, `sifirla` süper yöneticiye yeni bir parolayı verir; ikisi de loglar herkese açık olduğu için girişi yalnızca verilen RSA açık anahtarıyla şifreli yazar (açma komutu `.github/workflows/panel.yml`'de). Girince şifre değiştirilip iki adımlı doğrulama açılır, sonra dosya `sil` ile silinir.
- **Bağlantı (bir kez):** kısa yol Actions › **Panel girişi** › işlem `bagla`: aşağıdaki üç adımı sunucuda kendisi yapar (anahtar logda görünmez, doğrudan `.env`'e yazılır) ve ilk gönderim turunu bekler. Kanalların kesinti oranları sonra panelden girilir. Elle yapmak için:
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
| `shop` | Mağazadan ürün ve rütbe alma (eski uygulamalar dahil); alınmış ürünler kalır ve giyilir. Para işlemlerinin hepsi kapatılınca bu da kapanır. |

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
| `mail_quota_high` | Bugünkü ücretsiz e-posta kotası (bütün sağlayıcılar, UTC günü) dolmak üzere; %100'de e-postayla giriş UTC gece yarısına kadar durur | `ALERT_MAIL_QUOTA_PCT` (%80'den fazla) |
| `mail_failing` | Son 10 e-posta kodu hiçbir sağlayıcıyla gönderilemedi (anahtar yanlış, hesap durduruldu) | 10 art arda |
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
4. Hesaplar geldikçe `.env`'e: `GOOGLE_CLIENT_IDS` (aşağıda **Google ile giriş**), `SMS_PROVIDER` ve anahtarları, `GOOGLE_SERVICE_ACCOUNT`, `APPLE_IAP_*`, `S3_*`, `BACKUP_*`. Telefonla giriş açılınca `ALLOW_DEV_AUTH=0`, mağaza ödemesi açılınca `ALLOW_TEST_TOPUP=0`. **Test anahtarı:** otomatik kurulum her seferinde `ALLOW_DEV_AUTH` ve `ALLOW_TEST_TOPUP` satırlarını GitHub değişkeni `TEST_MODE`'a göre yazar (değişken yoksa 1 = test sunucusu, ikisi de açık). Yayında GitHub → Settings → Secrets and variables → Actions → Variables'a `TEST_MODE` = `0` eklenir; sonraki kurulum ikisini de 0 yapar. Bu iki satır `.env`'de elle değiştirilirse sonraki kurulumda geri yazılır. Kurulum, `.env`'de `DOMAIN` yoksa veya boşsa `DOMAIN=<ip>.sslip.io` da ekler (boş `DOMAIN` Caddy'yi çökertir). Para çekme ödemeleri yalnız test verisi hiç olmamış bir veritabanında yapılabilir (yukarıda **Para çekme**). Kilit süreleri değişecekse `LOCK_DAYS_STORE` (varsayılan 7) ve `LOCK_DAYS_JETON` (1). E-posta ve WhatsApp ayarları (`MAIL_*`, `BREVO_API_KEY`, `RESEND_API_KEY`, `WHATSAPP_*`, `OTP_REVIEW_EMAIL*`) GitHub'a girilir, kurulum `.env`'e kendisi yazar (aşağıda **E-posta ile giriş**).
5. İlk Jeton Noktası hesabını bir yönetici açar (`POST /api/admin/jeton/bank`); yönetici hesabı Actions › **Yetki ver** ile atanır (yukarıda **Moderasyon**).

## Test APK'sı (canlı mod)
`EXPO_PUBLIC_API_URL` dolu olan uygulama (EAS `preview` APK'sı) paylaşılması gerekenleri sunucudan yürütür (`app/src/lib/live`): hesap ve profil, jeton ve elmas bakiyesi, test yüklemesi, hediyeler, Gelir kilitleri ve Çevir, para çekme talepleri (`lib/live/withdraw.ts`: Para çek ekranı talebi sunucuya açar, bakiye ve geçmiş sunucunun cevabından gelir, bekleyen talep oradan iptal edilir; Gelir ekranları da sunucunun listesini gösterir), odalar, özel mesajlar, takip. Odada kimin olduğu, kimin hangi mikrofonda oturduğu (her telefonun kendi `seat` özelliği), kimin konuştuğu ve oda içi sohbet/hediye animasyonu LiveKit üzerinden telefonlar arasında gider; para hiçbir zaman bu yoldan geçmez, hediye önce `/api/gifts/send` ile ödenir. Bunun için sunucuda:
- `.env`: `ALLOW_DEV_AUTH=1` (cihazla hesap; satır yoksa kapalı) ve `ALLOW_TEST_TOPUP=1` (ücretsiz test jetonu). Otomatik kurulum bunları `TEST_MODE` değişkenine göre kendisi yazar (yukarıda); yayında `TEST_MODE=0` ile ikisi de 0. Test sunucusunda çekim talebi açılır, iptal edilir, reddedilir ama ödenemez (test jetonu).
- API bu sürüme güncellenmiş olmalı (yeni `/api/wallet/spend`, token'da `canUpdateOwnMetadata`). GitHub'da `DEPLOY_SSH_KEY` sırrı yoksa otomatik kurulum çalışmaz; ya sır eklenir ya da `server/api` sunucuya elle kopyalanıp `docker compose up -d --build api` yapılır.
- Dinleyici sayıları için yukarıdaki webhook adımı (yoksa oda listesinde sayı 0 görünür ve boş odalar da listelenir, odalar yine çalışır).

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

## E-posta ile giriş
Kod kendi alan adımızdan (ör. `kod@<alan adı>`) Brevo ile gider (ücretsiz, günde ~300); Brevo'nun günlük kotası dolar ya da hata verirse Resend (ücretsiz, günde 100). İkisi de ücretsiz, kart istemez. sslip.io adresiyle olmaz: alan adı gerekir, ama API'yi alan adına taşımak gerekmez (yalnız DNS kayıtları). Bir kez yapılır:

1. **Alan adı:** GoDaddy'de alınır, DNS GoDaddy'de kalır. API'yi henüz ona yönlendirmeyin (yeni APK ister).
2. **Brevo:** [brevo.com](https://www.brevo.com) → ücretsiz hesap, şirket olarak İngiltere'deki şirket. **Senders, Domains & Dedicated IPs → Domains → Add domain**. Gösterilen kayıtları tek tek GoDaddy → **My Products → alan adı → DNS**'e aynen ekleyin, Brevo'da **Authenticate**. "Transactional" açılması gerekiyor derse destek talebi (1–2 iş günü). **Senders**: `kod@<alan adı>`, ad *Similar Club*. **SMTP & API → API Keys → Generate** → anahtarı kopyalayın.
3. **Resend:** [resend.com](https://resend.com) → ücretsiz hesap → **Domains → Add domain** (önerdiği `send.<alan adı>` gibi alt alan olur). Kayıtları GoDaddy DNS'e ekleyin, **Verified** olana kadar bekleyin. **API Keys → Create** → **Sending access** → anahtarı kopyalayın.
4. **DMARC:** GoDaddy DNS'e bir TXT kaydı: ad `_dmarc`, değer `v=DMARC1; p=none; rua=mailto:similarclub00@gmail.com`. Aynı ada yalnız **bir** SPF (`v=spf1 …`) kaydı olmalı; iki sağlayıcı ayrı ayrı isterse bize söyleyin, birleştiririz.
5. **GitHub:** depo → **Settings → Secrets and variables → Actions**.
   - **Secrets** (gizli): `BREVO_API_KEY`, `RESEND_API_KEY`.
   - **Variables** (açık): `MAIL_PROVIDERS` = `brevo,resend`, `MAIL_FROM` = `Similar Club <kod@<alan adı>>`.
   - Mağaza incelemesi için isteğe bağlı: **sırlar** `OTP_REVIEW_EMAIL` (inceleme adresi) ve `OTP_REVIEW_EMAIL_CODE` (6 rakam). Bu adrese e-posta gitmez, bu kodla girilir. Adres değişken (Variables) olarak girilmemeli: Actions logları herkese açık ve GitHub değişkenlerin değerini orada gösterir (sırları `***` olarak). Daha önce değişken olarak girildiyse silin ve sır olarak ekleyin.
6. **Kurulum:** Actions → **Server** → Run workflow (ya da sunucu dosyası değişen bir birleştirme). Kurulum dolu olan değerleri `/opt/similar/.env`'e yazar (kurulum adımı yalnız adları yazdırır; değişkenlerin değeri GitHub'ın kendi adım başlığında görünür, sırlarınki görünmez), API yeniden başlar. API kaydında `MAIL_PROVIDERS: … left out` görünürse o sağlayıcının anahtarı ya da `MAIL_FROM` eksiktir.
7. **Deneme:** Gmail, Outlook/Hotmail ve Yandex adreslerine kod isteyin; gelen kutusuna düşmeli. Gmail'de **Orijinali göster**'de SPF, DKIM ve DMARC **PASS** olmalı. İsteğe bağlı: alan adını [Google Postmaster Tools](https://postmaster.google.com)'a ekleyin.

Değer boşsa ilgili parça kapalı kalır; `.env`'deki satırı kurulum silmez. Açılmış bir ayarı yeniden kapatmak için GitHub'daki değeri tek bir `-` yapın: kurulum `.env`'e boş yazar (ör. `MAIL_PROVIDERS=` → e-postayla giriş 503). Kotalar `.env`'de: `BREVO_DAILY` (290), `RESEND_DAILY` (95), UTC gününe göre; dolunca uygulama "Bugün çok fazla kod gönderildi; Google ile gir ya da yarın tekrar dene" der. Ayarlar: `server/infra/.env.example`.

**UK GDPR:** e-posta adresi yeni bir kişisel veri; Brevo (AB), Resend (ABD) ve WhatsApp açılırsa Meta veri işleyen olur. Brevo ve Resend hesap ayarlarında veri işleme sözleşmesini (DPA) kabul edin; gizlilik politikasına üçü de yazılmalı, Play Console → **Veri güvenliği**'ne "E-posta adresi" (toplanır, hesap yönetimi için, paylaşılmaz). Sunucu adresi yalnız giriş kimliği olarak tutar: sınır tablosunda (`otp_sends`) yalnız özeti, denetim kaydında (`audit_events`, silinemez) adres ve numara yok; hesap silinince adres, bekleyen kodlar ve WhatsApp denemeleri silinir.

## WhatsApp ile telefon doğrulama
İsteğe bağlı, ücretsiz "telefon doğrulandı" rozeti için (SMS parası yok). Uygulama WhatsApp'ı bizim numaraya hazır bir mesajla (`SC-XXXXXX`) açar, kişi **Gönder**'e basar; Meta mesajın hangi numaradan geldiğini imzalı olarak sunucuya bildirir. Kullanıcının işletmeye yazdığı mesaj ücretsiz, biz cevap vermeyiz. Bir kez yapılır:

1. **Numara:** normal WhatsApp'ta kullanılmayan yedek bir numara (ör. ucuz bir İngiltere kontörlü SIM).
2. **Meta:** [business.facebook.com](https://business.facebook.com) → İngiltere'deki şirket için işletme portföyü. [developers.facebook.com](https://developers.facebook.com) → **Create app** → tür **Business** → **WhatsApp** ekle → numarayı ekleyip doğrulayın.
3. **Webhook:** uygulamada **WhatsApp → Configuration → Webhook**: adres `https://130-61-230-94.sslip.io/api/webhooks/whatsapp` (alan adı gelince `https://<alan>/api/webhooks/whatsapp`), **Verify token** kendi uydurduğunuz uzun bir söz. **Webhook fields**'da `messages`'a abone olun. (Meta'nın sslip.io adresini kabul ettiği henüz denenmedi.)
4. **GitHub:** sırlar `WHATSAPP_APP_SECRET` (Meta uygulaması → **App settings → Basic → App secret**) ve `WHATSAPP_VERIFY_TOKEN` (3. adımdaki söz); değişken `WHATSAPP_NUMBER` (numara, ör. `+44 7700 900123`).
5. **Önce kurulum, sonra doğrulama:** Actions → **Server** → Run workflow; bitince Meta'da **Verify and save** (sunucu sözü tanıyıp cevap verir).

`WHATSAPP_NUMBER` ve `WHATSAPP_APP_SECRET` ikisi birden dolu değilse kapalıdır (503). Yalnız `OTP_COUNTRIES` (+90) numaraları doğrulanır. SMS ile doğrulama `SMS_PROVIDER` doluysa açılır; şimdilik gerekmiyor.

## Fotoğraf depolama (Cloudflare R2)
Anlar'daki ve profildeki fotoğraflar için. Telefon fotoğrafı doğrudan R2'ye yükler, API yalnız imzalı adres verir. Ayar yoksa yükleme "Fotoğraf yükleme henüz açık değil" der (503). R2'de 10 GB'a kadar ücretsiz, indirme ücreti yok; açmak için Cloudflare bir kart ya da PayPal ister. Bir kez yapılır:

1. **Kova:** [dash.cloudflare.com](https://dash.cloudflare.com) → ücretsiz hesap → **R2 Object Storage** → **Create bucket**: ad `similar-media`, konum **Automatic** ya da **Western Europe (WEUR)**.
2. **Herkese açık adres:** kova → **Settings → Public access → R2.dev subdomain → Allow Access**. Gösterilen `https://pub-….r2.dev` adresi `S3_PUBLIC_URL`. (r2.dev denemelik ve hız sınırlı; alan adı gelince kovaya **Custom domain** bağlanır, `S3_PUBLIC_URL` o olur.)
3. **Anahtar:** R2 ana sayfası → **API Tokens → Manage → Create API token** (Account API token): izin **Object Read & Write**, yalnız `similar-media` kovası. **Create**'ten sonra çıkan **Access Key ID** → `S3_KEY`, **Secret Access Key** → `S3_SECRET` (bir kez gösterilir), **S3 endpoint** (`https://<hesap>.r2.cloudflarestorage.com`, sonundaki kova adı olmadan) → `S3_ENDPOINT`.
4. **GitHub:** depo → **Settings → Secrets and variables → Actions → Secrets**: `S3_ENDPOINT`, `S3_BUCKET` (`similar-media`), `S3_KEY`, `S3_SECRET`, `S3_PUBLIC_URL`. Beşi de sır; anahtarları sohbete yapıştırmayın.
5. **Kurulum:** Actions → **Server** → Run workflow. Kurulum dolu olanları `/opt/similar/.env`'e yazar (yalnız adları yazdırır). Uygulamada fotoğraflı bir an paylaşıp deneyin.

**Telefonlar dosyayı sunucudan açar.** Yükleme doğrudan R2'ye gider, ama fotoğraf ve müzik telefonlara `https://<DOMAIN>/api/media/f/…` adresiyle verilir; API dosyayı R2'den okuyup iletir (`media.mjs` `sendFile`). Sebep: `r2.dev` Türkiye'deki bazı internet sağlayıcılarında açılmıyor. Veritabanında R2 adresi durur; çeviri tek yerde yapılır (`core.mjs` `filesOut`/`filesIn`). Kurulum sonundaki depo denetimi bu yolu da dener: satırda `uygulama adresi 200` görünmeli.

Kapatmak için GitHub'daki `S3_PUBLIC_URL`'i tek bir `-` yapın. **UK GDPR:** Cloudflare veri işleyen olur; Cloudflare hesabında veri işleme sözleşmesini (DPA) kabul edin, gizlilik politikasına ekleyin.

## Sırada
1. Alan adı (ör. `rtc.<alan>`) → `.env` `DOMAIN`, `Caddyfile`, `livekit.yaml` `turn.domain`, `API_BASE_URL` değişkeni.
2. Yedekleri Cloudflare R2'ye kopyalama (yeni `backup.sh`).
3. Uygulamanın ekranlarını sunucuya bağlamak: giriş (telefon), cüzdan, hediye paneli (`/api/gifts/send`), sıralamalar, mesajlar, oda listesi, push kaydı, fotoğraf yükleme; istemci fonksiyonları `app/src/lib/api.ts`'de hazır.
4. Native'de gerçek ses ve uygulama içi satın alma (development build).
5. Yük artınca makineyi 4 OCPU / 24 GB'a büyütme (ücretsiz).
