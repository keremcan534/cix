# Güncelleme 6

Sahibin gönderdiği "güncelleme 6" belgesinin 7 maddesi ve "SimilarClub PK Premium Nihai Paket v1" (PK ekranlarının konsept görselleri).

**Durum:** Hepsi yapıldı. Sunucu değişiklikleri ana dala birleşince kendiliğinden kurulur ve eski APK'lara da yarar (madde 1). Uygulama değişiklikleri yeni APK ile gelir.

## Maddeler

| # | Madde | Ne yapıldı |
|---|---|---|
| 1 | Fotoğraf ve çerçeve değişince mikrofonda ve balkonda değişmiyor (DÜZELMEMİŞ) | **Asıl sebep sunucudaydı.** Sunucu, kişinin hangi odada olduğunu yalnız LiveKit'in haber verdiği kayıttan (webhook) buluyordu; canlı sunucuda bu kayıt boş kalınca duyuru hiç gitmiyordu. Artık LiveKit'e açık odaları ve kişinin hangisinde olduğunu da sorar. Duyurudaki fotoğraf adresi de telefonların açabildiği adrese çevrilir (önce depo adresi gidiyordu, bazı ağlarda fotoğraf boş görünüyordu). Ödemeyle VIP seviyesi değişince de duyurulur. **Yeni APK gerekmez.** |
| 2 | Ses dalgaları kişiden kişiye farklı, bazıları fotoğrafın içine giriyor, çerçeveyi kesiyor | Mikrofon efektleri (Neon Halka, Ses Halkası, Dönen Yıldızlar, Müzik Notaları) koltuğun üstünde, yüz boyutundan bağımsız sabit bir katmanda oynuyordu: büyük yüzde fotoğrafın içine, küçük yüzde yan koltuğa ve isme taşıyordu. Artık koltuğun kendi konuşma halkası çiziyor: fotoğrafın dışında, çerçevenin arkasında, koltuğun içinde, herkeste aynı ölçüde. Seçilen efekt sunucuya da gidiyor (önce yalnız telefonda kalıyordu, başkaları farklısını görüyordu). Halka ismin harflerine de inmez. |
| 3 | Geniş çerçeveler ismi ve fotoğrafı kapatıyor, dengelenmeli (DÜZELMEMİŞ) | Koltukta **fotoğraf artık hiç küçülmez**: çerçeveli yüz, çerçevesiz yüzle aynı boyda (önce kanatlı/taçlı çerçevelerde fotoğraf %47–54'e iniyordu, görseldeki dengesizlik buydu). Çerçeve fotoğrafın kenarına oturur; koltuğa sığmıyorsa biraz küçülür (halkası fotoğrafın en çok %20'sini örter), yine taşan taç ucu ya da sallanan taş koltuğun sınırında kesilir: isme, yan koltuğa, üst sıraya binmez. Kodla çizilen çerçevelerin parıltı ve dalgaları da koltuğun içinde kalır.<br>**19 Kasım düzeltmesi (yeni APK):** Görünmez düz çizgide kesilme bitti. Halka artık fotoğrafın en çok %30'unu örter; fotoğraf yalnız çerçevenin deliğinde görünür (ince halkanın dışına taşmaz). Tacın ucu üst sıranın puan satırına kadar çıkabilir, sallanan taşlar koltuğun kendi isminin arkasına inebilir: çerçeve resmi olan koltukta isim yumuşak, koyu bir kapsülün içinde yazılır, taşlar kapsülün arkasında kalır. Yan yana iki koltuğun çerçevesi arasında, alt alta iki sıranın taşıyla tacı arasında en az 2 px kalır, birbirine değmez. İlk sıranın da üstünde diğer sıralar kadar yer var (başlığın, bir panonun ya da Patron koltuğunun altında): aynı çerçeve her sırada aynı boyda. Video karesinin altındaki sıra bir puan satırı kadar aşağıda; kamerası kapalı video karesinde yüz, üstünde bir sıranın yeri kalacak boyda. Bunun bedeli: sahne 7 px uzun (bir pano varken 8 px, video düzenlerinde video karesinin altındaki koltuk sırası için 15 px daha), sohbet o kadar kısalır. Yine sığmayan çerçevede fotoğraf biraz küçülür (en çok %80'e); sonra nefes almadan sığıyorsa kıpırdamadan çizilir; kesim yalnız son çare ve o zaman da çerçeve kıpırdamaz (kesik kenar kaymaz). Uygulamanın dokuz çerçevesi hiçbir sırada, pano altında, video karesinde ya da Takım PK'de kesilmez. Üst sıra alt sıranın üstünde çizilir: üst sıranın ismi ve PK rozeti (artık opak) alttaki tacın ucunu örter, tersi olmaz; Takım PK'de takım başlığının da koyu bir zemini var. Konuşan kişinin halkası her koltukta, çerçeveli olsun olmasın, fotoğrafın ve çerçevenin **arkasında** (güncelleme 5'teki karar: dalgalar çerçeveyi kesmesin). Eski APK'larda eski kesim kalır. |
| 4 | Yeni hesaplarda oda katkı sıralaması görünmüyor, avatarları başkalarına görünmüyor | Kayıt ekranında seçilen fotoğraf **hiç sunucuya yüklenmiyordu**; telefon kendinde gösterdiği için kişi fotoğrafı var sanıyordu, başkaları boş yüz görüyordu. Artık hesap açılınca yüklenir. Böyle açılmış eski hesapların fotoğrafı, kişi kendi profilini açınca bir kez yüklenir. Kupanın yanındaki ilk üç okunamazsa 5 sn sonra yeniden denenir (önce 1 dakika bekliyordu). |
| 5 | PK, oda sıralaması, hediye değerleri gibi rakamlarda K, M, B kısaltması | Ortak kısaltma: 1k, 1.1k, 10k, 10.12k, 100k, 100.1k, 1m, 1.1m, 2.5b. Aşağı yuvarlanır (999.999 → 999.99k), kimse olduğundan fazla görünmez. Kullanıldığı yerler: koltuk altı PK puanı, PK takım skorları, PK sonuç ve sıralamaları, odanın katkı sıralaması, Sıralamalar sayfası, oda istatistiklerindeki hediye değerleri. Para ödenen ya da çekilen yerler (fiyatlar, bakiye, para çekme) tam sayı kalır. |
| 6 | Hediye arttıkça koltuk altındaki rakam büyüyor, kesiliyor; PK açılınca koltuklar arasında boşluk oluşuyor | Koltuk altındaki PK rozeti artık **sabit genişlikte**: puan ne kadar büyürse büyüsün rozet büyümez, rakam kısaltılır (61.99k), asla "61.9…" diye kesilmez. Puan satırının yeri **her odada baştan ayrılır**: PK açılıp kapanınca hiçbir koltuk kıpırdamaz, küçülmez, araya boşluk girmez (diğer uygulamalardaki gibi). Bedeli: PK yokken isimlerin altında 15 px boşluk; 20–30 mikrofonlu odalarda yüzler biraz küçük. |
| 7 | Mikrofon denoise hâlâ çalışmıyor | İncelendi: yapay zekâ temizliği (RNNoise) gönderilen sese gerçekten uygulanıyor, APK'da derli ve doğru bağlı. Duyulmamasının sebepleri ve yapılanlar aşağıda. |

## PK Premium (konsept paketi)

Konsept görsellerdeki dört ekran uygulamaya geçti. Görseller "yalnız konsept" olduğu için ekranın tamamı resim olarak konmadı: taç, kanatlar, defne çerçeveler, VS kalkanı, aslan ve kurt sancakları, kupa ve hedef **şeffaf parçalar olarak kesildi** (`app/assets/pk/`, kesen betik `app/scripts/pk-art-cut.py`); isim, fotoğraf, puan, süre ve sıralama gerçek bileşenlerle üstlerine çizilir.

- **PK Başlat:** taçlı başlık, pembe "Normal PK" ve mavi "Takım PK" kartları, ortada VS, süre seçimi, "PK'yı Başlat" düğmesi. "Odalar arası" sekmesi duruyor.
- **PK aktif:** Normal PK'de oda düzeni değişmez (konseptin notu: ana oda ekranı korunur). Başlıktaki "PK 14:24" rozetine dokununca açılan kartta 2-1-3 kürsü (altın, gümüş, bronz), altında diğer katılımcılar. Takım PK'de sahnedeki alan: aslanlı kırmızı sancak, kırmızı skor, VS, mavi skor, kurtlu mavi sancak, kalan süre.
- **PK Sonuçları:** iki taraf karşı karşıya (Normal PK: ilk iki kişi; Takım PK: Kırmızı ve Mavi, takımın en çok puan alanının fotoğrafıyla; odalar arası: iki oda), ortada taç ve "KAZANAN" / "BERABERE" / "KAZANAN YOK", skorlar, % çubuğu, Hediye Sıralaması (ilk üç taçlı, "Tümünü gör"), altta Taç Kazandıranlar.
- **Taç Kazandıranlar:** konseptin kuralıyla **yalnız iki kişi**: En Çok Atış Yapan (PK boyunca en çok hediye puanı gönderen) ve En Çok Atışı Alan (en çok alan). İki takım birlikte sayılır; iade edilen hediye sayılmaz; eşitlikte daha çok hediye, sonra kimlik sırası (her telefon aynı kişiyi gösterir). Sunucu değişmedi: telefon, sunucunun gönderdiği gönderen → alan puanlarından hesaplar.

**Ürün kararı değişti:** Önceki "Taç Kazandıranlar" yalnız kazanana hediye gönderenleri listeliyordu, beraberlikte boştu. Yeni ekran kazanan kim olursa olsun en çok gönderen ve en çok alan kişiyi gösterir; beraberlikte de gösterir. Yönetim panelindeki eski taç kaydı aynen tutuluyor.

## Odadan çıkış paneli (16 Kasım)

Sahibin gönderdiği tasarıma göre: oda adı parlayan bir hapın içinde, "Küçült" pembe, "Çıkış" mercan renkli parlak cam küreler, açıklamaları ("Oda arkada sürer", "Odadan ayrıl") hap içinde, panel gece karası. **"Odayı herkes için kapat" kaldırıldı** (sahibin isteği). Uygulamada odayı kalıcı kapatmanın tek yeri burasıydı; artık oda, sahibi ve yöneticileri çıktıktan 5 dakika sonra kendiliğinden dinlenmeye geçer ve içlerinden biri dönünce yeniden açılır (Güncelleme 4 kuralı). Odanın üyeleri, yöneticileri ve kuralları böylece kaybolmaz.

## Ana sayfa yeni tasarımı (16 Kasım)

Sahibin gönderdiği tasarıma göre, açık ve koyu temada aynı pembe cam görünüm:

- "İyi günler, Ad" el sallayan bir şeritte, sağda kalpler.
- Dört parlak kutu tek sırada: Hemen Tanış, Canlı Odalar, Aile, Jeton Kazan.
- Listeler (Ana Sayfa, Yakındakiler, Öne çıkanlar…) ile Sıralama ve ülke düğmeleri bir cam çubukta; seçili liste kendi hapında.
- Her kişi pembe cam bir kartta: fotoğraf, isim ve Yankı rozeti, yaş ve benzerlik; yanında Selam ya da Sohbet ve Takip et / Takipte. (İlgi alanları 17 Kasım'da müşterinin notuyla karttan kalktı; bkz. [TASARIM_DENETIMI.md](TASARIM_DENETIMI.md).)
- Alt menü pembe cam bir çubuk; seçili sekmenin simgesi ve adı pembe hapta. (17 Kasım: yüzen çubuk ekranın altına oturtuldu, müşteri "oturmuyor" demişti.)

## Çalışmayan haklar gizlendi (17 Kasım)

Sahibin kararı: VIP, Rütbe, Abonelik, Cömertlik ve Yankı sayfalarında yalnız uygulamanın gerçekten verdiği haklar görünür; yapılmamış olanlar yapılınca geri gelir. Çalışmayan bir özelliği satmak kullanıcıyı yanıltır, Google Play de bunu yanıltıcı sayabilir.

| Sayfa | Görünenler (çalışıyor) | Gizlenenler (henüz yok) |
|---|---|---|
| VIP 1–10 | VIP rozeti, Profil çerçevesi, Seviyeleri gizle, Oda şifresi, VIP mağaza eşyaları (VIP 1), Üyelere özel hediyeler (VIP 2), Sessiz ziyaret (VIP 7) | Özel giriş duyurusu (yalnız kişinin kendi telefonunda görünüyordu), renkli sohbet balonu, puanla alışveriş, profil kartı çerçevesi, hediye serisi efekti, kendi unvanını yaz, dolu odaya girme, mesaj çevirisi, yüklemede indirim, öncelikli destek |
| Rütbe | Rütbe Nişanı, Oda kilitleme, Giriş karşılaması, Profil çerçevesi | Rütbe etiketi, sohbet balonu, ayrılmış koltuk, binek, gizli oda girişi, arkadaşa jeton, sıralamada gizlenme, aile içinde görünmezlik |
| Abonelik | Profiline bakanları gör, Seviyeleri gizle | Arama indirimi, günlük ücretsiz eşleşme, altın isim, VIP madalyası, ek giriş ödülü, Hoş Geldin Kutusu |
| Cömertlik | Seviye rozeti | Öne çıkma, seviye hediyesi, giriş efekti, madalya, odada seviye duyurusu, profil çerçevesi, platform duyurusu |
| Yankı | Yankı rozeti, Ana Sayfa'da öne çıkma, Anlar'da paylaşım (Lv.5) | Kazanç bonusu %1–5, sohbet balonu, madalya, giriş efekti, mikrofon halkası, profil çerçevesi, özel araç |

- "Gizli oda girişi" sunucu odalarında kimseyi gizlemiyordu ama odada "kimse görmez" yazıyordu; artık sunucu odalarında açılmıyor.
- Yankı seviye atlama bildirimi artık kazanç bonusundan söz etmiyor.
- **Sahibin dikkatine:** Abonelikte artık iki ayrıcalık görünüyor (fiyat 145–599 TL). Fiyatı ya da haklarını gözden geçirmek gerekebilir.
- Sonraki adım (karar bekliyor): sunucuda "Seviye ve VIP ayarları" ve finans panelinde ekran; haklar sırayla sunucuda yapılınca sayfalara geri döner.

## Mikrofon denoise

Kod satır satır izlendi (LiveKit kancası, 48 kHz / 10 ms kareler, ölçek, APK derlemesi): temizlik **gönderilen sesin** yolunda ve çalışıyor. "Çalışmıyor" görünmesinin sebepleri:

1. **Anahtar yalnız karşıya giden sesi temizler.** Açan kişi farkı kendi telefonunda duyamaz; fark, odadaki öbür telefonlarda duyulur. Aynı telefonda açıp kapatıp dinlemek hiçbir şey göstermez.
2. **Telefonun kendi gürültü engelleyicisi her zaman açık;** yapay zekâ bunun üstüne kalan sabit gürültüyü (vantilatör, uğultu) alır. TV, müzik, başka konuşmalar gibi sesleri bu model silmez.
3. **"Çalışıyor" yazısı yanıltıcıydı:** uygulama açıldığından beri bir kez çalıştıysa hep "Çalışıyor" diyordu.
4. **Şarkı modunda** ("Ham mikrofon") her odaya girişte yapay zekâ temizliği yeniden açılıyordu.

Yapılanlar: 3 ve 4 düzeltildi; yazı artık saniyede bir okunur, yalnız ses o an temizleniyorsa "Çalışıyor" der ve farkı karşı tarafın duyacağını söyler.

**Doğru deneme:** İki telefon, ayrı odalarda ya da kulaklıkla. Konuşan telefonun yanında vantilatör çalışsın; konuşan sussun ve anahtarı aç/kapa; **dinleyen** telefonda uğultu yaklaşık 1 saniyede azalmalı.

**Daha güçlü temizlik istenirse (sahibin kararı):** (a) RNNoise'un yeni sürümüne (0.2) geçmek (yeni APK), (b) telefonun engelleyicisi yerine WebRTC'nin kendi engelleyicisini zorlamak (Güncelleme 5'te bunun tersine karar verilmişti; iki telefonla A/B denemesiyle seçilmeli).

## Telefonda denenecekler

- **Görünüm (yeni APK gerekmez, sunucu kurulunca):** İki telefon aynı odada; biri mikrofondayken çerçeve taksın, çıkarsın, fotoğraf değiştirsin: öbür telefonda birkaç saniyede mikrofonda ve Balkon'da değişmeli.
- **Yeni hesap:** Yeni bir hesap aç, kayıtta fotoğraf seç, odaya gir: öbür telefonda fotoğrafı görünmeli; kupanın yanındaki ilk üç gelmeli.
- **PK:** Normal PK aç: koltuklar hiç kıpırdamamalı, rozetler aynı boyda kalmalı; büyük hediyelerde rakam "61.99k" gibi görünmeli. Takım PK'de aslan ve kurt sancakları, skorlar ve süre görünmeli. Bitince PK Sonuçları, sonra Taç Kazandıranlar (iki kişi) açılmalı.
- **Çerçeve:** Kanatlı ve taçlı çerçeveyle mikrofona çık: isim kapanmamalı (koyu kapsülün içinde okunmalı); fotoğraf ince halkanın dışına taşmamalı; tacın ucu ve taşlar düz bir çizgide kesilmemeli, yan yana ya da alt alta iki çerçeve birbirine değmemeli; ilk sırada (müzik ya da anket açıkken de) çerçeve öbür sıralardakiyle aynı boyda olmalı; konuşunca halka çerçevenin arkasında kalmalı. PK'de puan rozeti alttaki tacın ucunu tamamen örtmeli.
- **Ses dalgası:** Mikrofon efekti seçili biri konuşsun: efekt koltuğun etrafında, fotoğrafın dışında ve herkeste aynı görünmeli.

## Bilinen sınırlar

- Taç ve kanatlı dört çerçeve (Gümüş Taç, Altın Taç, Mercan Kanat, Gök Kanat) koltuğa göre çok büyük çizilmiş. Artık hiçbir yerde kesilmezler (19 Kasım), ama koltuğa sığmaları için halkaları fotoğrafın üstüne biner: mikrofon sıralarında bu dört çerçevede görünen fotoğraf yüzün yaklaşık %71–83'ü (en küçüğü Altın Taç), diğer çerçevelerde %73–100. Temiz çözüm bu dört çerçevenin koltuk sürümlerinin çizilmesi (taç ve taşlar daha kısa); çizilirse aynı kural daha büyük fotoğrafla yerleştirir.
- "Müzik Notaları" efekti artık nota değil, halkada dönen ışıklar olarak görünür (efekt koltuğun içinde kalsın diye).
- Eski APK'lar mikrofon efektini eskisi gibi oynatır.
