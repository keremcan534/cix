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

**Şanslı paketleri (Güncelleme 7 madde 10):** Şanslı hediye paketlerinin ikonu ve videosu da aynı yükleme, kontrol ve
çevirme yolundan geçer (`server/api/lucky-art.mjs`: `checkIcon`, `videoOf`, aynı çevirme sırası, bağlantıdan dosya), ama
bu listede değildir: ayrı tabloda (`lucky_art`) durur, Hediyeler panelinde ve kataloğun hediyelerinde görünmez ve
`/api/gifts/send` ile gönderilemez. Paketlerin fiyatı, olasılıkları ve yeni paket eklemek Şanslı hediye ayarı
sayfasındadır ([`LUCKY_HEDIYE.md`](LUCKY_HEDIYE.md)). Bir dosya hem bir hediyede hem bir pakette kullanılıyorsa
birinden kaldırılınca öbürü için kalır.

**Eski APK'lar:** katalogda bilmedikleri hediyeyi göstermez (yalnız derlenmiş listeyi süzerler), odada gelen bilinmeyen
hediyeyi sessizce atlar, videosunu indirmez (adresi `/api/fx/g/…`, onların süzgecinden geçmez). Yeni hediyeleri bu
özelliği taşıyan APK'dan (bu değişikliğin preview-N'i) itibaren her telefon görür; derlenmiş hediyeler aynen çalışır.

**Varsayılanlar (değiştirilebilir):**

