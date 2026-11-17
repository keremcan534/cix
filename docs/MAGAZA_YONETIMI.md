# Mağaza yönetimi (çerçeveler, giriş efektleri, sohbet balonları, ses dalgaları)

Müşterinin isteği (17 Kasım): giriş efekti, çerçeve, sohbet balonu, ses dalgası ve çıkartma paketleri için mağaza içeriğini düzenleyecek bir ekran. Giriş efektinde odaya girenin adı animasyonun üstünde yazmalı.

Sahibin kararı: önce giriş efekti ve çerçeve (yayında), sonra sohbet balonu ve ses dalgası (bu bölüm).

Çıkartma paketleri zaten panelde: **Uygulama › Emojiler** ([`EMOJI_YONETIMI.md`](EMOJI_YONETIMI.md)).

## Panelde: Hediye ve mağaza › Mağaza

Dört sekme var: **Giriş efektleri**, **Çerçeveler**, **Sohbet balonları** ve **Ses dalgaları**.

- **Uygulamanın kendi eşyaları:** şunlar değişir ve "Orijinaline dön" ile geri gelir:
  - ad
  - fiyat
  - süre (0 = süresiz)
  - VIP seviyesi
  - satışta mı
  - sıra

  Resimleri, animasyonları ve renkleri uygulamanın içinde; onlar buradan değişmez.
- **Yeni çerçeve:**
  - Saydam, kare PNG ya da WebP (128–1024 px, en çok 4 MB).
  - Fotoğraf ortadaki boşluğa oturur. Boşluğun büyüklüğü önizlemede örnek fotoğrafla kaydırıcıdan ayarlanır.
- **Yeni giriş efekti:**
  - **Video:** hazır yığılmış MP4, ya da saydam WebM, ProRes 4444 .mov veya SVGA. Bunları uygulamanın sunucusu hediyelerdeki gibi telefon videosuna çevirir. Çevrilene kadar eski video oynar.
  - **İsim plakası:** odaya girenin adının yazılacağı yer. Ayarlar: yatay ve dikey yer, genişlik, yazı boyu, renk, kalın.
  - **Önizleme:** videonun üstünde örnek bir adla gösterilir.
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
  - **Parıltı resmi (isteğe bağlı):** saydam PNG ya da WebP, 64–512 px, en çok 512 KB. Kalp ya da yıldız gibi bir şekil; noktaların yerine döner.
  - **Önizleme:** konuşan bir yüzün çevresinde.
- **Satıştan kaldırma ve silme:**
  - Satıştan kaldırılan eşya mağazada görünmez ve satılmaz. Sahibi kullanmaya devam eder; odada başkaları da görür.
  - Kimsede olmayan kendi eşyanız silinebilir; resmi ve videosu da silinir.
  - Sahibi olan eşya silinmez.
- **Yetki:** `app.shop`. Süper yönetici, finans yöneticisi ve operasyon yöneticisinde var.
- **Denetim kaydı:** her değişiklik kaydedilir (`audit_events` `shop.*`, önce/sonra).

## Tasarımcı için

- Giriş animasyonunda **isim alanını boş bırakın**; isim plakası ve çerçeve animasyonda olabilir, yazıyı uygulama yazar.
- Animasyon 540 × 960 kareye göre hazırlanır (dikey). Plakanın yeri bu kareye göre verilir. Telefon videoyu ekrana sığdırır, ad videodaki yere oturur.
- Saydam olmayan (arka planlı) video ancak "Arka planlı tam ekran" seçilirse kabul edilir; yoksa odada kutu gibi görünür.
- **Sohbet balonu resmi:**
  - Süsleri (taç, kanat, yıldız) köşelere koyun. Ortaya ve kenarların ortasına süs koymayın: uzar.
  - Mesaj, köşe çizgilerinin arasındaki alana yazılır. Bu alan, yazı rengiyle okunacak kadar sade olsun.
  - Kenarları yuvarlak bir balon için çevresi saydam olmalı.
- **Ses dalgası resmi:** tek bir küçük şekil (kalp, yıldız). Telefon dört tanesini halkanın üstünde döndürür.

## Telefonlar

- **Yeni APK:**
  - Mağazayı sunucudan gösterir: sıra, ad, fiyat, süre ve sizin eklediğiniz eşyalar.
  - Gösterdiği fiyat ve günle satın alır. Fiyat ya da gün arada değiştiyse alım reddedilir, jeton düşmez.
  - Sizin çerçevenizi fotoğrafın çevresine çizer.
  - Sizin giriş efektinizin videosunu indirir ve odaya girenin adını plakaya yazar. Video henüz telefonda değilse ya da "hareketi azalt" açıksa alışılmış giriş bandı çıkar.
  - Sizin sohbet balonunuzu odadaki sohbette çizer: renkleriyle ya da resmiyle, köşeler bozulmadan.
  - Sizin ses dalganızı konuşanın koltuğunda çizer; dalga sese göre büyür.
- **Eski APK'lar:**
  - Kendi içindeki mağazayı gösterir.
  - Panelde fiyatı ya da süresi değişmiş bir eşyayı alamaz, "uygulamayı güncelle" görür. Satıştan kaldırılmış eşya için "artık satışta değil" görür.
  - Sizin eklediğiniz eşyaları göremez. Onları takan birini görünce çerçeve, giriş efekti, balon ya da dalga çizmez; düz halini gösterir.
  - Çerçeve ve giriş efektiyle çıkan APK (preview-172) balon ve dalga satırlarını atlar; kendi balonlarını ve dalgalarını gösterir.

## Teknik

- **Tablo:** `076_shop_items`, `077_shop_bubbles_waves` (balon ve dalga; görünüş `look` sütununda).
- **Sunucu:**
  - `shop-items.mjs`: panel uçları ve telefonlara giden liste (`GET /api/catalog?shop=1` `shop`).
  - Giriş efekti videoları `/api/fx/s/<id>.mp4` adresinden ve katalogun `fx` listesinden gelir.
  - Video çevirme hediyelerle aynı iş: `custom-gifts.mjs` iki tabloyu sırayla çevirir.
  - Balon ve dalga resimleri de `shopframe` yüklemesiyle gelir; boyutu ve saydamlığı kullanımına göre `shop-items.mjs`'de denetlenir.
- **Satış:** `economy.mjs` eşyayı panelin değerleriyle satar.
- **Uygulama:**
  - `lib/shop-live-core.ts`: listeyi okur, uygulamanın eşyalarıyla birleştirir, plakanın ekrandaki yerini ve balon resminin dokuz parçasını hesaplar. Telefon okuduğu listeyi saklar ve yeniden açılınca aynı kodla okur; bu yüzden liste sunucunun biçiminde saklanır.
  - `data/catalog` `cosmeticById` panelin değerlerini verir.
  - Plakayı `components/fx/video-fx` `PlateName` çizer.
  - Balonu `components/fx/shop-bubble` çizer; dalgayı `components/room/voice-wave` çizer (uygulamanın dört dalgası da aynı stillerden).
- **Testler:**
  - Sunucu: `test/shop-items.test.mjs`.
  - Uygulama: `tests/shop-live.test.ts`.
  - Panel: `tests/app-admin.test.ts`.

## Sırada

- **Seviyeye bağlı ödül:** VIP ve Rütbe seviyelerine çerçeve, giriş efekti, balon ve dalga bağlamak (Seviyeler ve VIP sayfasıyla).
- **Binek ve özel numara:** istenirse aynı sayfaya.
