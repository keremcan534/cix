# Görsel üretim listesi: uygulamadaki tüm emojilerin yerine

Uygulamada emoji kalmayacak; aşağıdaki her satır sizin üreteceğiniz **bir görsel**. Liste kodun taranmasıyla çıkarıldı (uygulamada 1.398 emoji kullanımı, 330 farklı emoji). Aynı görselin birden çok yerde kullanıldığı durumlarda tek satır ve tek dosya adı var.

**Ad değişikliği notu:** Bu liste teslim edilen dosyaların kaydıdır; dosya adları ve görsel tarifleri teslim anındaki haliyle kalır. Ekrandaki adlar değişti: SVIP → VIP (VIP 1–10; ara ad İnci de kaldırıldı, süreli VIP aboneliği ekranda "Abonelik"), Asil → Rütbe (Çavuş, Yüzbaşı, Binbaşı, Albay, Paşa), Kabile/Aile → Aile, Patron koltuğu → Patron koltuğu, Lucky → Uğurlu, CP → İkili, Casino → Oyun Salonu, Servet → Cömertlik, Cazibe → Yankı. Yeni adlara uygun görseller ayrı bir sanat listesiyle üretilecek (`docs/SANAT_LISTESI_OZGUNLUK.md`). Deniz, denizcilik ve gemicilik temalı ad ve motif kullanılmaz (`docs/TASARIM_YONU.md` §3): ör. oda sahibi rozeti, Cömertlik amblemleri (Kuvars … Efsane) ve Aile güç rozetleri (Demir … Efsane) bu kurala göre çizilir.

**Teslim durumu:** 536 görselin hepsi 512 px PNG olarak teslim alındı (iki ZIP, klasör 01–12). Tablonun "Not" sütunu her satırın durumunu söyler.

- **Bölüm 1–3 (145 görsel): ✅ uygulamaya bağlandı.** Hediyeler `app/assets/gifts/192` ve `/512` (`components/GiftArt.tsx`, Lucky paketleri dahil; yönetimden eklenen yeni Lucky paketi `lucky-yeni-lucky.png` ile görünür; müzikli hediye köşesinde müzik rozeti). Efekt hediyeleri ve animasyonlar `app/assets/anim/192` ve `/512` (`components/fx/anim-art.tsx`, katalogda görsel türü `art`; kategori simgeleri animasyon yönetiminde). Tepkiler `app/assets/reactions` (`components/ReactionArt.tsx`): emoji panelinde, koltuk tepkisinde ve yalnız tepki emojisinden oluşan mesajlarda (oda, birebir ve grup sohbeti) çıkartma olarak görünür; yazıyla karışık emoji metin kalır. Paketler Unicode emojiyi saklamaya devam eder.
- **Bölüm 4 (29 görsel): 19'u kabul edildi, 11'i bağlandı** (iki 3D teslim: `SimilarClub_04_3D_20_DOGRULANMIS_TASLAK.zip` ve `SimilarClub_DUZELTME_04_TAM_05_ILK40_69_PNG_Claude.zip`). Mağaza sekmeleri, giriş efekti simgeleri, Spor Araba ve Özel Jet binekleri, Altın sohbet balonu `app/assets/store` içinde (`components/StoreArt.tsx`, 192 px, içeriğe göre kırpıldı): mağaza sekmelerinde, ürün kartlarında ve odaya girişte geçen binek olarak görünür. Kuyruklu Yıldız ve Özel Jet yakın eşleşme olarak onaylandı. 8 resimli çerçevenin küçük resmi gerekmedi (mağaza çerçevenin kendisini gösteriyor). İkinci teslimdeki 9 yakın eşleşme/prototip (Özel ID sekmesi ve rozeti, Ses Halkası, Yörünge, Aurora, Ateş, Scooter, Şeker, Galaksi) onaylanmadı; `cerceve-altin-tac.png` iki teslimde de Kraliyet Kanatları ile aynı dosya. Bu 10 görselde emoji kaldı.
- **Bölüm 5, ilk 40 (`SimilarClub_DUZELTME_04_TAM_05_ILK40_69_PNG_Claude.zip`): 35'i bağlandı**, `app/assets/room` içinde (`components/RoomArt.tsx`, 192 px): oda tipi ve tema seçicileri, seviye rozetleri, oda menüsü, oda kartı, patron koltuğu ve oda pencerelerinin başlıkları. Ailem, Konuşmacı kuyruğu, Oda botu ve Gizli giriş onaylanmadı; Oda kamerası teslim edildi ama düğme açık/kapalı durumunu gösterdiği için bağlanmadı. 19 kaynak görselde kenar düz kesik (sayfadan kesilirken), "Not" sütununda yazılı. 41–55 (zar yüzleri, PK simgeleri) bu teslimde yok.
- **Bölüm 5'in 41–55'i ve 6–12: taslak, bağlanmadı.** Teslim notuna göre bunlar bir ikon fontunun (Font Awesome 4, SIL OFL 1.1) siluetlerinden otomatik üretilmiş düz vektör taslaklar; istenen 3D cam stilinde değil. 211 dosya başka dosyalarla birebir aynı görsel (ör. 27 farklı öğe aynı yıldız, 19 öğe yıldız+rozet, 11 kabile öğesi aynı grup simgesi, 10 ödül/finans öğesi aynı banknot; Erkek ve Kadın simgesi de aynı yıldız). Ayrıca: zar yüzü 6'da 8 nokta var; slot kirazı ve üzümü, bilardo ve dört taş düz daire; giriş efekti Ejderha ve Ejder kartı alev simgesi; Kıbrıs bayrağı boş bayrak. Bunlarla emojiyi değiştirmek birçok yerde anlamı bozacağı için emoji (ve mevcut 3D ikonlar) yerinde kaldı. Yeniden üretilmesi gerekenler "Not" sütununda `⚠️ yeniden üretilmeli` ile işaretli.
- Bölüm 1–3'te zayıf kalanlar: `animasyon-ejderha.png` ve `animasyon-kategori-fantastik.png` düz siluet; `tepki-temel-kahkaha` = `tepki-eglence-yerlere-yattim` ve `tepki-vip-elmas` = `tepki-vip-kristal` aynı görsel. Kahkaha ve Elmas bağlı; Yerlere Yattım ve Kristal ücretli pakette kopya satılmasın diye çıkarıldı, yenileri gelince `components/ReactionArt.tsx` ve `data/catalog.ts` STICKER_PACKS'e geri eklenir.
- **Emoji / çıkartma ayrımı:** standart Unicode emojiler herkese ücretsiz (`STANDARD_EMOJI`); bölüm 3'teki çizimler artık satılan çıkartmalardır (`STICKER_PACKS`). Temel ücretsizdi; Güncelleme 4'te emoji panelinden ve mağazadan kalktı, gönderilmiş Temel çıkartmaları yine çizilir. Çıkartma mesajda `⟦kimlik⟧` olarak gider, emoji yazmak çıkartma göstermez.

