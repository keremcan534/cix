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
