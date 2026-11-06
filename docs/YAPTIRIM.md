# Yaptırım sistemi: susturma, hesap banı, cihaz banı

Sunucu: `server/api/sanctions.mjs`, tablo yapısı: `migrations/014_sanctions.sql`. Uygulama: `app/src/lib/sanctions.ts`,
`app/src/components/sanction-screen.tsx`, yönetim: `app/src/components/admin/sanction-*.tsx`.

## Türler ve nerede uygulanır

| Tür | Kod | Etkisi | Nerede durdurulur |
| --- | --- | --- | --- |
| Oda içi yazılı susturma | `mute_room_text` | O odada sohbete yazamaz | Ses jetonunda veri izni yok (live.mjs); bağlıysa izin hemen düşer |
| Oda içi mikrofon susturma | `mute_room_voice` | O odada konuşamaz | Ses jetonunda yayın izni yok; LiveKit mikrofonu kapatır |
| Genel yazılı susturma | `mute_global_text` | Tüm odalarda yazamaz; istenirse DM de | live.mjs, messages.mjs |
| Genel sesli susturma | `mute_global_voice` | Tüm odalarda konuşamaz; istenirse aramalar da | live.mjs |
| Tüm iletişim susturması | `mute_all` | Yazı, ses, DM, arama | Hepsi |
| Hesap banı | `account_ban` | Her istek reddedilir, oturumlar kapanır, odası kapanır | core.mjs `auth()`, auth.mjs giriş |
| Cihaz banı | `device_ban` | O cihazdan hiçbir hesapla giriş / kayıt olmaz | core.mjs, auth.mjs `deviceGate` |

Her yaptırım ayrı bir satırdır; birini kaldırmak diğerini kaldırmaz. Süreler sunucu saatiyle (Postgres `now()`)
hesaplanır; telefonun saatini değiştirmek hiçbir şeyi kısaltmaz. Uygulamadaki geri sayım sunucunun gönderdiği
`serverNow` üzerinden tekdüze saatle işler, sıfıra gelince yalnızca sunucuya yeniden sorar.

Reddetme cevapları: ban için `403 {code: account_banned|device_banned, sanction, serverNow, appealSession?}`,
susturma için `403 {code: 'muted', sanction, serverNow}`.

## Yetkiler

- **Oda yöneticisi:** kendi odasında sohbet / mikrofon susturması, en çok 7 gün. Oda sahibini, platform
  personelini ve başka bir oda yöneticisini susturamaz.
- **Oda sahibi:** kendi odasında daha uzun (uygulamada 30 gün seçeneği, sunucu 10 yıla kadar kabul eder) ya da
  "ben kaldırana kadar". Odadaki her susturmayı kaldırabilir; platformun verdiklerini kaldıramaz.
- **Ajans yöneticisi:** yalnızca kendi yayıncılarının yaptırımlarını görür (`GET /api/agency/member-sanctions`).
- **Platform moderatörü** (`users.role = moderator`): genel susturma, 90 güne kadar hesap banı, 30 güne kadar
  cihaz banı, süreli yaptırım kaldırma, itiraz inceleme. Yönetim panelinde yalnızca Yaptırımlar sekmesini görür.
- **Süper yönetici** (`admin`): hepsi; ömür boyu ban, kademeler, yetki verme, itiraz kararları.
- Ek yetkiler `admin_permissions` tablosuyla kişiye özel verilebilir (panel: Yaptırımlar → Yetkiler).

## Otomatik susturma

İletişim filtresi (docs/SUNUCU.md, "İletişim filtresi") bir metni her reddettiğinde `contact_refusals`'a bir satır
yazılır; uygulamanın göndermeden reddettikleri de (`POST /api/contact/refusals`) aynı sayaca girer. Sunucu her
retten hemen sonra sayar (`sanctions.mjs` `contactStrike`, `core.mjs` `countRefusal`):

