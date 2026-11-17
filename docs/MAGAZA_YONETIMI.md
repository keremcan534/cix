# Mağaza yönetimi (çerçeveler ve giriş efektleri)

Müşterinin isteği (17 Kasım): giriş efekti, çerçeve, sohbet balonu, ses dalgası ve çıkartma paketleri için mağaza içeriğini düzenleyecek bir ekran. Giriş efektinde odaya girenin adı animasyonun üstünde yazmalı.

Sahibin kararı: önce giriş efekti ve çerçeve, sonra sohbet balonu ve ses dalgası.

Çıkartma paketleri zaten panelde: **Uygulama › Emojiler** ([`EMOJI_YONETIMI.md`](EMOJI_YONETIMI.md)).

## Panelde: Hediye ve mağaza › Mağaza

İki sekme var: **Giriş efektleri** ve **Çerçeveler**.

- **Uygulamanın kendi eşyaları:** şunlar değişir ve "Orijinaline dön" ile geri gelir:
  - ad
  - fiyat
  - süre (0 = süresiz)
  - VIP seviyesi
  - satışta mı
  - sıra

  Resimleri ve animasyonları uygulamanın içinde; onlar buradan değişmez.
- **Yeni çerçeve:**
  - Saydam, kare PNG ya da WebP (128–1024 px, en çok 4 MB).
  - Fotoğraf ortadaki boşluğa oturur. Boşluğun büyüklüğü önizlemede örnek fotoğrafla kaydırıcıdan ayarlanır.
- **Yeni giriş efekti:**
  - **Video:** hazır yığılmış MP4, ya da saydam WebM, ProRes 4444 .mov veya SVGA. Bunları uygulamanın sunucusu hediyelerdeki gibi telefon videosuna çevirir. Çevrilene kadar eski video oynar.
  - **İsim plakası:** odaya girenin adının yazılacağı yer. Ayarlar: yatay ve dikey yer, genişlik, yazı boyu, renk, kalın.
  - **Önizleme:** videonun üstünde örnek bir adla gösterilir.
  - **Uzun ad:** plakaya sığacak kadar küçülür, tek satır kalır.
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

## Telefonlar

- **Yeni APK:**
  - Mağazayı sunucudan gösterir: sıra, ad, fiyat, süre ve sizin eklediğiniz eşyalar.
  - Gösterdiği fiyat ve günle satın alır. Fiyat ya da gün arada değiştiyse alım reddedilir, jeton düşmez.
  - Sizin çerçevenizi fotoğrafın çevresine çizer.
  - Sizin giriş efektinizin videosunu indirir ve odaya girenin adını plakaya yazar. Video henüz telefonda değilse ya da "hareketi azalt" açıksa alışılmış giriş bandı çıkar.
- **Eski APK'lar:**
  - Kendi içindeki mağazayı gösterir.
  - Panelde fiyatı ya da süresi değişmiş bir eşyayı alamaz, "uygulamayı güncelle" görür. Satıştan kaldırılmış eşya için "artık satışta değil" görür.
  - Sizin eklediğiniz eşyaları göremez. Onları takan birini görünce çerçeve ya da giriş efekti çizmez.

## Teknik

- **Tablo:** `076_shop_items`.
- **Sunucu:**
  - `shop-items.mjs`: panel uçları ve telefonlara giden liste (`GET /api/catalog?shop=1` `shop`).
  - Giriş efekti videoları `/api/fx/s/<id>.mp4` adresinden ve katalogun `fx` listesinden gelir.
  - Video çevirme hediyelerle aynı iş: `custom-gifts.mjs` iki tabloyu sırayla çevirir.
- **Satış:** `economy.mjs` eşyayı panelin değerleriyle satar.
- **Uygulama:**
  - `lib/shop-live-core.ts`: listeyi okur, uygulamanın eşyalarıyla birleştirir, plakanın ekrandaki yerini hesaplar.
  - `data/catalog` `cosmeticById` panelin değerlerini verir.
  - Plakayı `components/fx/video-fx` `PlateName` çizer.
- **Testler:**
  - Sunucu: `test/shop-items.test.mjs`.
  - Uygulama: `tests/shop-live.test.ts`.
  - Panel: `tests/app-admin.test.ts`.

## Sırada

- **Sohbet balonu ve ses dalgası:** panelden renk ve görsel, aynı sayfaya yeni sekmeler.
- **Seviyeye bağlı ödül:** VIP ve Rütbe seviyelerine çerçeve ve giriş efekti bağlamak (Seviyeler ve VIP sayfasıyla).
