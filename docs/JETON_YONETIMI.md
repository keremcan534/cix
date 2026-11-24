# Jeton yönetimi: yönetim jeton yüklemesi ve jeton paketleri

> **Jeton değeri (24 Kasım 2026):** Sahipler: "1.000 jeton = 220 TL, kur 50,62". Panel › Canlı ayarlar'a iki yeni ayar
> geldi: **Jeton değeri › 1.000 jeton = ? TL** (varsayılan 220) ve **Jeton Noktası › Toptan: 1.000 jeton = ? TL**
> (varsayılan 220, elle değiştirilir). Bir kayıtta en çok %50 değişirler (kayan bir rakam on kat fiyat olmasın).
> - **Paketler:** her pakette 1.000 jeton = 220 TL. Google Play Türkiye'de bir ürüne en çok 11.000 TL verilebildiği
>   için paketler 1.000–50.000 jeton: 1.000 (220 TL), 2.500 (550), 5.000 (1.100), 7.500 (1.650), 10.000 (2.200),
>   15.000 (3.300), 20.000 (4.400), 30.000 (6.600), 50.000 (11.000). Play Console'da `coins_2500`, `coins_7500`,
>   `coins_15000`, `coins_30000` yeni ürün; beş eski ürünün fiyatı değişir; `coins_100000`, `coins_200000`,
>   `coins_500000`, `coins_1000000` pasife alınır (geç gelen bir satın almaları yine yüklenir). Kullanıcının ödediği
>   fiyatı Play belirler; uygulama Play'in fiyatını gösterir.
> - **Satın almanın fiyatı** artık satın almanın üstüne yazılır (migration 119): finans kaydı ve iade ekranı o fiyatı
>   kullanır; daha önceki satın almalar eski paket fiyatıyla kalır.
> - **Çevir (elmas → jeton)** jeton değeriyle hesaplanır: 5.000 elmas = 1 USD kalırken 10.000 elmas ≈ 460 jeton (önce
>   ≈ 4.218). Eski uygulamalar eski orana göre fazla jeton gösterdiği için Çevir'de "uygulamayı güncelle" uyarısı alır,
>   hiçbir şey taşınmaz. Jeton Noktası bozdurması da aynı değerle (aksi hâlde elmas ucuza alınıp jeton pahalıya satılırdı).
> - **Kur:** varsayılan 50,62. Canlı ayarlar'da elle kaydedilmiş bir kur varsa o geçerlidir; panelden 50,62 yapılmalı.
> - **Finans paneli:** panel migration 012, yüklendiği gün USD/TRY 50,62 kuru ve 1 jeton = 0,22 TRY gelir karşılığını
>   (komisyon matrahı) yazar.
> - **Ödeme kuru (24 Kasım 2026):** Yayıncılara ve ajanslara ödeme yaparken baz alınan kur, Canlı ayarlar › Ödemeler ›
>   **Ödeme kuru: 1 USD = ? TL** (varsayılan 49, elle değişir, bir kayıtta en çok %10). Panelin Para çekme ve Ajans
>   ödemeleri sayfaları gönderilecek TL'yi (USD × ödeme kuru) gösterir; "Ödendi" işaretlenince o anki kur ve TL ödemeye
>   yazılır (migration 120), sonradan değişmez. Panelin gördüğü kur ile o anki kur farklıysa işaret konmaz, yeni tutar
>   gösterilir. Jeton Noktası anında bozdurmada yayıncıya ödenecek TL de bu kurla; çevirme ve finans raporları 50,62 ile
>   kalır (aradaki fark ödemelerde şirkette kalır).
> - **Sonraki adımlar (sahiplerle):** elmasın değeri (5.000 elmas = 1 USD) ve jetonla fiyatlanan her şey (hediyeler,
>   VIP eşikleri, Rütbe, mağaza, oyunlar) ayrı ayrı konuşulacak; şimdilik jeton sayıları aynı.

Tarih: 22 Kasım 2026. Sahiplerin "Yönetim Paneli Güncelleme" listesindeki 4. ve 5. maddeler.

## Yönetim jeton yüklemesi (panel: Para › Yönetim jeton yükleme)

Yönetim bir süre Jeton Noktası hizmetini kendisi verecek. Bu sayfayı yalnız **Süper yönetici** görür ve kullanır
(panel yetkisi `app.jeton_load`; başka hiçbir role verilmez).

1. **Yönetim hesabı:** Yönetimin kendi Jeton Noktası hesabı seçilir. Hesap önce Para › Jeton Noktası sayfasından
   Jeton Noktası yapılır. Sayfa hesabın stoğunu gösterir.
2. **Jeton üret:** Hesaba jeton üretilir (uygulamanın toptan satışı). Kaç jeton olduğu, toplam TL fiyatı ve belge
   numarası yazılır. Fiyat finansa bu stoğun maliyeti olarak gider.
3. **Kişiye yükle:** Kişinin profilindeki ID, 1.000 jetonun TL değeri (toptan fiyattan başlar, değiştirilebilir),
   jeton ya da ödenen TL yazılır; biri yazılınca öteki kendiliğinden hesaplanır. Dekont numarası ve not isteğe bağlıdır.
   **Yükle** önce bir onay penceresi açar: kişinin adı, jeton ve tutar. **Onayla ve yükle** yükler, **Vazgeç** iptal
   eder. Jetonlar yönetim hesabının stoğundan düşer.
4. **Geri al:** Yalnız yönetim, yanlış bir yüklemeyi geri alır. O yüklemeden kişide **hâlâ harcanmamış** jetonlar
   yönetim hesabına döner; harcanmış kısım geri gelmez (ekran ne kadarının döndüğünü söyler). Bir yükleme bir kez geri
   alınır. Neden yazmak zorunludur.

Her işlem uygulamanın kaydına işlemi yapan panel kullanıcısının adıyla yazılır (`coin_transfers` `admin_load`,
`admin_reverse`; `audit_events` `jeton.admin_load`, `jeton.admin_reverse`). Kişiye gelen jeton bir Jeton Noktası
satışı gibidir: hediye edilince alıcının elması 1 gün kilitli kalır, mağaza iadesi izini bulur.

## Jeton paketleri (panel: Canlı ayarlar › Hediyeler ve paketler › Jeton paketleri)

Her paket için panelden:

- **Ek jeton:** Paketi alan herkese her alımda paketin üstüne verilen jeton (ör. 5.000'lik pakete +500 → 5.500).
  Kalıcıdır, süresi yoktur; değiştirilene kadar her alımda verilir.
- **İlk alım hediyesi:** Paketi ilk kez alana bir kez verilen jeton.
- **Sıra:** Paketlerin cüzdandaki sırası (↑ ↓).

En çok paketin kendi jetonu kadar ek jeton ve hediye verilir. Paketin kendi jetonu ve fiyatı Google Play'deki
ürüne bağlıdır (`coins_5000` gibi), bu yüzden buradan değişmez. Fiyat Play Console'dan değişir. Paket gizlemek için
"Gizli paketler" ayarı kullanılır.

Ek jeton ve hediye ayrı tutulur (`purchases.extra`, `bonus`); satın alma iade edilirse geri alınır. Ek jeton
finansa ayrı bir hediye olarak gider (`paket_ek_jeton`). Kampanya bunlara ek olarak çalışır. Kayıt önce önizlenir,
geçmişte durur ve geri alınabilir.

**Eski APK'lar:** Sıra ve ilk alım hediyesi eski uygulamada da görünür. Ek jeton eski uygulamada görünmez ama alımda
verilir.