- Son `AUTO_MUTE_WINDOW` dakikada (varsayılan 60) `AUTO_MUTE_REFUSALS` ret (varsayılan 5) olunca sistem kişiye
  `AUTO_MUTE_MINUTES` dakikalık (varsayılan 60) genel yazılı susturma verir, DM dahil (`mute_global_text`,
  `include_dm`). Gerekçe `contact_sharing` (`migrations/018_contact_auto_mute.sql`): kişi "Otomatik: iletişim
  bilgisi paylaşma denemesi" görür; yönetim panelinde kaynak "Otomatik (iletişim filtresi)", veren "Otomatik
  sistem", iç not "1 saatte 5 kez iletişim bilgisi yazmaya çalıştı". Yazılmak istenen metin hiçbir yerde saklanmaz.
- Bu gerekçeyi yalnızca sistem verir: yönetim panelinin gerekçe listesinde yoktur; yetkilinin elle verdiği
  yaptırım, ceza kademesi ayarı ve oda sahibinin ya da oda yöneticisinin susturması bu gerekçeyle reddedilir
  (`400`). Böylece "Otomatik: …" yazısı yalnızca gerçekten otomatik verilen susturmada görünür.
- Susturma DM'leri ve bütün odalarda sohbeti kapatır (messages.mjs, live.mjs; bağlı olduğu odada veri izni hemen
  ardından düşer, ret cevabı LiveKit'i beklemez). Mikrofon ve aramalar açık kalır.
- Yalnızca kişinin DM'ini ve oda sohbetini kapatan son susturma (bu kuralınki ya da bir yetkilinin DM dahil yazılı
  susturması) bittikten ya da kaldırıldıktan sonraki retler sayılır. Susturma sürerken yapılan retler (profil,
  anlar gibi susturmanın kapatmadığı yerlerde) yetkili için kayda geçer ama sonradan da sayılmaz: süre bitince ya
  da yetkili kaldırınca sayım sıfırdan başlar, son iki deneme yine uyarılır. Yalnızca oda sohbetini kapatan bir
  susturma (DM açık) sayımı sıfırlamaz.
- Kişinin DM'i ve oda sohbeti zaten kapalıysa (bu kuralın ya da bir moderatörün susturmasıyla) yeni susturma
  eklenmez, uyarı da gönderilmez.
- Personel (`moderator`, `admin`) susturulmaz; retleri yine sayılır.
- Aynı anda gelen retler tek susturma doğurur (kişi başına işlem kilidi). Dakikada 20'den fazla ret yazılmasa da
  her biri sayılır (zamanları sunucunun belleğinde tutulur; sunucu yeniden başlarsa yazılmayanlar unutulur).
- Kural isteği bozmaz: hata olursa yalnızca kayda geçer, 2 saniyeden uzun sürerse ret cevabı onu beklemez.
  Şikâyetle gelen otomatik yaptırımlar (`autoFromReports`) bu susturmayı "yakın zamanda verilmiş otomatik
  yaptırım" saymaz.
- `AUTO_MUTE_REFUSALS=0` kuralı kapatır. Ayarlar: `server/infra/.env.example`.

Uyarı: son iki denemede ret cevabı (`400 {code: 'contact_blocked', …}` ve `POST /api/contact/refusals`)
`strikesLeft` (2 ya da 1) ve `muteMinutes` taşır; uygulama ret notunun altına "2 deneme hakkın kaldı; sonra 1 saat
mesaj yazamazsın." ya da "Bir kez daha denersen 1 saat mesaj yazamazsın." yazar. Susturmayı başlatan ret
`muted: true, until, muteMinutes, sanction, serverNow` taşır; uygulama yazma kutusunda susturma şeridini gerekçe ve
kalan süreyle gösterir. İtiraz ve kaldırma her yaptırımdaki gibidir.

## Cihaz kimliği

Uygulama girişte üç işaret gönderir: kurulum kimliği, Android kimliği (Android), anahtar zinciri kimliği
(iOS/Android güvenli depo). Sunucu bunları **ham olarak saklamaz**, yalnızca SHA-256 özetlerini tutar
(`device_registry`). Web sürümünde yalnızca kurulum kimliği vardır, bu yüzden web'de cihaz banı tarayıcı verisini
silerek aşılabilir. Play Integrity / App Attest henüz bağlı değildir.

