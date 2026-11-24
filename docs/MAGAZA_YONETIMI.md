# Mağaza yönetimi (çerçeveler, giriş efektleri, sohbet balonları, ses dalgaları, koltuk renkleri)

Müşterinin isteği (17 Kasım): giriş efekti, çerçeve, sohbet balonu, ses dalgası ve çıkartma paketleri için mağaza içeriğini düzenleyecek bir ekran. Giriş efektinde odaya girenin adı animasyonun üstünde yazmalı.

Sahibin kararı: önce giriş efekti ve çerçeve (yayında), sonra sohbet balonu ve ses dalgası (bu bölüm).

Sahibin isteği (17 Kasım, koltuk rengi): koltuk rengi kendi kendine değişmesin; cırtlak renk olmasın (pembe açık pembe, yeşil haki olsun; kırmızı ve turuncu kalsın); standart Gümüş, diğerleri ücretli; renklerin paleti, adı, fiyatı ve süresi panelden ayarlansın.

Çıkartma paketleri zaten panelde: **Uygulama › Emojiler** ([`EMOJI_YONETIMI.md`](EMOJI_YONETIMI.md)).


## Süre paketleri (Güncelleme 8, 21 Kasım 2026)

- Panelde **Mağaza**'da bir ürünü düzenlerken ana sürenin (ör. 30 gün) yanına **en fazla 3 süre paketi** eklenir (ör. 7 ve 15 gün), her biri kendi fiyatıyla. Süresiz üründe ve koltuk renklerinde paket olmaz.
- Yeni uygulama Çarşı'da ürün kartında süreleri gösterir (7g · 15g · 30g); seçilen sürenin fiyatıyla satın alır. Sunucu gösterilen süreyi ve fiyatı denetler; değiştiyse jeton düşmez.
- **Eski APK'lar** paketleri görmez, ana süreyi ana fiyatla satmaya devam eder.
- Uygulamanın kendi ürünlerinde de olur; **Orijinale dön** paketleri de kaldırır.
- Teknik: `shop-items.mjs` (`plansOf`), `110_shop_plans.sql`, katalog `shop.items[].plans`, alım `POST /api/shop/buy {days}`; test `test/shop-plans.test.mjs`.
## Panelde: Hediye ve mağaza › Mağaza

Beş sekme var: **Giriş efektleri**, **Çerçeveler**, **Sohbet balonları**, **Ses dalgaları** ve **Koltuk renkleri**.

- **Uygulamanın kendi eşyaları:** şunlar değişir ve "Orijinaline dön" ile geri gelir:
  - ad
  - fiyat
  - süre (0 = süresiz)
  - VIP seviyesi
  - satışta mı
  - sıra

  Resimleri, animasyonları ve renkleri uygulamanın içinde; onlar buradan değişmez.
