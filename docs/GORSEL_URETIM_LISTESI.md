# Görsel üretim listesi: uygulamadaki tüm emojilerin yerine

Uygulamada emoji kalmayacak; aşağıdaki her satır sizin üreteceğiniz **bir görsel**. Liste kodun taranmasıyla çıkarıldı (uygulamada 1.398 emoji kullanımı, 330 farklı emoji). Aynı görselin birden çok yerde kullanıldığı durumlarda tek satır ve tek dosya adı var.

**Teslim durumu:** 536 görselin hepsi 512 px PNG olarak teslim alındı (iki ZIP, klasör 01–12). Tablonun "Not" sütunu her satırın durumunu söyler.

- **Bölüm 1–3 (145 görsel): ✅ uygulamaya bağlandı.** Hediyeler `app/assets/gifts/192` ve `/512` (`components/GiftArt.tsx`, Lucky paketleri dahil; yönetimden eklenen yeni Lucky paketi `lucky-yeni-lucky.png` ile görünür; müzikli hediye köşesinde müzik rozeti). Efekt hediyeleri ve animasyonlar `app/assets/anim/192` ve `/512` (`components/fx/anim-art.tsx`, katalogda görsel türü `art`; kategori simgeleri animasyon yönetiminde). Tepkiler `app/assets/reactions` (`components/ReactionArt.tsx`): emoji panelinde, koltuk tepkisinde ve yalnız tepki emojisinden oluşan mesajlarda (oda, birebir ve grup sohbeti) çıkartma olarak görünür; yazıyla karışık emoji metin kalır. Paketler Unicode emojiyi saklamaya devam eder.
- **Bölüm 4 (29 görsel): 19'u kabul edildi, 11'i bağlandı** (iki 3D teslim: `SimilarClub_04_3D_20_DOGRULANMIS_TASLAK.zip` ve `SimilarClub_DUZELTME_04_TAM_05_ILK40_69_PNG_Claude.zip`). Mağaza sekmeleri, giriş efekti simgeleri, Spor Araba ve Özel Jet binekleri, Altın sohbet balonu `app/assets/store` içinde (`components/StoreArt.tsx`, 192 px, içeriğe göre kırpıldı): mağaza sekmelerinde, ürün kartlarında ve odaya girişte geçen binek olarak görünür. Kuyruklu Yıldız ve Özel Jet yakın eşleşme olarak onaylandı. 8 resimli çerçevenin küçük resmi gerekmedi (mağaza çerçevenin kendisini gösteriyor). İkinci teslimdeki 9 yakın eşleşme/prototip (Özel ID sekmesi ve rozeti, Ses Dalgası, Yörünge, Aurora, Ateş, Scooter, Şeker, Galaksi) onaylanmadı; `cerceve-altin-tac.png` iki teslimde de Kraliyet Kanatları ile aynı dosya. Bu 10 görselde emoji kaldı.
- **Bölüm 5, ilk 40 (`SimilarClub_DUZELTME_04_TAM_05_ILK40_69_PNG_Claude.zip`): 35'i bağlandı**, `app/assets/room` içinde (`components/RoomArt.tsx`, 192 px): oda tipi ve tema seçicileri, seviye rozetleri, oda menüsü, oda kartı, patron koltuğu ve oda pencerelerinin başlıkları. Ailem, Konuşmacı kuyruğu, Oda botu ve Gizli giriş onaylanmadı; Oda kamerası teslim edildi ama düğme açık/kapalı durumunu gösterdiği için bağlanmadı. 19 kaynak görselde kenar düz kesik (sayfadan kesilirken), "Not" sütununda yazılı. 41–55 (zar yüzleri, PK simgeleri) bu teslimde yok.
- **Bölüm 5'in 41–55'i ve 6–12: taslak, bağlanmadı.** Teslim notuna göre bunlar bir ikon fontunun (Font Awesome 4, SIL OFL 1.1) siluetlerinden otomatik üretilmiş düz vektör taslaklar; istenen 3D cam stilinde değil. 211 dosya başka dosyalarla birebir aynı görsel (ör. 27 farklı öğe aynı yıldız, 19 öğe yıldız+rozet, 11 kabile öğesi aynı grup simgesi, 10 ödül/finans öğesi aynı banknot; Erkek ve Kadın simgesi de aynı yıldız). Ayrıca: zar yüzü 6'da 8 nokta var; slot kirazı ve üzümü, bilardo ve dört taş düz daire; giriş efekti Ejderha ve Ejder kartı alev simgesi; Kıbrıs bayrağı boş bayrak. Bunlarla emojiyi değiştirmek birçok yerde anlamı bozacağı için emoji (ve mevcut 3D ikonlar) yerinde kaldı. Yeniden üretilmesi gerekenler "Not" sütununda `⚠️ yeniden üretilmeli` ile işaretli.
- Bölüm 1–3'te zayıf kalanlar: `animasyon-ejderha.png` ve `animasyon-kategori-fantastik.png` düz siluet; `tepki-temel-kahkaha` = `tepki-eglence-yerlere-yattim` ve `tepki-vip-elmas` = `tepki-vip-kristal` aynı görsel. Bağlandılar; yenileri gelince aynı adla değiştirmek yeterli.

**Toplam 536 görsel.** Öncelik: P1 134 (çok görünen, para kazandıran) · P2 183 · P3 158 · P4 61 (küçük arayüz simgeleri).

| Bölüm | Adet |
|---|---|
| 1. Hediyeler | 60 |
| 2. Efekt hediyeleri ve animasyonlar | 30 |
| 3. Tepkiler ve emoji paketleri (çıkartma) | 55 |
| 4. Mağaza ürünleri | 29 |
| 5. Oda | 55 |
| 6. Oyunlar | 28 |
| 7. VIP, SVIP, Asil, seviyeler | 101 |
| 8. Aile, kabile, ilişki | 30 |
| 9. Görevler, çark, davet ödülleri | 17 |
| 10. Profil, keşfet, sosyal | 63 |
| 11. Para ve finans | 11 |
| 12. Arayüz durum ve işlem simgeleri | 57 |

## ChatGPT ile üretim

1. Mevcut 3D ikon setinizi (taç, hediye, jeton…) **örnek görsel olarak ekleyin**.
2. Aşağıdaki stil metnini bir kez gönderin, sonra tabloları 10–15 satırlık parçalar hâlinde verin.
3. Her görseli **"Dosya adı" sütunundaki adla** kaydedin; uygulamaya bağlarken bu adlar kullanılacak.

```
Stil (her görsel için aynı, eklediğiniz 3D ikon setiyle uyumlu):
- 3D, parlak cam/jöle yüzeyli, yumuşak stüdyo ışığı, hafif iç parlama; altın (#F6BD60) metal detaylar.
- Ana renkler: turkuaz (#13D9DF), mercan (#FF6576), altın (#F6BD60). Mor ve mor-pembe gradyan kullanmayın.
- Tek nesne, ortada, kenarlarda boşluk; şeffaf arka plan (PNG); koyu lacivert (#080F1E) zeminde okunaklı.
- Yazı, harf, rakam, logo, marka, gerçek kişi yüzü yok (Özel ID ve zar gibi rakamın anlamın parçası olduğu yerler hariç).
- 1024 × 1024 px üretin; uygulamaya 192 px (simgeler) ve 512 px (hediyeler) olarak küçültülerek konur.
Aşağıdaki her satır için ayrı bir görsel üret. "Ne çizilecek" sütununu izle, dosyayı "Dosya adı" ile kaydet.
```

**Üretmeyin / ayrı karar:**
- Zaten üretilmiş 3D simgeler (`assets/icons`): jeton, elmas, hediye, taç, kalp, sohbet, zarf, şimşek, mikrofon, çark, kupa, kılıçlar, görevler, çadır, çanta, alışveriş çantası, grup, kişi ekle. "Not" sütununda eşleşenler yazıyor; isterseniz yenisiyle değiştirin.
- 8 avatar çerçevesinin büyük görseli var (`assets/frames`); listede yalnız mağaza küçük resimleri.
- **Örnek (demo) içerik:** örnek kullanıcı biyografileri, gönderiler, örnek sohbet mesajları ve oda adlarındaki emojiler (ör. "Gece Sohbeti 🌙") görsel değil, metindir; gerçek veriyle değiştirilirken silinecek.
- **Kullanıcıların telefon klavyesinden yazdığı emojiler** (sohbet, biyografi) uygulamanın elinde değil. Engellenip engellenmeyeceği ayrı bir ürün kararı.
- Hareketli olanlar (büyük hediyeler, giriş efektleri, efekt hediyeleri): ChatGPT kapak/simge görselini verir; hareketli sürüm (Lottie veya şeffaf video) ayrı iş.

**Zaten var, yeniden üretmeye gerek yok** (`assets/icons`, 3D cam set). Bu emojiler kodda bu dosyalarla değiştirilecek:

| Dosya | Emoji | Nerede |
|---|---|---|
| `coin.png` | 🪙 | jeton bakiyesi, fiyatlar, çark |
| `diamond.png` | 💎 | elmas, yayıncı kazancı |
| `gift.png` | 🎁 | hediye düğmesi, hediye mesajları |
| `crown.png` | 👑 | taç, kazanan, patron koltuğu, VIP |
| `heart.png` | ❤️ | beğeni, kalp |
| `chat.png` | 💬 | sohbet, mesaj |
| `envelope.png` | ✉️ 💌 | davetler, mektup |
| `bolt.png` | ⚡ | Hemen Tanış |
| `mic.png` | 🎤 🎙️ | mikrofon, Normal PK, yayıncı |
| `wheel.png` | 🎡 🎰 | şans çarkı, oyunlar |
| `trophy.png` | 🏆 | sıralama, kupa |
| `swords.png` | ⚔️ | PK, kabile güç puanı |
| `tasks.png` | 📋 | görevler |
| `tent.png` | ⛺ | kabile |
| `briefcase.png` | 💼 | ajans / iş |
| `bag.png` | 🛍️ | mağaza |
| `group.png` | 👥 | odadaki kullanıcılar, üyeler |
| `user-add.png` | — | mikrofon daveti, kişi ekle |