## Saklama ve silme (UK GDPR)

- Yaptırım, itiraz, kanıt ve işlem kayıtları silinmez; kaldırılan yaptırım `lifted` durumuna geçer, kim ve neden
  kaldırdığı yazılır. Bu, itiraz ve tekrar eden ihlal kademeleri için gereklidir.
- Hukuki dayanak: UK GDPR Madde 6(1)(f) meşru menfaat (platform güvenliği ve kötüye kullanımın önlenmesi).
- Önerilen saklama süresi: süreli yaptırımlar bittikten sonra 2 yıl, ömür boyu banlar ve cihaz banları
  sürdükçe. Bu süre dolan kayıtların anonimleştirilmesi için henüz otomatik iş **yoktur**; yayından önce
  eklenmelidir.
- Kişi kendi yaptırımlarını, gerekçesini, bitişini ve itiraz durumunu uygulamada görür (Madde 15 erişim hakkı).
  İç not (`internal_note`) yalnızca personel içindir ve kişiye gönderilmez.
- Hesap silme, süren bir susturma yüzünden reddedilmez (UK GDPR silme hakkı). Kişisel bilgiler silinir; yaptırım
  kayıtları ve cihaz bağı, yaptırımın aşılmasını önlemek için kalır. Silinen hesapta süren genel susturma, aynı
  cihazda silmeden sonra açılan yeni hesaba aynı bitişle geçer (`sanctions.mjs` `carryMutes`). Cihazdaki eski
  hesaplar ve oda içi susturmalar etkilenmez.

## Bilinen sınırlar

- Oda sohbeti susturulan kişinin odadaki veri kanalı tamamen kapanır; koltuk sinyalleri ve hediye animasyonları
  da yayınlanmaz.
- Aramalar sunucuda olmadığı için arama susturması yalnızca `/api/sanctions/check?action=call` ile sorulabilir.
- Gerçek telefonda ve gerçek LiveKit ile denenmedi; yeni yerel modüller için yeni APK gerekir.
- Var olan bir yaptırıma sonradan kanıt ekleme ekranı yok (sunucu ucu var).
- Otomatik susturmanın "son iki deneme" uyarısı yalnızca ret notu gösteren yazma kutularında görünür: DM, oda ve
  grup sohbeti, anlar (paylaşım ve yorum), ajans açıklaması (Ajans paneli › Ayarlar) ve ajans ağındaki gerekçe
  kutusu. Reddi uyarı penceresiyle bildiren ekranlarda görünmez: profil ve giriş (ad, şehir, hakkında), oda adı ve
  duyurusu, oda anketi, etkinliği ve sorusu, tayfa adı ve duyurusu, ajans başvurusu ve katılma notu (ajans ağı),
  ajans ofisi adı ve bölgesi, ajans değiştirme gerekçesi, ajans paneli görev ve etkinlik başlıkları. Bu ekranlarda
  3. ve 4. ret uyarısız geçer; sayım ve susturma oralarda da işler.
- Ajans açıklaması kaydet düğmesi olmadığı için alandan çıkınca denetlenir; aynı metinle alana girip çıkmak yeni
  ret saymaz (`fieldRefusal`), metin değişince yeniden sayılır.
- Oda sohbeti sunucudan geçmez (LiveKit veri kanalı): oradaki ret yalnızca uygulamada yapılır ve sunucuya
  uygulamanın kendi bildirimiyle (`POST /api/contact/refusals`) sayılır. Filtreyi ya da bildirimi atlayan
  değiştirilmiş bir uygulama oda sohbetine iletişim bilgisi yazabilir ve bu yüzden sayılmaz, susturulmaz. Susturma
  başladıktan sonra ise oda sohbeti sunucuda kapanır (LiveKit veri izni). Sunucunun kendi denetlediği yerler
  (DM, profil, oda adı ve duyurusu, ajans, Jeton Noktası notu) bu sınırın dışındadır.
