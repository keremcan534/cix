# Durum listesi: iki güncelleme belgesi, APK'daki gerçek hâli

Her madde, telefona kurulan APK'da (gerçek sunucuya bağlı sürüm) ne gördüğünü söyler. Her yeni APK'da güncellenir.

Durumlar:

- **Çalışıyor**: APK'da var ve sunucuya bağlı.
- **Yarım**: bir kısmı var, eksik olan yanında yazıyor.
- **Seviyeyle açılır**: var, ama yeni hesapta seviye yetmediği için görünmez.
- **Kurulum bekliyor**: kod hazır, bir hesap ya da anahtar girilince çalışır.
- **Yalnız telefonda**: sadece kullanan kişinin telefonunda çalışıyor, odadaki diğerleri görmüyor. Ya sunucuya taşınacak ya da gizlenecek.
- **Telefonda denenmeli**: kodda doğru, gerçek telefonda henüz denenmedi.

Son güncelleme: Paket 1 (acil düzeltmeler).

---

## Paket 1'de düzelenler

- **Odadaki hareketli animasyonlar:**
  - Ücretli olanlar artık sunucuda ödeniyor ve odadaki herkes görüyor.
  - Daha önce sadece gönderenin telefonunda oynuyordu, jeton da sonunda geri dönüyordu.
  - Ücretsiz tepkiler de artık herkese gidiyor.
- **Mikrofondaki emoji tepkileri:** Artık herkes görüyor. Önceden sadece gönderende görünüyordu.
- **Moderasyon:** Gerçek odalardaki sahte "2 açık rapor" yazısı kaldırıldı.
- **Oda sahibinin ayarları (artık sunucuda, odadaki herkes görüyor):**
  - **Kapak:** Oda sahibi ve Süper Yönetici seçebiliyor.
  - **Oda teması:** Sadece oda sahibi.
  - **Odada hediye efektleri aç/kapa:** Sadece oda sahibi.
  - **Üst çubuktaki ayar düğmesi:** Oda sahibi ve yöneticilerde de görünüyor.

---

## Belge 1: Güncellemeler

| No | Madde | Durum | Not |
|---|---|---|---|
| 1 | Her yer simetrik ve okunur | Yarım | Kodda tarandı, her ekrana tek tek bakılmadı |
| 2 | Para Çek'te Jeton Noktası | Çalışıyor | Aktif Jeton Noktası yoksa "Şu an aktif Jeton Noktası yok" yazar |
| 3 | "Yayıncı ata" kalksın | Çalışıyor | |
| 4 | Ajans koduyla katılma, 3 gün kuralı | Çalışıyor | 3 günü geçen kişi ajanssız kalır, sadece transferle bir ajansa girer |
| 5 | Transfersiz ayrılamaz, ikinci hesap ilk ajansa | Çalışıyor | İkinci hesap kuralı aynı telefonda geçerli |
| 6 | Erkek yayıncı olamaz, erkekten komisyon yok | Çalışıyor | |
| 7 | Gelir'de tüm kazanç ayrıntısı | Çalışıyor | |
| 8–11 | Balkon, Aile, yeni rütbe adları | Çalışıyor | |
| 12 | Anlar'da paylaşım ve hediye | Seviyeyle açılır | Paylaşım Yankı Lv.5'te açılır. Fotoğraf için depo (R2) gerekir. Hediye çalışıyor |
| 13 | Oda menüsünde geri tuşu | Yarım | Bir adım geri çalışıyor, iki adım içeriden geri basınca odaya atıyor |
| 14 | Oda kartında tüm ayrıntılar | Yarım | Kapak seçme bu pakette geldi. Aile ve üyeler bölümü yok |
| 15 | Oda ayarlarında her şey | Yarım | Tema bu pakette geldi. Eksikler: oda tipi, mikrofon izni, Dümen koltuğu, oda üyeleri, kara liste, gizlilik, bot. Yavaş mod ve kelime filtresi sadece telefonda çalışıyor |
| 16 | "Odayı şikâyet et" gizlensin | Çalışıyor | |
| 17 | Efekt ayarları | Yarım | Kişisel ayarlar çalışıyor. "Odada hediye efektleri" bu pakette herkese uygulanıyor. Başkalarının giriş efektleri henüz görünmüyor |
| 18 | Emoji: ücretsiz/ücretli | Çalışıyor | Bu pakette düzeldi. Konuşurken çıkan mikrofon efekti hâlâ sadece sende görünüyor |
| 19–22 | Yönetici sıralaması (sahip, Süper Yönetici, Yönetici) | Çalışıyor | Etkinlikler sadece telefonda tutuluyor |
| 23 | Çarpı penceresi üstten açılsın | Çalışıyor | |
| 24 | Mikrofon kuyruğu (el kaldırma) | Çalışıyor | Başta kapalı, Oda ayarlarından açılıyor |
| 25 | Mikrofon değişikliği herkeste aynı | Telefonda denenmeli | |
| 26 | Küçük mikrofon, büyüyen sohbet | Çalışıyor | |
| 27 | Rüzgâr Gülü odada | Seviyeyle açılır | Cömertlik Lv.2'de açılır. Düğmesi sağ altta, örnekteki gibi üstte değil |
| 28 | Uğurlu hediyeler ve yönetimi | Seviyeyle açılır | Cömertlik Lv.2 ve 18 yaş gerekir. Yönetimi: Ayarlar › Yönetim › Uğurlu hediyeler (sadece yönetici hesaplar) |

