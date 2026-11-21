# Jeton yönetimi: yönetim jeton yüklemesi ve jeton paketleri

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