**Toplam 661 görsel.** Öncelik (bölüm 1–15, 556 görsel): P1 143 (çok görünen, para kazandıran) · P2 192 · P3 160 · P4 61 (küçük arayüz simgeleri). Bölüm 16 ve sonrasının öncelikleri kendi tablolarında yazılı.

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
| 13. Güncelleme 2: Odalar bannerları ve Mesajlar | 7 |
| 14. Güncelleme 3: Ücretli oda süslemeleri | 6 |
| 15. Oda oyunları: Ludo | 7 |
| 16. Oyun Salonu: çark ve tahta oyunları | 9 |
| 17. Oyun Salonu: Yörünge, Mercan Avı, Fener Kayalığı | 22 |
| 18. Oda oyunları: Renk Kartları, XOX, Dört Taş | 21 |
| 19. Oyun Salonu: Bilye Şelalesi | 8 |
| 20. Etkinlik Merkezi: temalar ve türler | 26 |
| 21. Emoji paneli: VIP emojileri | 8 |
| 22. Oda katkı sıralaması | 4 |
| 23. Kalp seviyesi (birebir) | 7 |

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
| 11 | `animasyon-ses-dalgasi.png` | Ses Halkası | 🔊 | avatardan yayılan ses halkaları | P2 | ✅ Teslim edildi · Eski adı Ses Dalgası, dosya adı aynı kaldı · Uygulamada hareketli oynar; ChatGPT ile kapak görseli, hareketli sürüm ayrı iş |
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
| 13 | `tepki-eglence-yerlere-yattim.png` | Yerlere Yattım | 🤣 | "Yerlere Yattım" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ⚠️ yeniden üretilmeli: Kahkaha ile aynı görsel; pakette değil · Paket: Eğlence |
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
| 38 | `tepki-vip-elmas.png` | Elmas | 💎 | "Elmas" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ⚠️ yeniden üretilmeli: Elmas ile aynı görsel; pakette değil · Paket: VIP |
| 39 | `tepki-vip-ates.png` | Ateş | 🔥 | "Ateş" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 40 | `tepki-vip-isilti.png` | Işıltı | ✨ | "Işıltı" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 41 | `tepki-vip-kupa.png` | Kupa | 🏆 | "Kupa" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 42 | `tepki-vip-aslan.png` | Aslan | 🦁 | "Aslan" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 43 | `tepki-vip-zambak-armasi.png` | Zambak Arması | ⚜️ | "Zambak Arması" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ✅ Teslim edildi · Paket: VIP |
| 44 | `tepki-vip-kristal.png` | Kristal | 💠 | "Kristal" tepkisi; yüz ifadesi gereken tepkileri kendi maskotunuzla çizdirin | P1 | ⚠️ yeniden üretilmeli: Elmas ile aynı görsel; pakette değil · Paket: VIP |
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
| 6 | `cerceve-ses-dalgasi.png` | Ses Halkası | 🔊 | "Ses Halkası" avatar çerçevesinin mağaza küçük resmi | P2 | Eski adı Ses Dalgası, dosya adı aynı kaldı · İkinci 3D teslimde yakın eşleşme geldi, onaylanmadı; emoji kaldı · ⚠️ yeniden üretilmeli: ses dalgası yerine kulaklık motifi · Çerçeve kodla çiziliyor; yalnız mağaza simgesi |
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
| 17 | `cerceve-melek-kalp-mercan.png` | Melek Kalp · Pembe | 💞 | "Melek Kalp · Pembe" avatar çerçevesinin mağaza küçük resmi | P2 | ✅ 3D teslim edildi · Eski adı Melek Kalp · Mercan, dosya adı aynı kaldı · Mağaza kartı çerçevenin kendi görselini (assets/frames) avatarla gösterdiği için ayrıca bağlanmadı |
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
| 21 | `oyun-lucky-77.png` | Gece Yarısı Çarkı | 🎰 | oyun kapak simgesi: Gece Yarısı Çarkı | P3 | ✅ 3D teslim edildi (oyun ikonları sayfası), bağlandı (`app/assets/games`, `components/GameArt.tsx`): Oyun Merkezi ve oda menüsü |
| 22 | `oyun-dragon-tiger.png` | Ejder ile Kaplan | 🐉 | oyun kapak simgesi: Ejder ile Kaplan | P3 | Taslak teslim (parti 04–12) |
| 23 | `casino-kart-ejder.png` | Ejder | 🐉 | Ejder ile Kaplan masası: Ejder tarafı | P3 | Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: ejderha yerine alev simgesi, aynı görsel 2 dosyada |
| 24 | `casino-kart-kaplan.png` | Kaplan | 🐯 | Ejder ile Kaplan masası: Kaplan tarafı | P3 | Taslak teslim (parti 04–12) |
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
| 97 | `ayricalik-mikrofon-dalgasi.png` | Mikrofon halkası | 🎙️ | ayrıcalık simgesi: Mikrofon halkası (mikrofon çevresinde ses halkası) | P3 | Eski adı Mikrofon dalgası, dosya adı aynı kaldı · Taslak teslim (parti 04–12) · ⚠️ yeniden üretilmeli: aynı görsel 2 dosyada |
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


## 13. Güncelleme 2: Odalar bannerları ve Mesajlar (7)

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `banner-zirvedeki-ajanslar.png` | Zirvedeki ajanslar | 3D çanta | Odalar bannerı, sağ köşe: ajans çantası üstünde küçük kupa; koyu mavi-mor zemine oturacak, arka planı şeffaf | P2 | Yeni (güncelleme 2) · şu an mevcut 3D simge duruyor; gelince `components/room-banners.tsx` / `app/(tabs)/mesajlar.tsx` içinde değişir |
| 2 | `banner-en-cok-hediye-alan.png` | En çok hediye alanlar | 3D elmas | Odalar bannerı, sağ köşe: parlayan elmas ve etrafında küçük kıvılcımlar; koyu gül-mor zemine oturacak, şeffaf | P2 | Yeni (güncelleme 2) · şu an mevcut 3D simge duruyor; gelince `components/room-banners.tsx` / `app/(tabs)/mesajlar.tsx` içinde değişir |
| 3 | `banner-en-cok-hediye-gonderen.png` | En çok hediye gönderenler | 3D hediye | Odalar bannerı, sağ köşe: kapağı açılan altın kurdeleli hediye kutusu; koyu altın-mor zemine oturacak, şeffaf | P2 | Yeni (güncelleme 2) · şu an mevcut 3D simge duruyor; gelince `components/room-banners.tsx` / `app/(tabs)/mesajlar.tsx` içinde değişir |
| 4 | `banner-etkinlik-varsayilan.png` | Etkinlik bannerı (görselsiz) | kupa + degrade | Yönetim görsel koymadığında etkinlik bannerının sağ köşesi: kupa ve takvim yaprağı, mavi-mor zemine oturacak, şeffaf | P2 | Yeni (güncelleme 2) · şu an mevcut 3D simge duruyor; gelince `components/room-banners.tsx` / `app/(tabs)/mesajlar.tsx` içinde değişir |
| 5 | `mesaj-similar-ekibi.png` | Similar Ekibi | 3D zarf | Mesajlar üst kartı: mühürlü zarf ve küçük megafon (yönetimden gelen duyurular), şeffaf | P1 | Yeni (güncelleme 2) · şu an mevcut 3D simge duruyor; gelince `components/room-banners.tsx` / `app/(tabs)/mesajlar.tsx` içinde değişir |
| 6 | `mesaj-cevrimici-hizmet.png` | Çevrim içi hizmet | 3D sohbet | Mesajlar üst kartı: kulaklıklı sohbet balonu (canlı destek), şeffaf | P1 | Yeni (güncelleme 2) · şu an mevcut 3D simge duruyor; gelince `components/room-banners.tsx` / `app/(tabs)/mesajlar.tsx` içinde değişir |
| 7 | `mesaj-ajansim.png` | Ajansım | 3D çanta | Mesajlar üst kartı: ajans çantası ve yanında küçük yıldız rozeti, şeffaf | P1 | Yeni (güncelleme 2) · şu an mevcut 3D simge duruyor; gelince `components/room-banners.tsx` / `app/(tabs)/mesajlar.tsx` içinde değişir |