## Belge 2: Güncelleme 2

| No | Madde | Durum | Not |
|---|---|---|---|
| 1 | Yayına katılma modu herkeste aynı | Telefonda denenmeli | |
| 2 | Mikrofon gürültü engelleme | Telefonda denenmeli | preview-94'ten beri APK'da |
| 3 | Aile | Yarım | Sunucuda: kur, katıl, üyeler, roller, duyuru, sohbet. Eksikler: görevler, haftalık sandıklar, bonus, seviye ayrıcalıkları, aile odası. Keşfet'teki Aile kısayolu gizli |
| 4 | Yayıncı profilinde ajans ve aile | Çalışıyor | |
| 5 | Profilde kırmızı/mavi cinsiyet simgesi | Çalışıyor | |
| 6 | Ajans sahibinin ana ekranı | Çalışıyor | |
| 7 | Haftalık/aylık kazanç ve dışa aktarma | Yarım | Kazançlar var. Dışa aktarma dosya vermiyor, yazı olarak paylaşıyor |
| 8 | Referans ajanslar | Çalışıyor | |
| 9–12 | Eşleşme (3 hak, 58 saniye, ücretler) | Çalışıyor | İki karşı cinsten hesap aynı anda aramada olmalı |
| 13 | Birebir: mesaj, sesli/görüntülü arama | Yarım | Karşı tarafın uygulaması kapalıysa arama çalmıyor (bildirim kurulumu bekliyor) |
| 14, 16–18 | Ücretler, karşılıklı takipte mesaj ücretsiz | Çalışıyor | Ücretler sadece onaylı ajans yayıncısıyla konuşunca görünür. Yönetim panelinden değişir |
| 15 | Kalp seviyesiyle arama açılması | Yarım | Arama kilitleri çalışıyor. Mesajda fotoğraf gönderme hiç yok |
| 19 | Mesajda hediye | Çalışıyor | |
| 20 | Ayarlar'da sürüm ve güncelleme | Çalışıyor | |
| 21 | Oda sesi kapat düğmesi | Çalışıyor | |
| 22–33 | ⋯ menüsü düzenlemesi | Çalışıyor | Çıkanlar odanın adına/resmine dokununca açılan oda kartında |
| 34 | Şanslı çanta | Çalışıyor | |
| 35 | Emoji paneli geri tuşuyla kapansın | Çalışıyor | |
| 36 | Küçült/Büyüt | Çalışıyor | |
| 37 | Mesajda büyük emoji | Çalışıyor | |
| 38 | Mikrofon sayısına göre boyut | Çalışıyor | |
| 39 | Yazarken mikrofonlar kapanmasın | Telefonda denenmeli | |
| 40 | @bahset | Çalışıyor | |
| 41–42 | Kişi kartı | Çalışıyor | |
| 43–44 | DJ yetkisi | Çalışıyor | |
| 45 | Telefondan müzik çalma | Kurulum bekliyor | Depo (R2) anahtarları girilmeden şarkı yüklenmez |
| 46 | "Benzer" yerine "Ana Sayfa" | Yarım | Sekmeler doğru, alt menüde hâlâ "Benzerler" yazıyor |
| 47 | Cinsiyet filtresi kalksın | Çalışıyor | |
| 48 | Öne çıkanlar | Çalışıyor | Onaylı yayıncı ya da harcama yapan biri olunca dolar |
| 49–50 | Çevrim içi ve Yeni kullanıcı sekmeleri | Çalışıyor | |
| 51 | Dünya simgesiyle filtre | Çalışıyor | |
| 52 | Anlar'da Yankı Lv.5 | Çalışıyor | |
| 53 | Anlar'da spam ve görüntü filtresi | Yarım | Yazı filtreleniyor, resimler otomatik denetlenmiyor |
| 54 | Anlar'da yorum, silme, beğeni | Çalışıyor | |
| 55 | Odalar bannerları | Çalışıyor | Sadece "Sana yakın" sekmesinde |
| 56 | Yönetimin etkinlik bannerı | Çalışıyor | Resim için depo (R2) gerekir |
| 57–58 | Mesajlar üst bölümleri | Çalışıyor | |
| 59 | Similar Ekibi duyuruları | Çalışıyor | Kişisel duyurunun telefona bildirimi kurulum bekliyor |
| 60 | Çevrim içi hizmet | Çalışıyor | Sık sorulanlar ve e-posta var, canlı destek yok |

---

## Kurulum bekleyenler (senin yapacakların)

- **Bildirimler (Firebase):** Arama çalması, mesaj ve duyuru bildirimleri için.
- **Depo (R2) anahtarları:** Fotoğraf, şarkı ve duyuru resimleri için. Anahtarlar GitHub Secrets'a girilir.

## Sıradaki paketler

1. **Oda, geri kalanı:** Sadece telefonda çalışan her şey sunucuya taşınacak ya da gizlenecek:
   - yavaş mod, kelime filtresi
   - etkinlikler, soru-cevap
   - oda tipi, mikrofon izni, oda üyeleri, kara liste
   - başkalarının giriş ve mikrofon efektleri
   - iki adım geri tuşu
   - alt menüdeki "Benzerler" adı
2. **Aile'nin tamamı:** görevler, haftalık sandıklar, bonus, seviye ayrıcalıkları, aile odası, Keşfet kısayolu.
3. **Bildirimler:** Firebase dosyaları gelince.
