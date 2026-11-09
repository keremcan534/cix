# Durum listesi: iki güncelleme belgesi, APK'daki gerçek hâli

Her madde, telefona kurulan APK'da (gerçek sunucuya bağlı sürüm) ne gördüğünü söyler. Her yeni APK'da güncellenir.

Durumlar:

- **Çalışıyor**: APK'da var ve sunucuya bağlı.
- **Yarım**: bir kısmı var, eksik olan yanında yazıyor.
- **Seviyeyle açılır**: var, ama yeni hesapta seviye yetmediği için görünmez.
- **Kurulum bekliyor**: kod hazır, bir hesap ya da anahtar girilince çalışır.
- **Yalnız telefonda**: sadece kullanan kişinin telefonunda çalışıyor, odadaki diğerleri görmüyor. Ya sunucuya taşınacak ya da gizlenecek.
- **Telefonda denenmeli**: kodda doğru, gerçek telefonda henüz denenmedi.

Son güncelleme: preview-96 sonrası (Küçült, çanta yağmuru, @bahset düzeltmesi).

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

## Paket 2'de düzelenler (oda)

- **Geri tuşu:** Oda menüsünde iki adım geri doğru çalışıyor. Menüden başka ekrana gidip dönünce menü yeniden açılıyor.
- **Oda ayarları artık sunucuda, odadaki herkes için aynı:**
  - yavaş mod, yasaklı kelimeler, bot (girişte hoş geldin ve kurallar)
  - oda tipi, mikrofon izni (Lv.4), Dümen koltuğu (Lv.3)
  - oda üyeleri (katıl, başvur, onayla, çıkar), kara liste
  - özel oda, kişi sınırı, odayı profilde göster, ekran görüntüsü engeli
- **Etkinlikler ve soru-cevap:** Sunucuda, odadaki herkes görüyor.
- **Başkalarının görünümü:** Çerçeve, sohbet balonu, giriş efekti ve konuşurken mikrofon efekti herkese görünüyor.

## Paket 3'te düzelenler (Aile)

- **Günlük görevler:** Sunucu, üyelerin gerçekten yaptıklarından sayıyor. Yoklama günde bir.
- **Haftalık sandıklar:** Ailenin haftası yetince açılıyor. Ödül jetonu veriyor (sadece mağazada harcanır). Kişi başı haftada bir.
- **Aile sohbetinde hediye:** Sadece aileden birine gidiyor, sohbette görünüyor. Gelir'de ayrı satır.
- **Ailem ekranı:**
  - bu hafta, sıra, aktif üye, öne çıkanlar
  - aile odası (liderin açık odası)
  - seviye ayrıcalıkları, aile kuralları
  - liderin seçtiği etiket ve tema
- **Uyum Köşesi:** Ailedeki gerçek ikililer ve İkili hediyesi.
- **Diğer:** Keşfet'teki Aile kısayolu açıldı. Oda kartında oda sahibinin ailesi görünüyor.

## Paket 4'te gelenler (bildirimler)

- **Aramalar çalacak:** Uygulama kapalıyken de çalacak, kendi zil sesiyle.
- **Bildirimler:** Mesaj, hediye ve takip bildirimleri gelecek.
- **Kurulum:** Kod hazır. Firebase dosyaları girilince açılır (aşağıda).

## Paket 5'te gelenler