## 1. Hediyeler (60)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `hediye-gul.png` | Gül | 🌹 | tek, uzun saplı kırmızı gül | P1 | ✅ Teslim edildi · Raf: Popüler |
| 2 | `hediye-kalp.png` | Kalp | 💖 | parlayan mercan kalp, etrafında küçük ışıltılar | P1 | ✅ Teslim edildi · Raf: Popüler |
| 3 | `hediye-kahve.png` | Kahve | ☕ | buharı tüten fincan kahve | P1 | ✅ Teslim edildi · Raf: Popüler |
| 4 | `hediye-pasta.png` | Pasta | 🎂 | mumlu, katlı doğum günü pastası | P1 | ✅ Teslim edildi · Raf: Popüler |
| 5 | `hediye-tac.png` | Taç | 👑 | mücevherli altın taç | P1 | ✅ Teslim edildi · Raf: Popüler |
| 6 | `hediye-roket.png` | Roket | 🚀 | alev püskürten turkuaz-altın roket | P1 | ✅ Teslim edildi · Raf: Popüler |
| 7 | `hediye-elmas.png` | Elmas | 💎 | büyük, ışık kıran kesme elmas | P1 | ✅ Teslim edildi · Raf: Popüler |
| 8 | `hediye-sato.png` | Şato | 🏰 | altın kuleli masal şatosu | P1 | ✅ Teslim edildi · Raf: Popüler |
| 9 | `hediye-oyun-zamani.png` | Oyun Zamanı | 🎮 | parlak oyun kumandası | P1 | ✅ Teslim edildi · Raf: Popüler |
| 10 | `hediye-dunya-turu.png` | Dünya Turu | 🌍 | etrafında uçak rotası çizgisi olan dünya küresi | P1 | ✅ Teslim edildi · Raf: Popüler |
| 11 | `hediye-seni-seviyorum.png` | Seni Seviyorum | 🥰 | kalp tutan sevimli karakter (insan yüzü yok) | P1 | ✅ Teslim edildi · Raf: Popüler |
| 12 | `hediye-panda-sarilmasi.png` | Panda Sarılması | 🐼 | kalbe sarılmış panda | P1 | ✅ Teslim edildi · Raf: Popüler |
| 13 | `hediye-tatil-keyfi.png` | Tatil Keyfi | 🏖️ | şemsiye ve palmiyeli küçük plaj adası | P1 | ✅ Teslim edildi · Raf: Popüler |
| 14 | `hediye-ucan-opucuk.png` | Uçan Öpücük | 😘 | kalp şeklinde uçan öpücük, dudak izi | P1 | ✅ Teslim edildi · Raf: Popüler |
| 15 | `hediye-gece-krali.png` | Gece Kralı | 🤴 | taç ve pelerin, gece mavisi, yıldızlar (gerçek kişi yok) | P1 | ✅ Teslim edildi · Raf: Popüler |
| 16 | `hediye-birlikte-bisiklet.png` | Birlikte Bisiklet | 🚲 | iki kişilik tandem bisiklet, kalp balonlu | P1 | ✅ Teslim edildi · Raf: Popüler |
| 17 | `hediye-parti-zamani.png` | Parti Zamanı | 🎉 | konfeti patlatan parti kornası | P1 | ✅ Teslim edildi · Raf: Popüler |
| 18 | `hediye-ani-fotografi.png` | Anı Fotoğrafı | 📸 | polaroid fotoğraf makinesi ve çıkan fotoğraf | P1 | ✅ Teslim edildi · Raf: Popüler |
| 19 | `hediye-altin-can.png` | Altın Çan | 🔔 | kurdeleli altın çan | P1 | ✅ Teslim edildi · Raf: Popüler |
| 20 | `hediye-altin-kugu.png` | Altın Kuğu | 🦢 | altın kuğu, zarif boyun | P1 | ✅ Teslim edildi · Raf: Popüler |
| 21 | `hediye-kar-topu.png` | Kar Topu | ❄️ | kar topu, buz parçacıkları | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 22 | `hediye-sulu-balon.png` | Sulu Balon | 🎈 | su dolu balon, damlalar | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 23 | `hediye-domates-at.png` | Domates At | 🍅 | olgun domates | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 24 | `hediye-kagit-ucak.png` | Kâğıt Uçak | ✈️ | katlanmış kâğıt uçak | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 25 | `hediye-su-kovasi.png` | Su Kovası | 🪣 | ağzına kadar su dolu kova | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 26 | `hediye-pasta-at.png` | Pasta At | 🥧 | kremalı tabak pasta | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 27 | `hediye-yumurta-at.png` | Yumurta At | 🥚 | yumurta | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 28 | `hediye-terlik-at.png` | Terlik At | 🩴 | terlik | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 29 | `hediye-konfeti-topu.png` | Konfeti Topu | 🎊 | patlayan konfeti topu | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 30 | `hediye-ask-oku.png` | Aşk Oku | 💘 | oklu kalp | P1 | ✅ Teslim edildi · Raf: Eğlenceli (atış) |
| 31 | `hediye-can-dostum.png` | Can Dostum | 💞 | iç içe dönen iki kalp | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 32 | `hediye-dilek-kavanozu.png` | Dilek Kavanozu | 🫙 | parlayan dilek kâğıtlarıyla dolu cam kavanoz | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 33 | `hediye-masal-kalesi.png` | Masal Kalesi | 🏯 | bulutların üstünde mercan-altın masal kalesi | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 34 | `hediye-ask-mektubu.png` | Aşk Mektubu | 💌 | kalp mühürlü zarf | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 35 | `hediye-sevgi-tatlisi.png` | Sevgi Tatlısı | 🍰 | kalp süslü dilim pasta | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 36 | `hediye-yildiz-faytonu.png` | Yıldız Faytonu | 🐎 | yıldız tozu saçan atlı fayton | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 37 | `hediye-evlilik-teklifi.png` | Evlilik Teklifi | 💍 | açık kutuda pırlanta yüzük | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 38 | `hediye-dugun-gunu.png` | Düğün Günü | 👰 | gelin buketi ve düğün pastası (kişi yok) | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 39 | `hediye-sonsuz-opucuk.png` | Sonsuz Öpücük | 💋 | parlak dudak izi | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 40 | `hediye-kristal-kolye.png` | Kristal Kolye | 📿 | kristal taşlı kolye | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 41 | `hediye-lunapark-randevusu.png` | Lunapark Randevusu | 🎡 | ışıklı dönme dolap | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 42 | `hediye-ask-atesi.png` | Aşk Ateşi | ❤️‍🔥 | alevler içinde kalp | P1 | ✅ Teslim edildi · Raf: İkili (çift) |
| 43 | `hediye-zumrut-saat.png` | Zümrüt Saat | ⌚ | zümrüt taşlı lüks kol saati | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 44 | `hediye-gizemli-gul.png` | Gizemli Gül | 🥀 | koyu, gizemli parlayan gül | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 45 | `hediye-sihirli-sapka.png` | Sihirli Şapka | 🎩 | yıldızlar çıkan silindir şapka | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 46 | `hediye-kristal-ayakkabi.png` | Kristal Ayakkabı | 👠 | kristal topuklu ayakkabı | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 47 | `hediye-altin-kilic.png` | Altın Kılıç | 🗡️ | süslü altın kılıç | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 48 | `hediye-kartal.png` | Kartal | 🦅 | kanatlarını açmış altın-turkuaz kartal | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 49 | `hediye-uzay-yolculugu.png` | Uzay Yolculuğu | 👨‍🚀 | astronot kaskı ve roket (yüz görünmez) | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 50 | `hediye-gokyuzu-turu.png` | Gökyüzü Turu | 🚁 | parlak helikopter | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 51 | `hediye-altin-kanatlar.png` | Altın Kanatlar | 🪽 | bir çift altın kanat | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 52 | `hediye-luks-yat.png` | Lüks Yat | 🛥️ | lüks yat | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 53 | `hediye-altin-tavus.png` | Altın Tavus | 🦚 | kuyruğu açık altın tavus kuşu | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 54 | `hediye-atlikarinca-gecesi.png` | Atlıkarınca Gecesi | 🎠 | ışıklı atlıkarınca | P1 | ✅ Teslim edildi · Raf: Özel (SVIP) |
| 55 | `lucky-sans-yoncasi.png` | Şans Yoncası | 🍀 | dört yapraklı yonca | P1 | ✅ Teslim edildi · Lucky hediye |
| 56 | `lucky-ugur-bocegi.png` | Uğur Böceği | 🐞 | uğur böceği | P1 | ✅ Teslim edildi · Lucky hediye |
| 57 | `lucky-altin-nal.png` | Altın Nal | 🧲 | altın at nalı (şu an mıknatıs emojisi duruyor) | P1 | ✅ Teslim edildi · Lucky hediye |
| 58 | `lucky-kayan-yildiz.png` | Kayan Yıldız | 🌠 | kuyruklu kayan yıldız | P1 | ✅ Teslim edildi · Lucky hediye |
| 59 | `lucky-yeni-lucky.png` | Yeni Lucky | 🎁 | Lucky hediyeleri için varsayılan simge: üstünde yonca olan hediye kutusu | P1 | ✅ Teslim edildi · Lucky hediye |
| 60 | `hediye-rozet-muzikli-hediye-rozeti.png` | Müzikli hediye rozeti | ♪ | hediye kutusunun köşesindeki küçük "müzikli" rozeti (nota) | P2 | ✅ Teslim edildi |

## 2. Efekt hediyeleri ve animasyonlar (30)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `animasyon-kategori-mikrofon-ve-ses.png` | Mikrofon ve ses | 🎙️ | kategori simgesi: Mikrofon ve ses | P2 | ✅ Teslim edildi · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/mic.png |
| 2 | `animasyon-kategori-romantik.png` | Romantik | 💞 | kategori simgesi: Romantik | P2 | ✅ Teslim edildi |
| 3 | `animasyon-kategori-araclar.png` | Araçlar | 🏎️ | kategori simgesi: Araçlar | P2 | ✅ Teslim edildi |
| 4 | `animasyon-kategori-fantastik.png` | Fantastik | 🐉 | kategori simgesi: Fantastik | P2 | ✅ Teslim edildi (⚠️ düz yılan/ejderha silueti; diğer animasyonlardan zayıf) |
| 5 | `animasyon-kategori-ihtisam.png` | İhtişam | 👑 | kategori simgesi: İhtişam | P2 | ✅ Teslim edildi · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/crown.png |
| 6 | `animasyon-kategori-uzay-ve-gosteri.png` | Uzay ve gösteri | 🚀 | kategori simgesi: Uzay ve gösteri | P2 | ✅ Teslim edildi |
| 7 | `animasyon-kategori-zenginlik.png` | Zenginlik | 💰 | kategori simgesi: Zenginlik | P2 | ✅ Teslim edildi |
| 8 | `animasyon-kategori-sevimli.png` | Sevimli | 🧸 | kategori simgesi: Sevimli | P2 | ✅ Teslim edildi |
| 9 | `animasyon-kategori-ozel-gun.png` | Özel gün | 🎄 | kategori simgesi: Özel gün | P2 | ✅ Teslim edildi |
| 10 | `animasyon-neon-halka.png` | Neon Halka | 💠 | avatar etrafında neon turkuaz halka | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 11 | `animasyon-ses-dalgasi.png` | Ses Dalgası | 🔊 | ses dalgası halkaları | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 12 | `animasyon-donen-yildizlar.png` | Dönen Yıldızlar | ⭐ | dönen küçük yıldızlar | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 13 | `animasyon-muzik-notalari.png` | Müzik Notaları | 🎵 | uçuşan müzik notaları | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 14 | `animasyon-ucan-kalpler.png` | Uçan Kalpler | 💖 | yukarı uçan kalpler | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 15 | `animasyon-alkis.png` | Alkış | 👏 | alkışlayan eller | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 16 | `animasyon-kahkaha.png` | Kahkaha | 😂 | kahkaha atan sevimli karakter | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 17 | `animasyon-kelebekler.png` | Kelebekler | 🦋 | turkuaz-altın kelebekler | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 18 | `animasyon-gul-buketi.png` | Gül Buketi | 💐 | gül buketi | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 19 | `animasyon-dans-eden-panda.png` | Dans Eden Panda | 🐼 | dans eden panda | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 20 | `animasyon-kalp-yagmuru.png` | Kalp Yağmuru | 💗 | yağan kalpler | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 21 | `animasyon-spor-araba.png` | Spor Araba | 🏎️ | spor araba | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 22 | `animasyon-ozel-jet.png` | Özel Jet | 🛩️ | özel jet | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 23 | `animasyon-ejderha.png` | Ejderha | 🐉 | turkuaz-altın ejderha | P2 | ✅ Teslim edildi (⚠️ düz yılan/ejderha silueti; diğer animasyonlardan zayıf) · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 24 | `animasyon-roket-firlatma.png` | Roket Fırlatma | 🚀 | fırlayan roket ve duman | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 25 | `animasyon-havai-fisek.png` | Havai Fişek | 🎆 | havai fişek patlaması | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 26 | `animasyon-yilbasi-kutlamasi.png` | Yılbaşı Kutlaması | 🎄 | süslü yılbaşı ağacı | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 27 | `animasyon-anka-kusu.png` | Anka Kuşu | 🐦‍🔥 | alevden anka kuşu | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 28 | `animasyon-kristal-kale.png` | Kristal Kale | 🏰 | kristal kale | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 29 | `animasyon-pelus-ayi.png` | Peluş Ayı | 🧸 | peluş ayı | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
| 30 | `animasyon-galaksi-tuneli.png` | Galaksi Tüneli | 🌌 | galaksi tüneli | P2 | ✅ Teslim edildi · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |

## 3. Tepkiler ve emoji paketleri (çıkartma) (55)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `tepki-temel-gulumseme.png` | Gülümseme | 😀 | "Gülümseme" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 2 | `tepki-temel-kahkaha.png` | Kahkaha | 😂 | "Kahkaha" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi (aynı görsel 2 dosyada) · Paket: Temel |
| 3 | `tepki-temel-asik.png` | Aşık | 😍 | "Aşık" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 4 | `tepki-temel-duygulandim.png` | Duygulandım | 🥹 | "Duygulandım" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 5 | `tepki-temel-mutlu.png` | Mutlu | 😊 | "Mutlu" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 6 | `tepki-temel-uzgun.png` | Üzgün | 😢 | "Üzgün" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 7 | `tepki-temel-kizgin.png` | Kızgın | 😡 | "Kızgın" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 8 | `tepki-temel-begendim.png` | Beğendim | 👍 | "Beğendim" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 9 | `tepki-temel-tesekkurler.png` | Teşekkürler | 🙏 | "Teşekkürler" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 10 | `tepki-temel-selam.png` | Selam | 👋 | "Selam" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 11 | `tepki-temel-dusunuyorum.png` | Düşünüyorum | 🤔 | "Düşünüyorum" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 12 | `tepki-temel-uykulu.png` | Uykulu | 😴 | "Uykulu" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Temel |
| 13 | `tepki-eglence-yerlere-yattim.png` | Yerlere Yattım | 🤣 | "Yerlere Yattım" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi (aynı görsel 2 dosyada) · Paket: Eğlence |
| 14 | `tepki-eglence-cilgin.png` | Çılgın | 🤪 | "Çılgın" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Eğlence |
| 15 | `tepki-eglence-havali.png` | Havalı | 😎 | "Havalı" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Eğlence |
| 16 | `tepki-eglence-parti.png` | Parti | 🥳 | "Parti" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Eğlence |
| 17 | `tepki-eglence-palyaco.png` | Palyaço | 🤡 | "Palyaço" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Eğlence |
| 18 | `tepki-eglence-hayalet.png` | Hayalet | 👻 | "Hayalet" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Eğlence |
| 19 | `tepki-eglence-ters-gulus.png` | Ters Gülüş | 🙃 | "Ters Gülüş" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Eğlence |
| 20 | `tepki-eglence-beynim-yandi.png` | Beynim Yandı | 🤯 | "Beynim Yandı" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Eğlence |
| 21 | `tepki-ask-kalp.png` | Kalp | ❤️ | "Kalp" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Aşk |
| 22 | `tepki-ask-iki-kalp.png` | İki Kalp | 💕 | "İki Kalp" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Aşk |
| 23 | `tepki-ask-opucuk.png` | Öpücük | 💋 | "Öpücük" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Aşk |
| 24 | `tepki-ask-kalp-eller.png` | Kalp Eller | 🫶 | "Kalp Eller" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Aşk |
| 25 | `tepki-ask-oklu-kalp.png` | Oklu Kalp | 💘 | "Oklu Kalp" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Aşk |
| 26 | `tepki-ask-opucuk-at.png` | Öpücük At | 😘 | "Öpücük At" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Aşk |
| 27 | `tepki-ask-gul.png` | Gül | 🌹 | "Gül" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Aşk |
| 28 | `tepki-ask-donen-kalpler.png` | Dönen Kalpler | 💞 | "Dönen Kalpler" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Aşk |
| 29 | `tepki-hayvanlar-kopek.png` | Köpek | 🐶 | "Köpek" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Hayvanlar |
| 30 | `tepki-hayvanlar-kedi.png` | Kedi | 🐱 | "Kedi" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Hayvanlar |
| 31 | `tepki-hayvanlar-tilki.png` | Tilki | 🦊 | "Tilki" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Hayvanlar |
| 32 | `tepki-hayvanlar-panda.png` | Panda | 🐼 | "Panda" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Hayvanlar |
| 33 | `tepki-hayvanlar-kurbaga.png` | Kurbağa | 🐸 | "Kurbağa" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Hayvanlar |
| 34 | `tepki-hayvanlar-tek-boynuzlu-at.png` | Tek Boynuzlu At | 🦄 | "Tek Boynuzlu At" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Hayvanlar |
| 35 | `tepki-hayvanlar-penguen.png` | Penguen | 🐧 | "Penguen" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Hayvanlar |
| 36 | `tepki-hayvanlar-ari.png` | Arı | 🐝 | "Arı" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Hayvanlar |
| 37 | `tepki-vip-tac.png` | Taç | 👑 | "Taç" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 38 | `tepki-vip-elmas.png` | Elmas | 💎 | "Elmas" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi (aynı görsel 2 dosyada) · Paket: VIP |
| 39 | `tepki-vip-ates.png` | Ateş | 🔥 | "Ateş" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 40 | `tepki-vip-isilti.png` | Işıltı | ✨ | "Işıltı" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 41 | `tepki-vip-kupa.png` | Kupa | 🏆 | "Kupa" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 42 | `tepki-vip-aslan.png` | Aslan | 🦁 | "Aslan" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 43 | `tepki-vip-zambak-armasi.png` | Zambak Arması | ⚜️ | "Zambak Arması" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 44 | `tepki-vip-kristal.png` | Kristal | 💠 | "Kristal" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi (aynı görsel 2 dosyada) · Paket: VIP |
| 45 | `tepki-animasyonlu-havai-fisek.png` | Havai Fişek | 🎆 | "Havai Fişek" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Animasyonlu |
| 46 | `tepki-animasyonlu-maytap.png` | Maytap | 🎇 | "Maytap" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Animasyonlu |
| 47 | `tepki-animasyonlu-gokkusagi.png` | Gökkuşağı | 🌈 | "Gökkuşağı" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Animasyonlu |
| 48 | `tepki-animasyonlu-patlama.png` | Patlama | 💥 | "Patlama" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Animasyonlu |
| 49 | `tepki-animasyonlu-konfeti.png` | Konfeti | 🎉 | "Konfeti" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Animasyonlu |
| 50 | `tepki-animasyonlu-disko-topu.png` | Disko Topu | 🪩 | "Disko Topu" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: Animasyonlu |
| 51 | `tepki-oda-alkis.png` | Alkış | 👏 | "Alkış" tepkisi (koltukta oynar) | P1 | ✅ Teslim edildi · Odada koltuk tepkisi |
| 52 | `tepki-oda-saskin.png` | Şaşkın | 😮 | "Şaşkın" tepkisi (koltukta oynar) | P1 | ✅ Teslim edildi · Odada koltuk tepkisi |
| 53 | `tepki-sekme-hareketli.png` | Hareketli | ✨ | emoji panelinde "hareketli" sekmesi simgesi | P2 | ✅ Teslim edildi |
| 54 | `tepki-sekme-son-kullanilanlar.png` | Son kullanılanlar | 🕘 | emoji panelinde "son kullanılanlar" sekmesi: saat | P2 | ✅ Teslim edildi |
| 55 | `magaza-emoji-paketleri.png` | Emoji paketleri | 😀 | mağazada emoji paketleri sekmesi simgesi | P2 | ✅ Teslim edildi |