- **Yeni çerçeve:**
  - **Çerçeve resmi:** durağan, saydam, kare PNG ya da WebP (128–1024 px, en çok 4 MB). Hareketli bir WebP buraya kabul edilmez.
  - Fotoğraf çerçevenin halkasına oturur. Resim seçilince halkanın iç kenarı bulunur ve ona bir daire oturtulur: fotoğrafın büyüklüğü ve yeri. Halkanın içine uzanan bir süs (taş, kanat ucu, ay) daireyi küçültmez ya da itmez; tasarımcının çizdiği gibi fotoğrafın kenarının üstünde kalır. Halka resmin ortasında değilse (üstte taç, altta isim levhası) fotoğraf halkaya kayar.
  - Oturmadıysa elle: önizlemede fotoğraf fareyle sürüklenir (ya da istenen yere tıklanır), kenarındaki noktayla ya da fare tekerleğiyle büyütülüp küçültülür, ok tuşlarıyla (Shift ile daha büyük adım) kaydırılır, + ve − ile boyu değişir. Üç kaydırıcı (büyüklük, yatay, dikey) da durur; "Resimden yeniden ölç" ölçümü tekrarlar.
  - Eski APK'lar fotoğrafı her zaman resmin ortasına koyar; halkası ortada olmayan çerçeve onlarda biraz kayık görünür.
  - **SVGA:** "Hareketli hali" alanına SVGA 2.x seçilebilir. Uygulamada SVGA oynatıcı olmadığı için sunucu onu kare, saydam, en çok 3 MB'lık hareketli WebP'ye ve durağan PNG'ye çevirir; ikisi de çerçeveye konur. Çevirme bir dakika kadar sürebilir.
  - **Hareketli hali (isteğe bağlı):** aynı çerçevenin hareketli WebP'si (saydam, kare, 128–512 px, en çok 3 MB). Durağan resim seçilmezse hareketlinin ilk karesi durağan resim olur. Yeni APK onu oynatır. Durağan resim kalır: eski APK'lar, Düşük veri modu, "hareketi azalt" ve listelerdeki küçük fotoğraflar (48 noktadan küçük) onu gösterir. Kaldırılınca durağan resim kalır.
  - **Görünen alan:** çerçeve kaydedilince ya da resmi veya hareketli hali değişince sunucu resmin gerçekten çizili (saydam olmayan) kısmını ölçer; hareketli halin her karesi de bu ölçüye girer. Böylece telefon çerçevenin kare resmin tamamı değil, süsün ne kadar uzandığını bilir. Bir sonraki APK'dan itibaren telefonlar bunu kullanır: çerçeve koltukta daha büyük ve kesilmeden çizilir. Eski APK'lar çerçeveyi eskisi gibi çizer. Hafif parıltı ve gölge de çizili sayılır, telefon onlara da yer açar. Ölçüm kaydı hiç engellemez: sunucuda Python ve Pillow yoksa ya da resim okunamazsa çerçeve yine kaydedilir ve eskisi gibi çizilir. Önceden eklenmiş çerçeveler sunucu açılınca bir kez arka planda ölçülür; telefonlar listeyi kendiliğinden yeniden okur.
- **Toplu çerçeve ekle** (Çerçeveler sekmesi): tasarımcının klasörü seçilir.
  - Her çerçevenin durağan PNG'si (önizleme) ve hareketli WebP'si dosya adından eşleştirilir (`02_imparator.webp` ve `02_imparator_onizleme.png`). PNG'si olmayanın durağan resmi hareketli WebP'nin ilk karesinden yapılır: yalnız WebP'lerden oluşan bir set de eklenir. Toplu eklemede GIF ve SVGA kullanılmaz; SVGA tek tek çerçeve formundan yüklenir.
  - Adlar dosya adından yapılır (`altin_tac` ya da `Altin_Tac` → "Altın Taç", `Cyber_VIP` → "Cyber VIP"); fotoğrafın yeri ve büyüklüğü her resmin halkasından ölçülür. Ad kartında; fotoğraf kartın önizlemesinde fareyle sürüklenerek, noktasından ya da tekerlekle büyütülerek düzeltilir. Uygulamada ya da listede olan bir ad kartında uyarılır.
  - Fiyat, süre, VIP seviyesi ve satışta olup olmadığı hepsine birden verilir. Eklenen çerçeveler mağazanın başına, dosya numarasının sırasıyla dizilir.
  - Eklenemeyenin sebebi kartında yazar; tekrar basınca yalnız eklenmemiş olanlar gönderilir. Yükleme sınırına takılırsa yarım dakika bekleyip devam eder.