- **Ajans kazançları:** Gerçek dosya olarak (Excel'de açılır) paylaşılıyor.
- **Mesajda fotoğraf:**
  - Yayıncıyla kalp seviyesi 3'te açılıyor.
  - Diğer kişilerle karşılıklı takipte açılıyor.
  - Depo (R2) anahtarları girilince çalışır.
- **Alt menü:** "Benzerler" artık "Ana Sayfa". Odalar'ın simgesi mikrofon oldu.

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
| 13 | Oda menüsünde geri tuşu | Telefonda denenmeli | İki adım geri ve menüye dönüş Paket 2'de geldi |
| 14 | Oda kartında tüm ayrıntılar | Çalışıyor | Kapak, oda üyeleri ve oda sahibinin ailesi var |
| 15 | Oda ayarlarında her şey | Çalışıyor | Hepsi sunucuda. Mikrofon izni Lv.4, Dümen koltuğu Lv.3 odada açılır |
| 16 | "Odayı şikâyet et" gizlensin | Çalışıyor | |
| 17 | Efekt ayarları | Çalışıyor | Başkalarının giriş efekti, çerçevesi ve sohbet balonu da görünüyor |
| 18 | Emoji: ücretsiz/ücretli | Çalışıyor | Konuşurken çıkan mikrofon efekti de herkese görünüyor |
| 19–22 | Yönetici sıralaması (sahip, Süper Yönetici, Yönetici) | Çalışıyor | Etkinlikler de sunucuda |
| 23 | Çarpı penceresi üstten açılsın | Çalışıyor | |
| 24 | Mikrofon kuyruğu (el kaldırma) | Çalışıyor | Başta kapalı, Oda ayarlarından açılıyor |
| 25 | Mikrofon değişikliği herkeste aynı | Telefonda denenmeli | |
| 26 | Küçük mikrofon, büyüyen sohbet | Çalışıyor | |
| 27 | Rüzgâr Gülü odada | Seviyeyle açılır | Cömertlik Lv.2'de açılır. Düğmesi örnekteki gibi sağ altta |
| 28 | Uğurlu hediyeler ve yönetimi | Seviyeyle açılır | Cömertlik Lv.2 ve 18 yaş gerekir. Yönetimi: Ayarlar › Yönetim › Uğurlu hediyeler (sadece yönetici hesaplar) |

## Belge 2: Güncelleme 2

| No | Madde | Durum | Not |
|---|---|---|---|
| 1 | Yayına katılma modu herkeste aynı | Telefonda denenmeli | |
| 2 | Mikrofon gürültü engelleme | Telefonda denenmeli | preview-94'ten beri APK'da |
| 3 | Aile | Yarım | Hepsi sunucuda (Paket 3). İki eksik: haftalık aile bonusu sadece tahmin olarak görünüyor, ödemesi senin kararın. Sandıktaki çerçeve ve sohbet balonu henüz verilmiyor, sadece jeton |
| 4 | Yayıncı profilinde ajans ve aile | Çalışıyor | |
| 5 | Profilde kırmızı/mavi cinsiyet simgesi | Çalışıyor | |
| 6 | Ajans sahibinin ana ekranı | Çalışıyor | |
| 7 | Haftalık/aylık kazanç ve dışa aktarma | Telefonda denenmeli | Artık gerçek dosya (.csv, Excel'de açılır) |
| 8 | Referans ajanslar | Çalışıyor | |
| 9–12 | Eşleşme (3 hak, 58 saniye, ücretler) | Çalışıyor | İki karşı cinsten hesap aynı anda aramada olmalı |
| 13 | Birebir: mesaj, sesli/görüntülü arama | Kurulum bekliyor | Uygulama kapalıyken arama çalması Firebase dosyaları girilince açılır |
| 14, 16–18 | Ücretler, karşılıklı takipte mesaj ücretsiz | Çalışıyor | Ücretler sadece onaylı ajans yayıncısıyla konuşunca görünür. Yönetim panelinden değişir |
| 15 | Kalp seviyesiyle arama açılması | Kurulum bekliyor | Arama kilitleri çalışıyor. Mesajda fotoğraf hazır (yayıncıyla kalp Lv.3), depo (R2) girilince çalışır |
| 19 | Mesajda hediye | Çalışıyor | |
| 20 | Ayarlar'da sürüm ve güncelleme | Çalışıyor | |
| 21 | Oda sesi kapat düğmesi | Çalışıyor | |
| 22–33 | ⋯ menüsü düzenlemesi | Çalışıyor | Çıkanlar odanın adına/resmine dokununca açılan oda kartında |
| 34 | Şanslı çanta | Telefonda denenmeli | preview-96: atılınca üstte kart iner, ekran kararır, yukarıdan çanta yağar |
| 35 | Emoji paneli geri tuşuyla kapansın | Çalışıyor | |
| 36 | Küçült/Büyüt | Telefonda denenmeli | preview-96: Küçült'te mikrofonlar numaralı küçük bir şerit, sohbet kalan yeri alır |
| 37 | Mesajda büyük emoji | Çalışıyor | |
| 38 | Mikrofon sayısına göre boyut | Çalışıyor | |
| 39 | Yazarken mikrofonlar kapanmasın | Telefonda denenmeli | |
| 40 | @bahset | Yarım | Bahsetmeli mesaj iletişim filtresine takılıyordu. Düzeltmesi PR #87'de, sonraki APK'da gelir |
| 41–42 | Kişi kartı | Çalışıyor | |
| 43–44 | DJ yetkisi | Çalışıyor | |
| 45 | Telefondan müzik çalma | Kurulum bekliyor | Depo (R2) anahtarları girilmeden şarkı yüklenmez |
| 46 | "Benzer" yerine "Ana Sayfa" | Çalışıyor | Alt menüde de "Ana Sayfa" |
| 47 | Cinsiyet filtresi kalksın | Çalışıyor | |
| 48 | Öne çıkanlar | Çalışıyor | Onaylı yayıncı ya da harcama yapan biri olunca dolar |
| 49–50 | Çevrim içi ve Yeni kullanıcı sekmeleri | Çalışıyor | |
| 51 | Dünya simgesiyle filtre | Çalışıyor | |
| 52 | Anlar'da Yankı Lv.5 | Çalışıyor | |
| 53 | Anlar'da spam ve görüntü filtresi | Yarım | Yazı filtreleniyor. Resimleri otomatik denetlemek için bir hizmet seçilmeli |
| 54 | Anlar'da yorum, silme, beğeni | Çalışıyor | |
| 55 | Odalar bannerları | Çalışıyor | Sadece "Sana yakın" sekmesinde |
| 56 | Yönetimin etkinlik bannerı | Çalışıyor | Resim için depo (R2) gerekir |
| 57–58 | Mesajlar üst bölümleri | Çalışıyor | |
| 59 | Similar Ekibi duyuruları | Çalışıyor | Telefona bildirimi Firebase girilince gelir |
| 60 | Çevrim içi hizmet | Çalışıyor | Sık sorulanlar ve e-posta var, canlı destek yok |

---

## Kalanlar: tam liste

**Yarım kalan işler (benim):**
- Simetri (Belge 1, madde 1): her ekran tek tek açılıp kontrol edilmedi.
- @bahset düzeltmesi: hazır, PR #87'de birleştirme bekliyor.
- Aile sandığındaki çerçeve ve sohbet balonu: mağazaya eklenince sandıktan verilir.
- Gezinme sadeleştirme planı: sana gösterilecek.

**Kurulum bekleyenler (senin):**
- **Bildirimler (Firebase):** Arama çalması, mesaj, hediye ve duyuru bildirimleri için. GitHub Secrets'a iki dosya:
  - `GOOGLE_SERVICES_JSON`: Firebase'in Android dosyası (paket adı com.similarclub.app).
  - `FCM_SERVICE_ACCOUNT`: Firebase hizmet hesabı anahtarı.
- **Depo (R2) anahtarları:** Anlar ve mesajda fotoğraf, şarkı yükleme, duyuru ve banner resimleri için. GitHub Secrets'a girilir.
- **Haftalık aile bonusu:** Şu an sadece tahmin gösteriliyor. Ödenecekse kuralını sen belirle.
- **Resim denetimi:** Anlar'daki resimleri otomatik denetlemek için bir hizmet seçilmeli.

**Telefonda denenecekler:** Bu listede "Telefonda denenmeli" yazan maddeler.

**Güvenlik ve yayın öncesi:**
- Finans paneli şifresini değiştir, iki adımlı doğrulamayı aç, WhatsApp'ta sabitlenmiş giriş mesajını sil. Sonra eski giriş bilgisi panelden silinir.
- Yayından önce test modu kapatılmalı: test jeton yükleme ve deneme girişi kapanır.
- Odada müzik için müzik lisansı (PRS/PPL).
- Play Store için mağaza paketi (AAB).

**Çalışıyor ama sınırlı:**
- Çevrim içi hizmette canlı destek yok, sık sorulanlar ve e-posta var.
- Odalar bannerları sadece "Sana yakın" sekmesinde.
- Kulüp (PR #36) senin isteğinle bekletiliyor.
