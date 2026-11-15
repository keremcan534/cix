# Emoji yönetimi (Yönetim › Emojiler)

Emoji panelinin çıkartma paketleri ve çıkartmaları uygulama güncellemesi olmadan panelden yönetilir. Uygulamayla gelen 15
paket ve 172 çıkartma değiştirilebilir ve orijinaline döner; yöneticiler kendi paketlerini ve çıkartmalarını da ekler.
Sunucu: `server/api/emoji.mjs` (tablolar `070_emoji_packs.sql`, uygulamanın listesi `server/api/stickers.mjs`), uygulama:
`app/src/lib/emoji-live-core.ts` (katalogdan okuma), `app/src/lib/live/emoji-live.ts` (ekranlar için),
`app/src/components/ReactionArt.tsx` (resimler).

## Ne değişir

**Paket** (Duygular, Müzik, Eğlence, VIP, Penguen…):

| Alan | Not |
| --- | --- |
| Ad | 2–24 karakter; iki paket aynı adı taşımaz (eski uygulama paketi adıyla satın alır) |
| Fiyat | 0–1.000.000 jeton; 0 ücretsiz. Ücretsiz paket fiyat alınca mağazada satılır, satılan paket 0 olunca herkese açılır |
| VIP seviyesi | 0–15; fiyatı 0 olan paket yalnız VIP ile açılır (VIP paketi gibi), fiyatlı pakette mağaza VIP'i denetler |
| Rafta / Kapalı | Kapalı paket emoji panelinden ve mağazadan kalkar; gönderilmiş çıkartmaları mesajlarda çizilmeye devam eder |
| Sıra | Paketlerin sırası (emoji panelinin sekmeleri ve mağaza) |

Hamle odanın kendi paketidir (her çıkartması mikrofonlarda bir şey yapar): fiyat alamaz, ona çıkartma eklenmez.

**Çıkartma:** ad (1–24), emoji (yazı satırlarında ve resmin çizilemediği yerde görünür), resim, paketi (başka pakete
taşınabilir), rafta / kapalı, paketteki sırası.

**Resim:** saydam PNG ya da WebP (kare, 96–1024 px, önerilen 256 × 256) ya da **Lottie animasyonu** (JSON, en çok 10 sn,
resimleri dosyanın içinde), en çok 512 KB. Lottie telefonda Duygular gibi oynar; web sürümü emojisini gösterir. Dosya
bilgisayardan seçilir ya da bağlantısı yapıştırılır (`POST /api/admin/emoji/fetch`, hediyelerdeki **Bağlantıdan dosya**
kurallarıyla).

**Yeni paket** listenin başına, **yeni çıkartma** paketinin sonuna eklenir. Kimlikler `ep1`, `es2`… biçimindedir.

**Orijinaline dön:** uygulamanın paketi ya da çıkartması (ya da tek bir alanı) uygulamadaki haline döner; yüklenen resim
depodan silinir. Sırası, istenmedikçe yerinde kalır.

**Silme:** yalnız yöneticinin eklediği. Bir paketi alan biri varsa paket silinmez, kapatılır (alanlar çıkartmalarını
mesajlarda görmeye devam eder). Silinen çıkartma, gönderildiği mesajlarda emojisi ve adıyla görünür.

## Telefona nasıl gider

- `GET /api/catalog?emoji=1` `emoji: { packs, gone }`: bütün paketler sırasıyla, her biri çıkartmalarıyla. Uygulamanın kendi
  resmi olan çıkartmada adres yoktur; değiştirilen ya da yöneticinin çıkartmasında `art: { url, kind: 'image' | 'lottie' }`.
  Kapatılanlar `off: true` ile listede kalır (çizilmeleri için), silinen yönetici çıkartmaları `gone` listesindedir.
- Katalog ve `/api/config` sürümüne (`v`) `emojiRev()` eklenir: bir değişiklikten sonra telefonlar kataloğu yeniden okur.
- Bu değişikliği taşıyan APK'dan itibaren emoji paneli, mağaza, paket sahipliği, mikrofondaki ve mesajlardaki çıkartmalar
  sunucunun listesini kullanır. Daha eski APK kendi derlenmiş paketlerini gösterir: yeni paket ve resimleri görmez.