- **Yeni giriş efekti:**
  - **Video:** hazır yığılmış MP4, ya da saydam WebM, ProRes 4444 .mov veya SVGA. Bunları uygulamanın sunucusu hediyelerdeki gibi telefon videosuna çevirir. Çevrilene kadar eski video oynar.
  - **İsim plakası:** odaya girenin adının yazılacağı yer. Ayarlar: yatay ve dikey yer, genişlik, yazı boyu, renk, kalın.
    - **Ad yazılsın:** kapatılırsa telefon videonun üstüne ad yazmaz, yalnız video oynar. Plakanın ayarları saklanır; yeniden açılınca aynı yerde çıkar.
    - **Yer değiştirme:** ad önizlemede sürüklenerek taşınır; sağ alt köşedeki tutamaçla plaka genişler ve yazı büyür. Ok tuşları ince ayar yapar (Shift ile daha büyük adım). Kaydırıcılar da durur.
    - **Yazının görünüşü:** büyük harf (Türkçe kurala göre: i → İ), harf aralığı, gölge ya da parlama (renk ve yayılma), kontur (renk ve kalınlık), adın arkasında yuvarlak bir bant (renk ve saydamlık).
    - **Zamanı:** ad videonun kaçıncı saniyesinde görünür ve kaçıncı saniyesinde kaybolur (0: video bitene kadar). Görünme şekli: hemen, solarak, büyüyerek ya da yükselerek. "Hareketi azalt" açık telefonda büyüme ve yükselme yerine solarak gelir.
  - **İkon (isteğe bağlı):** mağazada efektin bandının üstünde görünen resim. PNG ya da WebP, her yönde 64–4096 px, en çok 10 MB. Telefonlar için 512 px ve 512 KB'tan büyüğünü sunucu kaydederken kendisi küçültür (saydamlık korunur). Kare ve 192 px önerilir. Yoksa yalnız bant görünür.
  - **Önizleme:** videonun üstünde örnek bir adla gösterilir. Oynat / durdur, baştan oynat, döngü, ses ve zaman çubuğu vardır. Video istenen anda durdurulup ad yerleştirilebilir; "Şu andan görünsün" ve "Şu anda kaybolsun" düğmeleri zamanı o ana koyar.
  - **Uzun ad:** plakaya sığacak kadar küçülür, tek satır kalır.
- **Yeni sohbet balonu:**
  - **Renkler:** iki renk (soldan sağa geçiş; tek renk için ikisi aynı) ve yazı rengi.
  - **Resim (isteğe bağlı):** PNG ya da WebP, her yönde 64–1024 px, en çok 1 MB.
    - Telefon resmi üçte bir boyunda çizer. Resmi 3 kat büyük hazırlayın: 300 × 150 px'lik resim telefonda en az 100 × 50 noktadır.
    - **Köşeler:** dört kaydırıcıyla, resmin her kenarından ne kadarının köşe olduğu seçilir. Köşeler olduğu gibi kalır; aradaki kısım mesaja göre uzar ve mesaj ortaya yazılır.
    - Resim yüklenemezse renkler görünür.
  - **Önizleme:** kısa ve uzun bir mesaj, odadaki koyu zeminde.
- **Yeni ses dalgası:**
  - **Stil:** Halka (tek renk), Çift halka (iki renk; dıştaki sesle daha çok açılır), Dönen renkler (2–4 renk), Yayılan halka (tek renk), Parıltı (halka rengi ve dönen dört şekil).
  - **Parıltı resmi (isteğe bağlı):** saydam PNG ya da WebP, 64–4096 px, en çok 10 MB; 512 px ve 512 KB'tan büyüğünü sunucu kendisi küçültür. Kalp ya da yıldız gibi bir şekil; noktaların yerine döner.
  - **Önizleme:** konuşan bir yüzün çevresinde.
