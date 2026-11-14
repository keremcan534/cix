# Büyük hediyeler

En pahalı 12 hediye odada **tam ekran gösteri** olarak oynar. Oda kararır, arkada ışık huzmeleri döner, hediye kendi yönünden girer, parçaları hareket eder (kanat çırpar, tekerlek döner, alev titrer), ışıltılar uçuşur, altta "Gönderen → Alan · Hediye ×adet" şeridi çıkar, sonra her şey çekilir. Süre 5–6 saniye.

## Nasıl çalışır

- ChatGPT **sadece hareketsiz resim** çizer. Hareketi kod verir.
- Her büyük hediye **ayrı parçalar** hâlinde çizilir (gövde, kanat, tekerlek…). Kod her parçayı ayrı oynatır.
- Parçaları henüz gelmeyen hediye, kendi 512 px resmiyle **aynı gösteriyi** oynar (aynı giriş, ışık, ışıltı, şerit). Yani bugün de çalışıyor; resimler geldikçe daha canlı olur.
- Bir hediyenin parçalı gösterisi, **o hediyenin bütün dosyaları** gelince açılır. Yarım parça ile oynamaz.
- Efektler kapalıysa, "hareketi azalt" açıksa ya da oda sahibi hediye efektlerini kapattıysa gösteri oynamaz (hediyenin kendisi her zaman gider). "Az veri" açıksa ışıltı yarıya iner, huzmeler kapanır.
- Yönetici ekranı: **Animasyon kataloğu › Büyük hediyeler** sekmesinde her gösteri "▶ Test oynat" ile para harcamadan izlenir; kaç parçanın geldiği de yazar.

## Sıra

Ekranın ortasındaki efektler **sırayla** oynar: hediye videosu, büyük hediye gösterisi, öteki hediyelerin ortada beliren resmi ve tam ekran Hareketli. Gelen sıraya girer; oynayan sonuna kadar oynar, sonra sıradaki başlar. Yeni gelen oynayanı kesmez. Kendi gönderdiğin hediye de aynı sıraya girer.

- Hediyenin koltuğa uçuşu ve sohbet satırı sıra beklemez, hemen görünür.
- Sıra uzamaz:
  - Aynı kişi aynı hediyeyi, o hediye sırada beklerken yine gönderirse ayrı ayrı oynamaz. Bekleyenle birleşir ve bir kez "×N" oynar. Çarkla 10 kez atılan hediye: ilki oynar, sonra bir kez "×9".
  - Sunucu odasında birden çok kişiye atılan hediye kişi kişi duyurulur. Arkadan gelen alıcılar oynayan efekte katılır ("3 kişi"); aynı gönderim iki kez oynamaz.
  - En çok 6 efekt ve toplam 24 saniyelik oynatma bekler. Fazlası gelirse bekleyenlerden en düşük değerlisi (eşitse en eskisi) düşer.
  - Videosu ya da gösterisi olmayan hediyenin ortadaki resmi en çok 6 saniye bekler; daha geç kalırsa gösterilmez (uçuşu ve sohbet satırı zaten görünmüştür).
- Giriş efektleri sıraya girmez, kişi girdiği an görünür. Yalnızca tam ekran giriş videosu (Ejderha) sahneyi paylaşır: sahne boşsa video oynar, değilse giriş şeridi çizimle gösterilir; video oynarken sıradaki hediye onu bekler.
- Kod: `app/src/lib/fx-queue.ts` (kurallar) ve `app/tests/fx-queue.test.ts`; oda `app/src/components/room/live-room.tsx` içinde oynatır.

## Kod nerede

| Dosya | Görevi |
|---|---|
| `app/src/data/gift-shows.ts` | Hangi hediyenin hangi parçaları var, nerede durur, nasıl hareket eder. |
| `app/src/components/fx/gift-show.tsx` | Tam ekran gösteriyi oynatan bileşen. |
| `app/src/components/fx/gift-show-art.ts` | Gelen parça resimlerinin listesi (şimdilik boş). |
| `app/tests/gift-shows.test.ts` | En pahalı 10 hediyenin gösterisi var mı, her dosya bu listede mi. |