## 14. Güncelleme 3: Ücretli oda süslemeleri (6)

Oda Ayarları › **Oda Süslemesi › Ücretli** rafındaki arka planlar. Kod, fiyatlar ve raf hazır (`server/api/catalog.mjs` `ROOM_BGS`, `app/src/data/catalog.ts` `ROOM_BG_PAID`); görseli gelmeyen süsleme rafta "Yakında" olarak durur ve satılmaz. **Ücretsiz** sekmesindeki dört süsleme uygulamanın mevcut deniz fotoğraflarını kullanıyor (`app/assets/bg`, yeni görsel gerekmiyor); onlar ücretsiz stok fotoğraf olduğu için satılamaz, bu yüzden ücretli raf özgün görsel bekliyor.

Ölçü ve stil (hepsi için aynı, `docs/ODA_GORSEL_LISTESI.md` ile uyumlu):

- **Dikey, 1080 × 1920 px** (sahnenin biçimi, 9:16), PNG ya da JPG; şeffaflık yok, kenar boşluğu yok (ekranı tam kaplar).
- Üst yarıda mekân hissi; **ortada ve üst üçte birde sakin, boş alan** (koltuklar ve avatarlar oraya gelir); **alt yarı koyu ve sade** (üstüne sohbet yazısı gelir, uygulama ayrıca koyulaştırır).
- İnsan, yazı, logo, marka, bayrak yok. Yumuşak, hafif bulanık, az ayrıntı.
- Satılacağı için **özgün** olmalı: başka uygulamaların görsellerinden kopya ya da "satılamaz" lisanslı stok fotoğraf kullanılmamalı (`docs/VARLIK_KAYNAKLARI.md`'ye kaynağı yazılır).

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `oda-susleme-yildizli-gece.png` | Yıldızlı Gece | "Yakında" kutusu | Durgun gece denizinin üstünde yıldızlı gökyüzü ve ince bir samanyolu; ufukta turkuaz bir parıltı | P1 | Yeni (güncelleme 3) · 600 jeton / 30 gün · kimlik `rb-yildiz` |
| 2 | `oda-susleme-neon-sokak.png` | Neon Sokak | "Yakında" kutusu | Yağmur sonrası gece sokağı: ıslak zeminde turkuaz ve mercan neon yansımaları, bulanık tabela ışıkları (yazı okunmaz) | P1 | Yeni (güncelleme 3) · 900 jeton / 30 gün · kimlik `rb-neon` |
| 3 | `oda-susleme-konser-sahnesi.png` | Konser Sahnesi | "Yakında" kutusu | Boş konser sahnesi: üstten inen spot ışıkları, hafif sahne dumanı, arkada bulanık ışık duvarı; mercan ve turkuaz | P1 | Yeni (güncelleme 3) · 900 jeton / 30 gün · kimlik `rb-konser` |
| 4 | `oda-susleme-teras-partisi.png` | Teras Partisi | "Yakında" kutusu | Çatı katı terası: asılı ampul zincirleri, uzakta bulanık şehir ışıkları, gece gökyüzü; altın ve mercan ışık | P1 | Yeni (güncelleme 3) · 1.200 jeton / 30 gün · kimlik `rb-teras` |
| 5 | `oda-susleme-galaksi.png` | Galaksi | "Yakında" kutusu | Derin uzay: sarmal galaksi ve yıldız tozu, turkuaz ve altın bulutsu; mor-pembe gradyan yok | P1 | Yeni (güncelleme 3) · 1.200 jeton / 30 gün · kimlik `rb-galaksi` |
| 6 | `oda-susleme-altin-salon.png` | Altın Salon | "Yakında" kutusu | Yüksek tavanlı, altın ışıklı görkemli salon: avize ışıltısı, mermer zemin yansıması, lacivert gölgeler | P1 | Yeni (güncelleme 3) · 2.000 jeton / 30 gün · kimlik `rb-salon` |

Teslimden sonra (her görsel için): dosya `app/assets/room/` içine konur → `app/src/components/room/stage-backdrop.tsx` içindeki `ROOM_BG_ART`'a kimliğiyle eklenir → `server/api/catalog.mjs` `ROOM_BG_ROWS`'ta o satırın sonundaki `false` `true` yapılır (satışa açılır). Uygulama sürümü yayımlanmadan sunucuda satışa açılmamalı: görseli olmayan eski sürüm o süslemeyi çizemez (ücretsiz süslemeyi gösterir). Yeni bir süsleme eklemek aynı üç adım artı iki katalog satırıdır.


## 15. Oda oyunları: Ludo (7)

Ludo artık gerçek bir tahtada oynanıyor (`app/src/components/games/room/ludo-board.tsx`, `ludo.tsx`): 15 × 15 haç tahta, dört renkli yuva, yıldızlı güvenli kareler, ortada ev üçgenleri. **Şu an hiçbir görsel dosyası kullanmıyor**: tahta, taşlar ve kupa kodla (düz renk, degrade, Ionicons) çiziliyor; yalnız zar mevcut `zar-zar-yuzu-1..6.png` görsellerini kullanıyor (yeni zar gerekmiyor). Aşağıdakiler gelirse oyun çizilmiş bir masa oyunu gibi görünür; gelmezse bugünkü hali kalır, hiçbir şey bozulmaz.

Ölçü ve stil (hepsi için aynı):

- Mevcut 3D cam stil (`zar-zar-yuzu-*.png`, `oyun-ludo.png` ile aynı aile), **şeffaf zemin**, PNG.
- Renkler uygulamanın paleti: turkuaz `#13D9DF`, mercan `#FF6576`, altın `#F6BD60`, yeşil `#22C55E`; zemin gece laciverti. Mor yok.
- Taşlar tahtada **yaklaşık 20 px** çizilir (yuvada 26 px): ayrıntı az, siluet net, üstten bakış. Dört taş aynı kalıptan, yalnız rengi farklı olmalı.
- Yazı, logo, marka yok. Başka Ludo oyunlarının taşı ya da tahtası kopyalanmamalı (`docs/SANAT_LISTESI_OZGUNLUK.md`).

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `ludo-tas-turkuaz.png` | Ludo taşı · Turkuaz | kodla çizilen parlak pul | Üstten görünen yuvarlak, parlak oyun taşı (piyon başı gibi kubbeli), turkuaz; beyaz ince kenar, üstte ışık yansıması; 192 px | P2 | Yeni (oyun yenileme) · şu an degrade daire; gelince `ludo-board.tsx` içindeki `Token` gövdesi görsele döner |
| 2 | `ludo-tas-mercan.png` | Ludo taşı · Mercan | kodla çizilen parlak pul | 1 ile aynı kalıp, mercan | P2 | Yeni (oyun yenileme) · 1 ile aynı |
| 3 | `ludo-tas-altin.png` | Ludo taşı · Altın | kodla çizilen parlak pul | 1 ile aynı kalıp, altın | P2 | Yeni (oyun yenileme) · 1 ile aynı |
| 4 | `ludo-tas-yesil.png` | Ludo taşı · Yeşil | kodla çizilen parlak pul | 1 ile aynı kalıp, yeşil | P2 | Yeni (oyun yenileme) · 1 ile aynı |
| 5 | `ludo-tahta-zemin.png` | Ludo tahta zemini | düz lacivert `#0A1426` | Kare, **1080 × 1080 px, şeffaf değil**: gece laciverti oyun masası dokusu (hafif keçe ya da cilalı ahşap), köşelere doğru çok hafif koyulaşan; üstüne kareler ve yuvalar kodla çizilecek, bu yüzden desen sade ve düşük kontrastlı | P2 | Yeni (oyun yenileme) · gelince `ludo-board.tsx` `felt` zeminine konur |
| 6 | `ludo-yildiz.png` | Güvenli kare yıldızı | Ionicons `star` | Küçük, dolgun beş köşeli yıldız, açık gümüş-beyaz, hafif kabartma; 96 px, 14 px çizilecek | P3 | Yeni (oyun yenileme) · dört yıldızlı güvenli karede |
| 7 | `ludo-kupa.png` | Ludo kupası | Ionicons `trophy` | Altın kupa, iki kulplu, kaidesinde küçük yıldız; 192 px | P3 | Yeni (oyun yenileme) · kazanan bandında ve tahtanın ortasında (küçük) |

Teslimden sonra: dosyalar `app/assets/art/` içine konur ve `app/src/components/Art.tsx` listesine eklenir (zar yüzleri gibi) → `ludo-board.tsx` ve `ludo.tsx` içinde ilgili çizim `<Art name=…>` ile değiştirilir. Taşların dördü birden gelmeden bağlanmamalı: yarısı görsel, yarısı kodla çizilmiş taş aynı tahtada yan yana durur.

## 16. Oyun Salonu: çark ve tahta oyunları (9)

Gece Yarısı Çarkı, Liman Pazarı, Sihir Destesi (`app/src/components/games/board.tsx`) ve Rüzgâr Gülü (`components/games/wheel.tsx`) şu an düz görünümlerle, emojiyle ve Ionicons simgeleriyle çiziliyor; hareket, ses ve kazanç anı hazır. Aşağıdaki görseller gelince yalnız çizim değişir, oyun aynı kalır. Hepsi **şeffaf arka planlı PNG, üstünde yazı ve rakam yok** (çarpanları ve tutarları uygulama yazar); mor-pembe yalnız tahta oyunlarının kendi sahnesinde, Rüzgâr Gülü'nde yok.

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `cark-ibre.png` | Çark ibresi | kodla çizilen üçgen ve pim | Aşağıyı gösteren, damla biçimli parlak ibre (mercan gövde, altın pim üst ortada); tam karşıdan, 192 px. Pim görselin tam ortasında olmalı (ibre pimin etrafında sallanır) | P2 | Yeni (oyun yenileme) · iki çarkta da (`fx/wheel-stage.tsx` `WheelPointer`) |
| 2 | `gece-carki-gobek.png` | Gece Yarısı Çarkı göbeği | Ionicons `moon` + yıldız noktaları | Yuvarlak gece göğü: lacivert-mor zemin, hilal ve birkaç yıldız, altın ince kenar; tam karşıdan, 512 px | P2 | Yeni (oyun yenileme) · çarkın dönmeyen ortası |
| 3 | `meyve-karpuz.png` `meyve-elma.png` `meyve-limon.png` `meyve-uzum.png` `meyve-77.png` | Çark meyveleri (5) | emoji ve "77" yazısı | Aynı kalıpta beş parlak 3D simge: karpuz dilimi, kırmızı elma, limon, üzüm salkımı, altın "77" plakası; 192 px. Dilimde 20 px, seçenek kartında 28 px çizilir | P1 | Yeni (oyun yenileme) · `slot-limon`/`slot-uzum` taslaklarının yerine; beşi birden gelmeden bağlanmaz |
| 4 | `liman-tabak.png` | Liman Pazarı tabağı | Ionicons `restaurant` | Üstten görünen beyaz porselen servis tabağı, altın ince kenar, yanında çatal-bıçak; boş (üstüne gelen yemeği uygulama koyar); 512 px | P2 | Yeni (oyun yenileme) · halkanın ortası |
| 5 | `liman-yengec.png` … `liman-lahana.png`, `liman-salata.png`, `liman-pizza.png`, `liman-bos-tabak.png` | Liman yemekleri (11) | emoji | Aynı kalıpta 3D yemek simgeleri: yengeç, balık, karides, et, domates, balkabağı, mantar, lahana; ayrıca salata kasesi, pizza dilimi ve boş tabak; 192 px | P2 | Yeni (oyun yenileme) · sebzeler yeşil, et ve deniz ürünleri mercan çerçeveli kartta durur |
| 6 | `sihir-kart-arkasi.png` | Sihir Destesi kart arkası | kodla çizilen mor kart + Ionicons `sparkles` | Dikey oyun kartı arkası (2:3): koyu mor zemin, altın ince çerçeve, ortada sekiz köşeli yıldız ve ince yıldız tozu deseni; 384 × 576 px, köşeler yuvarlak | P1 | Yeni (oyun yenileme) · destede ve kart çevrilirken |
| 7 | `sihir-burc-kova.png` … (8) ve `sihir-joker.png` | Burç kartı simgeleri (9) | yazı karakteri (♒ …) ve 🃏 | Sekiz burcun altın çizgi simgesi (Kova, Başak, Boğa, Yengeç, Balık, Aslan, Yay, Akrep), aynı çizgi kalınlığında; ayrıca joker (şapkalı soytarı başı, altın-mor); 192 px | P2 | Yeni (oyun yenileme) · karakter her telefonda aynı görünmüyor |
| 8 | `fis-250.png` … `fis-25000.png` | Bahis fişleri (6) | kodla çizilen fiş | Üstten görünen casino fişi, kenarında sekiz açık renk çentik, ortası boş (tutarı uygulama yazar): mavi, yeşil, kırmızı, mor, turuncu, siyah-altın; 192 px | P3 | Yeni (oyun yenileme) · `fx/chips.tsx` `ChipFace`; kodla çizilen hali yeterince iyi, acele yok |
| 9 | `ruzgar-ozet-rozet.png` | Çoklu tur özeti rozeti | yok (düz başlık) | Küçük altın pusula gülü rozeti, altında kurdele (yazısız); 192 px | P3 | Yeni (oyun yenileme) · ×10 / ×50 özet kartının başlığında; `docs/RUZGAR_GULU.md` listesindeki `ruzgar-merkez.png` ve `ruzgar-ok.png` de hâlâ bekleniyor |

Teslimden sonra: dosyalar `app/assets/art/` içine konur ve `app/src/components/Art.tsx` listesine eklenir → ilgili çizim `<Art name=…>` ile değiştirilir (çark dilimleri ve seçenek kartlarında `board.tsx`, ibre için `fx/wheel-stage.tsx`). Çarkın dilimleri, çerçevesi ve ampulleri kodla çizilmeye devam eder (dönerken net kalsın ve her ekran boyuna uysun diye).


## 17. Oyun Salonu: Yörünge, Mercan Avı, Fener Kayalığı (22)

Yörünge (`app/src/components/games/rocket-stage.tsx`), Mercan Avı (`fish-stage.tsx`) ve Fener Kayalığı (`fener-stage.tsx`) sahneleri şu an kodla çizilen biçimlerle, telefonun emojileriyle ve mevcut `oyun-roket` kapak görseliyle duruyor; hareket, ses ve kazanç anı hazır. Aşağıdaki görseller gelince yalnız çizim değişir, oyun aynı kalır. Hepsi **şeffaf arka planlı PNG, üstünde yazı ve rakam yok** (çarpanları ve tutarları uygulama yazar).

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `yorunge-roket.png` | Yörünge roketi | `oyun-roket.png` (kapak simgesi) | Burnu tam yukarı bakan, tam karşıdan roket: kırmızı-gümüş gövde, turkuaz pencere, **alevsiz** (alevi uygulama çizer ve oynatır); roketin ekseni görselin tam ortasında; 384 px | P1 | Yeni (oyun yenileme) · sahnede 58 px çizilir ve yol boyunca döndürülür |
| 2 | `yorunge-gezegen.png` | Kalkış gezegeni | kodla çizilen turuncu daire | Büyük bir gezegenin yalnız üst yayı: kehribar-turuncu yüzey, birkaç krater, ince atmosfer ışığı; alt kenar düz; 1024 × 256 px | P2 | Yeni (oyun yenileme) · sahnenin altında durur, üstüne son sonuçlar şeridi gelir |
| 3 | `yorunge-rampa.png` | Fırlatma rampası | kodla çizilen ray ve iki ayak | Yandan görünen çelik kafes rampa, hafif yukarı eğimli (yaklaşık 15°), iki ayaklı; 384 × 192 px | P3 | Yeni (oyun yenileme) · kodla çizilen hali yeterli, acele yok |
| 4 | `mercan-palyaco.png`, `mercan-sari.png`, `mercan-balon.png`, `mercan-kalamar.png`, `mercan-ahtapot.png`, `mercan-kaplumbaga.png`, `mercan-yunus.png`, `mercan-kopekbaligi.png`, `mercan-balina.png`, `mercan-ejderha.png` | Mercan Avı canlıları (10) | emoji (🐠 🐟 🐡 🦑 🐙 🐢 🐬 🦈 🐳 🐉) | Aynı kalıpta on 3D deniz canlısı: Palyaço Balığı, Sarı Balık, Balon Balığı, Kalamar, Ahtapot, Kaplumbağa, Yunus, Köpekbalığı, Balina, Altın Ejderha. Hepsi yandan ve **sola bakar** (sağa yüzeni uygulama çevirir); ödemesi yüksek olan daha gösterişli; 256 px | P1 | Yeni (oyun yenileme) · emoji her telefonda farklı görünüyor; onu birden gelmeden bağlanmaz |
| 5 | `mercan-top-namlu.png`, `mercan-top-kaide.png` | Top (2) | kodla çizilen namlu ve kubbe | Namlu: tam yukarı bakan metal namlu, altın bilezikli, dönme noktası alt ortada (192 × 384 px). Kaide: yarım kubbe, altın kenarlı, ortasında turkuaz göbek (384 × 192 px) | P2 | Yeni (oyun yenileme) · namlu dokunulan balığa döner ve geri teper |
| 6 | `mercan-deniz-dibi.png` | Deniz dibi şeridi | kodla çizilen kayalar ve mercan dalları | Yatay şerit: kum, koyu kayalar, renkli mercanlar (pembe, turuncu, mor); üst kenarı şeffafa açılır; 1080 × 360 px | P2 | Yeni (oyun yenileme) · yosunlar ve kabarcıklar kodla oynamaya devam eder |
| 7 | `fener-gemi-kucuk.png`, `fener-gemi-orta.png`, `fener-gemi-buyuk.png`, `fener-gemi-altin.png` | Fener gemileri (4) | emoji (⛵ 🚤 🚢) | Yükü büyüdükçe büyüyen dört gemi: yelkenli sandal, motorlu tekne, yük gemisi, altın yük gemisi; yandan, **sola (limana) bakar**; gece denizinde okunacak açık renkler; 192 px | P1 | Yeni (oyun yenileme) · yük etiketini (×0,5 …) uygulama geminin altına yazar |
| 8 | `fener-kandil.png` | Kandil | emoji (🏮) | Suda yüzen yanık kandil, sıcak turuncu ışık halesi; 192 px | P1 | Yeni (oyun yenileme) · üç kandil Fırtına Gecesi'ni başlatır |
| 9 | `fener-kule.png` | Fener kulesi | kodla çizilen taş sütun ve ray | Dikey deniz feneri gövdesi: taş ve kırmızı-beyaz kuşaklar, ışık odası **boş** (ışığı ve merceği uygulama çizer, sıralar arasında gezdirir); 128 × 1024 px | P2 | Yeni (oyun yenileme) · sıraların başında, tahtanın solunda durur |

Teslimden sonra: dosyalar `app/assets/art/` içine konur ve `app/src/components/Art.tsx` listesine eklenir → ilgili çizim değişir (`rocket-stage.tsx` `RocketSprite` ve `Planet`; `fish-stage.tsx` `FishSprite`, `Cannon` ve `Water`; `fener-stage.tsx` `shipLook`, `SeaCell` ve `Tower`). Işık huzmesi, roketin izi ve alevi, patlama, kabarcıklar, yağmur ve şimşek kodla çizilmeye devam eder (hareket ettikleri ve her ekran boyuna uydukları için).


## 18. Oda oyunları: Renk Kartları, XOX, Dört Taş (21)

Renk Kartları (`app/src/components/games/room/cards.tsx`, kart yüzleri `card-face.tsx`), XOX (`room/xox.tsx`) ve Dört Taş (`room/four.tsx`) şu an düz görünümlerle, degradelerle ve Ionicons simgeleriyle çiziliyor; hareket, ses ve el sonu hazır. Aşağıdaki görseller gelince yalnız çizim değişir, oyun aynı kalır. Hepsi **şeffaf arka planlı PNG, üstünde yazı ve rakam yok** (rakamları, "+2"yi ve kart sayılarını uygulama yazar). Renk Kartları'nın destesi bize özgüdür: dört renk Turkuaz, Mercan, Altın ve Yeşil'dir, her rengin kendi amblemi vardır (damla, alev, güneş, yaprak). Başka kart oyunlarının kart yüzü düzeni (ortada eğik beyaz oval gibi), yazı tipi ya da adı kullanılmamalı.

| # | Dosya adı | Ad | Şu an | Ne çizilecek | Öncelik | Not |
|---|---|---|---|---|---|---|
| 1 | `renk-kart-turkuaz.png`, `renk-kart-mercan.png`, `renk-kart-altin.png`, `renk-kart-yesil.png` | Kart yüzü zeminleri (4) | kodla çizilen degrade ve soluk Ionicons amblemi | Dikey oyun kartı yüzü (yaklaşık 2:3, köşeler yuvarlak, ince beyaz kenar): rengin açıktan koyuya zemini, sağ altta büyük ve soluk amblem (damla, alev, güneş, yaprak); ortası ve sol üst köşe **boş** (rakamı ya da işareti uygulama koyar); 384 × 552 px | P1 | Yeni (oyun yenileme) · elde 54–58 px, ortada 62 px genişlikte çizilir; 360 dp ekranda sol üst köşe okunmalı |
| 2 | `renk-amblem-damla.png`, `renk-amblem-alev.png`, `renk-amblem-gunes.png`, `renk-amblem-yaprak.png` | Renk amblemleri (4) | Ionicons `water`, `flame`, `sunny`, `leaf` | Aynı kalıpta dört küçük beyaz amblem (tek renk, dolu biçim); 192 px | P2 | Yeni (oyun yenileme) · kartın köşesinde 10 px, masadaki "Renk" rozetinde 13 px, renk seçiminde 24 px çizilir: çok sade olmalı |
| 3 | `renk-isaret-atla.png`, `renk-isaret-yon.png`, `renk-isaret-arti2.png` | İşaret kartı simgeleri (3) | Ionicons `ban`, `swap-vertical` ve "+2" yazısı | Beyaz, kalın çizgili üç işaret: Atla (üstü çizili daire), Yön (ters yönlü iki ok), +2 (üst üste iki küçük kart; "+2" yazısını uygulama ekler); 192 px | P2 | Yeni (oyun yenileme) · kartın ortasında ve köşesinde |
| 4 | `renk-joker.png`, `renk-joker-arti4.png` | Joker yüzleri (2) | kodla çizilen dört renkli disk | Dikey kart yüzü: gece laciverti zemin, ortada dört rengin (turkuaz, mercan, altın, yeşil) döndüğü parlak fırıldak; ikincisinde fırıldağın üstünde boş koyu plaka ("+4"ü uygulama yazar); 384 × 552 px | P1 | Yeni (oyun yenileme) · renk seçtiren kartlar |
| 5 | `renk-kart-arka.png` | Kart arkası | kodla çizilen lacivert kart, turkuaz eşkenar dörtgen ve mercan nokta | Dikey kart arkası: gece laciverti zemin, turkuaz ince çerçeve, ortada turkuaz eşkenar dörtgen ve mercan göbek, çok hafif dalga deseni; 384 × 552 px | P1 | Yeni (oyun yenileme) · destede, rakiplerin kart sayısında ve uçan kartta |
| 6 | `renk-masa.png` | Kart masası | kodla çizilen koyu degrade ve ince iç çizgi | Yatay, köşeleri çok yuvarlak masa yüzeyi: koyu petrol-lacivert keçe, çok hafif doku, kenarda ince açık şerit; ortası sade (desteler oraya gelir); 1024 × 480 px | P3 | Yeni (oyun yenileme) · kenar rengi oyunda ortadaki renge göre uygulamadan boyanır, görselde nötr kalmalı |
| 7 | `oyun-renk-kartlari.png` | Renk Kartları kapağı | emoji (🃏) | Oyun kapak simgesi, diğer `oyun-*.png` kapaklarıyla aynı 3D üslupta: yelpaze açılmış dört renkli kart (turkuaz, mercan, altın, yeşil), en üstte dört renkli fırıldaklı Joker; 512 px | P1 | Yeni (oyun yenileme) · Oyun Merkezi kartı, oda menüsü ve oyun başlığı (`components/GameArt.tsx` `COVER.cards`) |
| 8 | `xox-x.png`, `xox-o.png` | XOX işaretleri (2) | kodla çizilen iki çubuk ve halka | Kalın, uçları yuvarlak, hafif parlayan iki işaret: turkuaz X ve mercan O; tam karşıdan; 256 px | P3 | Yeni (oyun yenileme) · işaretler şu an kodla "çizilerek" geliyor; görsel gelirse büyüyerek gelir. Kodla çizilen hali yeterli, acele yok |
| 9 | `dort-tas-mercan.png`, `dort-tas-altin.png` | Dört Taş taşları (2) | kodla çizilen degrade daire ve iç halka | Üstten görünen parlak, hafif bombeli iki pul: mercan ve altın; kenarda ince çentikli halka; 192 px | P2 | Yeni (oyun yenileme) · tahtada yaklaşık 38 px, oyuncu rozetinde 18 px çizilir |
| 10 | `dort-tas-hucre.png` | Tahta hücresi | kodla çizilen, ortası delik mavi kare | Dört Taş tahtasının tek hücresi: gece mavisi parlak plastik kare, ortasında **şeffaf** yuvarlak delik, deliğin kenarında ince iç gölge; kenarlar yan yana döşenince ek yeri görünmemeli; 192 px | P2 | Yeni (oyun yenileme) · uygulama 7 × 6 döşer; taş deliğin arkasından düşerken görünür, bu yüzden delik tam şeffaf olmalı |

Teslimden sonra: dosyalar `app/assets/art/` içine konur ve `app/src/components/Art.tsx` listesine eklenir → kart yüzleri ve arkası `room/card-face.tsx` içinde (`CardFace`, `CardBack`, `CARD_COLORS`), masa `room/cards.tsx` içinde, taş ve hücre `room/four.tsx` içinde (`Disc` ve tahtanın ön yüzü), kapak `components/GameArt.tsx` `COVER` listesinde değişir. Süre halkası, kazanan çizgi, uçan kartlar ve konfeti kodla çizilmeye devam eder (hareket ettikleri için).

## 19. Oyun Salonu: Bilye Şelalesi (8)

Oyun şimdilik kodla çizilen şekillerle duruyor (altın noktalar çivi, renkli kaplar kupa, gri bilye). Stil: diğer oyun görselleriyle aynı 3D cam/jöle yüzey; tahta gece moru ve lacivert, altın detaylar. Şeffaf arka plan, 512 px PNG.

| # | Görsel | Ne çizilecek | Dosya adı | Öncelik |
|---|---|---|---|---|
| 1 | Oyun kapağı | Mor-lacivert bir şelalenin içinden dökülen parlak gümüş bilyeler, altın çivilerden sekerek; üstte boş alan (yazı yok) | `oyun-bilye-selalesi.png` | P1 |
| 2 | Bilye | Tek parlak gümüş bilye, beyaz ışık yansıması, hafif gölge (küçük boyda da okunur) | `bilye-top.png` | P1 |
| 3 | Çivi | Küçük altın pirinç çivi başı, üstten bakış, parlak | `bilye-civi.png` | P2 |
| 4 | Altın kupa | Ağzı yukarı küçük altın kupa, içi koyu, "20x" yazmadan | `bilye-kupa-altin.png` | P1 |
| 5 | Yakut kupa | Aynı biçimde kırmızı yakut kupa | `bilye-kupa-yakut.png` | P2 |
| 6 | Zümrüt kupa | Aynı biçimde yeşil zümrüt kupa | `bilye-kupa-zumrut.png` | P2 |
| 7 | Tahta arka planı | Dikey 320×440 oranında, mor-lacivert derin bir şelale dokusu, kenarlarda ince altın çerçeve; çivi ve kupa çizilmeden | `bilye-tahta.png` | P2 |
| 8 | Fırlatma kanalı | Sağda dikey, cam bir boru; altta küçük bir yay/piston | `bilye-kanal.png` | P3 |

## 20. Etkinlik Merkezi: temalar ve türler (26)

Etkinlik kartları ve odadaki etkinlik teması şimdilik temanın iki rengiyle çizilen geçiş ve bir simgeyle duruyor (`app/src/lib/events.ts` THEME_LOOK). Görseller gelince kartta (kapak yüklenmemişse), tema seçicide ve etkinlik sürerken odanın arka planında kullanılacak. Adlar SimilarClub'ın kendi temaları; başka uygulamaların tema adı, deseni ya da karakteri kullanılmasın. Stil: uygulamanın 3D cam/jöle yüzeyi, yazı yok.

**Tema kapakları** (16:9, 1280 × 720 PNG; kartın üstünde, yazısız; ortada temanın ana nesnesi):

| # | Tema | Ne çizilecek | Dosya adı | Öncelik |
|---|---|---|---|---|
| 1 | Sade | Mor-mavi yumuşak ışık lekeleri, ortada küçük parıltı | `etkinlik-kapak-sade.png` | P2 |
| 2 | İlk Selam | Turkuaz-mavi zemin, el sallayan iki el silueti, baloncuklar | `etkinlik-kapak-ilk-selam.png` | P1 |
| 3 | Pasta ve Mum | Pembe-turuncu zemin, mumlu katlı pasta, konfeti | `etkinlik-kapak-pasta.png` | P1 |
| 4 | Sahne Işığı | Mor-pembe zemin, sahne spotları ve mikrofon, notalar | `etkinlik-kapak-sahne.png` | P1 |
| 5 | Yıldız Gecesi | Lacivert-mor gece göğü, parlak yıldızlar, hilal | `etkinlik-kapak-yildiz.png` | P2 |
| 6 | Kupa Gecesi | Kehribar-altın zemin, parlayan kupa, kürsü | `etkinlik-kapak-kupa.png` | P1 |
| 7 | İki Kalp | Kırmızı-pembe zemin, iç içe iki kalp, yumuşak ışık | `etkinlik-kapak-iki-kalp.png` | P2 |
| 8 | Ocak Başı | Turuncu-sarı sıcak zemin, şömine ateşi, fincanlar | `etkinlik-kapak-ocak.png` | P2 |
| 9 | Altın Gala | Koyu altın zemin, kadife perde, altın ışıltılar | `etkinlik-kapak-altin-gala.png` | P2 |

**Oda arka planları** (dikey 1080 × 1920 PNG; etkinlik sürerken sahnenin arkasında; üst ve orta sade kalsın, mikrofonlar okunabilsin):

| # | Tema | Ne çizilecek | Dosya adı | Öncelik |
|---|---|---|---|---|
| 10 | İlk Selam | Ferah turkuaz salon, yumuşak ışıklar | `etkinlik-oda-ilk-selam.png` | P2 |
| 11 | Pasta ve Mum | Balonlar ve hediye kutularıyla süslü kutlama salonu | `etkinlik-oda-pasta.png` | P1 |
| 12 | Sahne Işığı | Mor ışıklı konser sahnesi, büyük mikrofon silueti | `etkinlik-oda-sahne.png` | P1 |
| 13 | Yıldız Gecesi | Yıldızlı gökyüzü altında çatı terası | `etkinlik-oda-yildiz.png` | P2 |
| 14 | Kupa Gecesi | Yarışma stüdyosu, skor ışıkları, kupa | `etkinlik-oda-kupa.png` | P1 |
| 15 | İki Kalp | Gül yaprakları ve yumuşak pembe ışık | `etkinlik-oda-iki-kalp.png` | P2 |
| 16 | Ocak Başı | Şömineli, sıcak bir aile salonu | `etkinlik-oda-ocak.png` | P2 |
| 17 | Altın Gala | Altın avizeli gala salonu, kadife perdeler | `etkinlik-oda-altin-gala.png` | P2 |
| 18 | Sade | Temanın renkleriyle sade derin bir ışık | `etkinlik-oda-sade.png` | P3 |

**Etkinlik türleri** (512 px kare, şeffaf; filtrede ve kartın etiketinde; yönetim yeni tür ekleyince bu biçimde yeni simge istenir):

| # | Tür | Ne çizilecek | Dosya adı | Öncelik |
|---|---|---|---|---|
| 19 | Eğlence | Gülen yüzlü parti şapkası | `etkinlik-tur-eglence.png` | P2 |
| 20 | Müzik | Nota ve kulaklık | `etkinlik-tur-muzik.png` | P2 |
| 21 | Tanışma | El sallayan el | `etkinlik-tur-tanisma.png` | P2 |
| 22 | Yarışma | Küçük kupa | `etkinlik-tur-yarisma.png` | P2 |
| 23 | Özel Günler | Kurdeleli hediye kutusu | `etkinlik-tur-ozel-gun.png` | P2 |
| 24 | Aile Etkinlikleri | Yan yana üç kişi silueti | `etkinlik-tur-aile.png` | P3 |
| 25 | Çiftler Etkinlikleri | İki kalp | `etkinlik-tur-cift.png` | P3 |
| 26 | Diğer | Üç parıltı | `etkinlik-tur-diger.png` | P3 |

## 21. Emoji paneli: VIP emojileri (8)

Emoji panelinin üstünde artık "Sabit" ve "VIP" var (Güncelleme 4, madde 9). VIP'te bugün satılan paketler duruyor (Eğlence, Aşk, Hayvanlar, VIP, Animasyonlu); üst VIP seviyeleri için daha değerli görünen yeni çıkartmalar gerekiyor. Aşağıdakiler yeni ve bize özgü fikirler; başka uygulamaların çıkartmalarından alınmadı. Stil: bölüm 3'teki çıkartmalarla aynı 3D cam/jöle yüzey, altın (#F6BD60) detaylar, turkuaz ve mercan vurgular, mor-pembe gradyan yok; tek nesne, şeffaf arka plan, yazı ve rakam yok; 512 px PNG (uygulama 192 px'e küçültür). Panelde 40 px, mikrofonda kişinin fotoğrafının üstünde yaklaşık 60–80 px çizilir: küçükte de okunmalı.

| # | Görsel | Ne çizilecek | Dosya adı | Öncelik |
|---|---|---|---|---|
| 1 | Taçlı Kalp | Parlak mercan cam kalp, tepesinde yana hafif yatık küçük altın taç, kalbin içinde yumuşak ışık | `tepki-vip-tacli-kalp.png` | P1 |
| 2 | Altın Mikrofon | Eski usul yuvarlak başlı altın mikrofon, gövdesinde turkuaz cam halka, çevresinde üç küçük ışıltı | `tepki-vip-altin-mikrofon.png` | P1 |
| 3 | Kristal Gül | Tek uzun saplı gül, yaprakları buz gibi şeffaf turkuaz kristal, sapı ve yaprakları altın | `tepki-vip-kristal-gul.png` | P1 |
| 4 | Altın Alkış | Birbirine vuran iki altın cam el, aralarından saçılan küçük kıvılcımlar | `tepki-vip-altin-alkis.png` | P2 |
| 5 | Alevli Elmas | Tam karşıdan kesme elmas, üst kenarlarından yükselen turkuaz alev (mevcut Elmas ve Ateş'ten ayrı, ikisinin birleşimi gibi durmalı) | `tepki-vip-alevli-elmas.png` | P2 |
| 6 | Saygı Selamı | Beyaz eldivenli bir el, bileğinde altın manşet, zarifçe öne eğilmiş selam hareketi | `tepki-vip-saygi-selami.png` | P2 |
| 7 | Monoklu Göz Kırpma | Göz kırpan yuvarlak sarı yüz, açık gözünde altın çerçeveli monokl, başında küçük altın taç | `tepki-vip-monoklu-goz-kirpma.png` | P2 |
| 8 | Uykulu Hilal | Gözleri kapalı, tatlı tatlı uyuyan hilal yüz, ucundan sarkan küçük altın yıldız | `tepki-vip-uykulu-hilal.png` | P3 |

Teslimden sonra: dosyalar `app/assets/reactions` içine konur, `app/src/components/ReactionArt.tsx` SRC listesine eklenir ve `app/src/data/catalog.ts` STICKER_PACKS'e yeni bir paket olarak girer (panelde VIP başlığında kendi sekmesiyle görünür, `lib/emoji-panel`). Hangi VIP seviyesinden açılacağı ve fiyatı sahibin kararı; sunucu kataloğu (`server/api/catalog.mjs`) de aynı anda güncellenir.

## 22. Oda katkı sıralaması (4)

Oda katkı sıralaması yenilendi (Güncelleme 4, madde 14): Cömertlik ve Yankı listelerinde ilk üç kişi bir kürsüde duruyor. Bugün kürsü basamakları kodla çizilen degrade bloklar, fotoğrafların çevresi altın, gümüş ve bronz renkli düz halka; madalyalar (`derece-1/2/3`) ve birincinin tacı mevcut görseller. Aşağıdakiler kürsüyü daha değerli gösterecek yeni ve bize özgü fikirler; başka uygulamaların kanatlı çerçevelerinden alınmadı. Stil: mevcut 3D cam/jöle yüzey, gece mavisi gövde, altın (#F6BD60) detaylar, mor-pembe gradyan yok; yazı ve rakam yok; şeffaf arka plan, 512 px PNG. Oda içinde koyu zeminde, küçük boyda da okunmalı.

| # | Görsel | Ne çizilecek | Dosya adı | Öncelik |
|---|---|---|---|---|
| 1 | Altın çelenk | Fotoğrafın çevresine oturan yuvarlak altın defne çelengi; alt ortası açık (madalya oraya gelir), iç daire tamamen şeffaf; uygulamada 84 px fotoğrafın çevresinde yaklaşık 104 px | `katki-celenk-altin.png` | P1 |
| 2 | Gümüş çelenk | Aynı biçimde gümüş defne çelengi, yaprakları biraz daha sade | `katki-celenk-gumus.png` | P2 |
| 3 | Bronz çelenk | Aynı biçimde bronz defne çelengi, sıcak bakır tonları | `katki-celenk-bronz.png` | P2 |
| 4 | Kürsü | Üç basamaklı kısa kürsü, önden ve hafif yukarıdan: ortası en yüksek, solu ikinci, sağı üçüncü; gece mavisi cam gövde, basamakların üst kenarında altın, gümüş ve bronz ince ışık şeridi; üstleri düz ve boş (fotoğraflar üstünde durur); yatay, yaklaşık 3:1 oranında | `katki-kursu.png` | P2 |

Teslimden sonra: dosyalar `app/assets/art/` içine konur ve `app/src/components/Art.tsx` listesine eklenir → çelenkler `components/room/contrib-board.tsx` içinde ilk üçün fotoğraf halkasının (`Face`, `PLACE.ring`) yerine, kürsü kodla çizilen basamakların (`pedestal`) yerine geçer. Madalyalar ve taç olduğu gibi kalır; kişinin kendi mağaza çerçevesi varsa o gösterilmeye devam eder.

## 23. Kalp seviyesi (birebir) (7)

İki kişi arasındaki kalp seviyesi (Lv.0–10) yükseldikçe kalp daha çok şey yapıyor (Güncelleme 4, madde 19). Bugün hepsi kodla çiziliyor (`app/src/components/heart-level.tsx`, görünümler `app/src/lib/heart-tiers.ts`): Ionicons kalp, renkli dolgu ve ışık; Lv.5'ten itibaren iki fotoğraf arasındaki çizgide kalp atışları gidip geliyor, Lv.7'den itibaren kalp profil fotoğrafında atıyor ve küçük kalpler yükseliyor, Lv.9–10'da altın kenar ve halka var. Görünümler sohbetin üstündeki kalp çubuğunda, karşı tarafın profilindeki "Aranızdaki kalp" kartında, profil fotoğrafının köşesinde, odadaki kişi kartında ve Mesajlar › Yakınlık listesinde. Aşağıdakiler bu kalplerin yerine geçecek görseller; yeni ve bize özgü fikirler, başka uygulamaların kanatlı ya da taçlı çerçevelerinden alınmadı. Stil: mevcut 3D cam/jöle yüzey, mercan (#FF6576) ve koyu kırmızı tonlar, altın (#F6BD60) yalnız en üst görünümde; mor ve mor-pembe gradyan yok; yazı ve rakam yok; tek nesne, şeffaf arka plan, 512 px PNG. Uygulamada 18–30 px çizilir: küçükte de okunmalı, beş kalp yan yana konunca seviye arttıkça daha değerli görünmeli. Hareketi (atma, nabız, yükselen kalpler) uygulama kodla verir; görseller durağan.

| # | Görsel | Ne çizilecek | Dosya adı | Öncelik |
|---|---|---|---|---|
| 1 | Kıvılcım kalbi (Lv.1–2) | Küçük, yumuşak açık mercan cam kalp; üst köşesinde tek bir minik kıvılcım | `kalp-seviye-kivilcim.png` | P1 |
| 2 | Işıltı kalbi (Lv.3–4) | Mercan cam kalp, içinden sıcak bir ışık vuruyor, kenarlarında hafif parıltı | `kalp-seviye-isilti.png` | P1 |
| 3 | Nabız kalbi (Lv.5–6) | Gül kırmızısı cam kalp, yüzeyinde ince parlak bir nabız çizgisi (tek tepe), çevresinde yumuşak hale | `kalp-seviye-nabiz.png` | P1 |
| 4 | Tutku kalbi (Lv.7–8) | Koyu kırmızı parlak cam kalp, iki yanından yukarı süzülen iki minik mercan kalp | `kalp-seviye-tutku.png` | P1 |
| 5 | Sonsuz kalp (Lv.9–10) | Koyu kırmızı cam kalp, ince altın kenar, ortasında yumuşak altın ışık, çevresinde birkaç küçük altın ışıltı; taç ve kanat yok | `kalp-seviye-sonsuz.png` | P1 |
| 6 | Kalp atışı | Çizgide ilerleyen minik parlak mercan kalp, arkasında kısa ve yumuşak bir ışık izi; yatay, sağa doğru | `kalp-atis.png` | P2 |
| 7 | Kalp çizgisi | İki fotoğrafı bağlayan ince, parlak yatay şerit; ortasında küçük bir nabız tepesi, uçlara doğru incelip soluyor; mercandan altına geçen ton; yaklaşık 6:1 oranında | `kalp-cizgisi.png` | P3 |

Teslimden sonra: dosyalar `app/assets/art/` içine konur ve `app/src/components/Art.tsx` listesine eklenir → `components/heart-level.tsx` içinde `HeartGlyph` her görünümün kalbini (1–5) Ionicons kalbin yerine çizer; ışık, atma, yükselen kalpler ve altın halka kodla kalır. Kalp atışı (6) çizgide giden kalbin, kalp çizgisi (7) `HeartLink` içindeki düz çizginin yerine geçer. Rozetteki ("♥ Lv.7") beyaz kalp ve dolgu rengi olduğu gibi kalır.