- **Koltuk renkleri:** odadaki boş ve kilitli mikrofonların rengi. Oda sahibi rengi odası için alır, odadaki herkes görür.
  - Her rengin adı, rengi, fiyatı ve süresi (gün; 0 = süresiz) değişir; uygulamanın altı renginin rengi de. **Yeni koltuk rengi** ile renk eklenir.
  - **Renk:** renk seçici ve hazır yumuşak tonlar. Önizleme telefondaki gibidir: boş ve kilitli koltuk, minder seçilen renge boyanır, altın kenarı, ayakları ve kilidi aynı kalır.
  - **Gümüş** her odanın ücretsiz, varsayılan rengidir: adı ve rengi değişir; fiyatı ve süresi olmaz, satıştan kalkmaz.
  - Süreli bir rengin süresi bitince oda bir dakika içinde Gümüş'e döner. Süre içinde oda o renge ücretsiz geri döner.
  - Fiyatı ya da süreyi değiştirmek önceden alanları etkilemez. Süre gelmeden önce alınmış renkler süresizdir.
  - Kartta rengin kaç odada olduğu yazar. Bir odada olan renk silinmez; satıştan kaldırılır (alan odalar süresi bitene kadar kullanır).
  - Renkte VIP seviyesi yoktur.
- **Satıştan kaldırma ve silme:**
  - Satıştan kaldırılan eşya mağazada görünmez ve satılmaz. Sahibi kullanmaya devam eder; odada başkaları da görür.
  - Kimsede olmayan kendi eşyanız silinebilir; resmi ve videosu da silinir.
  - Sahibi olan eşya silinmez.
- **Yetki:** `app.shop`. Süper yönetici, finans yöneticisi ve operasyon yöneticisinde var.
- **Denetim kaydı:** her değişiklik kaydedilir (`audit_events` `shop.*`, önce/sonra).

## Tasarımcı için

- **Hareketli çerçeve:** hareketli WebP (saydam, döngülü, kare, 256 px önerilir, en çok 512 px ve 3 MB) ve aynı çerçevenin durağan PNG'si. Ortadaki fotoğraf alanı ikisinde de aynı ve saydam olmalı.
- **Halka:** kapalı, yuvarlak ve mümkünse resmin ortasında olsun. Ortada değilse panel yerini ölçer ve fotoğrafı oraya koyar; ama oval ya da açık bir halkaya yuvarlak fotoğraf oturmaz, halkanın içine giren süs (kurt başı, kanat) fotoğrafın üstünü kapatır. Halkanın altına yazı koymayın; ters ya da bozuk yazı tasarımda düzeltilmeli. GIF'in saydam kenarları tırtıklı çıkar. SVGA yüklenirse sunucu hareketli WebP'ye çevirir. Bir odada çok koltuk aynı anda oynar: dosyaları küçük tutun.

- Giriş animasyonunda **isim alanını boş bırakın**; isim plakası ve çerçeve animasyonda olabilir, yazıyı uygulama yazar.
- Animasyon 540 × 960 kareye göre hazırlanır (dikey). Plakanın yeri bu kareye göre verilir. Telefon videoyu ekrana sığdırır, ad videodaki yere oturur.
- Saydam olmayan (arka planlı) video ancak "Arka planlı tam ekran" seçilirse kabul edilir; yoksa odada kutu gibi görünür.
- **Sohbet balonu resmi:**
  - Süsleri (taç, kanat, yıldız) köşelere koyun. Ortaya ve kenarların ortasına süs koymayın: uzar.
  - Mesaj, köşe çizgilerinin arasındaki alana yazılır. Bu alan, yazı rengiyle okunacak kadar sade olsun.
  - Kenarları yuvarlak bir balon için çevresi saydam olmalı.
- **Ses dalgası resmi:** tek bir küçük şekil (kalp, yıldız). Telefon dört tanesini halkanın üstünde döndürür.
- **Koltuk:** koltuk resmi tek bir puftur; uygulama onu üç katmanla çizer (minderin şekli, ışığı ve gölgesi, altını) ve minderi panelden seçilen renge boyar. Yeni bir koltuk resmi gelirse `app/scripts/seat-layers.py` onu üç katmana ayırır (`app/assets/room/koltuk-{bos,kilitli}-{renk,isik,altin}.png`, panelde `web/img`). Minder tek renk ve açık tonlu olsun; altın süsler sarı-turuncu altın tonunda kalsın (betik altını renginden ayırır).