Gelen bir dosya `app/assets/gifts/show/` klasörüne konur ve `gift-show-art.ts` dosyasına bir satır eklenir.

## ChatGPT görsel listesi

`docs/GORSEL_URETIM_LISTESI.md` içindeki **stil metnini** bir kez gönderin, sonra hediye hediye bu tabloları verin. Kurallar:

- Her dosya 1024 × 1024 px, **şeffaf arka planlı PNG**.
- Her dosyada **tek bir parça** olacak; parça resmin ortasında dursun, kenarlara değmesin.
- Aynı hediyenin parçaları **aynı ışıkla** (sol üstten), aynı stil ve aynı bakış açısıyla çizilsin; yan yana konunca tek resim gibi görünsün.
- Üzerinde yazı, rakam, logo olmayacak. Mor ya da mor-pembe kullanılmayacak. Gerçek bir uygulamanın hediyesine benzemeyecek.
- "2 kez kullanılır" yazan parça **bir kez** çizilir; kod onu iki yere koyar (gerekirse aynalar).
- Öncelik: tablodaki sıra (en pahalı hediye en üstte).
- Parçalar, hediyenin bugünkü küçük resmiyle aynı şeyi gösterir (helikopter, roket ve astronot, pasta ve buket…), yalnızca daha zengin çizilir. Hepsi gelince küçük resimler de bu parçalardan yeniden üretilebilir.

Toplam 33 dosya.


### Yıldız Faytonu (`c6`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 1 | `yildiz-faytonu-iz.png` | Arkada kalan yıldız tozu izi: soldan sağa incelen altın ışıltılı bir şerit. | kayar |
| 2 | `yildiz-faytonu-govde.png` | Tekerleksiz fayton gövdesi: altın süslemeli, turkuaz camlı, yandan görünüş. | süzülür |
| 3 | `yildiz-faytonu-teker.png` | Tek bir fayton tekerleği: altın jantlı, yıldız biçimli parmaklıklı, tam karşıdan. | 2 kez kullanılır, döner |

### Atlıkarınca Gecesi (`v12`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 4 | `atlikarinca-gecesi-govde.png` | Atlıkarıncanın tabanı ve direkleri, atlar ve tepe olmadan: altın direkler, turkuaz ve mercan süslü yuvarlak platform. | durur |
| 5 | `atlikarinca-gecesi-at.png` | Direksiz tek bir atlıkarınca atı: beyaz, altın eyerli, mercan yeleli, yandan. | 2 kez kullanılır, süzülür |
| 6 | `atlikarinca-gecesi-tepe.png` | Atlıkarıncanın çatısı: mercan ve krem dilimli çadır tepesi, altın kenarlı, ucunda küçük bir yıldız. | sallanır |

### Gökyüzü Turu (`v8`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 7 | `gokyuzu-turu-bulut.png` | Tek bir yumuşak beyaz bulut, altın kenar ışığı. | 2 kez kullanılır, kayar |
| 8 | `gokyuzu-turu-govde.png` | Pervanesiz turkuaz-altın gezi helikopteri, büyük cam kabinli, yandan; üstteki pervane mili görünsün. | süzülür |
| 9 | `gokyuzu-turu-pervane.png` | Helikopterin üst pervanesi tek başına: yandan görünen uzun, ince altın kanat çubuğu. | titrer |

### Düğün Günü (`c8`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 10 | `dugun-gunu-pasta.png` | Üç katlı beyaz düğün pastası: mercan kurdeleler, krem güller, tepesinde yanan mumlar. | durur |
| 11 | `dugun-gunu-buket.png` | Mercan kurdeleli büyük bir gül buketi: kırmızı, pembe ve beyaz güller. | sallanır |
| 12 | `dugun-gunu-yuzukler.png` | İç içe geçmiş iki altın alyans, birinde küçük bir pırlanta. | nabız gibi büyür |
| 13 | `dugun-gunu-guvercin.png` | Kanatları açık uçan tek bir beyaz güvercin, yandan. | 2 kez kullanılır, süzülür |

