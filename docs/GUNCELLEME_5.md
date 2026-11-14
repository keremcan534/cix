# Güncelleme 5

Sahibin gönderdiği "güncelleme 5" belgesinin 19 maddesi, "hediyeler standart 1. parti" listesi ve durumları.

**Durum:** 19 maddenin hepsi yapıldı. Sunucu değişiklikleri ana dala birleşince kendiliğinden kurulur. Uygulama değişiklikleri yeni APK ile gelir; 15. madde ve ham mikrofon yerel kod değiştirdiği için yeni APK şart.

**Sahibin kararları (bu güncellemede):**
- Mikrofonu tamamen ham bırakan seçenek olsun: Efektler ve ses › "Ham mikrofon (şarkı modu)".
- Oda sahibi ve yöneticiler üye kontenjanından yer tutmasın.
- Abonelik sunucuya bağlansın; ziyaretçileri yalnız aboneler görsün.

## Maddeler

| # | Madde | Ne yapıldı |
|---|---|---|
| 1 | PK için odada birden fazla kişi isteniyor; PK başladıktan sonra girenler dahil olmuyor | Kişi sayısı önemsiz, tek kişiyle de açılır. PK sürerken mikrofona çıkan herkes kendiliğinden katılır (Takım PK'de az kişili takıma). Patron koltuğundaki kişi de PK'ye girer. `POST /api/rooms/pk/join` |
| 2 | Oda sesini kapatıp çıkan, dönünce sesi hâlâ kapalı buluyor | Oda sesi açık/kapalı artık o ziyarete ait: odaya yeniden girince, oda değiştirince ya da uygulama yeniden açılınca açık gelir. Küçültülen oda aynı ziyarettir; mini kartta "Oda sesi kapalı" yazar |
| 3 | Oda sesini kapatırken ekranda bir satır kaybolup geliyor | Mikrofonları aşağı iten "Oda sesi senin için kapalı" satırı kaldırıldı; kapalı olduğu hoparlör düğmesinden ve menüden görülür. Ekranda hiçbir şey kaymaz |
| 4 | Profil fotoğrafı ve çerçeve değişince mikrofonda ve balkonda değişmiyor | Sunucu, kişinin bulunduğu odalara yeni görünümünü hemen duyurur (çerçeve, ürün, fotoğraf, ad, cinsiyet görünürlüğü); mikrofon ve balkon odadan çıkıp girmeden yenilenir |
| 5 | Ses dalgaları kişiden kişiye farklı, bazıları çerçeveyi kesiyor | Her dalga stili aynı ölçüyle çizilir: fotoğrafın dışında, çerçevenin arkasında, koltuğun alanını aşmadan. Konuşan herkeste ve her telefonda aynı |
| 6 | Bazı geniş çerçeveler ismi ve yanındakileri kapatıyor | Her çerçevenin taşma payı ölçüldü; koltukta çerçeve kendi hücresinde kalır, isim her zaman okunur. 13 mağaza çerçevesi denendi |
| 7 | Giriş efekti: yöneticinin efekti herkese yansıyor, girene içeridekiler tekrar gösteriliyor, çift bildirim | Yalnız sen odadayken girenler "giriş" sayılır (ses sunucusunun giriş saatleri); içeride olanlar tekrar gösterilmez. Efekt girenin kendi görünüşüdür, oda yetkisi değiştirmez. Çift bildirimi yalnız ikisi aynı anda (20 sn içinde) girince, kendi girişlerinden sonra bir kez çıkar |
| 8 | Katkı sıralamasında kürsü ekrana oturmuyor, kişiler yanlış yerde | Kürsü resmi ekrandan ~3 kat genişti. Artık telefona ve tablete sığar: 2. solda, 1. ortada ve yüksekte, 3. sağda, her kişi kendi basamağında |
| 9 | Şanslı kazançları yalnız kazananda görünüyor | Kazanç bütün odalarda, uygulaması açık herkese üstteki bantla duyurulur. Adını gizleyen "Bir kullanıcı" görünür. Canlı ayarlar › Kazanç duyurusu ile en az kazanç seçilebilir (varsayılan: her kazanç) |
| 10 | Yeni hesaplarda katkı sıralaması görünmüyor, avatarları başkalarına görünmüyor | Kupanın yanındaki ilk üç sunucudan (bugünün Cömertlik listesi) gelir. Yeni hesabın adı ve fotoğrafı görünüm yanıtıyla gelir; mikrofonda, balkonda ve giriş efektinde görünür |
| 11 | Mikrofon sayısı artınca PK hediye toplamı görünmüyor | Puan rozeti koltuğun genişliğine göre boyutlanır; sığmazsa kısa yazılır (16,4B, 1,2Mn). 30 mikrofonda da okunur |
| 12 | PK bildirimi ana ekranda sabit, büyük duruyor | Büyük çubuk yerine üst bilgi satırında küçük "PK 47:16" rozeti; dokununca sıralama açılır. Koltuklar çubuğun yerini geri alır |
| 13 | Oda sesini kapatanlar müziği duymaya devam ediyor | Oda sesi kapalıyken müzik de durur; açılınca odanın o anki yerinden devam eder. Ortak YouTube ekranı da susar |
| 14 | Oda üyeleri "0 / 5.000" görünüyor | Sayı listedeki herkesi sayar (sahip ve yöneticiler dahil). Kontenjan yalnız üyeleri sayar; listede "Üye kontenjanı n / sınır" satırı. Takipçiler ayrı sayılır |
| 15 | Mikrofon denoise çalışmıyor | Sebep: eski bir ayar telefonun kendi gürültü engelleyicisini kapatıp yerine daha zayıfını koyuyordu; kaldırıldı. Temel gürültü engelleme, yankı giderme ve ses ayarı hep açık; "Mikrofon denoise" yapay zekâ temizliğini açar ve altında gerçekten çalışıp çalışmadığını yazar. **Yeni APK gerekir** |
| 16 | Animasyonlu hediyeler birbirini kesiyor | Büyük hediyeler sıraya girer, her biri sonuna kadar oynar. Aynı kişinin aynı hediyesi ×N olarak birleşir; birkaç kişiye atılan tek gösterim olur; sıra en çok 6 hediye / 24 sn |
| 17 | Her hediyede Şanslı'daki gibi tekrar çarkı | Her hediyeden sonra çark çıkar; dokundukça aynı hediye aynı kişilere tekrar gider. Fiyatı her seferinde sunucu belirler; jeton bitince çark kapanır |
| 18 | Emoji paneli açılınca mikrofonlar küçülüp kayıyor | Panel sohbet alanının üstünde açılır; koltuklar ve oda düzeni hiç değişmez. Panel ile klavye aynı anda açık kalmaz |
| 19 | Ziyaretçiler herkese açılsın, abone olmayana bulanık, bildirim gitsin | Liste herkese açık. Abone olmayan bakanın yüzünü ve adını bulanık görür, sunucu kimliği hiç göndermez. Profile bakılınca sahibine bildirim gider (aynı ziyaretçi için günde en çok bir kez; abone olmayana kimlik vermeden) |

## Hediye videoları sunucudan iner

Sahibin sorusu: "Hediyeleri uygulamaya mı gömüyorsun, sunucudan mı çekiyorsun? Gömersen uygulama şişer."

Videolar artık uygulamaya gömülmez. `server/api/fx/` içinden verilir; telefon her videoyu bir kez indirir, saklar, sürümü değişince yenisini alır (`docs/SUNUCU.md` › `GET /api/fx/<ad>.mp4`). Düşük veri modunda yalnız ilk gerektiğinde iner; inmemiş videonun yerine çizimli efekt oynar. Yeni video eklemek için uygulama güncellemesi gerekmez: dosya klasöre konur, `server/api/fx.mjs` `FX_VIDEOS` satırı eklenir.

### "Hediyeler standart 1. parti" listesi

| No | Hediye | Belgedeki elmas | Süre | Durum |
|---|---|---|---|---|
| 1–4 | Gül, Kalp, Kahve, Pasta | Standart | Standart | Uygulamada var (10, 50, 99, 200 jeton) |
| 5 | Tatlı Ayıcık | 20–30 | 6 sn | Videolu, uygulamada (2.999 jeton) |
| 6 | Pırlanta Yüzük | 30–50 | 6 sn | Videolu, uygulamada (19.999 jeton) |
| 5 | Roket | 50–80 | 6 sn | Videolu, uygulamada (1.999 jeton) |
| 6 | Kraliyet Tacı | 50–80 | 6 sn | Videolu, uygulamada (9.999 jeton) |
| 7–14 | Sevimli Panda, Hazine Sandığı, Efsanevi Tek Boynuz, Anka Kuşu, Altın Gemi, Kristal Saray, Altın Süper Otomobil, Altın Aslan | 60–400 | 6–8 sn | Videolar Drive'da; dosyalar ve fiyatlar bekleniyor |
| 15–20 | Altın Ejderha, Kraliyet Jeti, Altın İmparatorluk, Kozmik Ejderha, Ebedi Taht, Tanrıların Mirası | 500–5.000 | 8–10 sn | Henüz üretilmedi |

**Açık soru:** belgedeki "Elmas" sütunu bugünkü jeton fiyatlarıyla uyuşmuyor (Tatlı Ayıcık belgede 20–30, uygulamada 2.999 jeton). Fiyatlar netleşene kadar değiştirilmedi.

## Telefonda denenecekler

- **PK:** Tek kişiyle PK başlat, ikinci telefon mikrofona çıksın: birkaç saniyede her telefonda PK'ye girmeli (Takım PK'de az kişili takıma).
- **Giriş efekti:** Yönetici içerideyken odaya gir: içeridekilerin girişi tekrar oynamamalı. Bir çift aynı anda ve ayrı ayrı girsin.
- **Şanslı:** Kazanç başka bir odada da görünmeli.
- **Görünüm:** Biri odadayken çerçeve takıp çıkarsın ve fotoğraf değiştirsin: öbür telefonda hemen değişmeli.
- **Ses:**
  - Müzik çalarken oda sesini kapat: müzik de susmalı.
  - "Mikrofon denoise" altında konuşunca "Çalışıyor" yazmalı. "başlatılamadı" derse `SimilarDenoise` etiketli logcat satırları gerekir.
  - Gürültü engellemeyi ayrı odalarda ya da kulaklıkla deneyin; iki telefon aynı odada hoparlörle yankı yapar.
- **Hediyeler:** Videolu hediyeleri arka arkaya at: her biri sonuna kadar, sırayla oynamalı. Tekrar çarkı jeton bitince tek uyarıyla kapanmalı.
- **Düzen:** Emoji panelini açınca koltuklar kıpırdamamalı; tablette katkı kürsüsü sığmalı.
