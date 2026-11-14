# Hediye yönetimi (Yönetim › Hediyeler)

Yöneticiler yeni hediyeyi uygulama güncellemesi olmadan ekler, düzenler, raftan kaldırır, siler ve sıralar; hediye
herkesin uygulamasında görünür ve gönderilebilir. Sunucu: `server/api/custom-gifts.mjs` (tablo `066_custom_gifts.sql`),
uygulama: `app/src/components/admin/gifts-admin.tsx` (panel), `app/src/lib/live/gifts-admin.ts` (çağrılar, yükleme),
`app/src/lib/live/catalog-live.ts` (telefonda katalog), `app/src/components/GiftArt.tsx` (uzak ikon).

## Tasarım notu (kısa)

**Panel nerede:** uygulamadaki **Ayarlar › Yönetim › Hediyeler** sekmesi. Bu ekran telefonda ve tarayıcıda (web sürümü,
`https://keremcan534.github.io/cix/`, aynı yönetici hesabıyla giriş → Ayarlar › Yönetim) aynı şekilde çalışır; ekip
bilgisayardan da hediye ekler. Web sitesindeki panel (Finance Control, `panel.<alan adı>`, ayrı depo
`similarclup-finance-control`) bilerek bağımsız bir finans platformu: kendi kullanıcıları, kendi veritabanı var ve
uygulamanın koduna dokunmaz. Hediye kataloğu orada olsaydı panelden API'ye ikinci bir yetki anahtarı ve ikinci bir
izin modeli gerekirdi. Uçlar genel (`/api/admin/gifts…`): ileride orada bir sayfa isterseniz aynı API'yi çağırır.

**Akış:** yönetici ikon (ve isterse video ya da SVGA) yükler, ad, fiyat, raf, VIP sınırı yazar, önizler, kaydeder.
Sunucu satırı yazar, kataloğun sürümünü (`v`) artırır; telefonlar `/api/config`'te sürümün değiştiğini görünce kataloğu
yeniden okur (uygulama açıkken bir iki dakika içinde; açılışta hemen). Hediye rafın başında, paneldeki sırasıyla görünür.
Fiyatı her zaman sunucu belirler; gönderim, Şanslı çanta, PK puanı, oda seviyesi, bağlar, kalp seviyesi, ajans geliri
derlenmiş hediyelerdeki gibi işler.

**Eski APK'lar:** katalogda bilmedikleri hediyeyi göstermez (yalnız derlenmiş listeyi süzerler), odada gelen bilinmeyen
hediyeyi sessizce atlar, videosunu indirmez (adresi `/api/fx/g/…`, onların süzgecinden geçmez). Yeni hediyeleri bu
özelliği taşıyan APK'dan (bu değişikliğin preview-N'i) itibaren her telefon görür; derlenmiş hediyeler aynen çalışır.

**Varsayılanlar (değiştirilebilir):**