### Lüks Yat (`v10`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 14 | `luks-yat-yat.png` | Beyaz ve altın çizgili lüks bir yat, yandan; altı düz (su çizgisinde kesik). | sallanır |
| 15 | `luks-yat-dalga.png` | Yatay, uzun turkuaz bir dalga şeridi, köpüklü üst kenar. | kayar |

### Altın Tavus (`v11`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 16 | `altin-tavus-kuyruk.png` | Tam açılmış tavus kuşu kuyruğu tek başına: altın ve turkuaz göz desenli yarım daire yelpaze. | açılır |
| 17 | `altin-tavus-govde.png` | Kuyruksuz altın tavus kuşu gövdesi, başında küçük taç tüyleri, önden üçte bir açıdan. | süzülür |

### Uzay Yolculuğu (`v7`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 18 | `uzay-yolculugu-ay.png` | Parlak altın hilal ay, yumuşak bulutlara yaslanmış. | sallanır |
| 19 | `uzay-yolculugu-astronot.png` | Beyaz uzay giysili sevimli bir astronot, turkuaz kask camı, el sallarken. | süzülür |
| 20 | `uzay-yolculugu-alev.png` | Aşağı doğru yanan roket alevi: içi beyaz-sarı, dışı mercan. | titrer |
| 21 | `uzay-yolculugu-roket.png` | Yukarı bakan beyaz-altın roket, turkuaz yuvarlak pencereli, alevsiz. | süzülür |

### Dünya Turu (`h2`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 22 | `dunya-turu-dunya.png` | Yuvarlak dünya küresi: turkuaz denizler, krem kıtalar, altın enlem çizgileri; ülke sınırı yok. | döner |
| 23 | `dunya-turu-ucak.png` | Küçük beyaz-mercan yolcu uçağı, sağa uçarken yandan. | etrafında döner |

### Altın Kanatlar (`v9`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 24 | `altin-kanatlar-hale.png` | Altın ışık halkası: ince parlak çember ve yumuşak ışıma. | nabız gibi büyür |
| 25 | `altin-kanatlar-kanat.png` | Tek bir altın melek kanadı (sol kanat), tüyleri katman katman, omzu sağ üstte. | 2 kez kullanılır, çırpar |

### Masal Kalesi (`c3`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 26 | `masal-kalesi-bulut.png` | Kalenin altında duran geniş, yumuşak beyaz bulut. | kayar |
| 27 | `masal-kalesi-kale.png` | Masal kalesi, bayraksız: krem duvarlar, mercan sivri kuleler, altın süsler, turkuaz pencereler. | süzülür |
| 28 | `masal-kalesi-bayrak.png` | Direğiyle tek bir küçük mercan flama. | sallanır |

### Altın Kuğu (`h12`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 29 | `altin-kugu-halka.png` | Suda yayılan tek bir halka dalga, turkuaz ve altın ışıltılı, üstten hafif açıyla. | nabız gibi büyür |
| 30 | `altin-kugu-govde.png` | Kanatları kapalı altın kuğu gövdesi, yüzerken yandan. | süzülür |
| 31 | `altin-kugu-kanat.png` | Tek bir açık altın kuğu kanadı, yukarı kalkık, omzu sağ altta. | çırpar |

### Kartal (`v6`)

| # | Dosya adı | Ne çizilecek | Kodda ne yapar |
|---|---|---|---|
| 32 | `kartal-kanat.png` | Tek bir açık kartal kanadı (sol kanat): kahverengi-altın tüyler, omzu sağ üstte. | 2 kez kullanılır, çırpar |
| 33 | `kartal-govde.png` | Kanatsız kartal gövdesi ve başı, önden: beyaz baş, altın gaga, kahverengi-altın göğüs. | süzülür |