| Karar | Varsayılan |
| --- | --- |
| Kim yapar | Yalnız yönetici hesabı (`role = admin`); her işlem `audit_events`'e yazılır (kim, ne, önce/sonra, IP) |
| Fiyat | 1 – 1.000.000 jeton, tam sayı; değişiklik yeni gönderimlerden itibaren geçer, geçmiş gönderim kendi fiyatıyla kalır |
| Raf | Popüler, Çift, Muzip, Özel (Özel'de en düşük VIP 1–10). Çift rafının adı Kasım 2026'ya kadar İkili'ydi, Muzip'inki Kutlama'ydı (20 Kasım 2026); eski APK'lar eski adları yazar. Rafın kimliği (`gameplay`) aynı |
| Sıra | Yöneticinin hediyeleri kendi rafının başında, paneldeki sırayla; yeni eklenen en başa |
| Ad | 2–24 karakter; aynı adda iki hediye olmaz (derlenmişlerle de) |
| İkon | PNG ya da WebP, saydam, kare (en çok 1:1,25), 128–4096 px (önerilen 512 × 512), en çok 10 MB. Telefonlar hediye panelinin bütün ikonlarını indirir: 1024 px'ten ya da 1 MB'tan büyük ikonu sunucu kaydederken küçültür (en çok 1024 px ve 1 MB, saydam PNG, `tools/icon-fit.py`); yüklenen büyük dosya silinir |
| Video (hazır) | Yığılmış MP4: H.264, üst yarı renk, alt yarı alfa (ör. 540 × 1920), 1–15 sn, en çok 12 MB |
| Video (kaynak) | Saydam WebM (VP8/VP9 alfa) ya da ProRes 4444 .mov, en çok 500 MB; sunucu 540 × 960 görünür, 20 fps, AAC sesli yığılmış MP4'e çevirir. Dosya küçük olsun diye bu boyutta (540 × 960, 20 fps) dışa aktarın: görüntü aynı kalır, ProRes 4444 dosyası 1080 × 1920'ye göre kabaca dörtte birine iner |
| SVGA | SVGA 2.x, en çok 250 MB ve 15 sn (çevirici dosyayı bütün okur: 244 MB'lık bir SVGA 0,8 GB bellekle yaklaşık bir dakikada çevrildi); sunucu aynı biçime çevirir, sesini korur. Ekrandaki boyutu: Küçük %45, Orta %60, Büyük %80, Tam ekran %100 (varsayılan; uygulamanın kendi hediye videoları da tam ekran) |
| Eski %60 videolar | Tam ekran varsayılan olmadan önce SVGA'lar %60 boyutunda çevriliyordu (panel boyutu formun altında, yalnız yeni dosya seçince gösteriyordu; var olan videonun boyutu hiç değiştirilemiyordu). 074 bu videoları bir kez işaretler, sunucu açılınca tam ekrana büyütür: SVGA çevrildikten sonra silindiği için videonun kendisinden (ortadaki %60 kesilip 5/3 büyütülür; svga-to-fx.py'nin Tam ekranda yapacağının aynısı, yalnız küçük resimden, biraz yumuşak). Ölçülüp o boyutta olmayan ya da o arada değişen videoya dokunulmaz (`custom_gifts.video_enlarge`, denetimde `gift.video_enlarged`). En net hali için SVGA yeniden yüklenir |
| Arka plan silme | **Yapılmaz.** Kaynakta saydamlık yoksa ya da çıkan videonun hiçbir yeri saydam değilse reddedilir; arka planı silinmiş kaynak yükleyin. Reddedilen videonun odada nasıl görüneceği (arka planıyla kutu gibi) listede **Önizle** ile izlenir |
| Arka planlı tam ekran | Video bir sahneyse (ör. gece yolunda giden araba) ve arka planıyla bütün ekranı kaplaması isteniyorsa formda **Arka planlı tam ekran** seçilir: saydamlık aranmaz, oda video bitene kadar görünmez (`video.opaque: true`, `custom_gifts.job_opaque`, 073). Kaynakta, SVGA'da ve hazır MP4'te geçer. Arka planlı bir SVGA **Tam ekran** boyutunda bu seçim olmadan da kabul edilir: çevirici videoyu başta ve sonda saydamlaştırır (arka planlı 9:16 ve 4:7 SVGA'yla denendi). Telefon videoyu ekrana sığdırır: 9:16'dan uzun ekranlarda üstte ve altta oda görünür |
| Silme | Hediye raflardan ve panelden kalkar, gönderilemez; satır geçmiş için saklanır, ikonu ve videosu depodan silinir |
| Bağlantıdan dosya | Finans panelinde her dosyanın yanında "ya da bağlantı yapıştır": sunucu dosyayı bir kez indirir, yüklenmiş gibi denetler ve kendisi sunar (aşağıda **Bağlantıdan dosya**) |
| Raftan kaldırma | Panelde kalır, kataloğda görünmez, gönderilemez; tekrar rafa konabilir |

## Uygulamanın kendi hediyeleri (hazır 75 hediye)

Uygulamayla gelen hediyeler (Gül, Roket, Sevimli Panda, Pırlanta Yüzük…, `server/api/catalog.mjs` `GIFT_ROWS`) de
panelden değişir; geliştiriciye ya da uygulama güncellemesine gerek yoktur. Finans panelinin **Uygulama › Hediyeler**
listesi bunları da gösterir (`GET /api/admin/gifts?builtin=1`): uygulamadaki resmi (sunucunun `art/` kopyası), uygulamadaki
değerleri (`original`), neyin değiştirildiği (`changed`) ve son 30 günde kaç kez gönderildiği.

- **Değişebilenler:** ad, emoji, fiyat, raf, VIP seviyesi (Özel rafta), rafta / kapalı, raftaki sıra, ikon, video (hazır
  MP4, saydam WebM / MOV ya da SVGA; yöneticinin hediyelerindeki kurallarla). Duraklatılmış hediyeler (14 Kasım'da raftan
  kalkan 41 hediye, `GIFTS_PAUSED`) **Rafa koy** ile geri gelir; açık bir hediye raftan kaldırılabilir. Rafa konan
  duraklatılmış hediyeyi yalnız preview-163 ve sonraki APK'lar gösterir (eskisi kendi listesine göre gizler). Eski APK'dan
  güncellenen telefon, eski APK'nın sakladığı kataloğu eski sayar ve hemen yeniden okur (bu değişiklikten sonraki
  APK'larda; preview-163'te en çok ~11 dakika sürüyordu: uygulamayı kapatıp açmak ya da beklemek yetiyordu).
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
- **Bağ hediyeleri (Aile ve Dost rafı):** fiyatı da panelden değişir (19 Kasım 2026); raftan başka rafa geçmez. Bağ
  isteği o fiyatı keser. Fiyat uygulamanınkinden farklıyken eski APK'lar bağ isteği gönderemez ("uygulamayı güncelle"),
  bekleyen istek gönderildiği fiyatı tutar. Ayrıntı: [`BAGLAR.md`](BAGLAR.md).
- **Çantam (görev ödülü):** çantadaki hediye ödül olarak verildiği değerle, uygulamadaki fiyatıyla gönderilir; panelden
  fiyat değişikliği ödülü değerli kılmaz. Adı panelde verilen addır.
- **Ad çakışması:** iki hediye aynı adı taşıyamaz (uygulamanınkiler şimdiki adlarıyla). Bir uygulama hediyesinin adı
  değiştirilince eski adı başka hediyeye verilebilir; o zaman o hediye "ad" alanında orijinaline dönemez (409).
- **Panel resimleri:** `server/api/art/gifts/<id>.webp` ve `art/stickers/` uygulamanın resimlerinin küçük kopyalarıdır
  (`python3 server/api/tools/panel-art.py` ile yeniden üretilir), `GET /api/fx/art/…` ile panele gider; telefonlar
  kullanmaz.

Saklama: `custom_gifts` tablosunda uygulama hediyesinin kimliğiyle bir satır (`builtin`, 069); her boş sütun
"uygulamadaki gibi" demektir, satır hiç silinmez (katalog sürümü yalnız artar).

## Profil izi ve iz türleri (Muzip hediyeler)

Ayrıntı: [`PROFIL_IZLERI.md`](PROFIL_IZLERI.md).

**Hediyenin ayarı:** Her hediyenin bir **Profil izi** ayarı var: yok, **bırakır** ya da **temizler**.

- **Bırakır:** iz türü (listeden) ve isteğe bağlı süre. Süre dakika (5–10.080) ya da saat (1–168). Boşsa türün
  süresi, o da boşsa Canlı ayarlar › Profil izleri'ndeki süre (24 saat).
- **Temizler:** iz türü.
- Sunucuya giden: `mark: {role: 'leave', kind, minutes?}` (eski panel `hours?` gönderebilir), `{role: 'clean', kind}`
  ya da `null`.
- Listede her hediyenin `mark`'ı `{role, kind, hours, minutes}` olarak gelir. Uygulamanın hediyesinde `original.mark`
  ve değiştirildiyse `changed` içinde `mark`; "Orijinale dön" kuralı da geri alır.

**Kurallar:**

- Tür, **İz türleri** listesinde olmalı. Olmayan bir kelime reddedilir: '"camur" diye bir iz türü yok: önce
  Hediyeler › İz türleri'nden bu türü ekleyin'.
- Bir izi temizleyen hediye, o izi bırakan her hediyeden **pahalı olmalı**. Kaydı bozan değişiklik (fiyat, kural, geri
  alma) reddedilir: "Cam Tamiri izi temizlediği için onu bırakan hediyelerden pahalı olmalı: Terlik Geldi! 1.299
  jeton, bu 1.299 jeton."
- İz kurallı hediye Global olamaz. Bağ hediyeleri ve Koruma Kartı iz bırakamaz.

**Uygulamanın kendi hediyeleri:**

- **💩 Kaka Şakası** (`k1`, 999 jeton) `kaka` izi bırakır.
- **💧 Temizlik Suyu** (`k2`, 1.999 jeton) `kaka` izini temizler.
- **🩴 Terlik Geldi!** (`p8`, 1.299 jeton) düz hediyedir ve rafta değildir; kuralını panelde siz verirsiniz (aşağıdaki
  adımlar).

**Eski APK'lar:** İz kurallı hiçbir hediye eski APK'nın (f9671d9 ve öncesi) rafında görünmez. Buna Kar Topu, Domates At
ve Terlik Geldi! de dahil.

**İz türleri** (`GET /api/admin/mark-kinds`, `POST /api/admin/mark-kinds`, `/update`, `/delete`; yükleme türü
`markart`): Her türün alanları şunlar:

- **Anahtar:** küçük harf, rakam, tire; sonradan değişmez.
- **Ad:** "Kırık Cam" gibi.
- **İz resmi:** fotoğrafın üstüne çizilen saydam PNG ya da WebP.
- **Süre:** dakika.
- **Aynı iz yeniden gelince:** iki seçenekte de profilde tek iz kalır, en son göndereninki olur ve **süresi kısalmaz**
  (kalan süreyle yeni hediyenin süresinden uzun olanı geçer). Fark yalnız geçmiş kaydında: "süresi bitti" ya da
  "yerine geçti".
- **İz varken başka tür:** profilde iz varken başka türden bir iz hediyesi izi değiştirmez, düz hediye olarak gider
  (jeton düşer, iz bırakmaz). Bu bir ayar değil, her tür için böyle. Böylece ucuz bir hediye pahalı bir izi kaldıramaz.
- **Bir resim, bir tür:** başka bir türün kullandığı resim kaydedilmez; her türe ayrı dosya yükleyin.
- **Açık / kapalı.**

İz resmi yüklenirken sunucu piksel piksel denetler:

- kare, 256–2048 piksel, en çok 10 MB (telefonlara 512 piksel ve 300 KB'a küçültülmüşü gider), hareketsiz;
- saydamlık kanalı olan PNG ya da WebP.

Resim yüzü kapatabilir (ör. bütün fotoğrafı kaplayan buz; müşterinin isteği, 20 Kasım 2026). Telefon onu fotoğrafın
dairesine kırpar.

Uymayanı nedeniyle reddeder. Büyüğü 512 piksele küçültür. Her değişiklik denetim kaydıdır (`markkind.create`,
`markkind.update`, `markkind.delete`; önce ve sonra). Bir türü kullanan hediye varken tür silinemez.

### Yeni bir şaka çifti nasıl eklenir (adım adım, uygulama güncellemesi olmadan)

Örnek: **Çamur Bombası** çamur izi bırakır, **Köpük Banyosu** temizler. Sunucu testi aynı adımları yalnız bu uçlarla
yapar (`server/api/test/muzip.test.mjs`, "kodsuz üçüncü çift").

1. **Resimleri hazırlayın.** Ekipten:
   - **iz resmi:** 512 × 512 saydam PNG. Çizim bütün fotoğrafı kaplayabilir (yüz dahil); telefon dairenin dışını
     keser.
   - iki hediyenin **ikonu:** 512 × 512 saydam PNG.
   - isteğe bağlı **gönderim animasyonları:** SVGA 2.x, 3–5 sn; temizleme 2–4 sn.
2. **İz türünü ekleyin:** Panel › Uygulama › Hediyeler › **İz türleri** › Yeni tür.
   - Anahtar `camur`, ad "Çamur".
   - İz resmini yükleyin. Kontrolden geçmezse nedeni yazar (ör. "İz resmi kare olmalı…", "İz resminde saydamlık
     yok…").
   - İsterseniz süre verin (ör. 60 dakika).
   - Önizlemede örnek fotoğraf üstünde bakın.
3. **İz bırakan hediyeyi ekleyin:** Hediyeler › Yeni hediye.
   - Ad "Çamur Bombası", raf **Muzip**, fiyatı siz verin, ikon, varsa video.
   - **Profil izi: Bırakır**, tür **Çamur**, süre boş (türün süresi) ya da kendi süresi.
4. **Temizleyen hediyeyi ekleyin:**
   - Ad "Köpük Banyosu", raf Muzip, **Çamur Bombası'ndan pahalı** bir fiyat.
   - **Profil izi: Temizler**, tür Çamur.
5. **Telefonda bakın** (yeni APK, 1.1.0):
   - Yönetim › Hediyeler › **İz türlerini önizle** › Çamur: koltuk, kart ve profil boylarında, açık ve koyu zeminde,
     düşüş ve temizlenme.
   - Sonra iki hesapla deneyin. Alıcı göndereni takip etmeli ya da Gizlilik'te "Herkes" seçili olmalı.
6. **Yayından kaldırmak gerekirse:** türü **kapalı** yapın (hediyeler düz hediye olur, izler görünmez), ya da hediyeleri
   raftan kaldırın.

### Pilot: Terlik Geldi! → Kırık Cam → Cam Tamiri

Kırık Cam türü kurulumla gelir (`kirik-cam`). Uygulamanın içinde geçici bir kırık cam resmi var. Kendi resminizi
yükleyince o kullanılır.

1. **Gerçek resim (isteğe bağlı, sonra da olur):** İz türleri › Kırık Cam › iz resmini yükleyin. Hazır geçici dosya:
   `docs/gorseller/muzip/kirik-cam-512.png`.
2. **Terlik Geldi! (`p8`):** Hediyeler › uygulamanın hediyeleri › Terlik Geldi! › Düzenle.
   - **Rafa koy** (bugün rafta değil).
   - **Profil izi: Bırakır**, tür **Kırık Cam**, süre **24 saat** (1.440 dakika).
   - Fiyatı değiştirirseniz eski APK'lar onu zaten görmez.
   - İsterseniz "terlik fırlatma + cam çatlama" SVGA'sını Video'ya yükleyin.
3. **Cam Tamiri:** Hediyeler › Yeni hediye.
   - Ad "Cam Tamiri", raf Muzip, ikon `docs/gorseller/muzip/cam-tamiri-512.png` (geçici), emoji 🪟.
   - **Fiyat Terlik Geldi!'den yüksek** (bugün 1.299 jeton; değilse kayıt reddedilir).
   - **Profil izi: Temizler**, tür Kırık Cam.
   - İsterseniz "cam onarma + parıltı" SVGA'sı.
4. **Kaka Şakası çifti** hazır: Kaka Şakası `kaka` bırakır (24 saat, Canlı ayar), Temizlik Suyu temizler. Fiyatları
   panelden. Kaka için yeni bir iz resmi isterseniz İz türleri › Kaka İzi'ne yükleyin. Yüklenen resim yeni APK'da
   uygulamanınkinin yerine geçer, G7 APK uygulamanınkini çizmeye devam eder.
5. **Zorunlu güncelleme (sizin kararınız):** Canlı ayarlar › Zorunlu sürüm `1.1.0` yapılınca eski APK'lar güncellemeye
   yönlendirilir. Bunu **1.1.0 APK'nın Yönetim › Canlı ayarlar** ekranından kaydedin: sunucu zorunlu sürümü yalnız o
   sürüm ya da daha yenisi olan uygulamadan kabul eder. Finans paneli uygulama sürümü göndermediği için oradan
   kaydedilmez ("Uygulama sürümün gelmedi…").

**Panel tarafı (finans paneli deposu, ayrı iş):**

- hediye formunda tür listeden seçim ve dakika;
- İz türleri sayfası ve önizlemesi;
- yükleme türü `markart`;
- Kullanıcılar'da kişinin izleri.

Uçlar [`SUNUCU.md`](SUNUCU.md)'de, `PANEL_ROUTES` sunucuda hazır.

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

## Yakında (22 Kasım 2026)

Sahiplerin isteği: Aile ve Dost rafında Koruma Kartı açık kalsın; Kanka Kilidi, Kardeşlik Bağı, Can Bacım, Can Ağabey, Ablamın Işığı, Yenge Bizden Biri ve Enişte Makamı pasif görünsün, üstünde "Yakında" yazsın; Kalbim Seninle (Çift bağının hediyesi) Çift rafına geçsin; panelden açılıp kapatılabilsin.

- **Panel:** Hediyeler › hediyeyi düzenle › **Yakında** kutusu. Yalnız uygulamanın kendi hediyelerinde var; yöneticinin eklediği hediyeyi raftan kaldırmak yeterli. Listede "Yakında" etiketi görünür. Varsayılanı yukarıdaki yedi bağ hediyesi (`catalog.mjs` `GIFTS_SOON`); kutu kaldırılınca hediye açılır, işaretlenince yeniden Yakında olur ("Orijinale dön" varsayılana döndürür).
- **Telefonda (yeni APK):** hediye rafında soluk durur, fiyatın yerinde "Yakında" yazar; dokununca "… yakında açılacak" der, seçilmez. Bağ hediyesiyse o bağ türü "Bağ kur" listesinde "Yakında" yazar, istek gönderilmez.
- **Sunucu:** Yakında hediyeyi göndermek 409 ("… yakında açılacak"), o türde yeni bağ isteği 409 (`code: soon`); jeton oynamaz. Kurulmuş bağlar sürer, ama bağ hediyesi o tür açılana kadar gönderilemez.
- **Eski APK'lar** Yakında hediyeyi rafta hiç görmez (katalog yalnız `?soon=1` isteyen yeni uygulamaya verir); gönderemez.
- **Kalbim Seninle (`bag-cift`)** artık uygulamanın kendi değeriyle Çift rafında. Bağ hediyesi panelde Aile ve Dost ya da Çift rafına konabilir, başka rafa konamaz.

## Global hediye (Güncelleme 7, madde 12)

Çok pahalı bir hediye "Global" işaretlenirse biri onu **bir odada** birine gönderdiğinde, gönderenin ülkesindeki **bütün
odalarda** üstte bir bant ve odanın sohbetinde bir satır çıkar: "Kaan → Artemis’e 🚀 Roket gönderdi · Gece Sohbeti
odasında".
Sunucu: `server/api/global-gifts.mjs` (kurallar `global-gift-rules.mjs`, tablo sütunu `102_global_gifts.sql`), uygulama:
`app/src/lib/global-gift-core.ts`, `app/src/lib/tr-dative.ts`, `app/src/lib/live/global-gift.ts`,
`app/src/components/fx/global-gift-banner.tsx`.

**Sahiplerin kararları ve nasıl çalıştığı:**

| Konu | Karar |
| --- | --- |
| Kim işaretler | Yönetici, Hediyeler formunda **Global** kutusu (`global: true`); hem yöneticinin hediyelerinde hem uygulamanın kendi hediyelerinde. Her değişiklik denetimde önce/sonra ile (`gift.create`, `gift.update`, `gift.reset`). Finans panelindeki kutu sonraki iş; sunucu ucu hazır |
| En düşük fiyat | Canlı ayarlar › Global hediye › "en düşük fiyat" (`global_gift_min_price`, **300.000 jeton**). Altında kutu işaretlenemez (400). Global bir hediyenin fiyatı bu sınırın altına indirilemez; önce kutu kaldırılır. Sınır sonradan yükseltilirse altında kalan hediyenin işareti durur ama duyurulmaz |
| Nereden | Yalnız **odada** gönderilen (odanın hediye panelinde Global sekmesi ve rozeti var). Birebir sohbetten, profilden, aile sohbetinden ya da Anlar'dan gönderilen global hediye normal hediye gibi gider, **duyurulmaz**: oradaki hediye panelinde Global rozeti ve uyarı yok, iki kişi arasındaki bir hediye ülkeye duyurulmaz (Kasım 2026 incelemesi) |
| Oda adı | Banttaki "· Gece Sohbeti odasında" yalnız herkesin girebileceği açık bir odada yazar. Oda **özel** (yalnız üyeler) ya da **şifreliyse**, dinlenmedeyse, gönderen ya da alıcı Gizlilik › **"Bulunduğum odayı göster"**i kapattıysa ya da adını gizlediyse duyuru oda adı olmadan gider ("Gizli Buluşma" adlı özel bir odada iki kişinin birlikte olduğu ülkeye duyurulmasın; "Kaan'ın odası" gibi bir oda adı gizlenen adı ele vermesin). Profildeki "Şu an odada" ile aynı kural |
| Hiçbir zaman | Bağ hediyeleri (bağ isteği ya da bağı olana bağ puanı olarak gider), Koruma Kartı, Şanslı paketleri (şans oyunu tanıtılmaz; Şanslı gönderimi bu yoldan geçmez), profil izi bırakan ya da temizleyen hediyeler (Kaka, Su ve yöneticinin iz kurallı hediyeleri: alıcıyı bütün ülkenin önünde küçük düşürür; kutu ile iz kuralı birlikte kaydedilemez, [`PROFIL_IZLERI.md`](PROFIL_IZLERI.md)). Çantam'dan bedava gönderim de duyurulmaz |
| Ülke | Gönderenin profilindeki ülke (`profile_extras.country`); ülkesi boş olan **TR** sayılır. Duyuruyu profil ülkesi aynı olanlar görür (bugün neredeyse herkes TR) |
| Aralık | En çok **10 saniyede bir** duyuru (`global_gift_gap_seconds`, 0: beklemeden). Beklerken aynı kişinin aynı kişiye aynı hediyesi tek duyuruda toplanır (×3). En çok 20 duyuru bekler, 3 dakikadan eskisi atlanır |
| Görünüm | Bant (odanın üstündeki kazanç bandı sırasında, ~4,5 saniye) + o odanın sohbetinde bir satır. Hediyenin tam ekran videosu **yalnız gönderildiği odada** oynar; başka odalardaki telefonlar videoyu indirmez |
| İsim | Ayarlar › Gizlilik › "Adım genel duyurularda görünmesin" (`globalHideName`, ilk başta kapalı): açıksa o kişi (gönderen de alıcı da) "Bir kullanıcı" yazar, fotoğrafı, kimliği ve oda adı gitmez. Bu düğme yalnız yeni uygulamada var: **eski APK kullananlar adlarını gizleyemez** (alıcı da). Engelleşen kişiler birbirinin duyurusunu görmez (gönderenle ya da alıcıyla engeli olan) |
| Ek | Türkçe yönelme eki: Artemis’e, Ayşe’ye, Ali’ye, Bora’ya, Umut’a, Kemal’e. Sonu okunamayan adda (rakam, emoji, yabancı yazım) ek tahmin edilmez: "Kaan34 kişisine" |
| Banda dokunma | O odaya gider (oda ekranı mevcut odadan çıkmadan önce sorar; yasak, kara liste ve özel oda kuralları her zamanki gibi). Oda adı olmayan duyuruda dokununca bant yalnız kapanır. Sunucu artık özel ya da şifreli odayı hiç adlandırmadığı için `locked` hep `false` gider |
| Hediye paneli | Yeni uygulamada **Global** sekmesi ve hediye kutusunda "Global" rozeti. Global ayrı bir raf değil: hediye yöneticinin seçtiği rafta da durur, eski APK onu orada normal hediye olarak gösterir |

**Eski APK'lar:** canlı hattı `?global=1` ile açmazlar, bu yüzden duyuruyu hiç almazlar (bilmedikleri bir olayı "her şeyi
yeniden oku" sayarlardı). Gönderildiği odada eski APK normal bir hediye görür. Eski APK'dan odada gönderilen global
hediye yeni uygulamalara duyurulur. Katalogdaki `global: true` alanını eski APK görmezden gelir.

**Sınır (sonra):** duyuru sırası ve canlı hatlar tek API sürecinin belleğinde. Birden fazla API sürecine geçilince
ortak bir kanal (Postgres LISTEN/NOTIFY ya da Redis) ve tek bir sıra gerekir ([`DENETIM.md`](DENETIM.md)).

**Testler:** `server/api/test/global-gifts.test.mjs` (en düşük fiyat, bağ / Koruma / Şanslı reddi, denetim, katalog,
sınır yükselince; yeni hat alır, eski hat almaz, başka ülke, engeller, tekrar gönderim, gizli ad, fotoğraf ve ikon
adresi; oda dışı gönderim duyurulmaz; şifreli, özel ve dinlenen odada ve "Bulunduğum odayı göster" kapalıyken oda adı
gitmez; aralık ve ×N toplama; Şanslı duyurulmaz), `app/tests/global-gift.test.ts` (yönelme eki, olayın
okunması, bozuk olay, cümle, engel, katalog işaretleri, bant sırası).

## Telefona nasıl gider

- `GET /api/catalog` `gifts`: yöneticinin rafta olan hediyeleri **önce**, `custom: true`, `emoji` ve `icon` (bu sunucunun
  adresi) ile; ardından derlenmiş hediyeler. Yeni uygulama bunları rafların başına koyar (`giftShelf`), kimlikle bulur
  (`giftById`: odadaki duyuru, kombo, Gelir, Çantam), ikonunu çizer (`GiftArt`).
- `fx`: videoları `{kind: 'gift', id, url: '/api/fx/g/<id>.mp4?v=<sürüm>', bytes, ms}`; telefon klibi bir kez indirip
  saklar (`g-<id>-<sürüm>.mp4`), sürüm değişince yenisini alır, listeden çıkanı siler. İnmemişse çizimli efekt oynar.
- `global: true` (yalnız global hediyelerde): yeni uygulamanın Global sekmesi ve rozeti; eski uygulama görmezden gelir.
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
  `CUSTOM_GIFTS_POLL_MS` (başka bir sürecin değişikliğini okuma aralığı, varsayılan 5000), `LUCKY_ART_POLL_MS` (aynısı
  Şanslı paketlerinin ikon ve videoları için; yoksa `CUSTOM_GIFTS_POLL_MS`).
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
