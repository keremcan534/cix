# Banner Yönetimi

Sahiplerin isteği ve tasarımı (25 Kasım 2026): Odalar ekranının üstündeki kaydırmalı alan panelden yönetilir. Önce yönetimin bannerları, sonra (varsa) banner olarak gösterilen duyurular, en sonda üç sıralama (Zirvedeki ajanslar, En çok hediye alanlar, En çok hediye gönderenler).

## Panelde

**Duyuru ve etkinlik › Banner Yönetimi** (yetki: `app.notices`, Duyurular'la aynı ekip).

- **Önizleme:** yayındaki bannerlar telefondaki sırayla, kendiliğinden kayarak; oklar ve noktalarla gezilir.
- **Banner Listesi:**
  - Arama ve durum süzgeci: Tümü, Yayında, Planlandı, Taslak, Pasif, Süresi doldu.
  - Her satırda küçük görsel, durum, tarih aralığı ("15 Kas – 30 Kas" ya da "Süresiz"), bağlantı ve son 7 günün görüntülenme ile tıklama sayısı.
  - Aç/kapa anahtarı, düzenle, kaldır.
  - Satırlar sürüklenerek sıralanır; "Sıralamayı kaydet" ile telefonlara geçer.
- **Yayın Planı:** önümüzdeki haftalar bir zaman çizelgesinde. Her banner, yayında kalacağı günler boyunca bir çubuk; bugün pembe çizgi.
- **Performans:** son 7, 30 ya da 90 günün görüntülenme, tıklama ve tıklama oranı; günlük grafik ve banner banner tablo.
- **Yeni banner / düzenle:**
  - Başlık (2–60), alt yazı (120), bağlantı (hazır listeden ya da uygulama içi yol), düğme yazısı (24, bağlantı gerekir).
  - Görsel: yükleme (JPEG/PNG/WebP, 5 MB, yatay) ya da hazır örneklerden biri.
  - "Yazıları göster": görselin kendi yazısı varsa kapatılır; düğme yine görünür.
  - Renk: mor, pembe, altın ya da turkuaz (düğme ve kenar).
  - Başlangıç ve bitiş (boş: hemen ve süresiz); "Yayında".
  - Pencerede telefondaki görünümün önizlemesi var.

**Durumlar:**

| Durum | Ne zaman |
| --- | --- |
| Taslak | Hiç açılmamış |
| Yayında | Açık, başlangıcı gelmiş, bitişi gelmemiş |
| Planlandı | Açık ama başlangıcı gelmemiş |
| Pasif | Bir kez açılmış, sonra kapatılmış |
| Süresi doldu | Bitişi geçmiş |

Telefonlar en çok 10 yayındaki bannerı gösterir.

## Örnek bannerlar

Göç 131 sahiplerin gönderdiği üç görseli yayında ekler. Görseller uygulamanın içinde (`app/assets/banners/ornek-*.webp`), panelde de önizlemesi var (`web/img/banners/`):

| Banner | Bağlantı |
| --- | --- |
| En Çok Hediye Alanlar | haftalık yayıncı sıralaması |
| En Çok Hediye Gönderenler | haftalık zengin sıralaması |
| Zirvedeki Ajanslar | haftalık ajans sıralaması |

Panelden değiştirilir, kapatılır ya da kaldırılır.

## Sıralama kartları

Sahiplerin neon tasarımı (25 Kasım 2026):

- Sol üstte kartın kendi resmi: sandık, elmas ya da hediye kutusu (`assets/banners/podyum/baslik-*`).
- Başlık, ne saydığı ve sağda Gün/Hafta/Ay; altında ince bir çizgi.
- İlk üç kişi parlayan kürsülerde: 2. mor, 1. altın (iki yanında defne dalı), 3. pembe.
- Her birinin üstünde gümüş, altın ya da bronz taç; fotoğraf halkası ve sıra rozeti aynı renkte.
- İsim ve puan kürsünün üstünde. Boş sıra "Sıra boş" ve "—" gösterir.

## Sayım

- Bir kişi bir bannerı günde bir kez görüntülemiş ve bir kez tıklamış sayılır.
- Uygulama, kaydırmalı alanda o an görünen bannerı bildirir (`POST /api/banners/seen`); dokununca `POST /api/banners/click`.
- Sayılar günlük toplam olarak tutulur (`banner_stats`), kişi bilgisi tutulmaz.
- "Günde bir kez" sunucunun belleğinde tutulur; sunucu yeniden başlarsa aynı gün bir kişi bir kez daha sayılabilir.

## Eski APK

- Yeni bannerları duyuru kartı olarak görür: başlık, alt yazı ve yüklenmiş görsel.
- Hazır örnek görseller eski uygulamada yok; o bannerlar görselsiz duyuru kartı olarak çıkar.
- Sıralama kartları eski tasarımla kalır.
- Yeni uygulama `GET /api/room-banners?banners=1` ile bannerları ayrı alır.

## Teknik

- **Sunucu:** `server/api/banners.mjs`.
  - Uçlar: `GET/POST /api/admin/banners`, `/toggle`, `/order`, `/remove`, `/stats`, `POST /api/banners/seen`, `/click`.
  - Telefonların listesi `team.mjs` `GET /api/room-banners` içinde.
  - Her yönetici işlemi `audit_events`'e yazılır (`banner.create|update|toggle|order|remove`).
- **Göç:** `131_banners.sql` (`banners`, `banner_stats`). Satırlar silinmez; kaldırılan banner `removed_at` alır.
- **Görsel:** yükleme türü `notice` (Duyurular'ınki).
- **Uygulama:** `components/room-banners.tsx` (`BannerCard`, `BoardCard`), `lib/live/team.ts` (`bannersOf`, `bannerSeen`, `bannerClick`).
- **Panel:** `web/pages/app-banners.js`; `server/app-admin.ts` APP_ROUTES (`app.notices`).
- **Testler:**
  - Sunucu: `server/api/test/banners.test.mjs`.
  - Uygulama: `app/tests/banners-parse.test.ts`.
  - Panel: rota listesi testi.

## Kimlere ve Ajans Başvurusu bannerı (26 Kasım 2026)

Her bannerın bir **Kimlere** seçeneği var: **Herkes** ya da **Ajansı olmayanlar** (`audience`: `all` | `no_agency`). Ajansı olmayanlar seçilen banner, bir ajansta yayıncı olan, ajans sahibi olan ya da ajans ekibinde olan kişiye gönderilmez (`GET /api/room-banners`). **Ajans Başvurusu** bannerı (görseli uygulamada: `ajans-basvurusu`) artık burada yönetilen bir bannerdır: sıranın başında, Ajansı olmayanlar için, `/ajans`’a gider (136). Panelden kapatılır, sıralanır, tarih verilir. Görsel, kayan alanın her telefon genişliğinde yazısı ve düğmesi kesilmeyecek şekilde hazırlandı.