## Telefonlar

- **Yeni APK:**
  - Mağazayı sunucudan gösterir: sıra, ad, fiyat, süre ve sizin eklediğiniz eşyalar.
  - Gösterdiği fiyat ve günle satın alır. Fiyat ya da gün arada değiştiyse alım reddedilir, jeton düşmez.
  - Sizin çerçevenizi fotoğrafın çevresine çizer; hareketli hali varsa onu oynatır (48 noktadan büyük fotoğraflarda; Düşük veri modunda ve "hareketi azalt" açıkken durağan).
  - Sizin giriş efektinizin videosunu indirir ve odaya girenin adını plakaya yazar. Video henüz telefonda değilse ya da "hareketi azalt" açıksa alışılmış giriş bandı çıkar.
  - Yazının görünüşünü (büyük harf, harf aralığı, gölge, kontur, bant) ve zamanını panelden okur. "Ad yazılsın" kapalıysa yalnız video oynar. Mağazada efektin ikonunu gösterir.
  - Sizin sohbet balonunuzu odadaki sohbette çizer: renkleriyle ya da resmiyle, köşeler bozulmadan.
  - Sizin ses dalganızı konuşanın koltuğunda çizer; dalga sese göre büyür.
  - Koltuk renklerini panelden okur: adı, rengi, fiyatı ve süresi; sizin eklediğiniz renkler de. Kalan günü gösterir. Bağlantı bir an kopup dönerken koltuklar son rengi korur (önceden bir an varsayılan renge dönüp geri geliyordu).
- **Eski APK'lar:**
  - Hareketli çerçeveden önceki APK'lar çerçevenin durağan resmini gösterir.
  - Kendi içindeki mağazayı gösterir.
  - Panelde fiyatı ya da süresi değişmiş bir eşyayı alamaz, "uygulamayı güncelle" görür. Satıştan kaldırılmış eşya için "artık satışta değil" görür.
  - Sizin eklediğiniz eşyaları göremez. Onları takan birini görünce çerçeve, giriş efekti, balon ya da dalga çizmez; düz halini gösterir.
  - Çerçeve ve giriş efektiyle çıkan APK (preview-172) balon ve dalga satırlarını atlar; kendi balonlarını ve dalgalarını gösterir.
  - Koltuk renklerini kendi altı rengiyle ve eski resimleriyle gösterir; sizin eklediğiniz rengi bilmez, kendi varsayılanını (turkuaz) çizer. Gümüş'ü artık ücretsiz alır; panelde fiyatı ya da süresi değişen rengi ve artık ücretli olan Turkuaz'ı alamaz ("uygulamayı güncelle", jeton düşmez).
  - Yazı ayarlarından önceki APK'lar adı plakanın yerine, boyunda, renginde ve kalınlığında yazar. "Ad yazılsın" kapalı olsa da adı yazar. Büyük harf, harf aralığı, gölge, kontur, bant ve zamanı bilmez. İkonu göstermez.

## Teknik