| Karar | Varsayılan |
| --- | --- |
| Kim yapar | Yalnız yönetici hesabı (`role = admin`); her işlem `audit_events`'e yazılır (kim, ne, önce/sonra, IP) |
| Fiyat | 1 – 1.000.000 jeton, tam sayı; değişiklik yeni gönderimlerden itibaren geçer, geçmiş gönderim kendi fiyatıyla kalır |
| Raf | Popüler, İkili, Kutlama, Özel (Özel'de en düşük VIP 1–10) |
| Sıra | Yöneticinin hediyeleri kendi rafının başında, paneldeki sırayla; yeni eklenen en başa |
| Ad | 2–24 karakter; aynı adda iki hediye olmaz (derlenmişlerle de) |
| İkon | PNG ya da WebP, saydam, kare (en çok 1:1,25), 128–1024 px (önerilen 512 × 512), en çok 1 MB |
| Video (hazır) | Yığılmış MP4: H.264, üst yarı renk, alt yarı alfa (ör. 540 × 1920), 1–15 sn, en çok 12 MB |
| Video (kaynak) | Saydam WebM (VP8/VP9 alfa) ya da ProRes 4444 .mov, en çok 100 MB; sunucu 540 × 960 görünür, 20 fps, AAC sesli yığılmış MP4'e çevirir |
| SVGA | SVGA 2.x, en çok 100 MB ve 15 sn; sunucu aynı biçime çevirir, sesini korur. Ekrandaki boyutu: Küçük %45, Orta %60 (varsayılan), Büyük %80, Tam ekran %100 |
| Arka plan silme | **Yapılmaz.** Kaynakta saydamlık yoksa ya da çıkan videonun hiçbir yeri saydam değilse reddedilir; arka planı silinmiş kaynak yükleyin |
| Silme | Hediye raflardan ve panelden kalkar, gönderilemez; satır geçmiş için saklanır, ikonu ve videosu depodan silinir |
| Raftan kaldırma | Panelde kalır, kataloğda görünmez, gönderilemez; tekrar rafa konabilir |

## Yöneticinin adımları

1. **Ayarlar › Yönetim › Hediyeler › Yeni hediye.**
2. Ad, fiyat, raf (Özel ise VIP seviyesi), isteğe bağlı emoji (sohbet satırlarında görünür), Rafta / Kapalı.
3. **İkon seç:** saydam PNG ya da WebP.
4. **Video seç (isteğe bağlı):** `.mp4` hazır yığılmış video olarak olduğu gibi kullanılır; `.webm`, `.mov` ve `.svga`
   sunucuda çevrilir. SVGA için ekrandaki boyutu seçilir.
5. **Önizleme:** rafındaki kutucuk (ikon, ad, fiyat) ve büyük ikon; videosu hazır olan hediyenin videosu telefonda
   oda sahnesinin üstünde oynatılabilir (web'de saydam video oynatıcı yok).
6. **Hediyeyi ekle.** Çevrilen videoda liste "Video çevriliyor" der ve birkaç saniyede bir yenilenir; bitince
   "Video hazır · süre · boyut", olmazsa nedeni ("Bu videoda saydamlık yok…"). Çevrilirken hediye videosuz gönderilir
   (ikonu uçar), eski video varsa o oynar.
7. Listede ok tuşlarıyla rafın içinde sıra, **Düzenle**, **Raftan kaldır / Rafa koy**, **Sil**.

## Telefona nasıl gider

- `GET /api/catalog` `gifts`: yöneticinin rafta olan hediyeleri **önce**, `custom: true`, `emoji` ve `icon` (bu sunucunun
  adresi) ile; ardından derlenmiş hediyeler. Yeni uygulama bunları rafların başına koyar (`giftShelf`), kimlikle bulur
  (`giftById`: odadaki duyuru, kombo, Gelir, Çantam), ikonunu çizer (`GiftArt`).
- `fx`: videoları `{kind: 'gift', id, url: '/api/fx/g/<id>.mp4?v=<sürüm>', bytes, ms}`; telefon klibi bir kez indirip
  saklar (`g-<id>-<sürüm>.mp4`), sürüm değişince yenisini alır, listeden çıkanı siler. İnmemişse çizimli efekt oynar.
- `v` (katalog ve `/api/config`): canlı ayarların sürümü + yöneticinin hediyelerinin sürümü (`custom_gifts.rev`).
  Bir değişiklik olunca telefonlar kataloğu yeniden okur. Odada bilmediği bir hediye gelirse telefon kataloğu hemen
  yeniden okur ve hediyeyi o zaman çizer.

## Sunucu

- Uçlar: [`SUNUCU.md`](SUNUCU.md) › Hediye, sıralama, satın alma (`/api/admin/gifts…`, `/api/fx/g/<id>.mp4`).
- Dosyalar depoda (R2, `media.mjs` türleri `gifticon`, `giftvideo`, `giftsource`; yalnız yönetici): telefon / tarayıcı
  doğrudan depoya yükler, kayıt adresini söyler. Sunucu kaydederken dosyayı okur ve denetler: ikonun türü, boyutu,
  saydamlığı; videonun H.264 olduğu, yığılmış biçimi (alt yarısı gri bir maske mi) ve bir yerinin saydam olduğu.
- Çevirme arka planda, tek tek: kaynak indirilir, `ffmpeg` (WebM / MOV) ya da `tools/svga-to-fx.py` (SVGA; Python,
  numpy, Pillow) ile çevrilir, denetlenir, depoya konur, hediye yeni videoya geçer, kaynak silinir. Depo ya da yeniden
  başlatma yüzünden yarıda kalan iş birkaç kez daha denenir; dosyanın kendisinden kaynaklanan hata bir kez söylenir.
  Docker imajı `ffmpeg python3 py3-numpy py3-pillow` kurar. Ayar: `FFMPEG`, `FFPROBE`, `PYTHON` (programların yolu),
  `CUSTOM_GIFTS_POLL_MS` (başka bir sürecin değişikliğini okuma aralığı, varsayılan 5000).
- Gönderim yolları sunucu fiyatıyla: `POST /api/gifts/send` (oda, profil, sohbet, aile, Anlar), Şanslı çanta
  (`lucky-bags.mjs`). Çantam (ödül hediyeleri) yalnız derlenmiş hediyeleri tutar; mağaza (`economy.mjs`) hediye satmaz.

### Tarayıcıdan yükleme için bir kez: depoda CORS izni

Telefondan yüklemede gerekmez. Web sürümünden (bilgisayardan) ikon ve video yüklemek için Cloudflare R2'de kovanın
**Settings › CORS Policy** bölümüne şu kural eklenmeli:

```json
[{ "AllowedOrigins": ["https://keremcan534.github.io"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 600 }]
```

Kendi alan adınızda yönetim açılırsa o adres de `AllowedOrigins`'e eklenir.

## Sınırlar

- SVGA 1.x (zip) okunmaz; 2.x'te vektör şekiller, maskeler ve kırpma yolları çizilmez (betik sayar ve atlar).
- Sunucu 1 OCPU: 5 saniyelik bir SVGA birkaç on saniyede, 15 saniyelik büyük bir kaynak birkaç dakikada çevrilir.
- Web'de saydam video oynatıcı olmadığı için video önizlemesi yalnız telefonda.

## Testler

- Sunucu: `server/api/test/custom-gifts.test.mjs` (yetki, ikon kuralları, katalog ve sürüm, eski uygulamanın süzgeci,
  sunucu fiyatıyla gönderim, fiyat değişikliği, raftan kaldırma, sıra, hazır video, WebM çevirme, saydamlığı olmayan
  kaynağın reddi, SVGA çevirme ve boyutu, SVGA 1.x ve 15 sn'den uzunun reddi, silme ve denetim kaydı). CI ffmpeg,
  numpy ve Pillow'u kurar.
- Uygulama: `app/tests/custom-gifts.test.ts` (katalogdan okuma, bozuk kayıtların atlanması, raf sırası, kimlikle bulma,
  telefondaki kopya, video adresi ve eski uygulamanın süzgeci, paneldeki yardımcılar).
