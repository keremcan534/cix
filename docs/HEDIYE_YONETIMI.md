# Hediye yönetimi (Yönetim › Hediyeler)

Yöneticiler yeni hediyeyi uygulama güncellemesi olmadan ekler, düzenler, raftan kaldırır, siler ve sıralar; hediye
herkesin uygulamasında görünür ve gönderilebilir. Uygulamanın kendi hediyeleri de aynı yerden değişir (aşağıda
**Uygulamanın kendi hediyeleri**). Sunucu: `server/api/custom-gifts.mjs` (tablo `066_custom_gifts.sql`, `069`),
uygulama: `app/src/components/admin/gifts-admin.tsx` (panel), `app/src/lib/live/gifts-admin.ts` (çağrılar, yükleme),
`app/src/lib/live/catalog-live.ts` (telefonda katalog), `app/src/components/GiftArt.tsx` (uzak ikon).

## Tasarım notu (kısa)

**Panel nerede:** iki yerde, aynı sunucu uçlarıyla (`/api/admin/gifts…`):

- Uygulamadaki **Ayarlar › Yönetim › Hediyeler**: telefonda ve tarayıcıda (web sürümü, `https://keremcan534.github.io/cix/`,
  yönetici hesabıyla giriş) çalışır.
- Web'deki finans paneli (Finance Control, `panel.<alan adı>`, ayrı depo `similarclup-finance-control`) **Uygulama ›
  Hediyeler**: panelin kendi kullanıcıları ve rolleriyle (`app.gifts`). Panelin sunucusu API'yi aynı makinede bir
  anahtarla çağırır; işlem API'de Finance Control hesabıyla yapılır ve denetim kaydına panel kullanıcısının adıyla
  yazılır (`docs/SUNUCU.md` › Finans paneli). Panelde video önizlemesi tarayıcıda da saydam oynar.

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
| İkon | PNG ya da WebP, saydam, kare (en çok 1:1,25), 128–4096 px (önerilen 512 × 512), en çok 10 MB. Telefonlar hediye panelinin bütün ikonlarını indirir: 1024 px'ten ya da 1 MB'tan büyük ikonu sunucu kaydederken küçültür (en çok 1024 px ve 1 MB, saydam PNG, `tools/icon-fit.py`); yüklenen büyük dosya silinir |
| Video (hazır) | Yığılmış MP4: H.264, üst yarı renk, alt yarı alfa (ör. 540 × 1920), 1–15 sn, en çok 12 MB |
| Video (kaynak) | Saydam WebM (VP8/VP9 alfa) ya da ProRes 4444 .mov, en çok 500 MB; sunucu 540 × 960 görünür, 20 fps, AAC sesli yığılmış MP4'e çevirir. Dosya küçük olsun diye bu boyutta (540 × 960, 20 fps) dışa aktarın: görüntü aynı kalır, ProRes 4444 dosyası 1080 × 1920'ye göre kabaca dörtte birine iner |
| SVGA | SVGA 2.x, en çok 250 MB ve 15 sn (çevirici dosyayı bütün okur: 244 MB'lık bir SVGA 0,8 GB bellekle yaklaşık bir dakikada çevrildi); sunucu aynı biçime çevirir, sesini korur. Ekrandaki boyutu: Küçük %45, Orta %60 (varsayılan), Büyük %80, Tam ekran %100 |
| Arka plan silme | **Yapılmaz.** Kaynakta saydamlık yoksa ya da çıkan videonun hiçbir yeri saydam değilse reddedilir; arka planı silinmiş kaynak yükleyin. Reddedilen videonun odada nasıl görüneceği (arka planıyla kutu gibi) listede **Önizle** ile izlenir |
| Silme | Hediye raflardan ve panelden kalkar, gönderilemez; satır geçmiş için saklanır, ikonu ve videosu depodan silinir |
| Bağlantıdan dosya | Finans panelinde her dosyanın yanında "ya da bağlantı yapıştır": sunucu dosyayı bir kez indirir, yüklenmiş gibi denetler ve kendisi sunar (aşağıda **Bağlantıdan dosya**) |
| Raftan kaldırma | Panelde kalır, kataloğda görünmez, gönderilemez; tekrar rafa konabilir |

## Uygulamanın kendi hediyeleri (hazır 65 hediye)

Uygulamayla gelen hediyeler (Gül, Roket, Sevimli Panda, Pırlanta Yüzük…, `server/api/catalog.mjs` `GIFT_ROWS`) de
panelden değişir; geliştiriciye ya da uygulama güncellemesine gerek yoktur. Finans panelinin **Uygulama › Hediyeler**
listesi bunları da gösterir (`GET /api/admin/gifts?builtin=1`): uygulamadaki resmi (sunucunun `art/` kopyası), uygulamadaki
değerleri (`original`), neyin değiştirildiği (`changed`) ve son 30 günde kaç kez gönderildiği.

- **Değişebilenler:** ad, emoji, fiyat, raf, VIP seviyesi (Özel rafta), rafta / kapalı, raftaki sıra, ikon, video (hazır
  MP4, saydam WebM / MOV ya da SVGA; yöneticinin hediyelerindeki kurallarla). Duraklatılmış hediyeler (14 Kasım'da raftan
  kalkan 41 hediye, `GIFTS_PAUSED`) **Rafa koy** ile geri gelir; açık bir hediye raftan kaldırılabilir.
- **Orijinaline dön:** `POST /api/admin/gifts/reset` `{id, fields?}` hediyeyi (ya da yalnız bir alanını) uygulamadaki
  haline döndürür; yüklenen ikon ve video depodan silinir. Raftaki yeri, istenmedikçe yerinde kalır (sıralanmış raf bozulmaz).
- **Silinmez:** uygulamanın hediyesi her telefonda var; silmek yerine raftan kaldırılır.
- **Raftan kalkan uygulama hediyesi** (duraklatılmışlar gibi) kataloğa girmez ama gönderilebilir: eski bir telefon ya da
  Çantam gönderebilir, odadaki telefonlar onu çizer.
- **Video:** yeni video uygulamanın kendi klibinin yerine geçer (`/api/fx/g/<id>.mp4`; yöneticinin hediyeleri gelen
  sürümden bu yana her uygulama indirir). `video: null` hediyeyi videosuz uçurur; orijinale dönünce kendi klibi geri gelir.
- **Fiyat ve eski uygulamalar:** eski APK hediyenin adını, resmini ve fiyatını kendi içinden çizer. Fiyatı panelden
  değiştirilen bir uygulama hediyesi bu yüzden eski uygulamaların kataloğunda hiç görünmez, gönderirlerse "uygulamayı
  güncelle" der (409 `update_required`), jeton düşmez. Ad, emoji, ikon ve raf değişikliği eski uygulamada eski haliyle
  görünür, gönderim sorunsuz işler. Bu değişikliği taşıyan APK'dan itibaren telefon her şeyi sunucudan alır
  (`/api/catalog?gifts=2`), raftakini yalnız sunucunun listesine bakarak gösterir ve gönderirken ekranda gördüğü fiyatı
  da yollar: arada fiyat değiştiyse sunucu reddeder (409 `price_changed`, yeni fiyatla), telefon kataloğu yeniden okur.
- **Çantam (görev ödülü):** çantadaki hediye ödül olarak verildiği değerle, uygulamadaki fiyatıyla gönderilir; panelden
  fiyat değişikliği ödülü değerli kılmaz. Adı panelde verilen addır.
- **Ad çakışması:** iki hediye aynı adı taşıyamaz (uygulamanınkiler şimdiki adlarıyla). Bir uygulama hediyesinin adı
  değiştirilince eski adı başka hediyeye verilebilir; o zaman o hediye "ad" alanında orijinaline dönemez (409).
- **Panel resimleri:** `server/api/art/gifts/<id>.webp` ve `art/stickers/` uygulamanın resimlerinin küçük kopyalarıdır
  (`python3 server/api/tools/panel-art.py` ile yeniden üretilir), `GET /api/fx/art/…` ile panele gider; telefonlar
  kullanmaz.

Saklama: `custom_gifts` tablosunda uygulama hediyesinin kimliğiyle bir satır (`builtin`, 069); her boş sütun
"uygulamadaki gibi" demektir, satır hiç silinmez (katalog sürümü yalnız artar).

## Yöneticinin adımları

1. **Ayarlar › Yönetim › Hediyeler › Yeni hediye.**
2. Ad, fiyat, raf (Özel ise VIP seviyesi), isteğe bağlı emoji (sohbet satırlarında görünür), Rafta / Kapalı.
3. **İkon seç:** saydam PNG ya da WebP.
4. **Video seç (isteğe bağlı):** `.mp4` hazır yığılmış video olarak olduğu gibi kullanılır; `.webm`, `.mov` ve `.svga`
   sunucuda çevrilir. SVGA için ekrandaki boyutu seçilir.
5. **Önizleme:** rafındaki kutucuk (ikon, ad, fiyat) ve büyük ikon; videosu hazır olan hediyenin videosu telefonda
   oda sahnesinin üstünde oynatılabilir (web'de saydam video oynatıcı yok).
6. **Hediyeyi ekle.** Çevrilen videoda liste "Video çevriliyor" der ve birkaç saniyede bir yenilenir; bitince
   "Video hazır · süre · boyut", olmazsa nedeni tam cümleyle: ne yanlış ve nasıl dışa aktarılmalı ("Bu videoda saydamlık
   (alfa kanalı) yok: arka planıyla odada kutu gibi görünür… arka plan katmanını kapatıp ProRes 4444 + Alpha (.mov) ya da
   saydam WebM seçin"). Çevrilirken hediye videosuz gönderilir (ikonu uçar), eski video varsa o oynar.
   - **Reddedilen videonun önizlemesi:** Video çevrildi ama hiçbir yeri saydam değilse (arka planı silinmemişse) çıkan hali
     saklanır; listede ve Düzenle'de **Önizle** onu oda sahnesinin üstünde oynatır, böylece odada nasıl, arka planıyla kutu
     gibi görüneceği görülür. Hediyedeki video değişmez. Önizleme dosyası sonraki videoyla, orijinale dönmeyle ya da
     hediyeyle silinir (`custom_gifts.job_preview`, 072).
7. Listede ok tuşlarıyla rafın içinde sıra, **Düzenle**, **Raftan kaldır / Rafa koy**, **Sil**.

## Bağlantıdan dosya (kendi sitenizden)

Finans panelinin (Uygulama › Hediyeler) hediye formunda ikonun ve videonun **Dosya seç**'inin altında bir bağlantı alanı
vardır: dosyayı kendi sitenize (ör. GoDaddy hostingde `/hediyeler/` klasörüne) koyup adresini yapıştırırsınız,
**Bağlantıdan çek**'e basarsınız, sonra **Kaydet**.

- **Hangi bağlantı olur:** dosyayı **doğrudan indiren** adres; tarayıcıda açınca dosyanın kendisi görünmeli ya da hemen
  inmeli. Ör. `https://alanadiniz.com/hediyeler/yuzuk.png`, `https://alanadiniz.com/hediyeler/yuzuk.svga`. `http://` ya da
  `https://` ile başlamalı, 80/443 dışında bir port, kullanıcı adı ya da parola olmamalı.
- **Olmayanlar:** Google Drive ya da Dropbox **paylaşım sayfası**, GoDaddy **dosya yöneticisi**, giriş isteyen sayfalar:
  bunlar dosyayı değil bir web sayfasını açar ve "Bu bağlantı dosyanın kendisini değil bir web sayfasını açıyor…"
  cümlesiyle reddedilir. Bulunamayan dosya "sunucu 404 dedi", yanlış tür "İkon PNG ya da WebP olmalı; bağlantıdaki bir
  SVGA" gibi, büyük dosya sınırıyla, yavaş ya da kapalı site "zamanında cevap vermedi" der.
- **Yanlış alana yapıştırılan bağlantı:** Videonun bağlantısı ikonun alanına (ya da resmin bağlantısı videonun alanına)
  yapıştırılırsa panel bunu dosya adından anlar, bağlantıyı doğru alana taşır ve orada çeker ("Bu bir video bağlantısı:
  Video alanına taşındı"). Adından anlaşılmazsa sunucu söyler: "Bu bağlantı bir video (19,5 MB): ikonun değil, videonun
  bağlantı alanına yapıştırın" (ikonun 10 MB sınırı yerine).
- **Ne olur:** uygulamanın sunucusu dosyayı **bir kez** indirir, türünü ilk baytlarından okur, depoya koyar; kaydedince
  yüklenen dosya gibi denetlenir ve (WebM / MOV / SVGA ise) çevrilir. Telefonlar dosyayı **bizim sunucumuzdan** alır,
  sizin sitenize hiç bağlanmaz: siteniz yavaşlasa ya da kapansa odalar etkilenmez; eski APK'lar, saydamlık ve sınırlar
  yüklemedeki gibidir.
- **Yenileme:** dosyayı sitenizde aynı adreste değiştirirseniz hediye kendiliğinden değişmez, bilerek: her yeni dosya
  denetlenip çevrilmeden telefonlara gitmemeli (siteniz değişir, bozulur ya da başkası dosyayı değiştirirse odalarda
  denetlenmemiş bir şey çıkmasın). Düzenle'de bağlantı saklıdır; **Bağlantıdan yeniden çek** ve **Kaydet** ile yeni dosya
  alınır, çevrilir ve telefonlara kendiliğinden gider (uygulama güncellemesi gerekmez). Listede bağlantıdan gelen hediyede "🔗
  bağlantıdan" yazar. Bilgisayardan dosya seçilirse bağlantı silinir.
- **Güvenlik:** sunucu yalnız internette herkese açık adreslere bağlanır: bu makine (API, panel, veritabanı), konteyner
  ağı, özel ağlar, link-local (bulut üst verisi), CGNAT, çok noktaya yayın ve ayrılmış bloklar olmaz; alan adı çözüldükten
  sonra ve her yönlendirmede (en çok 5) yeniden denetlenir, bağlantı denetlenen adrese gider. Boyut sınırları yüklemeyle
  aynı (ikon 10 MB, hazır MP4 12 MB, video kaynağı 500 MB, SVGA 250 MB), süre ikon için 1, video için 10 dakika. Her deneme `audit_events`
  `gift.fetch` satırıdır (bağlantı, sonuç, panelden ise panel kullanıcısı). `server/api/link-fetch.mjs`.
- Uygulamadaki Yönetim › Hediyeler formunda bağlantı alanı yok (yeni APK gerektirir); sunucu ucu (`/api/admin/gifts/fetch`)
  hazır.

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

Telefondan ve finans panelinden (dosya panelin sunucusundan geçer) yüklemede gerekmez. Uygulamanın web sürümünden ikon ve
video yüklemek için Cloudflare R2'de kovanın
**Settings › CORS Policy** bölümüne şu kural eklenmeli:

```json
[{ "AllowedOrigins": ["https://keremcan534.github.io"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 600 }]
```

Kendi alan adınızda yönetim açılırsa o adres de `AllowedOrigins`'e eklenir.

## Sınırlar

- SVGA 1.x (zip) okunmaz; 2.x'te vektör şekiller, maskeler ve kırpma yolları çizilmez (betik sayar ve atlar).
- Sunucu 1 OCPU: 5 saniyelik bir SVGA birkaç on saniyede, 15 saniyelik büyük bir kaynak birkaç dakikada çevrilir.
- Panelin önizlemesi videoyu telefonlardaki gibi saydam çizer (oda sahnesinin üstünde); yalnız ses ve hız tarayıcıya göre
  az farklı olabilir.

## Testler

- Bağlantıdan dosya: `server/api/test/gift-links.test.mjs` (sahte müşteri sitesi: ikon iner, depoya yüklenmiş gibi konur,
  kaydedilir, bağlantı saklanır ve denetimde; türü baytlarından; MP4, SVGA 1.x, web sayfası, büyük dosya, 404, döngü;
  ikonun alanına yapıştırılan video ve videonun alanına yapıştırılan resim, ikonun 10 MB'ı yerine "bu bir video";
  bu sunucu, özel ağ, bulut üst verisi, yönlendirme ve ad üzerinden iç adres reddi).
- Uygulamanın kendi hediyeleri: `server/api/test/builtin-gifts.test.mjs` (panel listesi ve uygulamadaki değerler, ad /
  emoji / fiyat, eski uygulamanın kataloğu ve 409'ları, gösterilen fiyatla gönderim ve tekrar, ad çakışması, raf ve VIP,
  rafa koyma ve kaldırma, karışık sıra, ikon, video ve kapatma, orijinale dönme, silinmezlik, denetim, Şanslı çanta),
  `app/tests/app-gift-edits.test.ts` (telefonda `gifts=2`: değerler, sıra, raftakiler, ikon, bozuk alanlar, eski sunucu, kopya).
- Sunucu: `server/api/test/custom-gifts.test.mjs` (yetki, ikon kuralları, katalog ve sürüm, eski uygulamanın süzgeci,
  sunucu fiyatıyla gönderim, fiyat değişikliği, raftan kaldırma, sıra, hazır video, WebM çevirme, saydamlığı olmayan
  ve alfası hiçbir yerde saydam olmayan kaynağın reddi ve önizlemesi (maskesi her yerde beyaz; yeni videoyla silinir), SVGA çevirme ve boyutu, SVGA 1.x ve 15 sn'den uzunun reddi, silme ve denetim kaydı). CI ffmpeg,
  numpy ve Pillow'u kurar.
- Uygulama: `app/tests/custom-gifts.test.ts` (katalogdan okuma, bozuk kayıtların atlanması, raf sırası, kimlikle bulma,
  telefondaki kopya, video adresi ve eski uygulamanın süzgeci, paneldeki yardımcılar).