- **Tablo:** `076_shop_items`, `077_shop_bubbles_waves` (balon ve dalga; görünüş `look` sütununda), `078_shop_entry_icons` (giriş efektinin ikonu, `icon_url`), `079_shop_frame_motion` (çerçevenin hareketli hali, `motion_url`, katalogda `art.motion`; deliğin yeri, `hole_x` / `hole_y`, katalogda `art.at`, ortadaysa yok), `083_seat_colors` (koltuk rengi türü `seat`, rengi `look`; `room_seat_colors.ends_at`: süreli rengin bitişi), `098_shop_frame_reach` (çerçevenin çizili kısmı, `art_box_l` / `_t` / `_r` / `_b`: resmin kenarlarına oranla sol, üst, sağ, alt; `art_box_of`: hangi resimlerden ölçüldüğü).
- **İsim plakası (`plate`):** `x`, `y`, `w`, `size`, `color`, `bold`; yeni alanlar `show`, `upper`, `spacing`, `shadow` (`{ color, size }` ya da `null`), `outline` (`{ color, size }` ya da `null`), `back` (`{ color, alpha }` ya da `null`), `from`, `to` (saniye), `anim` (`none` / `fade` / `zoom` / `rise`). Gönderilmeyen alan varsayılanını alır (`PLATE_DEFAULT`); eski kayıtlarda olmayan alanları telefon ve panel varsayılanla okur.
- **Sunucu:**
  - `shop-items.mjs`: panel uçları ve telefonlara giden liste (`GET /api/catalog?shop=1` `shop`).
  - Giriş efekti videoları `/api/fx/s/<id>.mp4` adresinden ve katalogun `fx` listesinden gelir.
  - Video çevirme hediyelerle aynı iş: `custom-gifts.mjs` iki tabloyu sırayla çevirir.
  - Balon ve dalga resimleri de `shopframe` yüklemesiyle gelir; boyutu ve saydamlığı kullanımına göre `shop-items.mjs`'de denetlenir.
  - Çerçevenin çizili kısmını `tools/frame-reach.py` ölçer (Pillow; alfa değeri 12'nin üstünde, yaklaşık %5: hafif parıltı ve gölge de sayılır; hareketlinin her karesi, sınırsız; yalnız PNG ve WebP açılır). Resmin kendisi bozuksa ya da hiçbir şey çizili değilse "ölçüldü, kutusu yok" olarak kalır; sunucunun sorununda (Pillow yok ya da WebP okumuyor, bellek, zaman aşımı) ölçülmemiş kalır, sonra yine denenir. Aynı anda iki kayıt (biri resim, biri hareketli hali) çerçeveyi ölçüsüz bırakmaz: sonra kaydedilen fark eder, arka planda yeniden ölçülür. Katalog onu `art.reach` olarak verir: deliğin merkezinden yatayda (uzak tarafa), yukarı ve aşağı ne kadar uzandığı, resmin kenarına oranla (`{ x, top, bottom }`; en az fotoğrafın yarıçapı, en çok resmin o taraftaki kenarı; binde bire dışa yuvarlanır, ölçülenden hiç küçük olmaz). Ölçülmemiş çerçevede yok. Eski APK'ların okuyucusu çerçevenin bildiği alanlarını tek tek alır, `reach`'i görmez. Panel listesinde `art.box` ve `art.reach` (yoksa `null`).
  - Koltuk rengi kişinin aldığı bir eşya değildir: kişinin mağazası (`economy.mjs`) onu satmaz; oda için `room-seat-color.mjs` satar ([`SUNUCU.md`](SUNUCU.md) Koltuk rengi).
- **Satış:** `economy.mjs` eşyayı panelin değerleriyle satar.
- **Hareketli WebP telefonda:** Expo şablonu React Native'in `<Image>`'ında hareketli WebP'yi kapalı getirir (`expo.webp.animated=false`). `plugins/with-animated-webp` onu açar (Fresco animated-webp); yeni APK gerekir.
- **Yükleme sınırı:** yönetici hesabı dakikada 120 dosya yükleyebilir (diğerleri 20); 24 çerçevelik bir set 48 dosyadır.
- **Uygulama:**
  - `lib/shop-live-core.ts`: listeyi okur, uygulamanın eşyalarıyla birleştirir, plakanın ekrandaki yerini ve balon resminin dokuz parçasını hesaplar. Telefon okuduğu listeyi saklar ve yeniden açılınca aynı kodla okur; bu yüzden liste sunucunun biçiminde saklanır.
  - `data/catalog` `cosmeticById` panelin değerlerini verir.
  - Plakayı `components/fx/video-fx` `PlateName` çizer.
  - Balonu `components/fx/shop-bubble` çizer; dalgayı `components/room/voice-wave` çizer (uygulamanın dört dalgası da aynı stillerden).
  - Koltuk renklerini `data/seat-colors` tutar (liste gelmeden uygulamanın altı rengi); koltuğu `components/room/seat-pouf` çizer (minder katmanı `tintColor` ile boyanır).
- **Testler:**
  - Sunucu: `test/shop-items.test.mjs`, `test/room-seat-color.test.mjs`.
  - Uygulama: `tests/shop-live.test.ts`, `tests/seat-colors.test.ts`.
  - Panel: `tests/app-admin.test.ts`.

## Sırada

- ~~**Seviyeye bağlı ödül**~~ yapıldı: VIP, Cömertlik ve Yankı seviyelerine çerçeve, giriş efekti, binek, balon ve dalga (Seviye ve VIP › Seviye ve görev ödülleri, [`CANTA.md`](CANTA.md)). Rütbe satın alınan bir kademe olduğu için ödülü yok.
- **Binek ve özel numara:** istenirse aynı sayfaya.

## Bölüm değiştirme (24 Kasım 2026)

Panelde bir çerçeveyi **Düzenle › Bölüm › Ses halkası** ile Ses halkası bölümüne taşıyabilirsin. Çerçeve bir resim, ses halkası ise uygulamanın konuşunca çizdiği halka olduğu için taşıma şöyle olur:

- Çerçevenin adı, fiyatı, süresi, VIP seviyesi ve süre paketleriyle Ses halkası bölümünde **yeni bir ses halkası** açılır, en başta durur. Stilini ve rengini Düzenle penceresinde seçersin.
- Çerçeve **satıştan kalkar**; satın almış olanlar süresi bitene kadar takmaya devam eder.
- Bir eşya bir kez taşınır, geri alınmaz. Denetim kaydına yazılır.
- Sahiplerin isteğiyle **Çerçeveler › Ses Halkası** bu şekilde Ses halkası bölümüne taşındı (turkuaz, yayılan halka, 150 jeton, 7 gün).

## Binekler (25 Kasım 2026)

Çarşı'da giriş efektleriyle duran binekler (Scooter, Spor Araba, Özel Jet) uygulamanın kendisinindir ve artık panelde **Mağaza › Binekler** sekmesinde yönetilir: adı, fiyatı, süresi, VIP seviyesi, sırası ve satışta olup olmadığı. Yeni binek eklenmez (uygulama her birini kendisi çizer).

- Sahiplerin isteğiyle üçü de **satıştan kaldırıldı**; panelden "Satışa çıkar" ile geri açılır.
- Alanlar süresi bitene kadar bineğiyle odaya girmeye devam eder.
- Eski APK'da Çarşı'da görünmeye devam eder ama satın alınamaz ("Bu ürün artık satışta değil"). Yeni APK sunucunun listesine göre gösterir.

## Özel ID, Takma isim ve "Yakında" (25 Kasım 2026)

- **Mağaza › Özel ID** sekmesi: ID 777, ID 2026, ID 1001 ve **Takma isim oluştur** (5.000 jeton, ücretli). Uygulamanın kendisinin; adı, fiyatı, VIP seviyesi, satışta ve Yakında olup olmadığı değişir, yenisi eklenmez.
- **Yakında**: her eşyanın Düzenle penceresinde bir kutu. İşaretli eşya Çarşı'da "Yakında" etiketiyle durur, satın alınamaz ("… yakında satışa çıkacak"). Özel ID'lerin ve Takma isim'in hepsi Yakında başlar.
- Eski APK: Özel ID'ler eskisi gibi görünür ama satın alınamaz; Takma isim görünmez.
- Takma isim henüz bir özellik değil: Yakında kalkmadan önce ne yapacağı (adın yanında mı, yerine mi görünecek, kaç harf, filtre) yazılmalı.