## 4. Mağaza ürünleri (29)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `magaza-sekme-cerceve.png` | Çerçeve | 🖼️ | mağaza sekmesi: Çerçeve | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) |
| 2 | `magaza-sekme-giris-efekti.png` | Giriş efekti | ✨ | mağaza sekmesi: Giriş efekti | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) |
| 3 | `magaza-sekme-binek.png` | Binek | 🏎️ | mağaza sekmesi: Binek | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) |
| 4 | `magaza-sekme-sohbet-balonu.png` | Sohbet balonu | 💬 | mağaza sekmesi: Sohbet balonu | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) |
| 5 | `magaza-sekme-ozel-id.png` | Özel ID | 🔢 | mağaza sekmesi: Özel ID | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: altın madalyon, numara göstermiyor |
| 6 | `cerceve-ses-dalgasi.png` | Ses Dalgası | 🔊 | "Ses Dalgası" avatar çerçevesinin mağaza küçük resmi | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: ses dalgası yerine kulaklık motifi · Çerçeve kodla çiziliyor; yalnız mağaza simgesi |
| 7 | `cerceve-yorunge.png` | Yörünge | 🪐 | "Yörünge" avatar çerçevesinin mağaza küçük resmi | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: yörünge simgesi arma gibi duruyor · Çerçeve kodla çiziliyor; yalnız mağaza simgesi |
| 8 | `cerceve-aurora.png` | Aurora | 🌌 | "Aurora" avatar çerçevesinin mağaza küçük resmi | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: Buz Kristali çerçevesinin turkuaz renk değişimi, aurora kimliği yok · Çerçeve kodla çiziliyor; yalnız mağaza simgesi |
| 9 | `cerceve-ates.png` | Ateş | 🔥 | "Ateş" avatar çerçevesinin mağaza küçük resmi | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: altın çerçeve üstüne alev arması · Çerçeve kodla çiziliyor; yalnız mağaza simgesi |
| 10 | `cerceve-altin-tac.png` | Altın Taç | 👑 | "Altın Taç" avatar çerçevesinin mağaza küçük resmi | P2 | ⚠️ yeniden üretilmeli: iki 3D teslimde de dosya `cerceve-kraliyet-kanatlari.png` ile birebir aynı · Çerçeve kodla çiziliyor; yalnız mağaza simgesi |
| 11 | `cerceve-gumus-kristal.png` | Gümüş Kristal | 💠 | "Gümüş Kristal" avatar çerçevesinin mağaza küçük resmi | P2 | ✅ 3D teslim edildi · Mağaza kartı çerçevenin kendi görselini (assets/frames) avatarla gösterdiği için ayrıca bağlanmadı |
| 12 | `cerceve-buz-kristali.png` | Buz Kristali | ❄️ | "Buz Kristali" avatar çerçevesinin mağaza küçük resmi | P2 | ✅ 3D teslim edildi · Mağaza kartı çerçevenin kendi görselini (assets/frames) avatarla gösterdiği için ayrıca bağlanmadı |
| 13 | `cerceve-gul-kalpler.png` | Gül Kalpler | 💗 | "Gül Kalpler" avatar çerçevesinin mağaza küçük resmi | P2 | ✅ 3D teslim edildi · Mağaza kartı çerçevenin kendi görselini (assets/frames) avatarla gösterdiği için ayrıca bağlanmadı |
| 14 | `cerceve-altin-defne.png` | Altın Defne | 🌿 | "Altın Defne" avatar çerçevesinin mağaza küçük resmi | P2 | ✅ 3D teslim edildi · Mağaza kartı çerçevenin kendi görselini (assets/frames) avatarla gösterdiği için ayrıca bağlanmadı |
| 15 | `cerceve-gumus-tac.png` | Gümüş Taç | 👑 | "Gümüş Taç" avatar çerçevesinin mağaza küçük resmi | P2 | ✅ 3D teslim edildi · Mağaza kartı çerçevenin kendi görselini (assets/frames) avatarla gösterdiği için ayrıca bağlanmadı |
| 16 | `cerceve-kraliyet-kanatlari.png` | Kraliyet Kanatları | 🪽 | "Kraliyet Kanatları" avatar çerçevesinin mağaza küçük resmi | P2 | ✅ 3D teslim edildi · Mağaza kartı çerçevenin kendi görselini (assets/frames) avatarla gösterdiği için ayrıca bağlanmadı |
| 17 | `cerceve-melek-kalp-mercan.png` | Melek Kalp · Mercan | 💞 | "Melek Kalp · Mercan" avatar çerçevesinin mağaza küçük resmi | P2 | ✅ 3D teslim edildi · Mağaza kartı çerçevenin kendi görselini (assets/frames) avatarla gösterdiği için ayrıca bağlanmadı |
| 18 | `cerceve-melek-kalp-turkuaz.png` | Melek Kalp · Turkuaz | 💙 | "Melek Kalp · Turkuaz" avatar çerçevesinin mağaza küçük resmi | P2 | ✅ 3D teslim edildi · Mağaza kartı çerçevenin kendi görselini (assets/frames) avatarla gösterdiği için ayrıca bağlanmadı |
| 19 | `giris-efekti-isilti.png` | Işıltı | ✨ | "Işıltı" odaya giriş efektinin simgesi | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) |
| 20 | `giris-efekti-simsek.png` | Şimşek | ⚡ | "Şimşek" odaya giriş efektinin simgesi | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) |
| 21 | `giris-efekti-kuyruklu-yildiz.png` | Kuyruklu Yıldız | ☄️ | "Kuyruklu Yıldız" odaya giriş efektinin simgesi | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) · yakın eşleşme (onaylandı): kuyruklu yıldız değil yörüngeli yıldız |
| 22 | `giris-efekti-ejderha.png` | Ejderha | 🐉 | "Ejderha" odaya giriş efektinin simgesi | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) |
| 23 | `binek-scooter.png` | Scooter | 🛵 | binek: Scooter | P2 | İkinci 3D teslimde prototip geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: 3D değil, düz cam stili çizim |
| 24 | `binek-spor-araba.png` | Spor Araba | 🏎️ | binek: Spor Araba | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) |
| 25 | `binek-ozel-jet.png` | Özel Jet | 🛩️ | binek: Özel Jet | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) · yakın eşleşme (onaylandı): özel jet değil kalpli yolcu uçağı (hediye görseli) |
| 26 | `balon-seker.png` | Şeker | 🍬 | "Şeker" sohbet balonu simgesi | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: şeker yerine kalp şekeri |
| 27 | `balon-galaksi.png` | Galaksi | 🌌 | "Galaksi" sohbet balonu simgesi | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: lacivert sohbet balonu ve yörünge, galaksi teması zayıf |
| 28 | `balon-altin.png` | Altın | 🏆 | "Altın" sohbet balonu simgesi | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/store`, `components/StoreArt.tsx`) |
| 29 | `ozel-id-ozel-id.png` | Özel ID | 🔢 | parlak numara rozeti (özel kullanıcı numarası) | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: rozette numara yok; mağaza sekmesi görseliyle aynı dosya |

## 5. Oda (55)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `oda-turu-serbest-sohbet.png` | Serbest sohbet | 💬 | oda türü: Serbest sohbet | P1 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, oda tipi satırı ve seçicisi · Sohbet teması ile aynı görsel |
| 2 | `oda-turu-sahne.png` | Sahne | 🎭 | oda türü: Sahne | P1 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, oda tipi satırı ve seçicisi · yakın eşleşme (onaylandı): sahne yerine mikrofon |
| 3 | `oda-turu-soru-cevap.png` | Soru-cevap | ❓ | oda türü: Soru-cevap | P1 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, oda tipi satırı ve seçicisi · yakın eşleşme (onaylandı): soru işareti · Sorular ile aynı görsel |
| 4 | `oda-turu-muzik-odasi.png` | Müzik odası | 🎵 | oda türü: Müzik odası | P1 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, oda tipi satırı ve seçicisi · Müzik ve Müzik teması ile aynı görsel · kaynak görselde sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 5 | `oda-turu-etkinlik-odasi.png` | Etkinlik odası | 📅 | oda türü: Etkinlik odası | P1 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, oda tipi satırı ve seçicisi · kaynak görselde üst ve sol kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 6 | `oda-turu-ozel-oda.png` | Özel oda | 🔒 | oda türü: Özel oda | P1 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, oda tipi satırı ve seçicisi |
| 7 | `oda-tema-sohbet.png` | Sohbet | 💬 | oda teması: Sohbet | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, tema satırı ve seçicisi · Serbest sohbet ile aynı görsel |
| 8 | `oda-tema-pk.png` | PK | 🥊 | oda teması: PK | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, tema satırı ve seçicisi |
| 9 | `oda-tema-muzik.png` | Müzik | 🎵 | oda teması: Müzik | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, tema satırı ve seçicisi · Müzik ve Müzik odası ile aynı görsel · kaynak görselde sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 10 | `oda-tema-oyun.png` | Oyun | 🎮 | oda teması: Oyun | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, tema satırı ve seçicisi · kaynak görselde sol ve sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 11 | `oda-tema-parti.png` | Parti | 🎉 | oda teması: Parti | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, tema satırı ve seçicisi · Aktivite ile aynı görsel |
| 12 | `oda-tema-arkadaslik.png` | Arkadaşlık | 💜 | oda teması: Arkadaşlık | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Oda ayarları, tema satırı ve seçicisi · Kalp seviyesi ile aynı görsel · kaynak görselde sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli · Mor kalp marka paletine uymuyor; mercan veya turkuaz önerilir |
| 13 | `oda-seviye-bronz.png` | Bronz (Lv.1–2) | 🥉 | oda seviye rozeti Lv.1–2: Bronz | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartı seviye kutusu, seviye tablosu, ayarlardaki seviye satırı · kaynak görselde alt ve sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 14 | `oda-seviye-gumus.png` | Gümüş (Lv.3–4) | 🥈 | oda seviye rozeti Lv.3–4: Gümüş | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartı seviye kutusu, seviye tablosu, ayarlardaki seviye satırı · kaynak görselde alt ve sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 15 | `oda-seviye-altin.png` | Altın (Lv.5–6) | 🥇 | oda seviye rozeti Lv.5–6: Altın | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartı seviye kutusu, seviye tablosu, ayarlardaki seviye satırı · kaynak görselde alt ve sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 16 | `oda-seviye-madalya.png` | Madalya (Lv.7–8) | 🏅 | oda seviye rozeti Lv.7–8: Madalya | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartı seviye kutusu, seviye tablosu, ayarlardaki seviye satırı · yakın eşleşme (onaylandı): madalya yerine kupa |
| 17 | `oda-seviye-nisan.png` | Nişan (Lv.9) | 🎖️ | oda seviye rozeti Lv.9: Nişan | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartı seviye kutusu, seviye tablosu, ayarlardaki seviye satırı · yakın eşleşme (onaylandı): nişan yerine yıldız |
| 18 | `oda-seviye-kalp.png` | Kalp (Lv.10–11) | 💜 | oda seviye rozeti Lv.10–11: Kalp | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartı seviye kutusu, seviye tablosu, ayarlardaki seviye satırı · Arkadaşlık teması ile aynı görsel · kaynak görselde sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 19 | `oda-seviye-elmas.png` | Elmas (Lv.12–13) | 💎 | oda seviye rozeti Lv.12–13: Elmas | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartı seviye kutusu, seviye tablosu, ayarlardaki seviye satırı |
| 20 | `oda-seviye-tac.png` | Taç (Lv.14) | 👑 | oda seviye rozeti Lv.14: Taç | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartı seviye kutusu, seviye tablosu, ayarlardaki seviye satırı |
| 21 | `oda-seviye-uc-disli.png` | Üç Dişli (Lv.15) | 🔱 | oda seviye rozeti Lv.15: Üç Dişli | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartı seviye kutusu, seviye tablosu, ayarlardaki seviye satırı · yakın eşleşme (onaylandı): üç dişli yerine asa · kaynak görselde üst kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 22 | `oda-sansli-canta-oda-zarfi.png` | Şanslı çanta / oda zarfı | 🧧 | oda simgesi: Şanslı çanta / oda zarfı | P1 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda menüsü, zarf dağıtma penceresi, odaya düşen zarf · yakın eşleşme (onaylandı): kırmızı zarf yerine zarf |
| 23 | `oda-aktivite.png` | Aktivite | 🎉 | oda simgesi: Aktivite | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda menüsü, etkinlikler penceresi · Parti teması ile aynı görsel |
| 24 | `oda-anket.png` | Anket | 📊 | oda simgesi: Anket | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda menüsü, anket penceresi · yakın eşleşme (onaylandı): grafik yerine görev listesi · kaynak görselde üst kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 25 | `oda-topluluk-hedefi.png` | Topluluk hedefi | 🎯 | oda simgesi: Topluluk hedefi | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda menüsü, topluluk hedefi penceresi · kaynak görselde sol kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 26 | `oda-sorular.png` | Sorular | ❓ | oda simgesi: Sorular | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda menüsü, sorular penceresi · yakın eşleşme (onaylandı): soru işareti · Soru-cevap ile aynı görsel |
| 27 | `oda-muzik.png` | Müzik | 🎵 🎶 | oda simgesi: Müzik | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda menüsü, müzik penceresi · Müzik teması ve Müzik odası ile aynı görsel · kaynak görselde sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 28 | `oda-ailem.png` | Ailem | 🏰 | oda simgesi: Ailem | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: kale simgesi |
| 29 | `oda-ajans-odasi.png` | Ajans odası | 🏢 | oda simgesi: Ajans odası | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartındaki Kabile kutusu (ajans odası / ajansın) · kaynak görselde üst kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 30 | `oda-konusmaci-kuyrugu-el-kaldir.png` | Konuşmacı kuyruğu / el kaldır | 🙋 | oda simgesi: Konuşmacı kuyruğu / el kaldır | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: el kaldırma yerine kişi ekle simgesi, "Oda üyesi ol" ile aynı dosya |
| 31 | `oda-oda-botu.png` | Oda botu | 🤖 | oda simgesi: Oda botu | P2 | İkinci 3D teslimde prototip geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli |
| 32 | `oda-patron-koltugu.png` | Patron koltuğu | 👑 | oda simgesi: Patron koltuğu | P1 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): boş patron koltuğu |
| 33 | `oda-zar-duellosu.png` | Zar düellosu | 🎲 | oda simgesi: Zar düellosu | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Zar Düellosu penceresi · kaynak görselde alt kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 34 | `oda-yavas-mod.png` | Yavaş mod | 🐢 | oda simgesi: Yavaş mod | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Moderasyon, yavaş mod satırı · yakın eşleşme (onaylandı): kaplumbağa yerine kum saati · kaynak görselde alt ve sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 35 | `oda-moderasyon.png` | Moderasyon | 🛡️ | oda simgesi: Moderasyon | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Moderasyon penceresi |
| 36 | `oda-ses-ve-efekt-ayarlari.png` | Ses ve efekt ayarları | 🔊 | oda simgesi: Ses ve efekt ayarları | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): Ses ve efekt ayarları penceresi · yakın eşleşme (onaylandı): hoparlör yerine kulaklık · kaynak görselde sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 37 | `oda-oda-sesi-kapali.png` | Oda sesi kapalı | 🔇 | oda simgesi: Oda sesi kapalı | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): odada "oda sesi kapalı" uyarısı · yakın eşleşme (onaylandı): sessiz simgesi |
| 38 | `oda-gizli-giris.png` | Gizli giriş | 👻 | oda simgesi: Gizli giriş | P2 | İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: kilit simgesi, "Özel oda" ile aynı dosya |
| 39 | `oda-oda-kamerasi.png` | Oda kamerası | 📹 | oda simgesi: Oda kamerası | P2 | ✅ 3D teslim edildi · bağlanmadı: kamera düğmesi açık/kapalı durumunu Ionicons simgesiyle gösteriyor · kaynak görselde sol kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 40 | `oda-oda-uyesi-ol.png` | Oda üyesi ol | ➕ | oda simgesi: Oda üyesi ol | P2 | ✅ 3D teslim edildi, bağlandı (`app/assets/room`, `components/RoomArt.tsx`): oda kartında "Oda üyesi ol" düğmesi · kaynak görselde alt ve sağ kenar düz kesik (sayfadan kesilirken), yeniden üretilirse düzelmeli |
| 41 | `zar-zar-yuzu-1.png` | Zar yüzü 1 | ⚀ | 1 noktalı zar yüzü | P3 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |
| 42 | `zar-zar-yuzu-2.png` | Zar yüzü 2 | ⚁ | 2 noktalı zar yüzü | P3 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |
| 43 | `zar-zar-yuzu-3.png` | Zar yüzü 3 | ⚂ | 3 noktalı zar yüzü | P3 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |
| 44 | `zar-zar-yuzu-4.png` | Zar yüzü 4 | ⚃ | 4 noktalı zar yüzü | P3 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |
| 45 | `zar-zar-yuzu-5.png` | Zar yüzü 5 | ⚄ | 5 noktalı zar yüzü | P3 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |
| 46 | `zar-zar-yuzu-6.png` | Zar yüzü 6 | ⚅ | 6 noktalı zar yüzü | P3 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: 6 yerine 8 nokta var |
| 47 | `pk-normal-pk.png` | Normal PK | 🎤 | PK simgesi: Normal PK | P1 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/mic.png |
| 48 | `pk-takim-pk.png` | Takım PK | ⚔️ | PK simgesi: Takım PK | P1 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/swords.png |
| 49 | `pk-kirmizi-takim.png` | Kırmızı takım | 🔴 | PK simgesi: Kırmızı takım | P1 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |
| 50 | `pk-mavi-takim.png` | Mavi takım | 🔵 | PK simgesi: Mavi takım | P1 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |
| 51 | `pk-rastgele-dagit.png` | Rastgele dağıt | 🔀 | PK simgesi: Rastgele dağıt | P1 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |
| 52 | `pk-manuel-dagit.png` | Manuel dağıt | ✋ | PK simgesi: Manuel dağıt | P1 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 53 | `pk-beraberlik.png` | Beraberlik | 🤝 | PK simgesi: Beraberlik | P1 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |
| 54 | `pk-pk-mvp-one-cikan.png` | PK MVP / öne çıkan | ⭐ | PK simgesi: PK MVP / öne çıkan | P1 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 55 | `pk-pk-bitti.png` | PK bitti | 🏁 | PK simgesi: PK bitti | P1 | İkinci 3D teslimde yok (paket 5. bölümün ilk 40 öğesini kapsıyor) · Taslak teslim (parti 04–12) |

## 6. Oyunlar (28)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `oyun-ludo.png` | Ludo | 🎲 | oyun kapak simgesi: Ludo | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 2 | `oyun-cizim-tahmin.png` | Çizim Tahmin | 🎨 | oyun kapak simgesi: Çizim Tahmin | P3 | Taslak teslim (parti 04–12) |
| 3 | `oyun-bilgi-turnuvasi.png` | Bilgi Turnuvası | 🏆 | oyun kapak simgesi: Bilgi Turnuvası | P3 | Taslak teslim (parti 04–12) |
| 4 | `oyun-roket.png` | Roket | 🚀 | oyun kapak simgesi: Roket | P3 | Taslak teslim (parti 04–12) |
| 5 | `oyun-meyve-partisi.png` | Meyve Partisi | 🍓 | oyun kapak simgesi: Meyve Partisi | P3 | Taslak teslim (parti 04–12) |
| 6 | `oyun-hazine-sandigi.png` | Hazine Sandığı | 💰 | oyun kapak simgesi: Hazine Sandığı | P3 | Taslak teslim (parti 04–12) |
| 7 | `oyun-penalti.png` | Penaltı | ⚽ | oyun kapak simgesi: Penaltı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 8 | `oyun-balik-avi.png` | Balık Avı | 🦈 | oyun kapak simgesi: Balık Avı | P3 | Taslak teslim (parti 04–12) |
| 9 | `oyun-kelime-avi.png` | Kelime Avı | 🔤 | oyun kapak simgesi: Kelime Avı | P3 | Taslak teslim (parti 04–12) |
| 10 | `oyun-bilgi-yarismasi.png` | Bilgi Yarışması | 🧠 | oyun kapak simgesi: Bilgi Yarışması | P3 | ✅ 3D teslim edildi (oyun ikonları sayfası), bağlandı (`app/assets/games`, `components/GameArt.tsx`): Oyun Merkezi ve oda menüsü |
| 11 | `oyun-hizli-matematik.png` | Hızlı Matematik | ➗ | oyun kapak simgesi: Hızlı Matematik | P3 | Taslak teslim (parti 04–12) |
| 12 | `oyun-8-top-bilardo.png` | 8 Top Bilardo | 🎱 | oyun kapak simgesi: 8 Top Bilardo | P3 | ✅ 3D teslim edildi (oyun ikonları sayfası), bağlandı (`app/assets/games`, `components/GameArt.tsx`): Oyun Merkezi ve oda menüsü |
| 13 | `oyun-jackaroo.png` | Jackaroo | ♠️ | oyun kapak simgesi: Jackaroo | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 14 | `oyun-xox.png` | XOX | ⭕ | oyun kapak simgesi: XOX | P3 | Taslak teslim (parti 04–12) |
| 15 | `oyun-dort-tas.png` | Dört Taş | 🔴 | oyun kapak simgesi: Dört Taş | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 16 | `oyun-kelime-zinciri.png` | Kelime Zinciri | 🔤 | oyun kapak simgesi: Kelime Zinciri | P3 | ✅ 3D teslim edildi (oyun ikonları sayfası), bağlandı (`app/assets/games`, `components/GameArt.tsx`): Oyun Merkezi ve oda menüsü · yakın eşleşme: ABC harf taşları ve ampul |
| 17 | `oyun-dogru-yanlis.png` | Doğru / Yanlış | ✅ | oyun kapak simgesi: Doğru / Yanlış | P3 | Taslak teslim (parti 04–12) |
| 18 | `oyun-hafiza-eslestirme.png` | Hafıza Eşleştirme | 🧩 | oyun kapak simgesi: Hafıza Eşleştirme | P3 | ✅ 3D teslim edildi (oyun ikonları sayfası), bağlandı (`app/assets/games`, `components/GameArt.tsx`): Oyun Merkezi ve oda menüsü |
| 19 | `oyun-sans-carki.png` | Şans Çarkı | 🎡 | oyun kapak simgesi: Şans Çarkı | P3 | ✅ 3D teslim edildi (oyun ikonları sayfası), bağlandı (`app/assets/games`, `components/GameArt.tsx`): Oyun Merkezi ve oda menüsü |
| 20 | `oyun-zar-casino.png` | Zar (casino) | 🎲 | oyun kapak simgesi: Zar (casino) | P3 | ✅ 3D teslim edildi (oyun ikonları sayfası), bağlandı (`app/assets/games`, `components/GameArt.tsx`): Oyun Merkezi ve oda menüsü |
| 21 | `oyun-lucky-77.png` | Lucky 77 | 🎰 | oyun kapak simgesi: Lucky 77 | P3 | ✅ 3D teslim edildi (oyun ikonları sayfası), bağlandı (`app/assets/games`, `components/GameArt.tsx`): Oyun Merkezi ve oda menüsü |
| 22 | `oyun-dragon-tiger.png` | Dragon Tiger | 🐉 | oyun kapak simgesi: Dragon Tiger | P3 | Taslak teslim (parti 04–12) |
| 23 | `casino-kart-ejder.png` | Ejder | 🐉 | Dragon Tiger masası: Ejder tarafı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: ejderha yerine alev simgesi, aynı görsel 2 dosyada |
| 24 | `casino-kart-kaplan.png` | Kaplan | 🐯 | Dragon Tiger masası: Kaplan tarafı | P3 | Taslak teslim (parti 04–12) |
| 25 | `slot-kiraz.png` | Kiraz | 🍒 | slot makinesi sembolü: Kiraz | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 26 | `slot-limon.png` | Limon | 🍋 | slot makinesi sembolü: Limon | P3 | Taslak teslim (parti 04–12) |
| 27 | `slot-uzum.png` | Üzüm | 🍇 | slot makinesi sembolü: Üzüm | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 28 | `slot-can.png` | Çan | 🔔 | slot makinesi sembolü: Çan | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |

## 7. VIP, SVIP, Asil, seviyeler (101)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `vip-01-uye.png` | VIP 1 · Üye | 🔰 | VIP seviye 1 rozeti: Üye | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 5 dosyada |
| 2 | `vip-02-bronz.png` | VIP 2 · Bronz | 🥉 | VIP seviye 2 rozeti: Bronz | P2 | Taslak teslim (parti 04–12) |
| 3 | `vip-03-gumus.png` | VIP 3 · Gümüş | 🥈 | VIP seviye 3 rozeti: Gümüş | P2 | Taslak teslim (parti 04–12) |
| 4 | `vip-04-altin.png` | VIP 4 · Altın | 🥇 | VIP seviye 4 rozeti: Altın | P2 | Taslak teslim (parti 04–12) |
| 5 | `vip-05-platin.png` | VIP 5 · Platin | 💿 | VIP seviye 5 rozeti: Platin | P2 | Taslak teslim (parti 04–12) |
| 6 | `vip-06-safir.png` | VIP 6 · Safir | 🔷 | VIP seviye 6 rozeti: Safir | P2 | Taslak teslim (parti 04–12) |
| 7 | `vip-07-yakut.png` | VIP 7 · Yakut | ♦️ | VIP seviye 7 rozeti: Yakut | P2 | Taslak teslim (parti 04–12) |
| 8 | `vip-08-zumrut.png` | VIP 8 · Zümrüt | 💚 | VIP seviye 8 rozeti: Zümrüt | P2 | Taslak teslim (parti 04–12) |
| 9 | `vip-09-elmas.png` | VIP 9 · Elmas | 💎 | VIP seviye 9 rozeti: Elmas | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 10 | `vip-10-usta.png` | VIP 10 · Usta | 🎖️ | VIP seviye 10 rozeti: Usta | P2 | Taslak teslim (parti 04–12) |
| 11 | `vip-11-asil.png` | VIP 11 · Asil | ⚜️ | VIP seviye 11 rozeti: Asil | P2 | Taslak teslim (parti 04–12) |
| 12 | `vip-12-lord.png` | VIP 12 · Lord | 🗡️ | VIP seviye 12 rozeti: Lord | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 13 | `vip-13-kont.png` | VIP 13 · Kont | 💠 | VIP seviye 13 rozeti: Kont | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 14 | `vip-14-duk.png` | VIP 14 · Dük | 👑 | VIP seviye 14 rozeti: Dük | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 15 | `vip-15-imparator.png` | VIP 15 · İmparator | 🦁 | VIP seviye 15 rozeti: İmparator | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 16 | `svip-01.png` | SVIP 1 | 💠 | SVIP 1 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 17 | `svip-02.png` | SVIP 2 | 🟢 | SVIP 2 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 18 | `svip-03.png` | SVIP 3 | 🔷 | SVIP 3 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) |
| 19 | `svip-04.png` | SVIP 4 | 🔹 | SVIP 4 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) |
| 20 | `svip-05.png` | SVIP 5 | 🏵️ | SVIP 5 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) |
| 21 | `svip-06.png` | SVIP 6 | 🎖️ | SVIP 6 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) |
| 22 | `svip-07.png` | SVIP 7 | 🔮 | SVIP 7 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) |
| 23 | `svip-08.png` | SVIP 8 | ⚜️ | SVIP 8 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) |
| 24 | `svip-09.png` | SVIP 9 | 👑 | SVIP 9 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 25 | `svip-10.png` | SVIP 10 | 🌈 | SVIP 10 rozeti (1→10 giderek daha gösterişli) | P2 | Taslak teslim (parti 04–12) |
| 26 | `asil-1-sovalye.png` | Asil 1 · Şövalye | 🛡️ | asil unvan arması: Şövalye | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 27 | `asil-2-vikont.png` | Asil 2 · Vikont | 🗡️ | asil unvan arması: Vikont | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 28 | `asil-3-kont.png` | Asil 3 · Kont | ⚔️ | asil unvan arması: Kont | P2 | Taslak teslim (parti 04–12) |
| 29 | `asil-4-markiz.png` | Asil 4 · Markiz | 🏹 | asil unvan arması: Markiz | P2 | Taslak teslim (parti 04–12) |
| 30 | `asil-5-duk.png` | Asil 5 · Dük | 🦁 | asil unvan arması: Dük | P2 | Taslak teslim (parti 04–12) |
| 31 | `ayricalik-puan-takas-magazasi.png` | Puan Takas Mağazası | 🏪 | ayrıcalık simgesi: Puan Takas Mağazası | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 32 | `ayricalik-svip-etiket.png` | SVIP Etiket | 🏷️ | ayrıcalık simgesi: SVIP Etiket | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 6 dosyada |
| 33 | `ayricalik-yukseltme-bildirimleri.png` | Yükseltme bildirimleri | 📣 | ayrıcalık simgesi: Yükseltme bildirimleri | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 34 | `ayricalik-svip-rozeti.png` | SVIP rozeti | 🎖️ | ayrıcalık simgesi: SVIP rozeti | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 6 dosyada |
| 35 | `ayricalik-genel-sohbet-balonu.png` | Genel sohbet balonu | 🎨 | ayrıcalık simgesi: Genel sohbet balonu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 6 dosyada |
| 36 | `ayricalik-profil-cercevesi.png` | Profil çerçevesi | 🖼️ | ayrıcalık simgesi: Profil çerçevesi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 37 | `ayricalik-giris-ekrani-kayan-yazi.png` | Giriş ekranı kayan yazı | ✨ | ayrıcalık simgesi: Giriş ekranı kayan yazı | P3 | Taslak teslim (parti 04–12) |
| 38 | `ayricalik-ozel-urunu-satin-al.png` | Özel ürünü satın al | 🛍️ | ayrıcalık simgesi: Özel ürünü satın al | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 39 | `ayricalik-arac.png` | Araç | 🚗 | ayrıcalık simgesi: Araç | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 40 | `ayricalik-svip-e-ozel-hediye.png` | SVIP'e özel hediye | 🎁 | ayrıcalık simgesi: SVIP'e özel hediye | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 41 | `ayricalik-bilgi-karti-cercevesi.png` | Bilgi kartı çerçevesi | 🪪 | ayrıcalık simgesi: Bilgi kartı çerçevesi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 42 | `ayricalik-servet-puani-bonusu.png` | Servet Puanı Bonusu | 💰 | ayrıcalık simgesi: Servet Puanı Bonusu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 43 | `ayricalik-diy-unvani.png` | DIY unvanı | ✏️ | ayrıcalık simgesi: DIY unvanı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 44 | `ayricalik-oda-profil-arka-plani.png` | Oda Profil Arka Planı | 🏞️ | ayrıcalık simgesi: Oda Profil Arka Planı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 45 | `ayricalik-profil-hediyesi.png` | Profil hediyesi | 💝 | ayrıcalık simgesi: Profil hediyesi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 46 | `ayricalik-ozel-musteri-temsilcisi.png` | Özel müşteri temsilcisi | 🎧 | ayrıcalık simgesi: Özel müşteri temsilcisi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 47 | `ayricalik-kisisel-album-animasyonlu-gorsel.png` | Kişisel albüm animasyonlu görsel | 🎞️ | ayrıcalık simgesi: Kişisel albüm animasyonlu görsel | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 48 | `ayricalik-profil-araci.png` | Profil aracı | 🏎️ | ayrıcalık simgesi: Profil aracı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 49 | `ayricalik-yukleme-indirimi.png` | Yükleme indirimi | 💸 | ayrıcalık simgesi: Yükleme indirimi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 50 | `ayricalik-hediye-combo-skin.png` | Hediye Combo Skin | 🔥 | ayrıcalık simgesi: Hediye Combo Skin | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 51 | `ayricalik-gizli-ziyaret.png` | Gizli ziyaret | 🥷 | ayrıcalık simgesi: Gizli ziyaret | P3 | Taslak teslim (parti 04–12) |
| 52 | `ayricalik-ozel-oda-kapagi.png` | Özel oda kapağı | 🖼️ | ayrıcalık simgesi: Özel oda kapağı | P3 | Taslak teslim (parti 04–12) |
| 53 | `ayricalik-renkli-takma-ad.png` | Renkli takma ad | 🌈 | ayrıcalık simgesi: Renkli takma ad | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 54 | `ayricalik-ai-hediye.png` | AI hediye | 🤖 | ayrıcalık simgesi: AI hediye | P3 | Taslak teslim (parti 04–12) |
| 55 | `ayricalik-dogum-gunu-hediyesi.png` | Doğum günü hediyesi | 🎂 | ayrıcalık simgesi: Doğum günü hediyesi | P3 | Taslak teslim (parti 04–12) |
| 56 | `ayricalik-profil-sayfasi-cercevesi.png` | Profil Sayfası Çerçevesi | 🪞 | ayrıcalık simgesi: Profil Sayfası Çerçevesi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 57 | `ayricalik-profil-sayfasi-arka-plani.png` | Profil Sayfası Arka Planı | 🌌 | ayrıcalık simgesi: Profil Sayfası Arka Planı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 58 | `ayricalik-ozel-id.png` | Özel ID | 🔢 | ayrıcalık simgesi: Özel ID | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 59 | `ayricalik-etkinlik-onceligi.png` | Etkinlik önceliği | ⏫ | ayrıcalık simgesi: Etkinlik önceliği | P3 | Taslak teslim (parti 04–12) |
| 60 | `ayricalik-kisiye-ozel-tasarim-hediye.png` | Kişiye özel tasarım hediye | 💎 | ayrıcalık simgesi: Kişiye özel tasarım hediye | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 61 | `ayricalik-jeton-hediye-et.png` | Jeton Hediye Et | 💗 | ayrıcalık simgesi: Jeton Hediye Et | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 62 | `ayricalik-vip-listesi.png` | VIP Listesi | 👑 | ayrıcalık simgesi: VIP Listesi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 6 dosyada |
| 63 | `ayricalik-araclar.png` | Araçlar | 🚘 | ayrıcalık simgesi: Araçlar | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 64 | `ayricalik-asil-madalyasi.png` | Asil Madalyası | 🏅 | ayrıcalık simgesi: Asil Madalyası | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 6 dosyada |
| 65 | `ayricalik-asil-etiketi.png` | Asil Etiketi | 🔖 | ayrıcalık simgesi: Asil Etiketi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 6 dosyada |
| 66 | `ayricalik-giris-ekrani.png` | Giriş Ekranı | 🌟 | ayrıcalık simgesi: Giriş Ekranı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 67 | `ayricalik-oda-kilitleme.png` | Oda Kilitleme | 🔒 | ayrıcalık simgesi: Oda Kilitleme | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 68 | `ayricalik-asil-koltugu.png` | Asil Koltuğu | 🛋️ | ayrıcalık simgesi: Asil Koltuğu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 6 dosyada |
| 69 | `ayricalik-ozel-arka-plan.png` | Özel arka plan | 🏞️ | ayrıcalık simgesi: Özel arka plan | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 70 | `ayricalik-ozel-hediyeler.png` | Özel Hediyeler | 🎁 | ayrıcalık simgesi: Özel Hediyeler | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 71 | `ayricalik-sohbet-balonu.png` | Sohbet balonu | 💬 | ayrıcalık simgesi: Sohbet balonu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 72 | `ayricalik-profil-kart-cercevesi.png` | Profil kart çerçevesi | 🪪 | ayrıcalık simgesi: Profil kart çerçevesi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 73 | `ayricalik-oda-karti.png` | Oda Kartı | 🗂️ | ayrıcalık simgesi: Oda Kartı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 74 | `ayricalik-oda-kenarligi.png` | Oda Kenarlığı | 🔲 | ayrıcalık simgesi: Oda Kenarlığı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 75 | `ayricalik-ozel-emoji-paketleri.png` | Özel Emoji Paketleri | 😊 | ayrıcalık simgesi: Özel Emoji Paketleri | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 76 | `ayricalik-dinamik-oda-kapagi.png` | Dinamik Oda Kapağı | 🎞️ | ayrıcalık simgesi: Dinamik Oda Kapağı | P3 | Taslak teslim (parti 04–12) |
| 77 | `ayricalik-gizli-ziyaret-asil.png` | Gizli Ziyaret (asil) | 🎭 | ayrıcalık simgesi: Gizli Ziyaret (asil) | P3 | Taslak teslim (parti 04–12) |
| 78 | `ayricalik-tam-dolu-odalar.png` | Tam Dolu Odalar | 🚪 | ayrıcalık simgesi: Tam Dolu Odalar | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 79 | `ayricalik-cevrimici-gizlilik.png` | Çevrimiçi Gizlilik | 🫥 | ayrıcalık simgesi: Çevrimiçi Gizlilik | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 80 | `ayricalik-ulusal-dolasim.png` | Ulusal Dolaşım | 🌍 | ayrıcalık simgesi: Ulusal Dolaşım | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 81 | `ayricalik-gizemli-kisi-kimligi.png` | Gizemli Kişi Kimliği | 🕵️ | ayrıcalık simgesi: Gizemli Kişi Kimliği | P3 | Taslak teslim (parti 04–12) |
| 82 | `ayricalik-gizli-oda-girisi.png` | Gizli Oda Girişi | 👻 | ayrıcalık simgesi: Gizli Oda Girişi | P3 | Taslak teslim (parti 04–12) |
| 83 | `ayricalik-yayin-engelleme.png` | Yayın Engelleme | 🔇 | ayrıcalık simgesi: Yayın Engelleme | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 84 | `ayricalik-klan-gizliligi.png` | Klan Gizliliği | 🎭 | ayrıcalık simgesi: Klan Gizliliği | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 85 | `ayricalik-metin-cevirisi.png` | Metin Çevirisi | 🔤 | ayrıcalık simgesi: Metin Çevirisi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 86 | `ayricalik-seviye-rozeti.png` | Seviye rozeti | 🏅 | ayrıcalık simgesi: Seviye rozeti | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 87 | `ayricalik-one-cikma.png` | Öne çıkma | ⬆️ | ayrıcalık simgesi: Öne çıkma | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 88 | `ayricalik-seviye-hediyesi.png` | Seviye hediyesi | 🎁 | ayrıcalık simgesi: Seviye hediyesi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 89 | `ayricalik-odada-seviye-duyurusu.png` | Odada seviye duyurusu | 📣 | ayrıcalık simgesi: Odada seviye duyurusu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 90 | `ayricalik-platform-duyurusu.png` | Platform duyurusu | 📡 | ayrıcalık simgesi: Platform duyurusu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 91 | `ayricalik-giris-efekti.png` | Giriş efekti | ✨ | ayrıcalık simgesi: Giriş efekti | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 92 | `ayricalik-seviye-madalyasi.png` | Seviye madalyası | 🎖️ | ayrıcalık simgesi: Seviye madalyası | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 93 | `ayricalik-cazibe-rozeti.png` | Cazibe rozeti | 🏅 | ayrıcalık simgesi: Cazibe rozeti | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 94 | `ayricalik-kesfette-one-cikma.png` | Keşfette öne çıkma | 📈 | ayrıcalık simgesi: Keşfette öne çıkma | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 95 | `ayricalik-kazanc-bonusu.png` | Kazanç bonusu | 💎 | ayrıcalık simgesi: Kazanç bonusu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 96 | `ayricalik-cazibe-madalyasi.png` | Cazibe madalyası | 🎖️ | ayrıcalık simgesi: Cazibe madalyası | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 97 | `ayricalik-mikrofon-dalgasi.png` | Mikrofon dalgası | 🎙️ | ayrıcalık simgesi: Mikrofon dalgası | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 98 | `ayricalik-ozel-arac.png` | Özel araç | 🛸 | ayrıcalık simgesi: Özel araç | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 99 | `seviye-servet-seviyesi.png` | Servet seviyesi | 💰 | Servet seviyesi simgesi | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 100 | `seviye-cazibe-seviyesi.png` | Cazibe seviyesi | 🌹 | Cazibe seviyesi simgesi | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 101 | `svip-svip-isareti.png` | SVIP işareti | ✦ | SVIP adının yanındaki küçük parıltı işareti | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |

## 8. Aile, kabile, ilişki (30)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `kabile-rol-lider.png` | Lider | 👑 | kabile rolü: Lider | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/crown.png |
| 2 | `kabile-rol-yardimci.png` | Yardımcı | 🛡️ | kabile rolü: Yardımcı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada |
| 3 | `kabile-kabile-hazinesi.png` | Kabile Hazinesi | 🔮 | parlayan hazine küresi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada |
| 4 | `kabile-guc-puani.png` | Güç Puanı | ⚔ | çapraz kılıçlı güç simgesi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada |
| 5 | `kabile-kabile-kasasi.png` | Kabile Kasası | 🧰 | altın işlemeli büyük sandık (sayfa üstü illüstrasyon) | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada |
| 6 | `kabile-ahsap-sandik.png` | Ahşap Sandık | 🟫 | ahşap ödül sandığı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 7 dosyada |
| 7 | `kabile-yesil-sandik.png` | Yeşil Sandık | 🟩 | yeşil ödül sandığı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 7 dosyada |
| 8 | `kabile-mavi-sandik.png` | Mavi Sandık | 🟦 | mavi ödül sandığı | P3 | Taslak teslim (parti 04–12) |
| 9 | `kabile-kirmizi-sandik.png` | Kırmızı Sandık | 🟥 | kırmızı ödül sandığı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 7 dosyada |
| 10 | `kabile-premium-sandik.png` | Premium Sandık | 🌙 | premium ödül sandığı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 7 dosyada |
| 11 | `kabile-yeni-kabile.png` | Yeni Kabile | 🌱 | filiz: yeni kabile etiketi | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada |
| 12 | `kabile-haftalik-kabile-siralamasi.png` | Haftalık Kabile Sıralaması | 🏆 | kabile sıralama kupası | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/trophy.png |
| 13 | `kabile-kabile-kurallari.png` | Kabile kuralları | 📜 | parşömen | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada |
| 14 | `kabile-veri-merkezi.png` | Veri Merkezi | 📊 | istatistik paneli | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada |
| 15 | `kabile-gorev-sohbet-grubuna-mesaj-at.png` | Sohbet grubuna mesaj at | 💬 | kabile görevi: Sohbet grubuna mesaj at | P3 | Taslak teslim (parti 04–12) · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/chat.png |
| 16 | `kabile-gorev-kabile-odasinda-15-dk-kal.png` | Kabile odasında 15 dk kal | 🎙️ | kabile görevi: Kabile odasında 15 dk kal | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/mic.png |
| 17 | `kabile-gorev-yeni-uyeye-hediye-gonder.png` | Yeni üyeye hediye gönder | 🎁 | kabile görevi: Yeni üyeye hediye gönder | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 7 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/gift.png |
| 18 | `kabile-gorev-check-in-yap.png` | Check-in yap | 📅 | kabile görevi: Check-in yap | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 11 dosyada |
| 19 | `kabile-gorev-kabile-odasinda-hediye-gonder.png` | Kabile odasında hediye gönder | 🎉 | kabile görevi: Kabile odasında hediye gönder | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 7 dosyada |
| 20 | `kabile-gorev-cift-cp-kur.png` | Çift (CP) kur | 💞 | kabile görevi: Çift (CP) kur | P3 | Taslak teslim (parti 04–12) |
| 21 | `kabile-gorev-kabile-sohbetinde-hediye-gonder.png` | Kabile sohbetinde hediye gönder | 💌 | kabile görevi: Kabile sohbetinde hediye gönder | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 7 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/envelope.png |
| 22 | `iliski-cift-cp-en-tatli-cift.png` | Çift (CP) / En tatlı çift | 💞 | ilişki simgesi: Çift (CP) / En tatlı çift | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 23 | `iliski-dost-en-yakin-dostlar.png` | Dost / En yakın dostlar | 🤝 | ilişki simgesi: Dost / En yakın dostlar | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 24 | `iliski-dugun-salonu.png` | Düğün salonu | 💒 | ilişki simgesi: Düğün salonu | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 25 | `iliski-bulusma-odasi.png` | Buluşma odası | 🏠 | ilişki simgesi: Buluşma odası | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada |
| 26 | `iliski-koruma.png` | Koruma | 👑 | ilişki simgesi: Koruma | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/crown.png |
| 27 | `aile-logo-gece-kuslari.png` | Gece Kuşları | 🦉 | aile logosu: Gece Kuşları | P4 | Taslak teslim (parti 04–12) · Örnek (demo) aileler. Aileler kendi logosunu yükleyecekse üretmeyin; seçilecek hazır logo seti olacaksa üretin. |
| 28 | `aile-logo-karaoke-ailesi.png` | Karaoke Ailesi | 🎤 | aile logosu: Karaoke Ailesi | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Örnek (demo) aileler. Aileler kendi logosunu yükleyecekse üretmeyin; seçilecek hazır logo seti olacaksa üretin. |
| 29 | `aile-logo-oyun-kurtlari.png` | Oyun Kurtları | 🐺 | aile logosu: Oyun Kurtları | P4 | Taslak teslim (parti 04–12) · Örnek (demo) aileler. Aileler kendi logosunu yükleyecekse üretmeyin; seçilecek hazır logo seti olacaksa üretin. |
| 30 | `aile-logo-istanbul-sohbet.png` | İstanbul Sohbet | 🌉 | aile logosu: İstanbul Sohbet | P4 | Taslak teslim (parti 04–12) · Örnek (demo) aileler. Aileler kendi logosunu yükleyecekse üretmeyin; seçilecek hazır logo seti olacaksa üretin. |

## 9. Görevler, çark, davet ödülleri (17)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `gorev-bir-odada-5-dakika-kal.png` | Bir odada 5 dakika kal | 🎙️ | günlük görev: Bir odada 5 dakika kal | P2 | Taslak teslim (parti 04–12) · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/mic.png |
| 2 | `gorev-3-hediye-gonder.png` | 3 hediye gönder | 🎁 | günlük görev: 3 hediye gönder | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/gift.png |
| 3 | `gorev-5-kisiye-selam-ver.png` | 5 kişiye selam ver | 👋 | günlük görev: 5 kişiye selam ver | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 6 dosyada |
| 4 | `gorev-1-an-paylas.png` | 1 an paylaş | 📸 | günlük görev: 1 an paylaş | P2 | Taslak teslim (parti 04–12) |
| 5 | `gorev-1-goruntulu-arama-yap.png` | 1 görüntülü arama yap | 📹 | günlük görev: 1 görüntülü arama yap | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 6 | `cark-kucuk-jeton.png` | Küçük jeton | 🪙 | birkaç jeton (5–20 jeton ödülü) | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 7 | `cark-jeton-kesesi.png` | Jeton kesesi | 💰 | dolu jeton kesesi (50 jeton) | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 8 | `cark-elmas-odul.png` | Elmas ödül | 💎 | elmas (100 jeton ödülü) | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 9 | `cark-roket-odul.png` | Roket ödül | 🚀 | roket (500 jeton ödülü) | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 10 | `cark-buyuk-odul.png` | Büyük ödül | 🏆 | altın kupa ve jeton yığını (büyük ödül) | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 11 | `cark-tekrar-dene.png` | Tekrar dene | 😅 | boş dilim: "tekrar dene" (üzgün maskot) | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 12 | `odul-pm-karti.png` | PM kartı | 💬 | ödül: PM kartı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/chat.png |
| 13 | `odul-merhaba-karti.png` | Merhaba kartı | ❤️ | ödül: Merhaba kartı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/heart.png |
| 14 | `odul-bonus-kredi-bileti.png` | Bonus kredi bileti | 🎟️ | ödül: Bonus kredi bileti | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 15 | `odul-sinirli-sureli-odul.png` | Sınırlı süreli ödül | ⏰ | ödül: Sınırlı süreli ödül | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 16 | `odul-kilitli-odul.png` | Kilitli ödül | 🔒 | ödül: Kilitli ödül | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 17 | `odul-tum-bonuslar-acildi.png` | Tüm bonuslar açıldı | 🎉 | ödül: Tüm bonuslar açıldı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |

## 10. Profil, keşfet, sosyal (63)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `rozet-haftanin-yildizi.png` | Haftanın Yıldızı | 🏆 | başarı rozeti: Haftanın Yıldızı | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 2 | `rozet-karaoke-ustasi.png` | Karaoke Ustası | 🎤 | başarı rozeti: Karaoke Ustası | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 3 | `rozet-sohbet-krali.png` | Sohbet Kralı | 💬 | başarı rozeti: Sohbet Kralı | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 4 | `rozet-comert-kalp.png` | Cömert Kalp | 🎁 | başarı rozeti: Cömert Kalp | P2 | Taslak teslim (parti 04–12) |
| 5 | `rozet-30-gun-seri.png` | 30 Gün Seri | 🔥 | başarı rozeti: 30 Gün Seri | P2 | Taslak teslim (parti 04–12) |
| 6 | `rozet-sosyal-kelebek.png` | Sosyal Kelebek | 🤝 | başarı rozeti: Sosyal Kelebek | P2 | Taslak teslim (parti 04–12) |
| 7 | `onur-romantik-randevu.png` | Romantik Randevu | 🏰 | onur duvarı etkinlik rozeti: Romantik Randevu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 8 | `onur-mucize-kesif.png` | Mucize Keşif | 🧭 | onur duvarı etkinlik rozeti: Mucize Keşif | P3 | Taslak teslim (parti 04–12) |
| 9 | `onur-odalar-arasi-pk-savasi.png` | Odalar Arası PK Savaşı | ⚔️ | onur duvarı etkinlik rozeti: Odalar Arası PK Savaşı | P3 | Taslak teslim (parti 04–12) |
| 10 | `onur-yildizli-gece.png` | Yıldızlı Gece | 🌌 | onur duvarı etkinlik rozeti: Yıldızlı Gece | P3 | Taslak teslim (parti 04–12) |
| 11 | `etiket-basketbol.png` | Basketbol | 🏀 | kişilik etiketi: Basketbol | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 12 | `etiket-mangal.png` | Mangal | 🍖 | kişilik etiketi: Mangal | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 13 | `etiket-punk.png` | Punk | 🎸 | kişilik etiketi: Punk | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 14 | `etiket-karaoke.png` | Karaoke | 🎤 | kişilik etiketi: Karaoke | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 8 dosyada |
| 15 | `etiket-kahve.png` | Kahve | ☕ | kişilik etiketi: Kahve | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 16 | `etiket-oyuncu.png` | Oyuncu | 🎮 | kişilik etiketi: Oyuncu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 17 | `etiket-kitap-kurdu.png` | Kitap kurdu | 📚 | kişilik etiketi: Kitap kurdu | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 18 | `etiket-gezgin.png` | Gezgin | ✈️ | kişilik etiketi: Gezgin | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 19 | `etiket-gece-kusu.png` | Gece kuşu | 🌙 | kişilik etiketi: Gece kuşu | P3 | Taslak teslim (parti 04–12) |
| 20 | `etiket-esprili.png` | Esprili | 😂 | kişilik etiketi: Esprili | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 21 | `etiket-kedisever.png` | Kedisever | 🐱 | kişilik etiketi: Kedisever | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 22 | `etiket-dans.png` | Dans | 💃 | kişilik etiketi: Dans | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 8 dosyada |
| 23 | `ilgi-karaoke.png` | Karaoke | 🎤 | ilgi alanı: Karaoke | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 8 dosyada |
| 24 | `ilgi-oyun.png` | Oyun | 🎮 | ilgi alanı: Oyun | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 25 | `ilgi-sohbet.png` | Sohbet | 💬 | ilgi alanı: Sohbet | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 6 dosyada |
| 26 | `ilgi-spor.png` | Spor | ⚽ | ilgi alanı: Spor | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 27 | `ilgi-seyahat.png` | Seyahat | ✈️ | ilgi alanı: Seyahat | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 28 | `ilgi-film.png` | Film | 🎬 | ilgi alanı: Film | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 29 | `ilgi-dans.png` | Dans | 💃 | ilgi alanı: Dans | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 8 dosyada |
| 30 | `ilgi-kitap.png` | Kitap | 📚 | ilgi alanı: Kitap | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 31 | `ilgi-muzik.png` | Müzik | 🎧 | ilgi alanı: Müzik | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 8 dosyada |
| 32 | `ilgi-kahve.png` | Kahve | ☕ | ilgi alanı: Kahve | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 33 | `cinsiyet-kadin.png` | Kadın | ♀ 👩 | cinsiyet simgesi: Kadın | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada · Kayıtta 👩/👨 olarak da geçiyor; aynı görsel |
| 34 | `cinsiyet-erkek.png` | Erkek | ♂ 👨 | cinsiyet simgesi: Erkek | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada · Kayıtta 👩/👨 olarak da geçiyor; aynı görsel |
| 35 | `maskot-bos-durum-maskotu.png` | Boş durum maskotu | 🦭 | uyuyan sevimli fok (boş liste / veri yok ekranları). Uygulamanın maskotu olabilir | P1 | Taslak teslim (parti 04–12) |
| 36 | `maskot-uyuyan-bakiye.png` | Uyuyan bakiye | 💤 | uyku "z z Z" | P1 | Taslak teslim (parti 04–12) |
| 37 | `konu-arama-merkezi.png` | Arama Merkezi | 📞 | keşfet/an konu etiketi: Arama Merkezi | P3 | Taslak teslim (parti 04–12) |
| 38 | `konu-parti.png` | Parti | 🎉 | keşfet/an konu etiketi: Parti | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 39 | `konu-ootd.png` | OOTD | 👗 | keşfet/an konu etiketi: OOTD | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 40 | `konu-gezi-gunlugu.png` | Gezi Günlüğü | 🧳 | keşfet/an konu etiketi: Gezi Günlüğü | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada |
| 41 | `konu-bu-aksam-ne-dinliyoruz.png` | Bu Akşam Ne Dinliyoruz | 🎧 | keşfet/an konu etiketi: Bu Akşam Ne Dinliyoruz | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 42 | `konu-romantik-randevu-konu.png` | Romantik Randevu (konu) | 💞 | keşfet/an konu etiketi: Romantik Randevu (konu) | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
| 43 | `konu-odalar-arasi-pk-konu.png` | Odalar Arası PK (konu) | ⚔️ | keşfet/an konu etiketi: Odalar Arası PK (konu) | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/swords.png |
| 44 | `ana-yaklasan-etkinlikler.png` | Yaklaşan etkinlikler | 📅 | ana sayfa kısayolu: Yaklaşan etkinlikler | P2 | Taslak teslim (parti 04–12) |
| 45 | `ana-oyun-merkezi.png` | Oyun merkezi | 🎮 | ana sayfa kısayolu: Oyun merkezi | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 46 | `ana-gorevler.png` | Görevler | 🎯 | ana sayfa kısayolu: Görevler | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 47 | `ana-senin-icin.png` | Senin için | ✨ | ana sayfa kısayolu: Senin için | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 19 dosyada |
| 48 | `ana-ipucu.png` | İpucu | 💡 | ana sayfa kısayolu: İpucu | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 49 | `siralama-zenginler.png` | Zenginler | 💰 | sıralama sekmesi: Zenginler | P2 | Taslak teslim (parti 04–12) |
| 50 | `siralama-yayincilar.png` | Yayıncılar | 🎙️ | sıralama sekmesi: Yayıncılar | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/mic.png |
| 51 | `siralama-odalar.png` | Odalar | 🔥 | sıralama sekmesi: Odalar | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 52 | `siralama-ajanslar.png` | Ajanslar | 🏢 | sıralama sekmesi: Ajanslar | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 53 | `siralama-oda-xp.png` | Oda XP | ⭐ | sıralama sekmesi: Oda XP | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 4 dosyada |
| 54 | `derece-1.png` | 1. madalya | 🥇 | sıralama 1. madalyası | P1 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 5 dosyada |
| 55 | `derece-2.png` | 2. madalya | 🥈 | sıralama 2. madalyası | P1 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 5 dosyada |
| 56 | `derece-3.png` | 3. madalya | 🥉 | sıralama 3. madalyası | P1 | Taslak teslim (parti 04–12) |
| 57 | `ulke-tum-ulkeler.png` | Tüm ülkeler | 🌍 | ülke: Tüm ülkeler (bayrak doğru renk ve oranla; stilize ama değiştirilmemiş) | P3 | Taslak teslim (parti 04–12) |
| 58 | `ulke-turkiye.png` | Türkiye | 🇹🇷 | ülke: Türkiye (bayrak doğru renk ve oranla; stilize ama değiştirilmemiş) | P3 | Taslak teslim (parti 04–12) |
| 59 | `ulke-azerbaycan.png` | Azerbaycan | 🇦🇿 | ülke: Azerbaycan (bayrak doğru renk ve oranla; stilize ama değiştirilmemiş) | P3 | Taslak teslim (parti 04–12) |
| 60 | `ulke-almanya.png` | Almanya | 🇩🇪 | ülke: Almanya (bayrak doğru renk ve oranla; stilize ama değiştirilmemiş) | P3 | Taslak teslim (parti 04–12) |
| 61 | `ulke-hollanda.png` | Hollanda | 🇳🇱 | ülke: Hollanda (bayrak doğru renk ve oranla; stilize ama değiştirilmemiş) | P3 | Taslak teslim (parti 04–12) |
| 62 | `ulke-kibris.png` | Kıbrıs | 🇨🇾 | ülke: Kıbrıs (bayrak doğru renk ve oranla; stilize ama değiştirilmemiş) | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: bayrak yerine boş bayrak simgesi; hangi bayrak olduğu belirlenmeli |
| 63 | `maskot-destek-botu.png` | Destek botu | 😉 | destek sohbetindeki botun yüzü; boş durum maskotuyla aynı karakter olabilir | P1 | Taslak teslim (parti 04–12) |

## 11. Para ve finans (11)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `finans-bonus-kredi.png` | Bonus Kredi | 🎟️ | kampanya bileti | P2 | Taslak teslim (parti 04–12) |
| 2 | `finans-hediyelerden-kazan.png` | Hediyelerden kazan | 🎁 | hediye → elmas | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada · Mevcut 3D ikonla aynı anlam olabilir: assets/icons/gift.png |
| 3 | `finans-ucretli-aramalar.png` | Ücretli aramalar | 📹 | görüntülü arama kazancı | P2 | Taslak teslim (parti 04–12) |
| 4 | `finans-haftalik-odeme-banka.png` | Haftalık ödeme / banka | 🏦 | banka binası | P2 | Taslak teslim (parti 04–12) |
| 5 | `finans-odeme-ve-hak-edis.png` | Ödeme ve hak ediş | 💳 | kart | P2 | Taslak teslim (parti 04–12) |
| 6 | `finans-yukleme-indirimi.png` | Yükleme indirimi | 💸 | kanatlı para | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |
| 7 | `finans-ilk-alim-firsati.png` | İlk alım fırsatı | 🔥 | "sadece ilk defa" alevi | P2 | Taslak teslim (parti 04–12) |
| 8 | `finans-vip-elmas-paketi.png` | VIP + elmas paketi | 👑 💎 | taç ve elmas birlikte | P2 | Taslak teslim (parti 04–12) |
| 9 | `finans-yayinci-analizi.png` | Yayıncı analizi | 📈 | yükselen grafik | P2 | Taslak teslim (parti 04–12) |
| 10 | `finans-ajanssiz-yayinci.png` | Ajanssız yayıncı | 🏛️ | bağımsız yayıncı binası | P2 | Taslak teslim (parti 04–12) |
| 11 | `finans-para-cekme.png` | Para çekme | 🏧 | para çekme | P2 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 10 dosyada |

## 12. Arayüz durum ve işlem simgeleri (57)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `ui-onaylandi-tamam.png` | Onaylandı / tamam | ✅ | arayüz simgesi: Onaylandı / tamam | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 2 | `ui-iptal-hata.png` | İptal / hata | ❌ ✖️ | arayüz simgesi: İptal / hata | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 3 | `ui-engel-askida.png` | Engel / askıda | ⛔ 🚫 | arayüz simgesi: Engel / askıda | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 4 | `ui-uyari.png` | Uyarı | ⚠️ | arayüz simgesi: Uyarı | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 5 | `ui-kilitli.png` | Kilitli | 🔒 | arayüz simgesi: Kilitli | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 6 | `ui-oturum-guvenlik.png` | Oturum / güvenlik | 🔐 | arayüz simgesi: Oturum / güvenlik | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 7 | `ui-bekliyor.png` | Bekliyor | ⏳ | arayüz simgesi: Bekliyor | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 8 | `ui-suresi-doldu.png` | Süresi doldu | ⌛ | arayüz simgesi: Süresi doldu | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 9 | `ui-hatirlatma-sureli.png` | Hatırlatma / süreli | ⏰ | arayüz simgesi: Hatırlatma / süreli | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 10 | `ui-sure.png` | Süre | ⏱ | arayüz simgesi: Süre | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 11 | `ui-bildirim-acik.png` | Bildirim açık | 🔔 | arayüz simgesi: Bildirim açık | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 12 | `ui-sessize-alindi.png` | Sessize alındı | 🔕 | arayüz simgesi: Sessize alındı | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 13 | `ui-aktif-cevrimici.png` | Aktif / çevrimiçi | 🟢 | arayüz simgesi: Aktif / çevrimiçi | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 14 | `ui-pasif.png` | Pasif | ⚪ | arayüz simgesi: Pasif | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 15 | `ui-canli-bakimda.png` | Canlı / bakımda | 🔴 | arayüz simgesi: Canlı / bakımda | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 16 | `ui-hata-test.png` | Hata (test) | 🟠 | arayüz simgesi: Hata (test) | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 17 | `ui-baglanti-dusuk-veri.png` | Bağlantı / düşük veri | 📶 | arayüz simgesi: Bağlantı / düşük veri | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 18 | `ui-yeniden-baglandi.png` | Yeniden bağlandı | 🔄 | arayüz simgesi: Yeniden bağlandı | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 19 | `ui-paylas-baglanti.png` | Paylaş / bağlantı | 🔗 | arayüz simgesi: Paylaş / bağlantı | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 20 | `ui-kopyala-liste.png` | Kopyala / liste | 📋 | arayüz simgesi: Kopyala / liste | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 21 | `ui-sikayet.png` | Şikâyet | 🚩 | arayüz simgesi: Şikâyet | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 22 | `ui-destek.png` | Destek | 🛟 | arayüz simgesi: Destek | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 23 | `ui-belge.png` | Belge | 📄 | arayüz simgesi: Belge | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 24 | `ui-veri-paket.png` | Veri / paket | 📦 | arayüz simgesi: Veri / paket | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 25 | `ui-ek-dosya.png` | Ek dosya | 📎 | arayüz simgesi: Ek dosya | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 26 | `ui-ayarlar-sistem.png` | Ayarlar / sistem | ⚙️ | arayüz simgesi: Ayarlar / sistem | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 27 | `ui-ara.png` | Ara | 🔍 | arayüz simgesi: Ara | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 28 | `ui-konum.png` | Konum | 📍 | arayüz simgesi: Konum | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 29 | `ui-ag.png` | Ağ | 🌐 | arayüz simgesi: Ağ | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 30 | `ui-istatistik.png` | İstatistik | 📊 | arayüz simgesi: İstatistik | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 31 | `ui-profil.png` | Profil | 👤 | arayüz simgesi: Profil | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 32 | `ui-duzenle.png` | Düzenle | ✏️ | arayüz simgesi: Düzenle | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 33 | `ui-duyuru.png` | Duyuru | 📢 | arayüz simgesi: Duyuru | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 34 | `ui-davet-gonderildi.png` | Davet gönderildi | 📨 | arayüz simgesi: Davet gönderildi | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 35 | `ui-sesli-arama.png` | Sesli arama | 📞 | arayüz simgesi: Sesli arama | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 36 | `ui-goruntulu-arama.png` | Görüntülü arama | 🎥 | arayüz simgesi: Görüntülü arama | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 37 | `ui-ajans.png` | Ajans | 🏢 | arayüz simgesi: Ajans | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 38 | `ui-ev-oda.png` | Ev / oda | 🏠 | arayüz simgesi: Ev / oda | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 3 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 39 | `ui-itiraz.png` | İtiraz | ⚖️ | arayüz simgesi: İtiraz | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 40 | `ui-gizli-kisi.png` | Gizli kişi | 🕵️ | arayüz simgesi: Gizli kişi | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 41 | `ui-katiliyorum.png` | Katılıyorum | 💪 | arayüz simgesi: Katılıyorum | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 42 | `ui-kutlama.png` | Kutlama | 🎉 | arayüz simgesi: Kutlama | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 43 | `ui-one-cikan.png` | Öne çıkan | ⭐ | arayüz simgesi: Öne çıkan | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 27 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 44 | `ui-populer-seri.png` | Popüler / seri | 🔥 | arayüz simgesi: Popüler / seri | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 45 | `ui-indir-asagi.png` | İndir / aşağı | ⬇️ | arayüz simgesi: İndir / aşağı | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 46 | `ui-takip-ederek-geldi.png` | Takip ederek geldi | 👣 | arayüz simgesi: Takip ederek geldi | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 47 | `ui-basvuru-gonderildi.png` | Başvuru gönderildi | 📝 | arayüz simgesi: Başvuru gönderildi | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 48 | `ui-canli-yayin-bildirimi.png` | Canlı yayın bildirimi | 🔴 | arayüz simgesi: Canlı yayın bildirimi | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 49 | `ui-hayran-kulubu.png` | Hayran kulübü | 💜 | arayüz simgesi: Hayran kulübü | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 50 | `ui-selam.png` | Selam | 👋 | arayüz simgesi: Selam | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 51 | `ui-hedef.png` | Hedef | 🎯 | arayüz simgesi: Hedef | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 52 | `ui-duyuru-megafon.png` | Duyuru (megafon) | 📣 | arayüz simgesi: Duyuru (megafon) | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 53 | `ui-kapat.png` | Kapat | ✕ | arayüz simgesi: Kapat | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 54 | `ui-okundu.png` | Okundu | ✓✓ | arayüz simgesi: Okundu | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 55 | `ui-gonderilmedi.png` | Gönderilmedi | ✗ | arayüz simgesi: Gönderilmedi | P4 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 56 | `ui-isaretsiz-kutu.png` | İşaretsiz kutu | ⬜ | arayüz simgesi: İşaretsiz kutu | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |
| 57 | `ui-bilgi.png` | Bilgi | ℹ️ | arayüz simgesi: Bilgi | P4 | Taslak teslim (parti 04–12) · Küçük (16–24 px) kullanılır. 3D yerine düz vektör ikon setiyle (ör. Ionicons) çözülmesi önerilir; yine de üretilecekse aynı stilde, sade |