- **Mağaza:** paket `pack-<id>` olarak buradaki fiyatla satılır (`economy.mjs` `sellable`). Eski uygulama paketi derlenmiş
  adı ve fiyatıyla alır (`/api/wallet/spend`, "Çıkartma paketi: Eğlence"): fiyat yükseldiyse "uygulamayı güncelle" der, jeton
  düşmez; düştüyse düşük fiyattan alır.

## Uçlar

| Uç | Ne yapar |
| --- | --- |
| `GET /api/admin/emoji` | Bütün paketler ve çıkartmalar; uygulamanınkilerin uygulamadaki değerleri (`original`), değişenler (`changed`), paneldeki resmi (`picture`: uygulamanın resmi `art/stickers/`, Lottie'de yok), kaç kişinin aldığı (`owners`), kurallar (`limits`) |
| `POST /api/admin/emoji/packs` `{name, price, minVip?, enabled?}` | Yeni paket |
| `POST /api/admin/emoji/packs/update` `{id, …}` | Paket (uygulamanınki de) |
| `POST /api/admin/emoji/packs/reset` `{id, fields?}` | Uygulamanın paketi orijinaline (`name`, `price`, `minVip`, `enabled`, `sort`) |
| `POST /api/admin/emoji/packs/delete` `{id}` | Kimsenin almadığı yönetici paketi, çıkartmalarıyla |
| `POST /api/admin/emoji/packs/order` `{ids}` | Paketlerin sırası |
| `POST /api/admin/emoji/stickers` `{pack, name, emoji?, art, artLink?, enabled?}` | Yeni çıkartma (`art`: önce `stickerart` olarak yüklenen dosya) |
| `POST /api/admin/emoji/stickers/update` `{id, …}` | Çıkartma (uygulamanınki de; `art: null` uygulamanın resmine döner) |
| `POST /api/admin/emoji/stickers/reset` `{id, fields?}` | Uygulamanın çıkartması orijinaline (`pack`, `name`, `emoji`, `enabled`, `sort`, `art`) |
| `POST /api/admin/emoji/stickers/delete` `{id}` | Yöneticinin çıkartması |
| `POST /api/admin/emoji/stickers/order` `{pack, ids}` | Bir paketin çıkartma sırası |
| `POST /api/admin/emoji/fetch` `{url}` | Bağlantıdan resim (PNG, WebP, Lottie JSON) |

Hepsi yönetici ister ve finans panelinden çağrılabilir (`panel.mjs` `PANEL_ROUTES`); her değişiklik `audit_events`'e
(`emoji.pack_*`, `emoji.sticker_*`, `emoji.fetch`) önce/sonra ve panel kullanıcısının adıyla yazılır.

## Saklama

`emoji_packs` ve `emoji_stickers` (070): uygulamanın paketi ya da çıkartması kimliğiyle bir satırdır, her boş sütun
"uygulamadaki gibi" demektir ve satır hiç silinmez (katalog sürümü yalnız artar). Yöneticinin paketi ve çıkartması kendi
satırıdır; silinen satır `deleted_at` ile kalır. Uygulamanın paket listesi sunucuda `stickers.mjs`'tedir;
`app/tests/server-catalog.test.ts` iki tarafın aynı kalmasını denetler. Paneldeki resimler: `server/api/art/stickers/`
(`python3 server/api/tools/panel-art.py`).

## Testler

- Sunucu: `server/api/test/emoji.test.mjs` (panel ve katalog, ad ve fiyat değişikliği ve mağaza, eski uygulamanın alışı,
  ücretsiz/satılık/kapalı paket ve VIP, yeni paket ve PNG/Lottie çıkartma, resim kuralları, uygulamanın çıkartmasını
  değiştirme ve taşıma, sıra, silme ve `gone`, bağlantıdan resim, yetki, denetim kaydı).
- Uygulama: `app/tests/emoji-live.test.ts` (katalogdan okuma, sıra ve kapatma, yönetici paketi, taşınan çıkartma, bozuk
  kayıtlar, emoji paneli sekmeleri, kopya), `app/tests/server-catalog.test.ts` (iki listenin aynılığı).
