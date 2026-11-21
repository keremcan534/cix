# İkon eksikleri: uygulamada resmi olmayan her şey

Bu liste tasarımcıya verilmek için hazırlandı (21 Kasım 2026, ana dal `ccr-0c79d9d5-0hfb46`, commit `9f74bcd`). Uygulamanın bütün ekranları (`app/src`) ile sunucu katalogları (`server/api`) tarandı: hediyeler, Şanslı paketleri, çıkartmalar, mağaza, VIP, rütbe, seviyeler, profil, bağlar, aile, ajans, bildirimler, mesajlar, oyunlar, görevler, etkinlikler, oda, menüler ve ayarlar. Kodda hiçbir şey değiştirilmedi.

Eski üretim listesi `docs/GORSEL_URETIM_LISTESI.md` teslim kaydıdır. Bu dosya ise bugünkü kodda neyin hâlâ resimsiz olduğunu gösterir.

## Nasıl okunur

Bir öğe şu durumlardan birindeyse "ikonu yok" sayıldı. "Şu an ne gösteriliyor" sütunu hangisi olduğunu söyler:

| Durum | Anlamı | Adet |
|---|---|---|
| **emoji** | Resim yerine telefonun emojisi görünüyor. | 105 |
| **Ionicons** | Hazır bir yazı tipi simgesi (düz çizgi glif) görünüyor; uygulamaya özel resim yok. Geri oku, kapat (X), ok başı ve büyüteç gibi gezinme simgeleri listeye alınmadı. | 552 |
| **yedek ikon** | Öğeye özel değil, genel bir resim görünüyor (ör. bütün jeton paketlerinde aynı jeton, bilinmeyen hediyede 🎁, baş harf dairesi). | 42 |
| **boş** | Hiç simge yok, ama yanındaki benzer öğelerde var. | 64 |
| **dosya eksik** | Kodda resmin yeri hazır ama dosya teslim edilmedi (`require` satırı yorumda ya da tablo `null`). Yerine ne çizildiği yazılı. | 77 |
| diğer | Kodla çizilmiş geçici şekil vb. | 11 |
| | **Toplam** | **851** |

Bunların dışında yalnız yönetim ekranlarında görünen 42 öğe her bölümün sonunda ayrıca listelendi. Cümle içindeki süs emojileri (bildirim ve uyarı metinleri) öğe sayılmadı; her bölümün "Metin içi emoji" başlığında dosya başına özetlendi.

- Bir öğe birden çok bölümde geçiyorsa tek bölümde sayıldı. Sayılmadığı yerde "N satır başka bölümde sayıldı" notu var.
- "Kaynak" sütunu öğenin tanımlandığı ya da çizildiği yeri verir (dosya:satır). Satır numaraları bu commit'e göredir.
- 552 Ionicons satırının çoğu (ayarlar, oda araçları, koltuk menüsü, arama düğmeleri) tek tek çizim değil, **bir küçük simge seti** olarak düşünülmeli. `app/src/components/Icon3D.tsx` başındaki kurala göre gezinme ve küçük arayüz glifleri bugün bilerek vektör tutuluyor. Bunların özel simgeye geçip geçmeyeceği bir tasarım kararı.

## Önce kod işi: resmi hazır ama bağlanmamış

Bu satırlar için **çizim gerekmez**. Resim dosyası depoda duruyor, ekran ise emoji ya da Ionicons gösteriyor. Tasarımcıya gitmeden önce yazılımcı kapatabilir.

| Öğe | Şu an | Hazır resim | Kaynak |
|---|---|---|---|
| Panelden eklenen yeni Şanslı paketi | emoji (varsayılan 🎁) | `assets/gifts/*/lucky-yeni-lucky.png` (hiçbir yerde kullanılmıyor) | `app/src/components/GiftArt.tsx` |
| Yörünge oyun kapağı | emoji 🚀 | `assets/art/oyun-roket.png` (sahnede var, kapak eşlemesinde yok) | `app/src/components/GameArt.tsx:9` |
| Rüzgâr Gülü JACKPOT dilimi | Ionicons kupa | `assets/games/ruzgar-jackpot.png` (yalnız üstteki JACKPOT kutusunda) | `app/src/components/games/wheel.tsx:347` |
| Oda alt çubuğu "Oda sesi" açık/kapalı | Ionicons | `ROOM_ICON_ART.sound` ve `soundOff` (`soundOff` hiç kullanılmıyor) | `app/src/components/RoomArt.tsx:68`, `room/parts.tsx:725` |
| Oda menüsü "Oda" bölümü | Ionicons, resmin önüne geçiyor | `ROOM_ICON_ART` | `app/src/components/room/menu.tsx:65` |
| Oda kartı alt satırı (tema, tür, bayrak) | emoji | `ROOM_THEME_ART`, `ROOM_TYPE_ART`, `ulke-*` | `app/src/components/room/owner.tsx:345` |
| Ülke seçici (Odalar, Keşfet) | bayrak emojisi, Ionicons küre | `assets/art/ulke-*` | `app/src/data/rooms-ui.ts:24-27` |
| Mesajlar › "Aileni bul" | yanlış simge (3D jeton) | 3D `tent` | `app/src/app/(tabs)/mesajlar.tsx:208` |
| Profilde ilgi alanı, cinsiyet, kişilik etiketleri | emoji / Ionicons | `ilgi-*`, `cinsiyet-*`, `etiket-*` (`Art.tsx`) | bölüm 3 |
| Canlı aile sandıkları | Ionicons "cube" | `kabile-*-sandik` | bölüm 5 |
| Bağ kur menüsü, oda sohbeti bağ çipi | Ionicons | `assets/bonds/bag-*.png` | bölüm 4 |
| Grup sohbeti 🎁 💬 👥 🎙️ | düz emoji | 3D karşılıkları var (`EmojiIcon`) | `app/src/components/GroupChat.tsx` |
| Profil oda seviyesi çipi | emoji | `roomLevelArt` (`RoomArt.tsx`) | bölüm 2 |
| Rütbe giriş bandı ve profil kartı | kademe emojisi | `asil-1…5` | bölüm 2 |
| Roket katkı sırası 1-2-3 | emoji 🥇🥈🥉 | `derece-1/2/3` | `app/src/components/room/room-rocket.tsx:139` |
| Gelir kaynakları | Ionicons | `finans-*` | bölüm 9 |
| Odadaki etkinlik bandı ve listesi | Ionicons tema simgesi | 9 etkinlik teması kapağı | bölüm 8 |
| Boş durum ekranları | Ionicons | `maskot-bos-durum-maskotu` | bölüm 9 |
| Odada ve sohbette Ionicons "gift", "mic", "trophy", "chatbubble" kullanan düğmeler | Ionicons | 3D `gift`, `mic`, `trophy`, `chat` | tablolarda "Not: 3D … var" yazan satırlar |

Tablolarda "Not: … var" yazan her satır bu türdendir.

## 1. Hediyeler, Şanslı paketleri, çıkartmalar, animasyonlar

Kontrol özeti (bunların resmi VAR, listelenmedi):
- `server/api/catalog.mjs` GIFT_ROWS (76 hediye) ile `app/src/data/mock.ts` GIFTS aynı kimlikleri taşıyor; fark yok. 76'sının hepsinin `app/src/components/GiftArt.tsx` ART haritasında 192/512 resmi var, dosyalar diskte duruyor. Müzikli hediye rozeti (`hediye-rozet-muzikli-hediye-rozeti.png`) de var.
- Yönetimden eklenen hediye (`server/api/custom-gifts.mjs:1469`) ikon yüklenmeden kaydedilmiyor ("İkonu önce yükle"), yani uygulamada her zaman ikonuyla görünüyor.
- Çıkartmalar: `server/api/stickers.mjs` ile `app/src/data/catalog.ts` STICKER_PACKS aynı (172 çıkartma). Hepsinin resmi ya da animasyonu var (ReactionArt SRC / ANIM / SPRITES). Yönetimden eklenen çıkartma da resim istiyor (`server/api/emoji.mjs:619`).
- Animasyonlar: `server/api/catalog.mjs:312` ROOM_ANIMS (14) uygulamadaki kayıtlarla aynı. 21 kaydın 9 kategorisinin hepsinin resmi var (`components/fx/anim-art.tsx`).

### Hediye paneli: sekmeler ve rozetler (`components/room/gift-sheet.tsx`)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Global sekmesi | Hediye paneli raf şeridi | Ionicons "globe" | `app/src/components/room/gift-sheet.tsx:50` |
| Şanslı sekmesi | Hediye paneli raf şeridi | Ionicons "leaf" | `app/src/components/room/gift-sheet.tsx:51` |
| Favoriler sekmesi | Hediye paneli raf şeridi | Ionicons "star" | `app/src/components/room/gift-sheet.tsx:57` |
| Popüler sekmesi | Hediye paneli raf şeridi | boş (yalnız yazı; Çantam'da 3D çanta, diğer üçünde simge var) | `app/src/components/room/gift-sheet.tsx:49` |
| Çift sekmesi | Hediye paneli raf şeridi | boş (yalnız yazı) | `app/src/components/room/gift-sheet.tsx:52` |
| Aile ve Dost sekmesi | Hediye paneli raf şeridi | boş (yalnız yazı) | `app/src/components/room/gift-sheet.tsx:53` |
| Muzip sekmesi | Hediye paneli raf şeridi | boş (yalnız yazı) | `app/src/components/room/gift-sheet.tsx:55` |
| Özel (Ayrıcalık) sekmesi | Hediye paneli raf şeridi | boş (yalnız yazı) | `app/src/components/room/gift-sheet.tsx:56` |
| "Global" köşe rozeti | Global hediye kutucuğu | Ionicons "globe" + "Global" yazısı | `app/src/components/room/gift-sheet.tsx:810` |
| "3D" köşe rozeti | 3D efektli hediye kutucuğu (g4, g6, h1, h3, h4, h8, h9, h10, p9, p10, c8, c11) | boş (yalnız "3D" yazılı hap; müzikli rozetin resmi var) | `app/src/components/room/gift-sheet.tsx:816` |
| VIP kilit hapı ("VIP n") | Özel raftaki kilitli hediye | Ionicons "lock-closed" | `app/src/components/room/gift-sheet.tsx:793` |
| Favori işareti | Favoriye eklenmiş hediye kutucuğu | Ionicons "star" | `app/src/components/room/gift-sheet.tsx:821` |
| "Tümü: odadaki herkes" alıcı düğmesi | Hediye paneli alıcı seçimi | Ionicons "home" | `app/src/components/room/gift-sheet.tsx:425` |
| "Tümü: mikrofondakiler" alıcı düğmesi | Hediye paneli alıcı seçimi | Ionicons "mic" (Icon3D'de mic var) | `app/src/components/room/gift-sheet.tsx:426` |
| Dinleyici alıcı etiketi | Hediye paneli alıcı seçimi (dinleyici fotoğrafının altı) | emoji 🎧 | `app/src/components/room/gift-sheet.tsx:433` |
| Profilden hediye: VIP kilit hapı | Profil hediye paneli | Ionicons "lock-closed" | `app/src/components/profile-gift-sheet.tsx:131` |
| Global hediye şeridindeki "GLOBAL" etiketi | Odadaki global hediye duyurusu | Ionicons "globe" | `app/src/components/fx/global-gift-banner.tsx:72` |
| Gönderenin fotoğrafı yoksa | Global hediye duyurusu | yedek ikon (Ionicons "person") | `app/src/components/fx/global-gift-banner.tsx:68` |

Toplam: 18

### Hediyenin emojiyle yazıldığı listeler (GiftArt kullanılmıyor)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Hediye geliri satırı (ayrıntı sütunu) | Gelir ekranı, hediye gelirleri | emoji (hediyenin emojisi + adı, ör. 🌹 Gül x3) | `app/src/app/gelir/index.tsx:47` |
| Eski kayıt hediye geliri | Gelir ekranı | emoji 🎁 "Hediye" | `app/src/app/gelir/index.tsx:47` |
| Hediye kırılımı satır başlığı | Gelir › ayrıntı, hediyeye göre gruplar | emoji (hediyenin emojisi + adı) | `app/src/app/gelir/detay.tsx:268` |
| "Hediye (eski kayıt)" grubu | Gelir › ayrıntı | emoji 🎁 | `app/src/app/gelir/detay.tsx:268` |
| Çift hediyesi seçenekleri | Kabile › İlişki, "Çift hediyesi" seçim sayfası | emoji (hediye emojisi + adı + fiyat 🪙) | `app/src/app/kabile/iliski.tsx:139` |
| Aile sohbeti hediye seçenekleri | Kabile › Sohbet, hediye seçim sayfası | emoji (hediye emojisi + adı + fiyat 🪙) | `app/src/app/kabile/sohbet.tsx:142` |

Toplam: 6

Not: Gelir ekranı başka bir bölümün de konusu olabilir; buraya hediye resmi gösterilmediği için eklendi.

### Bilinmeyen hediye yedeği
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Kataloğu bilinmeyen hediye (Çantam) | Çantam › Hediyeler kartı | yedek ikon: emoji 🎁 (GiftArt metin olarak çiziyor) | `app/src/app/canta.tsx:99` |
| Şanslı çantada kazanılan bilinmeyen hediye | Şanslı çanta "Kazandın!" kartı | yedek ikon: emoji 🎁 | `app/src/components/room/lucky-bag.tsx:567` |
| Hediye çantası (bilinmeyen hediye) | Şanslı çanta açılış kartı | yedek ikon: emoji 🎁 | `app/src/components/room/lucky-bag.tsx:573` |

Toplam: 3

Not: Bunlar yalnızca katalog hediyeyi tanımadığında (ör. silinmiş hediye) görünür. Gerekirse genel bir "hediye kutusu" resmi yeterli olur.

### Şanslı (Lucky) paketleri
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Panelden eklenen yeni Şanslı paketi (lk… kimliği, lk1–lk4 dışında) | Hediye paneli › Şanslı rafı, Şanslı geçmişi, Şanslı duyuru şeridi | emoji (varsayılan 🎁), panelden ikon verilene kadar | `app/src/lib/lucky.ts:311`, `app/src/components/GiftArt.tsx:116` |
| Emojisi bozuk gelen paket | Şanslı rafı | yedek ikon: emoji 🍀 | `app/src/lib/lucky-art.ts:56` |
| Genel yedek resim `lucky-yeni-lucky.png` | — (hiçbir yerde kullanılmıyor) | dosya var (`app/assets/gifts/192/lucky-yeni-lucky.png`) ama kodda bağlı değil; yeni paket bunun yerine emojiyle görünüyor | `app/src/components/GiftArt.tsx:95-98` (ART'ta yok) |
| "Olasılıklar" bilgi satırı | Şanslı rafı alt notu | Ionicons "information-circle" | `app/src/components/room/gift-sheet.tsx:567` |
| "Geçmişim / Olasılıklar" düğmesi | Şanslı rafı | Ionicons "time-outline" / "stats-chart-outline" | `app/src/components/room/gift-sheet.tsx:707` |
| Kazanan duyurusunda fotoğrafı olmayan kişi | Oda üstündeki kazanç şeridi (Şanslı ve oyun kazançları) | yedek ikon: emoji 🎉 | `app/src/components/fx/win-banner.tsx:64` |

Toplam: 6

Not: lk1–lk4 (Şans Yoncası, Uğur Böceği, Altın Nal, Kayan Yıldız) resimli, listelenmedi. Tasarımcıdan bir şey istemek gerekmez: mevcut `lucky-yeni-lucky.png` dosyası yeni paketlere bağlanabilir (kod işi).

### Büyük hediye gösterileri: parça resimleri eksik (`components/fx/gift-show-art.ts` SHOW_PARTS boş, `app/assets/gifts/show/` klasörü yok)
Hepsi şu an kendi 512 px hediye resmiyle aynı gösteriyi oynuyor. Hiçbirinin sunucuda videosu yok (`server/api/fx.mjs:19`).
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Yıldız Faytonu (c6) | Tam ekran hediye gösterisi | dosya eksik → tek 512 px hediye resmi. Eksik: `yildiz-faytonu-iz.png`, `yildiz-faytonu-govde.png`, `yildiz-faytonu-teker.png` | `app/src/data/gift-shows.ts:66` |
| Atlıkarınca Gecesi (v12) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `atlikarinca-gecesi-govde.png`, `atlikarinca-gecesi-at.png`, `atlikarinca-gecesi-tepe.png` | `app/src/data/gift-shows.ts:80` |
| Gökyüzü Turu (v8) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `gokyuzu-turu-bulut.png`, `gokyuzu-turu-govde.png`, `gokyuzu-turu-pervane.png` | `app/src/data/gift-shows.ts:94` |
| Düğün Günü (c8) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `dugun-gunu-pasta.png`, `dugun-gunu-buket.png`, `dugun-gunu-yuzukler.png`, `dugun-gunu-guvercin.png` | `app/src/data/gift-shows.ts:108` |
| Lüks Yat (v10) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `luks-yat-yat.png`, `luks-yat-dalga.png` | `app/src/data/gift-shows.ts:123` |
| Altın Tavus (v11) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `altin-tavus-kuyruk.png`, `altin-tavus-govde.png` | `app/src/data/gift-shows.ts:135` |
| Uzay Yolculuğu (v7) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `uzay-yolculugu-ay.png`, `uzay-yolculugu-astronot.png`, `uzay-yolculugu-alev.png`, `uzay-yolculugu-roket.png` | `app/src/data/gift-shows.ts:147` |
| Dünya Turu (h2) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `dunya-turu-dunya.png`, `dunya-turu-ucak.png` | `app/src/data/gift-shows.ts:161` |
| Altın Kanatlar (v9) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `altin-kanatlar-hale.png`, `altin-kanatlar-kanat.png` | `app/src/data/gift-shows.ts:173` |
| Masal Kalesi (c3) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `masal-kalesi-bulut.png`, `masal-kalesi-kale.png`, `masal-kalesi-bayrak.png` | `app/src/data/gift-shows.ts:186` |
| Altın Kuğu (h12) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `altin-kugu-halka.png`, `altin-kugu-govde.png`, `altin-kugu-kanat.png` | `app/src/data/gift-shows.ts:199` |
| Kartal (v6) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `kartal-kanat.png`, `kartal-govde.png` | `app/src/data/gift-shows.ts:212` |
| Koruma Kartı (koruma) | Tam ekran hediye gösterisi | dosya eksik → 512 px resim. Eksik: `koruma-karti-hale.png`, `koruma-karti-kanat.png`, `koruma-karti-kart.png` | `app/src/data/gift-shows.ts:226` |

Toplam: 13

Not: Bir gösteri, o hediyenin bütün parçaları gelmeden katmanlı oynamaz. Bu yüzden bir hediyenin parçalarını eksiksiz teslim etmek gerekir.

### Çıkartmalar ve emoji paneli (`components/EmojiPanel.tsx`)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Çıkartma paketi sekmeleri (VIP, Eğlence, Aşk, Hayvanlar, Animasyonlu, Ses Odası, Çay Ocağı, Duygular+, Kutlama, Maskot Hayvanlar, Penguen ve yönetimden eklenen paketler) | Emoji paneli › VIP bölümü sekme şeridi | boş (yalnız paket adı; Emoji ve Hareketli sekmelerinin resmi var) | `app/src/components/EmojiPanel.tsx:106` |
| Favoriler sekmesi | Emoji paneli › Sabit | Ionicons "star" | `app/src/components/EmojiPanel.tsx:238` |
| Kilitli paket işareti | Emoji paneli sekmesi, kilitli paketin adının yanı | emoji 🔒 | `app/src/components/EmojiPanel.tsx:241` |
| "Çıkartma paketini aç · fiyat" düğmesindeki jeton | Emoji paneli, kilitli paket | emoji 🪙 (Icon3D "coin" var ama kullanılmıyor) | `app/src/components/EmojiPanel.tsx:286` |
| Paket simgesi (genel) | Paketin kendi simgesi hiçbir yerde yok; mağaza kartı ilk 4 çıkartmayı gösteriyor | boş: paket verisinde simge alanı yok (ne uygulamada ne sunucuda) | `app/src/data/catalog.ts:172`, `server/api/emoji.mjs:8` |

Toplam: 5

Not: VIP emojilerinin 15'inin de resmi var. İki dosya kopya olduğu için pakete bağlanmamış, yeniden çizilmeleri gerekiyor: `tepki-eglence-yerlere-yattim` (Temel Kahkaha ile aynı) ve `tepki-vip-kristal` (Elmas ile aynı). Kaynak: `app/src/data/catalog.ts:296`, `:326`.

### Animasyonlar ve efekt hediyeleri (`data/animations.ts`)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Hazine Sandığı (an-chest) | Emoji paneli › Hareketli (VIP), odada efekt hediyesi | yedek ikon (genel 3D hediye kutusu `icons/gift.png`; sandık resmi yok) | `app/src/data/animations.ts:132` |

Toplam: 1

Not: Kraliyet Tacı (an-crown), Altın Yağmuru (an-coin-rain) ve Elmas Yağmuru (an-diamond-rain) da genel 3D ikonları (crown, coin, diamond) kullanıyor. Konuyla örtüştükleri için listelenmedi. Yönetimden "emoji" türüyle eklenen animasyon emoji olarak görünür (`app/src/components/fx/anim-player.tsx:23`), bu bir yönetici seçimi.

### Şanslı çanta (odada hediye/jeton çantası)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| "En şanslı" rozeti | Çanta açıldıktan sonra kazananlar listesi | Ionicons "trophy" (Icon3D'de trophy var) | `app/src/components/room/lucky-bag.tsx:618` |
| "Yalnızca beni takip edenler açabilir" satırı | Çanta bırakma sayfası | Ionicons "people-outline" | `app/src/components/room/lucky-bag.tsx:170` |

Toplam: 2

Not: Jeton/Hediye seçimi ve Çantam sekmeleri her yerde yalnız yazı (benzerlerinde de simge yok), listelenmedi.

### Yönetim ekranları
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Koruma Kartı ve 8 bağ hediyesi (koruma, bag-kardes, bag-baci, bag-agabey, bag-abla, bag-yenge, bag-enishte, bag-kanka, bag-cift) | Finans paneli / Yönetim › Hediyeler, "uygulamadaki resmi" | dosya eksik: `server/api/art/gifts/<id>.webp` yok, `original.icon` null (panelde uygulama resmi gösterilemiyor) | `server/api/custom-gifts.mjs:1153`, `server/api/art.mjs:30` |
| Animasyonlu Duygular (32), Müzik (12) ve Hamle (6) çıkartmaları (duygu-*, muzik-*, hamle-*) | Yönetim › Emojiler, çıkartmanın resmi | dosya eksik: `server/api/art/stickers/<id>.webp` yok, `picture` null (Lottie oldukları için panelde resim yok) | `server/api/emoji.mjs:397`, `:408` |
| Şanslı paketleri listesi | Uygulama içi Şanslı hediye yönetimi | emoji (paket emojisi + adı) | `app/src/app/lucky-yonetimi.tsx:102` |
| Şanslı geçmişi/kazananlar satırı | Uygulama içi Şanslı hediye yönetimi | emoji | `app/src/app/lucky-yonetimi.tsx:201` |
| Şanslı paket kartı | `components/admin/lucky.tsx` paket listesi | emoji (başlıkta paket emojisi) | `app/src/components/admin/lucky.tsx:125` |
| Hediye önizlemesi (ikon seçilmemişken) | Yönetim › Hediye ekle/düzenle | emoji (girilen emoji, boşsa 🎁) | `app/src/components/admin/gifts-admin.tsx:403` |
| PK puan tablosu hediye satırları | PK yönetimi | emoji (hediye emojisi + adı) | `app/src/app/pk-yonetimi.tsx:155` |
| Büyük hediye testi, bilinmeyen hediye | Animasyon yönetimi › Büyük hediyeler | yedek ikon: emoji 🎁 | `app/src/app/animasyon-yonetimi.tsx:148` |

Toplam: 8

### Metin içi emoji
- `app/src/components/room/gift-sheet.tsx`: 1 (💗 "+N yakınlık" özet satırı, :551)
- `app/src/components/EmojiPanel.tsx`: 2 (🎙️ "Mikrofon efektim" başlığı :191, "✓ Açık" :209)
- `app/src/components/room/live-room.tsx`: oda sohbeti hediye sistem satırlarının düz metni ~6 (🎁 … 💎, ör. :1901, :2779). Satır, hediyeyi `gift` alanıyla GiftArt üzerinden resimli çiziyor; emoji yalnız metin yedeği.
- `app/src/app/kabile/sohbet.tsx`: 5 (🪙 fiyat, 🎁 "Aileye … gönderdi" mesajı, ör. :91, :140)
- `app/src/app/kabile/iliski.tsx`: 2 (🪙 fiyat, ör. :118)

## 2. Mağaza (Çarşı), Çanta, VIP, Rütbe, seviyeler

> Kodda durum: Çarşı'daki 14 çerçeve, satıştaki giriş efekti (Ejderha), 3 binek, 3 sohbet balonu, Özel ID'ler, 4 ses dalgası önizlemesi, 6 ücretli + 4 ücretsiz oda süslemesi, 6 koltuk rengi, VIP seti (10 seviye × rozet/çerçeve/balon/giriş + sunucuda entry-icon), VIP hakları ızgarası, 5 Rütbe kademesi (asil-1…5), 11 Cömertlik + 10 Yankı grubu (simge + amblem) ve oda seviyesi resimleri **resimli**; aşağıdakiler eksik olanlar.
> Not: Rütbe adları kodda artık Şövalye / Vikont / Kont / Markiz / Dük (21 Kasım 2026); eski Çavuş…Paşa adları yalnız yorumlarda ve `app/src/app/ayarlar.tsx:329` alt yazısında ("Albay ve üstü") kalmış.

### Çarşı (mağaza)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ses dalgası sekmesi | Çarşı üst sekme şeridi (diğer 4 sekme + Çıkartma paketleri resimli) | emoji 🔊 | `app/src/data/catalog.ts:55`, `app/src/app/magaza.tsx:118-121`, `app/src/components/StoreArt.tsx:9-15` (`wave` yok) |
| Ejderha (en-dragon) kartındaki "Hoş geldin" bandı | Çarşı › Giriş efekti kartı, Çantam kartı (resmin altındaki bant) | emoji 🐉 (başta) + 🔥 (sonda) | `app/src/components/store-item.tsx:96,100`, `app/src/components/fx/entry.tsx:40` |
| Ejderha önizlemesinde bandın arkasından geçen yaratık | Çarşı › Önizle (ve odada giriş efekti) | emoji 🐉 (46 pt) | `app/src/components/fx/entry.tsx:62,126` |
| Binek adı satırı (Scooter / Spor Araba / Özel Jet) | Giriş bandının alt satırı "🛵 ile odaya girdi" (binek resmi ayrıca geçiyor) | emoji 🛵 / 🏎️ / 🛩️ | `app/src/components/fx/entry.tsx:107`, `app/src/app/magaza.tsx:49`, `app/src/data/catalog.ts:89-91` |
| Satın alma onay penceresinin başlığı (tüm ürünler) | Çarşı › fiyat düğmesi › onay | emoji (ürünün `emoji` alanı: 🔊 🪐 🌌 🔥 👑 💠 ❄️ 💗 🌿 🪽 💖 💞 💙 🐉 🛵 🏎️ 🛩️ 🍬 🏆 🔢 ✨ 🌈 💫) | `app/src/app/magaza.tsx:99`, `app/src/data/catalog.ts:59-102` |
| Ekibin eklediği giriş efekti (Yönetim › Mağaza'da ikon yüklenmemişse) | Çarşı / Çantam kartı | boş (yalnız renkli "Hoş geldin" bandı) — Not: ikon panelde isteğe bağlı | `app/src/components/store-item.tsx:91-103`, `server/api/shop-items.mjs:1043` |
Toplam: 6

### Çantam
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Hediyeler sekmesi | Çantam üst sekme şeridi (Çarşı'daki aynı sekmeler resimli) | boş (yalnız yazı) | `app/src/app/canta.tsx:30,77` |
| Çerçeveler sekmesi | Çantam üst sekme şeridi | boş | `app/src/lib/bag-core.ts:73`, `app/src/app/canta.tsx:77` |
| Giriş efektleri (+ binekler) sekmesi | Çantam üst sekme şeridi | boş | `app/src/lib/bag-core.ts:74` |
| Sohbet balonları sekmesi | Çantam üst sekme şeridi | boş | `app/src/lib/bag-core.ts:75` |
| Ses dalgaları sekmesi | Çantam üst sekme şeridi | boş | `app/src/lib/bag-core.ts:76` |
Toplam: 5

Not: Çantam'daki kaynak etiketleri (Çarşı, Yetkili hediyesi, Etkinlik ödülü, Görev ödülü, Seviye ödülü: `app/src/lib/bag-core.ts:35`) yalnız yazı; benzerlerinde de simge olmadığı için listelenmedi.

### Oda süsleri ve koltuk rengi
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Özel süsleme "Kendi görselin" (henüz görsel seçilmemişken) | Oda Süslemesi › Özel sekmesi | Ionicons "image-outline" (gri kutuda) — Not: boş durum yer tutucusu | `app/src/components/room/decor.tsx:501` |
Toplam: 1

Not: 6 ücretli süslemenin resmi `components/room/stage-backdrop.tsx:54-65`'te var (resimsiz karo yedeği `decor.tsx:315` şu an hiçbir öğede çıkmıyor). Koltuk renkleri `SeatPouf` ile renklendirilmiş resim (`seat-color-sheet.tsx:142`).

### VIP (VIP 1–10 ve Abonelik)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Abonelik hakkı "Ziyaretçiler" (Profiline bakanları gör) | VIP › Abonelik › Abonelik Ayrıcalıkları paneli (yuvarlak simge) | Ionicons "eye" | `app/src/data/status.ts:158`, `app/src/lib/levels-live-core.ts:261`, `app/src/components/vip/sub-rights.tsx:68` |
| Abonelik hakkı "Seviyeleri gizle" | VIP › Abonelik › Abonelik Ayrıcalıkları paneli | Ionicons "eye-off" | `app/src/data/status.ts:159`, `app/src/lib/levels-live-core.ts:261` |
| VIP hakkı "Profiline bakanları gör" (`visitors`) | VIP › VIP › hak ızgarası — Not: varsayılan VIP listesinde yok, panel VIP'e açarsa çıkar | emoji 👀 | `app/src/lib/levels-live-core.ts:210`, `app/src/components/vip/vip-rights.tsx:145-146`, `server/api/levels.mjs:47` |
| VIP 11–15 seviyeleri (panel en fazla 15 seviyeye izin veriyor) | VIP › VIP tabela kartı ve VIP seti önizlemeleri — Not: varsayılan 10 seviye | yedek ikon (VIP 10'un tabelası `hero-10.webp` ve 10. set resimleri) | `app/src/lib/vip-screen.ts:8-10,172-174`, `server/api/levels.mjs:135` |
| Genel "VIP" rozeti (seviyesi bilinmeyen VIP kişi) | Kişi kartı adı yanında | yedek ikon (altın renkli kutu + "VIP" yazısı) — Not: yalnız demo verisinde (`mock.ts` `vip: true`) | `app/src/components/ui.tsx:96-104`, `app/src/components/room/person-card.tsx:198` |
Toplam: 5

### VIP hakları ↔ `Art.tsx` `ayricalik-*` eşleşmesi
- VIP hak ızgarasında (canlı sunucu, varsayılan): Rozet, Profil çerçevesi, Seviyeleri gizle, Oda şifresi, VIP mağaza eşyaları, Üyelere özel hediyeler, Sessiz ziyaret tasarımın kendi resimleriyle (`assets/vip/right-*.png`), Sohbet balonu ve Giriş efekti VIP setinin resimleriyle çiziliyor: **eşleşmeyen yok**.
- Eşleşmeyen tek VIP hakkı: `visitors` "Profiline bakanları gör" (`ayricalik-*` resmi yok, emoji 👀; yukarıdaki tabloda).
- Hiçbir hakkın kullanmadığı `ayricalik-*` resimleri (8): `ayricalik-arac`, `ayricalik-kisisel-album-animasyonlu-gorsel`, `ayricalik-ozel-urunu-satin-al`, `ayricalik-profil-araci`, `ayricalik-profil-hediyesi`, `ayricalik-servet-puani-bonusu`, `ayricalik-svip-etiket`, `ayricalik-yukseltme-bildirimleri` (`app/src/components/Art.tsx`). Bunlar aşağıdaki resimsiz/ortak resimli haklara atanabilir mi diye tasarımcıya sorulabilir.

### Rütbe (Şövalye … Dük)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Rütbe hakkı "Özel emoji paketleri" (Yakında) | VIP › Rütbe › Özel Haklar ızgarası (soluk) | emoji 😊 | `app/src/data/status.ts:87`, `app/src/components/vip/noble-page.tsx:93` |
| Rütbe hakkı "Çevrimiçi gizlilik" (Yakında) | VIP › Rütbe › Özel Haklar | emoji 🫥 | `app/src/data/status.ts:92` |
| Rütbe hakkı "Ülke dolaşımı" (Yakında) | VIP › Rütbe › Özel Haklar | emoji 🌍 | `app/src/data/status.ts:93` |
| Rütbe hakkı "Yayın engelleme" (Yakında) | VIP › Rütbe › Özel Haklar | emoji 🔇 | `app/src/data/status.ts:96` |
| Rütbe hakkı "Sıralamada gizemli kimlik" (Yakında) | VIP › Rütbe › Özel Haklar (aynı ızgarada "Seviyeleri gizle" ile aynı resim) | yedek ikon (`ayricalik-gizemli-kisi-kimligi`, başka hakkın resmi) | `app/src/data/status.ts:94` (ve `:79`) |
| Rütbe hakkı "Renkli kullanıcı adı" (Yakında) | VIP › Rütbe › Özel Haklar | yedek ikon (`ayricalik-diy-unvani`, "Kendi unvanını yaz" için çizilmiş) — Not: anlam uyuşmuyor | `app/src/data/status.ts:89` |
| Rütbe hakkı "Oda kenarlığı" (Yakında) | VIP › Rütbe › Özel Haklar | yedek ikon (`ayricalik-oda-profil-arka-plani`) — Not: anlam uyuşmuyor | `app/src/data/status.ts:86` |
| Rütbe simgesi (5 kademe) giriş bandında ve oda giriş mesajında | Odaya girişte bant rozeti "🛡️ VIP 3 · Ada" ve sohbet satırı | emoji 🛡️ / 🗡️ / ⚔️ / 🏹 / 🦁 (asil-1…5 resimleri var, kullanılmıyor) | `app/src/components/room/live-room.tsx:425-427`, `app/src/data/status.ts:42-46` |
| Profil › Rütbe kartı alt yazısı | Profil sekmesi, Rütbe durumu kartı (resmin altında) | emoji kademe simgesi + ad ("🛡️ Şövalye") | `app/src/app/(tabs)/profil.tsx:215` |
| Rütbe fiyatlarının jeton simgesi | VIP › Rütbe alt çubuğu, paket kartları (fiyat, eski fiyat, "Günü"), "Jetonun:", "Al ·" düğmesi | emoji 🪙 (metin içinde; 3D `coin` ikonu var ama `EmojiIcon`/`Icon3D` kullanılmıyor) | `app/src/components/vip/noble-page.tsx:113,182,183,185,191,193` |
Toplam: 10

### Seviyeler (Cömertlik / Yankı)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Yankı ayrıcalığı "Anlar’da paylaşım" (Lv.5) | Seviye › Yankı › "Lv.n ayrıcalıkları" ızgarası (diğerleri resimli) | emoji 📸 | `app/src/data/charm.ts:39`, `app/src/app/seviye.tsx:263`, sunucuda varsayılan açık: `server/api/levels.mjs:125` |
| Rehber: "Ne işe yarar?" (Cömertlik) | Seviye › ? rehberi, bölüm başlığı (ilk bölüm resimli) | Ionicons "gift-outline" | `app/src/app/seviye.tsx:287` |
| Rehber: "Puan nasıl kazanılır?" (Cömertlik) | Seviye › ? rehberi | Ionicons "trending-up" | `app/src/app/seviye.tsx:288` |
| Rehber: "Sayılmayanlar" (Cömertlik) | Seviye › ? rehberi | Ionicons "alert-circle-outline" | `app/src/app/seviye.tsx:289` |
| Rehber: "Ne işe yarar?" (Yankı) | Seviye › ? rehberi | Ionicons "diamond-outline" | `app/src/app/seviye.tsx:293` |
| Rehber: "Puan nasıl kazanılır?" (Yankı) | Seviye › ? rehberi | Ionicons "trending-up" | `app/src/app/seviye.tsx:294` |
| Rehber: "Dikkat" (Yankı) | Seviye › ? rehberi | Ionicons "alert-circle-outline" | `app/src/app/seviye.tsx:295` |
| Rehber: "Seviye tablosu" | Seviye › ? rehberi, son kart | Ionicons "list" | `app/src/app/seviye.tsx:330` |
| Panelde eklenen 12.+ Cömertlik / 11.+ Yankı grubu (en fazla 20) | Seviye grup amblemi ve rozet — Not: varsayılan 11/10 grup | yedek ikon (son grubun simge ve amblemi tekrar) | `app/src/lib/levels-live-core.ts:162`, `server/api/levels.mjs:135` |
Toplam: 9

Not: Seviye ödülleri (`server/api/level-rewards.mjs`) Çantam'a mağaza ürünü olarak düşüyor; resimleri o ürünün kendi resmi (yukarıdaki Çarşı/Çantam satırları geçerli). Seviye rozetleri (`WealthBadge`/`CharmBadge`) tüm gruplarda resimli.

### Kalp seviyesi (sohbet kalbi)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Lv.0 "Başlangıç" kalbi | Sohbet / 1v1 kalp göstergesi, profil kalp kartı (diğer 5 görünüm resimli) | Ionicons "heart-outline" | `app/src/components/heart-level.tsx:182`, `app/src/lib/heart-tiers.ts:34`, resimliler `heart-level.tsx:39-45` |
| Sohbet kalbi rozeti "Lv.n" içindeki simge | Sohbet listesi / başlık rozeti (turkuaz hap) | Ionicons "chatbubble-ellipses" (Lv.0: "chatbubble-outline") | `app/src/components/heart-level.tsx:231` |
| Sohbet kalbi işareti (kalbin arkasındaki konuşma balonu) | ChatHeartMark | Ionicons "chatbubble" | `app/src/components/heart-level.tsx:193` |
| Sonsuz (Lv.9–10) rozetinin köşe yıldızı | Sohbet kalbi rozeti | Ionicons "sparkles" | `app/src/components/heart-level.tsx:234` |
| Yükselen küçük kalpler (Tutku, Sonsuz) | Kalbin üstünde efekt — Not: efekt parçası | Ionicons "heart" | `app/src/components/heart-level.tsx:151` |
Toplam: 5

### Oda seviyesi ve oda katkısı
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Oda seviyesi çipi (Lv.1–15) | Kullanıcı profili › "Oda" kartı | emoji 🥉 🥈 🥇 🏅 🎖️ 💜 💎 👑 🔱 (`ROOM_LEVEL_ICONS`) — Not: `RoomArt.roomLevelArt` resimleri hazır, burada kullanılmıyor | `app/src/app/kullanici/[id].tsx:1036`, `app/src/data/catalog.ts:533`, `app/src/components/RoomArt.tsx:29-51` |
| Katkı sıralaması düğmesi (ilk 3 kişi yokken) | Oda üst çubuğu | Ionicons "trophy" (3D `trophy` ikonu var) | `app/src/components/room/live-room.tsx:3877` |
| Oda kartı kısayolu "Katkı sıralaması" | Oda kartı kısayol satırı — Not: bu satırdaki tüm kısayollar Ionicons, oda bölümüyle çakışabilir | Ionicons "trophy-outline" | `app/src/components/room/live-room.tsx:3394` |
| Katkı sıralaması kilitli (oda Lv.3 altı) | Katkı sıralaması paneli — Not: boş durum | Ionicons "lock-closed" (28 pt) | `app/src/components/room/contrib-board.tsx:217` |
| Katkı sıralaması bağlantı yok | Katkı sıralaması paneli — Not: boş durum | Ionicons "cloud-offline-outline" | `app/src/components/room/contrib-board.tsx:148` |
Toplam: 5

### Para ürünleri (mağaza/VIP bağlamı)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Jeton paketleri p1–p9 (1.000 … 1.000.000 jeton), mağazanın canlı paketleri ve test paketleri | Cüzdan › Jeton yükle ızgarası | yedek ikon (hepsinde aynı 3D `coin`, pakete özel resim yok) | `app/src/app/cuzdan.tsx:362`, `app/src/data/status.ts:183-193` |
Toplam: 1

Not: Elmas → jeton Çevir (`components/exchange-sheet.tsx:101,135,145`) 3D `diamond`/`coin` ile resimli. Abonelik plan kartları tasarımın taç resimleriyle (`assets/vip/sub`).

### Metin içi emoji
- `app/src/app/magaza.tsx`: 1 (ör. "✓ Açık" `:154`)
- `app/src/components/store-item.tsx`: 1 (ekip balonu önizlemesi "Merhaba! 👋" `:127`)
- `app/src/app/vip.tsx`: 1 ("Abonelik aktif 🎉" `:214`)
- `app/src/components/vip/noble-page.tsx`: 4 (ör. "✓ Şövalye · …" `:67`, "🛡️ Şövalye oldun!" `:149`, uyarılarda 🪙 `:138,:143`)
- `app/src/components/room/owner.tsx`: 2 (oda seviye tablosunda ✅ / 🔒 `:209`)
- `app/src/components/room/live-room.tsx`: 2 ("🎉 Oda seviyesi Lv.n oldu!" `:1554`, giriş mesajında varsayılan ✨ `:426`)

### Yönetim ekranları
Uygulamada bu bölüme ait yönetim ekranı yok (Mağaza, Seviye ve VIP ayarları, Seviye ödülleri finans panelinde: `server/api/shop-items.mjs`, `levels-admin.mjs`, `level-rewards.mjs` yalnız API). Toplam: 0

Kapsam dışı bırakılanlar: çıkartma paketi resimleri (Çarşı › Çıkartma paketleri sekmesi `StickerArt` ile çiziliyor, çıkartma bölümüne ait), mikrofon efektleri / oda animasyonları (`data/animations.ts`), cüzdan menü satırları ve `coins-bank.tsx` metinleri. Özel ID'lerin üçü de aynı madalyonu (`ozel-id-ozel-id`) ve altında numarayı gösteriyor; tasarım gereği sayıldı, listelenmedi.

Kapsam: profil izleri/rozet/madalya/unvan, yetkili ve yayıncı rozetleri, profil ek bilgileri, bağlar, aile/kabile, ajans, bildirimler, mesajlar/sohbet, sosyal/keşfet. Tekrarlar bir kez sayıldı: "Bildirimler" menü satırı Profil bölümünde, aile/ajans grup sohbeti hızlı eylemleri Aile/Ajans bölümlerinde.

## 3. Profil: izler, rozetler, madalyalar, unvanlar, yetkili/yayıncı rozetleri, ek bilgiler

### Profil izleri (Muzip hediyeler)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Kırık Cam izi (`kirik-cam`) | Profil fotoğrafı üstündeki iz katmanı | yedek ikon: kodla çizilmiş geçici resim (`assets/marks/kirik-cam.png`, `scripts/kirik-cam-art.py`), gerçek sanat panelden yüklenmedikçe bu görünür | `app/src/components/profile-mark.tsx:24`, `docs/PROFIL_IZLERI.md:122` |
| Panelde açılan yeni iz türleri (ör. Çamur Bombası gibi) | Profil fotoğrafı üstü | Panelden resim yüklenmediyse yedek ikon: yalnız hediyenin küçük rozeti (`GiftArt`), panelden eklenen hediyenin resmi de yoksa emoji | `app/src/lib/profile-marks.ts:230`, `server/api/mark-kinds.mjs:120` |
| İz temizlenince parıltı (Kaka dışındaki türler) | Fotoğraf üstünde temizleme animasyonu | Ionicons "sparkles" (Kaka İzi'nde ise `su-sicrama.png` resmi var) | `app/src/components/profile-mark.tsx:126` |
| İz/temizlik hediyesi emojisi bilinmediğinde | İz rozeti, "Profilindeki iz" notu | emoji 💩 / 💧 (sunucudan emoji gelmezse yedek) | `app/src/lib/profile-marks.ts:117`, `app/src/lib/profile-marks.ts:128`, `server/api/profile-marks.mjs:45` |

Not: Cam Tamiri (Kırık Cam'ı temizleyen hediye) uygulamada derlenmiş resmi olan bir hediye değil; panelde yüklenen ikonu kullanılıyor (`docs/gorseller/muzip/cam-tamiri-512.png` da kodla çizilmiş geçici resim).

Toplam: 4

### Profil rozet satırı ve bağlılık hapları
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Cinsiyet + yaş rozeti (Kadın/Erkek) | Profil başlığı rozet satırı, listeler | Ionicons "female" / "male" (oysa `Art` içinde `cinsiyet-kadin` / `cinsiyet-erkek` resmi var, yalnız kayıt ekranında kullanılıyor) | `app/src/components/profile-badges.tsx:51` |
| "Gizli cinsiyet" işareti | Cinsiyet rozetinde (yalnız sahibine) | Ionicons "eye-off" | `app/src/components/profile-badges.tsx:53` |
| Yetkili rozeti: Yönetici / Moderatör | Profil başlığı rozet satırı | Ionicons "shield-checkmark" + renkli kutu | `app/src/app/kullanici/[id].tsx:770` |
| Doğrulanmış rozeti | Profil rozet satırı, isim yanları | Ionicons "checkmark-circle" (mavi) | `app/src/components/ui.tsx:93` |
| Ajans hapı | Profil başlığı, isim altı | Ionicons "business" + emoji 🏢 (canlıda her ajans için aynı) | `app/src/components/profile-badges.tsx:79`, `app/src/components/profile-badges.tsx:143` |
| Aile hapı | Profil başlığı, isim altı | Ionicons "people" (+ demoda aile emojisi) | `app/src/components/profile-badges.tsx:148` |
| "Ajans yok · Katıl" / "Aile yok · Katıl" hapları | Kendi profilim | Ionicons "business" / "people" (kesik çizgili boş hap) | `app/src/components/profile-badges.tsx:145`, `app/src/components/profile-badges.tsx:150` |

Toplam: 7

### Profil sayfası kartları (Bağlar, Temel Bilgiler, Vitrin başlıkları)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Hakkımda kartı | Profil › Hakkımda | Ionicons "chatbubble-ellipses-outline" (IconTile) | `app/src/app/kullanici/[id].tsx:831` |
| Arkadaşlık Sloganı kartı | Profil | Ionicons "pencil-outline" | `app/src/app/kullanici/[id].tsx:844` |
| Doğrulama kartı | Profil | Ionicons "checkmark-circle" / "shield-checkmark-outline" | `app/src/app/kullanici/[id].tsx:853` |
| Temel Bilgiler kartı başlığı | Profil | Ionicons "person-outline" | `app/src/components/profile-design.tsx:443` |
| Temel Bilgiler satırları: ID, Kullanıcı adı, Cinsiyet, Ülke, Doğum Günü, Üyelik, İlişki Durumu, Eğitim (8 satır) | Profil › Temel Bilgiler | Ionicons "keypad-outline", "at-outline", "female/male-outline", "flag-outline", "calendar-outline", "ribbon-outline", "heart-outline", "school-outline" | `app/src/app/kullanici/[id].tsx:864-905` |
| Cinsiyet değeri | Temel Bilgiler › Cinsiyet | Ionicons "female" / "male" (cinsiyet resmi var, kullanılmıyor) | `app/src/app/kullanici/[id].tsx:876` |
| Albüm kartı başlığı | Profil | Ionicons "images-outline" | `app/src/app/kullanici/[id].tsx:962` |
| Kişisel Profil kartı başlığı | Profil | Ionicons "flame-outline" | `app/src/app/kullanici/[id].tsx:1002` |
| Oda kartı başlığı | Profil | Ionicons "headset-outline" | `app/src/app/kullanici/[id].tsx:1026` |
| Vitrin Öğeleri başlığı | Profil | Ionicons "gift-outline" | `app/src/app/kullanici/[id].tsx:1046` |
| Ajans / Aile bölüm başlıkları | Profil › Bağlar | Ionicons "business" / "people" | `app/src/app/kullanici/[id].tsx:1074-1075` |
| Ajans / Aile amblem kutusu (LinkCard) | Profil › Bağlar | Ajans: emoji 🏢; Aile: Ionicons "heart" (aile amblemi yokken) | `app/src/components/profile-design.tsx:500`, `app/src/app/kullanici/[id].tsx:1289` |
| Bağlantılar bölüm başlığı | Profil › Bağlar | Ionicons "link" | `app/src/app/kullanici/[id].tsx:1076` |
| Arkadaş / Takipçi / Takip hapları | Profil › Bağlar › Bağlantılar | Ionicons "people-outline", "person-add-outline", "person-outline" | `app/src/app/kullanici/[id].tsx:1079-1081` |
| Bağlar bölüm başlığı | Profil › Bağlar | Ionicons "heart-circle-outline" | `app/src/app/kullanici/[id].tsx:1085` |
| Madalyalar / Unvanlar kart başlıkları | Profil › Onur | Ionicons "medal-outline" / "ribbon-outline" | `app/src/app/kullanici/[id].tsx:1425`, `app/src/app/kullanici/[id].tsx:1430` |
| Binekler / Giriş Efektleri / Hediye Koleksiyonu / Hediye Kataloğu kart başlıkları | Profil › Onur/Vitrin | Ionicons "car-sport-outline", "sparkles-outline", "gift-outline", "albums-outline" | `app/src/app/kullanici/[id].tsx:1448-1478` |
| İlişki Duvarı başlık simgesi, çift yüz arasındaki kalp, gün hapı kalbi | Profil › İlişki Duvarı | Ionicons "heart" (duvarın büyük resmi `iliski.png` var; küçük simgeler Ionicons) | `app/src/components/profile-design.tsx:205`, `:214`, `:266` |
| Defne yaprakları (gün sayısının iki yanı) | Profil › İlişki Duvarı | Ionicons "leaf" ×2 (kişi kartında `defne-sol` / `defne-sag` resmi var, burada kullanılmıyor) | `app/src/components/profile-design.tsx:225-227` |
| Koruma Duvarı: koruyucu yok yuvası / puan kalkanı | Profil › Koruma | Ionicons "shield-outline" / "shield" | `app/src/components/profile-design.tsx:313`, `:319` |
| Hediye Duvarı başlık simgesi | Profil › Hediye Duvarı | Ionicons "gift" | `app/src/components/profile-design.tsx:385` |

Not: Bu kartların hepsi `profile-design.tsx` paketindeki Ionicons tabanlı IconTile/CardHead ile çiziliyor; tasarımcı paketinde bu kart simgeleri resim olarak teslim edilmemiş. Profil sayfasının diğer öğeleri (alt eylem çubuğu, ⋯ menüsü) "Sosyal/keşfet" bölümüne bırakıldı.

Toplam: 21

### Madalyalar ve unvanlar
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Unvan: Gece Kuşu (t1) | Profil › Onur › Unvanlar | boş (yalnız renkli gradyan yazı; madalyaların resmi var) | `app/src/data/profile.ts:157` |
| Unvan: Oda Efsanesi (t2) | Profil › Onur › Unvanlar (sunucu bunu gerçekten veriyor) | boş | `app/src/data/profile.ts:158`, `server/api/profiles.mjs:261` |
| Unvan: Melodi Perisi (t3) | Profil › Onur › Unvanlar (demo) | boş | `app/src/data/profile.ts:159` |
| Unvan: Sohbet Ustası (t4) | Profil › Onur › Unvanlar (demo) | boş | `app/src/data/profile.ts:160` |
| Unvan: Yükselen Yıldız (t5) | Profil › Onur › Unvanlar (sunucu bunu gerçekten veriyor) | boş | `app/src/data/profile.ts:161`, `server/api/profiles.mjs:262` |
| Unvan: Altın Ses (t6) | Profil › Onur › Unvanlar (demo) | boş | `app/src/data/profile.ts:162` |
| Madalya sayacı (altın / gümüş) | Madalyalar kart başlığının sağı | emoji 🏅 / 🥈 | `app/src/app/kullanici/[id].tsx:1425` |

Not: Madalyaların altısının (md1–md6) da `rozet-*` resmi var, listelenmedi. Unvanlar bilerek yazı-rozet olabilir; tasarım kararı gerekiyor.

Toplam: 7

### Profil ek bilgileri (ilgi alanları, burç, etiketler, ilişki, eğitim)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| İlgi alanları (10 adet: Karaoke, Oyun, Sohbet, Spor, Seyahat, Film, Dans, Kitap, Müzik, Kahve) | Profil › Kişisel Profil hapları | emoji 🎤🎮💬⚽✈️🎬💃📚🎧☕ (oysa `ilgi-*` resimlerinin 10'u da `Art` içinde var; yalnız kayıt ekranı kullanıyor) | `app/src/app/kullanici/[id].tsx:1011`, `app/src/data/mock.ts:35`, `app/src/data/profile-art.ts:5` |
| İlgi alanı: Karaoke, Seyahat, Kitap, Müzik, Kahve | Oda kişi kartı / vitrin ilgi satırı (InterestRow) | emoji 🎤 ✈️ 📚 🎧 ☕ (yalnız Sohbet, Dans, Spor, Oyun, Film için kişi-kartı resmi var) | `app/src/components/person-showcase.tsx:94-113` |
| Bilinmeyen / emojisiz ilgi alanı | InterestRow | "•" nokta | `app/src/components/person-showcase.tsx:88` |
| Boy | Kişisel Profil hapı | Ionicons "resize-outline" | `app/src/app/kullanici/[id].tsx:1005` |
| Kilo | Kişisel Profil hapı | Ionicons "barbell-outline" | `app/src/app/kullanici/[id].tsx:1006` |
| Meslek | Kişisel Profil hapı | Ionicons "briefcase-outline" | `app/src/app/kullanici/[id].tsx:1007` |
| Diller | Kişisel Profil hapı | Ionicons "language-outline" | `app/src/app/kullanici/[id].tsx:1008` |
| Burç (12 burç: Koç … Balık) | Kişisel Profil hapı | Ionicons "star-outline" (her burç aynı yıldız) | `app/src/app/kullanici/[id].tsx:1009`, `app/src/data/profile.ts:25` |
| Burç seçenekleri (12) | Profili düzenle › Burç | boş (yalnız yazı; Kişilik Etiketleri seçenekleri emoji/resimli) | `app/src/components/profile-extras-form.tsx:43` |
| Kişilik Etiketleri seçenekleri (12) | Profili düzenle › Kişilik Etiketleri | emoji 🏀🍖🎸🎤☕🎮📚✈️🌙😂🐱💃 (her birinin `etiket-*` resmi var ama form yazı+emoji kullanıyor; profilde resim görünüyor) | `app/src/components/profile-extras-form.tsx:46`, `app/src/data/profile.ts:32-45` |
| İlişki Durumu seçenekleri (Bekar, İlişkisi var, Belirtilmemiş) | Profili düzenle | boş (yalnız yazı) | `app/src/components/profile-extras-form.tsx:49`, `app/src/data/profile.ts:28` |
| Eğitim seçenekleri (Lise, Ön lisans, Lisans, Yüksek lisans) | Profili düzenle | boş (yalnız yazı) | `app/src/components/profile-extras-form.tsx:52`, `app/src/data/profile.ts:29` |

Not: İlişki Durumu / Eğitim / Burç / Diller seçenekleri düz yazı çipleri; "boş" olarak listelendi çünkü aynı formdaki Kişilik Etiketleri simgeli. Simge istenip istenmediği tasarım kararı.

Toplam: 12

### VIP / Rütbe hakları (data/status.ts)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|

Not: VIP/Rütbe bölümünü tarayan başka bir parça varsa çakışabilir. VIP 1–10 seviyeleri, Rütbe kademeleri ve diğer hakların hepsinin resmi var (Art.tsx'te dosyaları doğrulandı).

Toplam: 0 (6 satır başka bölümde sayıldı)

### Yayıncı Merkezi ve yayıncı rozetleri
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Yayıncı seviyeleri (Lv.1 Çaylak, Lv.2 Yükselen, Lv.3 Popüler, Lv.4 Yıldız, Lv.5 Süperstar) | Yayıncı Merkezi › seviye satırı | boş (yalnız "Lv.N ad" yazısı; Cömertlik/Yankı/VIP seviyelerinin rozet resmi var) | `app/src/app/yayinci/index.tsx:191`, `app/src/data/economy.ts:11-17` |
| "Ajanslı yayıncı" durum kutusu | Yayıncı Merkezi | emoji 🏢 (yanındaki "Ajanssız yayıncı" durumunun `finans-ajanssiz-yayinci` resmi var) | `app/src/app/yayinci/index.tsx:171` |
| Ajans kartı (ajans logosu yoksa / "Bir ajansa katıl") | Yayıncı Merkezi | emoji 🏢 | `app/src/app/yayinci/index.tsx:230` |
| Son kazançlar: Görev, Ajans bonusu, Oda sahibi bonusu, Aile bonusu, Arama bonusu, Cazibe bonusu (6 kaynak) | Yayıncı Merkezi › Son kazançlar | emoji ⭐ (yalnız Hediye ve Arama'nın resmi var) | `app/src/app/yayinci/index.tsx:248`, `app/src/store.tsx:50` |
| Elmas bakiyesi | Yayıncı Merkezi üst kart, Para çek | emoji 💎 (Icon3D "diamond" var ama düz yazı içinde, EmojiIcon kullanılmıyor) | `app/src/app/yayinci/index.tsx:137`, `app/src/app/yayinci/cek.tsx:191` |
| Kilitli / çekilebilir elmas hapları | Yayıncı Merkezi bakiye kartı | Ionicons "lock-open" / "lock-closed" | `app/src/app/yayinci/index.tsx:142`, `:146` |
| Para çek / Anında bozdur düğmeleri | Yayıncı Merkezi bakiye kartı | Ionicons "cash-outline" / "flash-outline" | `app/src/app/yayinci/index.tsx:153`, `:158` |
| Para çekilemez uyarı kartı | Para çek | Ionicons "lock-closed" | `app/src/app/yayinci/cek.tsx:177` |

Not: `server/api/streamer-rule.mjs` yalnız kural/sayı tutuyor; sunucuda yayıncı rozeti/simgesi alanı yok. Mesaj Performansım ve Otomatik Mesajlarım ekranlarında simgeli öğe yok (yalnız metin içi 💎).

Toplam: 8

### Profil sekmesi menüsü (kendi profilim)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Üye ağım ve komisyonlar | Profil sekmesi menüsü (ajans üyesi, demo) | Ionicons "git-network-outline" (yanındaki satırlarda Icon3D var) | `app/src/app/(tabs)/profil.tsx:46` |
| Bildirimler | Profil sekmesi menüsü | Ionicons "notifications-outline" | `app/src/app/(tabs)/profil.tsx:50` |
| Müşteri hizmetleri | Profil sekmesi menüsü | Ionicons "headset-outline" | `app/src/app/(tabs)/profil.tsx:59` |
| Güvenlik Merkezi | Profil sekmesi menüsü | Ionicons "shield-checkmark-outline" | `app/src/app/(tabs)/profil.tsx:60` |
| Ayarlar | Profil sekmesi menüsü | Ionicons "settings-outline" | `app/src/app/(tabs)/profil.tsx:61` |
| Kimlik Doğrulamam | Profil sekmesi menüsü | Ionicons "checkmark-circle-outline" | `app/src/app/(tabs)/profil.tsx:115` |
| Etkinliklerim | Profil sekmesi menüsü | Ionicons "calendar-outline" | `app/src/app/(tabs)/profil.tsx:122` |

Not: Menüde Gelir, Jeton Noktası, Çarşı, Çantam, Cömertlik ve Yankı, Benim Koruma, Yayıncı Merkezi, Ajans, Sıralama, Hemen Tanış satırları Icon3D kullanıyor; listelenenler yalnız Ionicons. Ayarlar/menü bölümünü tarayan başka parça varsa çakışabilir.

Toplam: 7

### Metin içi emoji
- `app/src/app/yayinci/index.tsx`: 6 (💎 ×5 tutar yanında, 🎉 "En yüksek seviyedesin"; ör. `💎 ${weekTotal}`, `Net hak edişin 💎`).
- `app/src/app/yayinci/performans.tsx`: 3 (💎 "Mesajlardan kazanılan", "Kaçırılan kazanç", gün ayrıntısı).
- `app/src/lib/profile-marks.ts`: iz bildirim/toast metinleri hediyenin emojisini cümleye koyuyor (ör. "Ayşe sana 💩 attı; …"), 4 cümle şablonu (`:190-212`).
- `app/src/app/kullanici/[id].tsx`: 4 (⏳ ×2 fotoğraf incelemede/yükleniyor, ⚠️ kısıtlı hesap, ⛔ askıya alındı; `:751-781`).
- `app/src/app/(tabs)/profil.tsx`: 1 (Rütbe kutusunun alt satırı `${noble.emoji} ${noble.name}`, `:215`).

### Yönetim ekranları
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Rol ve Yetki Merkezi başlığı | Yetki (demo) | Ionicons "options-outline" | `app/src/app/yetki.tsx:149` |
| "İşlem yapan" seçici | Yetki (demo) | Ionicons "person-circle-outline" | `app/src/app/yetki.tsx:62` |
| İzin yasak işareti | Yetki › İzinleri seç | emoji ⛔ | `app/src/app/yetki.tsx:192` |
| Korumalı rol kilidi | Yetki › Rol seç | Ionicons "lock-closed" | `app/src/app/yetki.tsx:161` |
| Profil menüsü yönetim satırları: Oyun kataloğu, Animasyon kataloğu, PK, Şanslı hediye, Rol ve Yetki Merkezi, Ajans başvuru yönetimi (6, demo) | Profil sekmesi menüsü | Ionicons "game-controller-outline", "sparkles-outline", "flash-outline", "leaf-outline", "key-outline", "briefcase-outline" | `app/src/app/(tabs)/profil.tsx:51-56` |
| İz önizleme | Yönetim › Hediyeler › İz türlerini önizle | yalnız gezinme glifleri; panel türü resimsizse yedek rozet 🎁 | `app/src/app/iz-onizleme.tsx:84` |

Toplam: 6

## 4. Bağlar

### Bağ türleri (Bağ kur menüsü, oda sohbeti bağ çipi)
Bağ türlerinin 8'inin de resmi var (`app/assets/bonds/bag-*.png`, `BOND_ART` `app/src/components/bond-mark.tsx:14-23`). BondMark, profildeki bağ rozeti ve "Aile ve Dost" rafı bu resimleri kullanıyor. Aşağıdaki iki yer ise hâlâ `BOND_KINDS[k].icon` Ionicons'unu gösteriyor: "Bağ kur" menüsünün satırları (`app/src/components/bonds.tsx:397`) ve odada sohbetteki "Çift Lv10" çipi (`app/src/components/room/room-bonds.tsx:121`).

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Çift (Bağ Yüzüğü) | Bağ kur menüsü satırı, oda sohbetinde bağ çipi | Ionicons "heart" (resim var: bag-cift.png) | `app/src/data/bonds.ts:16` |
| Kardeş (Kardeş Bilekliği) | aynı | Ionicons "people" (resim var: bag-kardes.png) | `app/src/data/bonds.ts:17` |
| Bacı (Bacı Kolyesi) | aynı | Ionicons "flower" (resim var: bag-baci.png) | `app/src/data/bonds.ts:18` |
| Ağabey (Ağabey Saati) | aynı | Ionicons "shield" (resim var: bag-agabey.png) | `app/src/data/bonds.ts:19` |
| Abla (Abla Broşu) | aynı | Ionicons "sparkles" (resim var: bag-abla.png) | `app/src/data/bonds.ts:20` |
| Yenge (Yenge Çiçeği) | aynı | Ionicons "rose" (resim var: bag-yenge.png) | `app/src/data/bonds.ts:21` |
| Enişte (Enişte Kravatı) | aynı | Ionicons "ribbon" (resim var: bag-enishte.png) | `app/src/data/bonds.ts:22` |
| Kanka (Kanka Rozeti) | aynı | Ionicons "hand-left" (resim var: bag-kanka.png) | `app/src/data/bonds.ts:23` |

Not: Bunlar için yeni çizim gerekmiyor, satırlarda mevcut `BOND_ART` resmini kullanmak yeterli (kod işi).

Toplam: 8

### Bağ ödülleri ve bağ eylemleri
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Bağ çerçevesi (Lv6 ödülü) | Profil fotoğrafının çevresi | yedek ikon (renkli gradyan halka; çerçeve resmi yok) | `app/src/components/bonds.tsx:143-153` |
| Bağ sohbet balonu (Lv10 ödülü) | Oda sohbetinde mesaj balonu | yedek ikon (bağ rengiyle gradyan kutu; balon resmi yok) | `app/src/components/room/room-bonds.tsx:107-113` |
| Ortak giriş bandı (Lv8 ödülü) | Odaya birlikte giriş bandı | boş (yalnızca "Çift Lv8" yazısı; bağ resmi/işareti yok). Not: bandın kendisi oda bölümünün `fx: 'bond'` çizimi | `app/src/components/room/live-room.tsx:280-291` |
| Bağ işareti parıltısı (Lv16–20) | BondMark halkasının köşesi | metin glifi ✦ (U+2726, resim değil) | `app/src/components/bond-mark.tsx:65` |
| Bağ hediyesi adet menüsü (×1…×100) | Bağ satırı › Bağ hediyesi gönder sayfası | Ionicons "gift" (bağ hediyesinin resmi var) | `app/src/components/bonds.tsx:384` |
| "Bağ hediyesi gönder" düğmesi | Profil › Bağlar › bağ kartı | Ionicons "gift". Not: düğme; isterseniz türün resmi kullanılabilir | `app/src/components/bonds.tsx:466` |

Toplam: 6

### Metin içi emoji (Bağlar)
- `server/api/bond-life.mjs`: bildirim başlıklarında 5 yer, ör. "🔗 Bağ isteği", "🔗 Bağ kuruldu", "⚠️ Bağın bitmek üzere", "💎" (satır 89, 116, 125, 126, 253).
- `app/src/components/room/live-room.tsx:2827`: bağ isteği sistem mesajında 1 tane "🤝" (oda bölümüne ait).

## 5. Aile / Kabile

### Aile kimliği (amblem, rütbe, seviye)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Aile amblemi (canlı) | Aile listesi, davetler, aile başlık bandı | yedek ikon (liderin profil fotoğrafı ya da baş harf; sunucuda amblem/logo alanı yok) | `app/src/components/family-live.tsx:158`, `:206`, `:304`; `server/api/families.mjs:72` |
| Aile amblemi (demo) | Demo aile listesi, aile başlığı, sıralama, aile sohbeti başlığı | emoji (ailenin `emoji` alanı; yeni aile 🏰) | `app/src/app/aile.tsx:119`, `:261`, `:697`; `app/src/app/kabile/sohbet.tsx:102`; `app/src/data/kabile.ts:46` |
| Lider rütbesi | Üye listesi rozeti | canlı: boş (yalnızca "Lider" yazısı); demo: emoji 👑 (Text içinde; EmojiIcon kullanılmadığı için 3D taç da görünmüyor) | `app/src/components/family-live.tsx:481`, `app/src/lib/live/family.ts:31`, `app/src/app/aile.tsx:52` |
| Yardımcı rütbesi | Üye listesi rozeti | canlı: boş ("Yardımcı" yazısı); demo: emoji 🛡️ | `app/src/components/family-live.tsx:481`, `app/src/app/aile.tsx:52` |
| Aile seviyesi rozeti (Lv.1–15) | Aile başlık bandı, aile listesi | boş (yalnızca "Lv.N" yazısı) | `app/src/components/family-live.tsx:317`, `:212` |
| Güç kademesi Demir I–II | Demo aile seviye kartı | boş (kademe adı yazı + genel Ionicons "shield-checkmark-outline") | `app/src/data/kabile.ts:108-109`, `app/src/app/aile.tsx:290`, `:297` |
| Güç kademesi Bronz I–II | aynı | aynı | `app/src/data/kabile.ts:110-111` |
| Güç kademesi Gümüş I–II | aynı | aynı | `app/src/data/kabile.ts:112-113` |
| Güç kademesi Altın I–II | aynı | aynı | `app/src/data/kabile.ts:114-115` |
| Güç kademesi Platin I–III | aynı | aynı | `app/src/data/kabile.ts:116-118` |
| Güç kademesi Efsane | aynı | aynı | `app/src/data/kabile.ts:119` |
| Katkı seviyeleri (Büyüyor, Aktif, Destekçi, Çekirdek, Efsane) | Demo Görevler › Katkım | boş ("Lv.N" çipi + ad yazısı) | `app/src/data/kabile.ts:154-158`, `app/src/app/kabile/merkez.tsx:188-189` |
| Aile rozet çipi (ör. "Gece") | Demo aile başlığı | emoji 🏷️ | `app/src/app/aile.tsx:268` |
| Güç çarpanı çipi | Demo aile başlığı | emoji 🔥 | `app/src/app/aile.tsx:269` |
| Aile etiketleri (Yeni Aile, Premium Sandık, Sohbet Tutkunu, Çift Dolu, Karaoke, Müzik Sever, Oyuncu, Quiz, Şehir, Sohbet) | Demo aile profili etiket satırı | emoji 🌱🎁💬💞🎤🎶🎮🧠🌉☕ | `app/src/data/kabile.ts:86`, `:92-95`; `app/src/app/aile.tsx:362` |
| Aile temaları (Gece Moru, Kızıl Ay, Zümrüt Orman, Gece Mavisi, Altın Saray, Galaksi) | Aile ayarları › Tema seçici | yedek ikon (renkli gradyan kutu) | `app/src/components/family-live.tsx:713`, `app/src/app/aile.tsx:868`, `app/src/data/kabile.ts:215-220` |

Not: Güç kademeleri yalnızca demoda görünüyor; canlı aile ekranında güç kademesi yok, yalnızca Lv var.

Toplam: 16

### Aile görevleri
Canlıda görev satırları Ionicons kullanıyor (`TASK_ICON`, `app/src/components/family-center-live.tsx:33-41`, çizim `:279`). Demoda görevlerin `emoji` alanı gösteriliyor (`app/src/app/kabile/merkez.tsx:222`, `app/src/app/aile.tsx:768`).

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Aile sohbetine mesaj at (k-chat) | Görevler listesi | canlı: Ionicons "chatbubbles-outline"; demo: emoji 💬 (Text içinde) | `app/src/components/family-center-live.tsx:34`, `app/src/data/kabile.ts:184` |
| Aile odasında 15 dk kal (k-room) | aynı | canlı: Ionicons "mic-outline"; demo: emoji 🎙️ | `app/src/components/family-center-live.tsx:35`, `app/src/data/kabile.ts:185` |
| Yeni üyeye hediye gönder (k-newbie) | aynı | canlı: Ionicons "gift-outline"; demo: emoji 🎁 | `app/src/components/family-center-live.tsx:36`, `app/src/data/kabile.ts:186` |
| Aile yoklaması (k-checkin) | aynı | canlı: Ionicons "calendar-outline"; demo: emoji 📅 | `app/src/components/family-center-live.tsx:37`, `app/src/data/kabile.ts:187` |
| Aile odasında hediye (k-roomgift) | aynı | canlı: Ionicons "sparkles-outline"; demo: emoji 🎉 | `app/src/components/family-center-live.tsx:38`, `app/src/data/kabile.ts:188` |
| İkili kur, Çift hediyesi (k-cp) | aynı | canlı: Ionicons "heart-outline"; demo: emoji 💞 | `app/src/components/family-center-live.tsx:39`, `app/src/data/kabile.ts:189` |
| Aile sohbetinde hediye (k-chatgift) | aynı | canlı: Ionicons "mail-outline"; demo: emoji 💌 | `app/src/components/family-center-live.tsx:40`, `app/src/data/kabile.ts:190` |

Toplam: 7

### Aile sandıkları ve kasa
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ahşap Sandık (c1) | Canlı Görevler › haftalık sandıklar | Ionicons "cube" (renkli). Resmi var (`kabile-ahsap-sandik`, `app/src/components/Art.tsx:155`) ama canlı ekran kullanmıyor | `app/src/components/family-center-live.tsx:243` |
| Yeşil Sandık (c2) | aynı | Ionicons "cube" (resim var: `kabile-yesil-sandik`, `Art.tsx:158`) | `app/src/components/family-center-live.tsx:243` |
| Mavi Sandık (c3) | aynı | Ionicons "cube" (resim var: `kabile-mavi-sandik`, `Art.tsx:157`) | `app/src/components/family-center-live.tsx:243` |
| Kırmızı Sandık (c4) | aynı | Ionicons "cube" (resim var: `kabile-kirmizi-sandik`, `Art.tsx:156`) | `app/src/components/family-center-live.tsx:243` |
| Aile Sandığı puanı (birim) | Demo Görevler hero, görev ödülleri, kasa, Veri Merkezi | emoji 🔮 | `app/src/app/kabile/merkez.tsx:136`, `:228`; `app/src/app/kabile/kasa.tsx:164`; `app/src/app/aile.tsx:661` |
| Haftalık sandıklar kartı | Demo aile › Görevler sekmesi | emoji 🧰 | `app/src/app/aile.tsx:781` |
| Aile Kasası kısayolu | Demo aile sohbeti başlık düğmesi ve hızlı işlem çipi | emoji 💰 | `app/src/app/kabile/sohbet.tsx:109`, `:28` |

Not: Sandık resimleri hazır; canlıdaki 4 satır için yeni çizim gerekmiyor (kod yorumu `:42` "art comes later" diyor ama dosyalar zaten var).

Toplam: 7

### Aile ekranı kutucukları, kısayollar, listeler
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Görevler kutucuğu | Canlı aile ana sayfası | Ionicons "checkbox-outline" | `app/src/components/family-live.tsx:616` |
| Aile odası kutucuğu | aynı | Ionicons "mic-outline" | `app/src/components/family-live.tsx:617` |
| Uyum Köşesi kutucuğu | aynı | Ionicons "heart-outline" (demoda Art `iliski-cift-cp-en-tatli-cift` var) | `app/src/components/family-live.tsx:618` |
| Görevler hızlı çipi | Canlı aile sohbeti üst şerit | Ionicons "checkbox-outline" | `app/src/components/family-live.tsx:857` |
| Uyum Köşesi hızlı çipi | aynı | Ionicons "heart-outline" | `app/src/components/family-live.tsx:858` |
| Ailem hızlı çipi | aynı | Ionicons "people-outline" | `app/src/components/family-live.tsx:859` |
| Görevler hızlı işlemi | Demo aile sohbeti | emoji 🎯 | `app/src/app/kabile/sohbet.tsx:27` |
| Aile odası kartı | Demo aile › Durum ve Görevler sekmeleri | emoji 🎙️ (Text içinde; 3D mikrofon kullanılmıyor) | `app/src/app/aile.tsx:424`, `:791` |
| Üye durum çipleri (Partide, Görüşmede, Çevrimiçi) | Demo aile › şu an oynayanlar | emoji 🎉 📞 💬 | `app/src/app/aile.tsx:736` |
| Öne çıkanlar 1-2-3 | Canlı aile › Bu hafta | boş (yalnızca sıra numarası; demo aynı listede `derece-1..3` Art kullanıyor) | `app/src/components/family-live.tsx:641` (demo: `app/src/app/aile.tsx:712`) |
| Haftalık aile sıralaması 1-2-3 | Aile listesi (canlı ve demo) | boş (sıra numarası). Not: diğer sıralamalarda derece resimleri var | `app/src/components/family-live.tsx:205`, `app/src/app/aile.tsx:118` |
| Uyum Köşesi ikili satırı | Canlı Uyum Köşesi | Ionicons "heart" iki avatarın arasında (bağın BondMark'ı kullanılmıyor); başlıkta demo Art'ı yok | `app/src/components/family-center-live.tsx:358` |
| Üye işlem menüsü (Profili gör, Odasına git, Yardımcı yap, Aileden çıkar, Engelle, Şikâyet et…) | Üyeye uzun basınca | Ionicons (person-outline, enter-outline, shield-checkmark-outline, ribbon-outline…). Not: düşük öncelik | `app/src/app/aile.tsx:217-225`, `app/src/components/family-live.tsx:580-596` |
| Aile "Daha fazla" menüsü (Veri Merkezi, Aile kuralları, Sessize al, Üye davet et, Şikâyet, Ayrıl) | Demo aile başlığı › ⋮ | Ionicons. Not: düşük öncelik | `app/src/app/aile.tsx:636-641` |
| Aile paylaş menüsü (Bağlantıyı paylaş, Arkadaşlarını davet et) | Demo aile | Ionicons "link-outline", "people-outline". Not: düşük öncelik | `app/src/app/aile.tsx:649-650` |
| Aile sohbeti menüsü (Bildirimler, Aile profili, Görevler, Aile Kasası, Uyum Köşesi) | Demo aile sohbeti › ⋮ | Ionicons. Not: düşük öncelik | `app/src/app/kabile/sohbet.tsx:131-135` |

Toplam: 16 (2 satır başka bölümde sayıldı)

### Metin içi emoji (Aile)
- `app/src/app/aile.tsx`: yaklaşık 22 yer, ör. "💎 {havuz}", "📊 Veri Merkezi", "📜 Aile kuralları", "🏆 Haftalık Aile Sıralaması", "⭐ Öne Çıkanlar", "❤", "🟢 Aktif / ⚪ Pasif".
- `app/src/app/kabile/merkez.tsx`: 5 yer, ör. "🔮 +N sandık puanı", "açıldı 🎉", "Her N 🪙 için".
- `app/src/app/kabile/kasa.tsx`: 4 yer, ör. "Sandık Değeri N 🪙", "🎁 {eşya}".
- `app/src/app/kabile/iliski.tsx`: 2 yer, ör. "her 350 🪙", "❤".
- `app/src/app/kabile/sohbet.tsx`: 3 yer, ör. "📶 N kişi çevrimiçi · 🔕", "🎁 Aileye … gönderdi".
- `app/src/data/kabile.ts`: 5 duyuru metni (🌙 🎤 🐺 🌉 💜) ve `chestRewardText` içinde 🪙.

## 6. Ajans

### Ajans kimliği, statü ve kademeler
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ajans logosu (canlı) | Ajans › Ajanslarım kartı, Ofis başlığı | yedek ikon (ajans adının baş harfi dairede; sunucuda logo alanı yok) | `app/src/components/agency-net-hub.tsx:93-95`, `app/src/app/ajans/ofis.tsx:186-188` |
| Kodla bulunan ajans | Ajans › Kodla katıl › sonuç | Ionicons "business-outline" | `app/src/components/agency-net-hub.tsx:346` |
| Ajans logosu (demo: Yıldız Ajans, Nova Medya, Similar Talent, Atlas Yetenek) | Demo ajans listesi, önizleme, Ajansım | emoji ⭐ 🌙 💜 🗺️ | `app/src/data/agency.ts:44-47`; `app/src/app/ajans/index.tsx:84`, `:114`, `:211` |
| Aktif ajans statüsü | Ofis başlık pili, statü kartı | Ionicons "checkmark-circle(-outline)" | `app/src/app/ajans/ofis.tsx:197`, `app/src/components/agency-net.tsx:210`, `app/src/app/ajans/panel.tsx:124` |
| Aday ajans statüsü | aynı | Ionicons "hourglass-outline" | aynı |
| Kademe: Başlangıç | Ofis pili, kademe merdiveni | boş (yazı + nokta; pilde Ionicons "trending-up") | `server/api/agency-lib.mjs:76`; `app/src/app/ajans/ofis.tsx:196`; `app/src/components/agency-net.tsx:163-167` |
| Kademe: Gelişen | aynı | aynı | `server/api/agency-lib.mjs:77` |
| Kademe: Başarılı | aynı | aynı | `server/api/agency-lib.mjs:78` |
| Kademe: Üst ajansı geçmiş | aynı (+ "Üst ajansı geçti" pili Ionicons "trending-up"/"flash-outline") | aynı | `server/api/agency-lib.mjs:79`; `app/src/app/ajans/ofis.tsx:269` |
| Kademe: Çok yüksek performans | aynı | aynı | `server/api/agency-lib.mjs:80` |
| Ajans durumları (Taslak, Onay bekliyor, Aktif, Reddedildi, Askıda, Kapatıldı) ve Üst/Alt ajans | Ajans kartı ve Ofis pilleri | boş (yalnızca renkli yazı pili). Not: yanındaki kademe ve statü pillerinde simge var | `app/src/lib/agency-net.ts:585`, `:587`; `app/src/components/agency-net-hub.tsx:102-104` |
| Askıda / İnceleniyor bandı | Ofis özet | Ionicons "pause-circle-outline" / "hourglass-outline" | `app/src/app/ajans/ofis.tsx:210-211` |

Toplam: 12

### Ajans başvurusu
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Başvuru durumları (Taslak, Başvuru Alındı, Ön İncelemede, BD Değerlendirmesinde, Ek Bilgi Bekleniyor, Admin Onayı Bekleniyor, Onaylandı, Reddedildi, Askıya Alındı, Başvuru İptal Edildi) | Başvuru takibi, durum geçmişi | boş (renkli yazı rozeti `StatusBadge`) | `app/src/lib/agency-apps.ts:29-40`, `app/src/components/agency-apps.tsx:20-24` |
| Onaylandı sonuç kartı | Başvurum | Ionicons "checkmark-done" | `app/src/app/ajans/basvuru.tsx:416` |
| Reddedildi / Askıya alındı sonuç kartı | Başvurum | Ionicons "alert-circle" | `app/src/app/ajans/basvuru.tsx:424` |
| Ek bilgi istendi kartı | Başvurum | Ionicons "chatbubble-ellipses" | `app/src/app/ajans/basvuru.tsx:391` |
| Başvuru formu bölüm başlıkları (Ajans ve iletişim, Deneyim, Plan ve hedefler, Belge, Gizlilik, Durum geçmişi, Başvuru bilgilerin) | Başvuru formu ve özeti | Ionicons (business, ribbon, trending-up, document-attach, shield-checkmark, time, document-text). Not: bölüm başlığı glifi, düşük öncelik | `app/src/app/ajans/basvuru.tsx:146-160`, `:182-255`, `:439-443` |
| Ajans hesabı bölüm başlıkları (Kurulum adımları, Bağlı yayıncılar, Denetim, Yetkililer, Sözleşme, Komisyon kuralları, Coins Bank, Ödeme hesabı, Para çekme) | Ajans hesabı ve Coins Bank | Ionicons (list, people, shield-checkmark, person-add, document-text, pie-chart, wallet, receipt, card, cash). Not: düşük öncelik | `app/src/app/ajans/hesap/[id].tsx:126-391` |

Toplam: 6

### Ajans ofisi (sahip/ekip ekranı)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Özet KPI kutucukları (Bu ay komisyon, Çekilebilir, Aktif yayıncı, Performans puanı / Alt ajans) | Ofis › Özet | Ionicons diamond-outline, wallet-outline, mic-outline, speedometer-outline / git-branch-outline | `app/src/app/ajans/ofis.tsx:217-220` |
| Yayıncılar KPI (Yayıncı, Bu hafta/ay kazanç) | Ofis › Yayıncılar | Ionicons people-outline, diamond-outline | `app/src/app/ajans/ofis.tsx:441-442` |
| Referans ajans KPI (Bugün, Bu hafta, Bu ay, Referans ajans) | Ofis › Referans ajanslar | Ionicons today-outline, calendar-outline, calendar-number-outline, git-branch-outline | `app/src/app/ajans/ofis.tsx:516-519` |
| Kazanç KPI (Çekilebilir, Hesaplanıyor, Ödemede, Ödenen) | Ofis › Kazanç | Ionicons wallet-outline, hourglass-outline, paper-plane-outline, checkmark-done-outline | `app/src/app/ajans/ofis.tsx:694-697` |
| Ajans bildirim türleri (Geçme, Kademe, Diğer) | Ofis › Özet › bildirimler | Ionicons flash-outline / trending-up / notifications-outline | `app/src/app/ajans/ofis.tsx:298` |
| Komisyon kayıt türleri (fark, geçiş, asistan payı, iade, doğrudan) | Ofis › Kazanç › Komisyon kayıtları | Ionicons git-branch-outline / swap-horizontal / ribbon-outline / return-down-back-outline / diamond-outline | `app/src/app/ajans/ofis.tsx:739` |
| Ödeme talebi durumları (Ödendi, Reddedildi/İptal, Bekliyor) | Ofis › Kazanç › Ödeme talepleri | Ionicons checkmark-circle-outline / close-circle-outline / time-outline | `app/src/app/ajans/ofis.tsx:816` |
| Kademe geçmişi / oran değişikliği satırları | Ofis › Performans | Ionicons time-outline, trending-up/down, pricetag-outline | `app/src/app/ajans/ofis.tsx:648`, `:655`, `:662` |
| Yayıncı / katılım isteği satırları | Ofis › Yayıncılar, Talepler | yedek ikon (baş harf dairesi `Mono`; profil fotoğrafı yok) | `app/src/app/ajans/ofis.tsx:457`, `:864`, `:883`, `:479-485` |
| Ekip rolü satırı | Ofis › Ekip › rol seç | Ionicons "shield-checkmark-outline" | `app/src/app/ajans/ofis.tsx:986` |
| Asistan rozeti | Asistanlar sekmesi, asistanın kendi kartı | Ionicons "ribbon-outline" (ayrıldı: "alert-circle-outline") | `app/src/components/agency-assistants.tsx:110`, `:300` |
| Asistan payı kayıtları | Asistan kartı › Son asistan payları | Ionicons "ribbon-outline" / "return-down-back-outline" | `app/src/components/agency-assistants.tsx:324` |

Toplam: 12

### Ajans girişi (yayıncı tarafı) ve demo ajans ekranları
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ajans daveti satırı | Ajans › Davetler | Ionicons "mail-unread-outline" | `app/src/components/agency-net-hub.tsx:134` |
| Bekleyen katılım isteğim | Ajans › İsteklerim | Ionicons "hourglass-outline" | `app/src/components/agency-net-hub.tsx:149` |
| Üyelik pili "Üye" | Ajans › Üyeliğim | Ionicons "checkmark-circle" | `app/src/components/agency-net-hub.tsx:187` |
| Ajans paneli hızlı işlemi | Demo ajans sohbet grubu | emoji 📊 | `app/src/app/ajans/sohbet.tsx:39` |
| Jeton Noktası hızlı işlemi | aynı | emoji 🏦 | `app/src/app/ajans/sohbet.tsx:40` |
| Üye ağı hızlı işlemi | aynı | emoji 🌐 | `app/src/app/ajans/sohbet.tsx:41` |
| Üye durumu (Aktif, Pasif, Yeni) | Demo ajans paneli › Üyeler | emoji 🟢 ⚪ 🆕 | `app/src/app/ajans/panel.tsx:248` |
| Ağ üyesi durumu (Aktif, Aktivasyon bekliyor) | Demo Üye ağım | emoji 🟢 ⏳ | `app/src/app/ajans/ag.tsx:116` |
| Ajans etkinlikleri | Demo Ajansım › etkinlikler | emoji 📅 | `app/src/app/ajans/index.tsx:257` |
| Satıra itiraz et | Demo Üye ağım › komisyon satırı menüsü | emoji ⚖️ | `app/src/app/ajans/ag.tsx:197` |

Toplam: 10

### Metin içi emoji (Ajans)
- `app/src/app/ajans/panel.tsx`: 6 yer, ör. "Hedef: 💎 …", "Komisyon 💎 …", "✓".
- `app/src/app/ajans/index.tsx`: 5 yer, ör. "Haftalık elmas: 💎 …", "🛟 Platform desteğine…".
- `app/src/app/ajans/ag.tsx`: 4 yer, ör. "{tutar} 💎".
- `app/src/app/ajans/basvuru.tsx`: 4 yer, ör. "✓ {adım}", "📎 {belge}".
- `app/src/app/ajans/sohbet.tsx:35`: sabit duyuruda 1 tane "📢".
- `app/src/app/ajans/hesap/[id].tsx:45`: tutar biçiminde 1 tane "💎".
- `app/src/components/agency-message-perf.tsx`: 2 yer "💎"; `app/src/components/agency-net.tsx:194`: 1 tane "✓".
- `app/src/data/agency.ts:82-83`: etkinlik ödül metinlerinde 2 tane "💎".
- `app/src/lib/agency-apps.ts`: denetim/uyarı metinlerinde 4 yer "💎".

### Yönetim ekranları
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ajans Merkezi giriş kartı | Ajans ekranı (yalnızca platform personeli) | Ionicons "git-network-outline" | `app/src/components/agency-net-hub.tsx:78` |
| Merkez KPI kutucukları (Üst ajans, Bağlı yayıncı, Komisyon matrahı, Ajans komisyonu, BD komisyonu, Açık ödemeler, Onay bekleyen, Bekleyen transfer, Açık itiraz, Hesapla) | Ajans Merkezi › Genel | Ionicons (business-outline, people-outline, diamond-outline, pie-chart-outline, briefcase-outline, wallet-outline, hourglass-outline, swap-horizontal-outline, chatbox-ellipses-outline, calculator-outline) | `app/src/app/ajans/merkez.tsx:141-151` |
| Organizasyon ağacı düğümü (üst / alt ajans) | Ajans Merkezi › ağaç | Ionicons "business" / "git-branch-outline" | `app/src/app/ajans/merkez.tsx:230` |
| Kademe ve uyarı pilleri | Ajans Merkezi › düğüm, performans | Ionicons podium-outline, trending-up, flag-outline | `app/src/app/ajans/merkez.tsx:257-260`, `:782-784` |
| Başvuru yönetimi sekmeleri (Başvurular, Ajanslar, Performans, Denetim) | Ajans yönetimi | Ionicons documents, business, stats-chart, shield-checkmark | `app/src/app/ajans/yonetim/index.tsx:66-69` |
| Başvuru/ajans meta satırları (yayıncı sayısı, BD, tarih, Coins Bank, ödeme yetkisi) | Ajans yönetimi listeleri | Ionicons people, person-circle, calendar, wallet, lock-open/lock-closed | `app/src/app/ajans/yonetim/index.tsx:124-126`, `:149-150` |
| Başvuru belgeleri | Ajans yönetimi › başvuru › Belgeler | Ionicons "document-lock" | `app/src/app/ajans/yonetim/[id].tsx:236` |
| Başvuru detayı bölüm başlıkları (İşlemler, Kontroller, Belgeler, Yazışmalar, Durum geçmişi, Atama geçmişi, Başvuru bilgileri) | Ajans yönetimi › başvuru | Ionicons (flash, shield-checkmark, document-attach, chatbubbles, time, git-branch, document-text). Not: düşük öncelik | `app/src/app/ajans/yonetim/[id].tsx:178-309` |

Metin içi emoji (yönetim): `app/src/app/ajans/yonetim/index.tsx` 2 yer "💎", `app/src/app/ajans/yonetim/[id].tsx:146` 1 tane "🎉".

Toplam: 8

## 7. Bildirimler, mesajlar ve sosyal

### Bildirimler ekranı: bildirim türleri (`app/src/app/bildirimler.tsx`)
Her bildirim satırı `StateIcon` ile bir Ionicons glifi gösteriyor (`bildirimler.tsx:77`). Uygulamaya özel bildirim resmi yok.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Yeni takipçi / Yeni takipçiler | Bildirimler listesi | Ionicons "person-add" | `app/src/lib/follow-notices.ts:22`, `:24` |
| Profil ziyareti | Bildirimler listesi | Ionicons "eye" | `app/src/lib/visitor-rows.ts:43-44` |
| Takip ettiğin oda açıldı | Bildirimler listesi | Ionicons "mic" | `app/src/lib/room-social.ts:91` |
| Oda daveti (gelen) | Bildirimler listesi | Ionicons "mic" | `app/src/lib/room-social.ts:92`; demo `app/src/store.tsx:589` |
| Oda daveti gönderildi | Bildirimler listesi | Ionicons "mic" | `app/src/app/kullanici/[id].tsx:444` |
| Oda üyeliğin onaylandı | Bildirimler listesi | Ionicons "home" | `app/src/components/room/live-room.tsx:2133` |
| Etkinlik hatırlatması kuruldu | Bildirimler listesi | Ionicons "alarm" | `app/src/components/room/live-room.tsx:4476` |
| Selam verdi | Bildirimler listesi (demo) | Ionicons "hand-left" | `app/src/store.tsx:587` |
| Hoş geldin | Bildirimler listesi (demo) | Ionicons "sparkles" | `app/src/store.tsx:588` |
| Elmaslar jetona çevrildi | Bildirimler › Finans | Ionicons "swap-horizontal" | `app/src/components/exchange-sheet.tsx:70`, `:80` |
| Kilitli elmaslar açıldı | Bildirimler › Finans | Ionicons "lock-open" | `app/src/store.tsx:759` |
| Hediye aldın (elmas) | Bildirimler › Finans | Ionicons "gift" | `app/src/store.tsx:889` |
| Para çekme onaylandı | Bildirimler › Finans | Ionicons "card" | `app/src/store.tsx:1100` |
| Yankı seviyesi yükseldi | Bildirimler listesi | Ionicons "rose" | `app/src/store.tsx:735` |
| Cömertlik seviyesi yükseldi | Bildirimler listesi | Ionicons "trending-up" | `app/src/store.tsx:803` |
| Destek yanıtı geldi | Bildirimler listesi | Ionicons "help-buoy" | `app/src/store.tsx:1044` |
| Ajans başvurun kabul edildi | Bildirimler listesi | Ionicons "business" | `app/src/store.tsx:1214`, `app/src/app/ajans/yonetim/[id].tsx:98` |
| Ajans transfer talebi iletildi | Bildirimler listesi | Ionicons "paper-plane" | `app/src/store.tsx:1258` |
| Ajans transferi onaylandı | Bildirimler listesi | Ionicons "checkmark-circle" | `app/src/store.tsx:1269` |
| Ajansa geçiş tamam / ajanstan ayrıldın | Bildirimler listesi | Ionicons "business" | `app/src/store.tsx:1280` |
| Profil fotoğrafın onaylandı | Bildirimler listesi | Ionicons "image" | `app/src/store.tsx:1354` |
| Veri dökümü talebi alındı | Bildirimler › Güvenlik | Ionicons "archive" | `app/src/store.tsx:1359` |
| Oturum sonlandırıldı | Bildirimler › Güvenlik | Ionicons "lock-closed" | `app/src/app/ayarlar.tsx:249` |
| Tür yedeği (eski, emoji simgeli kayıtlı bildirimler): Sosyal / Finans / Güvenlik / Sistem | Bildirimler listesi | yedek ikon: Ionicons "chatbubble" / "wallet" / "shield-checkmark" / "notifications" | `app/src/app/bildirimler.tsx:21-28` |
| Bildirim tercihleri satırı | Bildirimler ekranının altı | Ionicons "options-outline" | `app/src/app/bildirimler.tsx:94` |

Toplam: 25

Not: Ben/Profil sekmesindeki "Bildirimler" menü satırı Profil bölümünde ("Profil sekmesi menüsü") sayıldı.

Not: Telefon bildirimi (push, `server/api/push.mjs`) uygulamanın tek `notification-icon.png` dosyasını kullanıyor; türe özel simge gönderilmiyor (`app/app.json:94`). Ayrı satır sayılmadı.

### SimilarClub Sistem (Mesajlar › resmî bildirim sohbeti, `app/src/components/team-inbox.tsx`)
Her kart renkli bir dairenin üstünde beyaz Ionicons glifi gösteriyor (`team-inbox.tsx:199-200`). Kategoriler sunucudan geliyor (`server/api/auto-chat-rules.mjs:42`).

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Sesli arama kazancı (voice_call) | SimilarClub Sistem kartı | Ionicons "call" | `app/src/components/team-inbox.tsx:32` |
| Görüntülü arama kazancı (video_call) | SimilarClub Sistem kartı | Ionicons "videocam" | `app/src/components/team-inbox.tsx:33` |
| Görüşme işlem bilgisi (call_paid) | SimilarClub Sistem kartı | Ionicons "receipt" | `app/src/components/team-inbox.tsx:34` |
| Günlük mesaj kazanç özeti (message_summary) | SimilarClub Sistem kartı | Ionicons "diamond" | `app/src/components/team-inbox.tsx:35` |
| Anlık mesaj kazancı (message_reward) | SimilarClub Sistem kartı | Ionicons "diamond" (özetle aynı) | `app/src/components/team-inbox.tsx:36` |
| PK sonucu (pk) | SimilarClub Sistem kartı | Ionicons "trophy" | `app/src/components/team-inbox.tsx:37` |
| Roket ödülü (rocket) | SimilarClub Sistem kartı | Ionicons "rocket" | `app/src/components/team-inbox.tsx:38` |
| Etkinlik ödülü (event_reward) | SimilarClub Sistem kartı | Ionicons "trophy" (PK ile aynı) | `app/src/components/team-inbox.tsx:39` |
| Çanta hediyesi (bag_gift) | SimilarClub Sistem kartı | Ionicons "gift" | `app/src/components/team-inbox.tsx:40` |
| Bonus ve görev ödülü (bonus, hoş geldin jetonu dahil) | SimilarClub Sistem kartı | Ionicons "gift" (çanta hediyesiyle aynı) | `app/src/components/team-inbox.tsx:41`; hoş geldin `server/api/referrals.mjs:95` |
| Yayıncı performans uyarısı (performance) | SimilarClub Sistem kartı | Ionicons "warning" | `app/src/components/team-inbox.tsx:42` |
| Otomatik mesaj / hazır cevap hakkı (quota) | SimilarClub Sistem kartı | Ionicons "notifications" | `app/src/components/team-inbox.tsx:43` |
| Bağ bildirimleri (bond) | SimilarClub Sistem kartı | Ionicons "link" | `app/src/components/team-inbox.tsx:44` |
| Ekip duyurusu: Etkinlik (event) | SimilarClub Sistem kartı | Ionicons "calendar" | `app/src/components/team-inbox.tsx:23` |
| Ekip duyurusu: Güncelleme (update) | SimilarClub Sistem kartı | Ionicons "sparkles" | `app/src/components/team-inbox.tsx:24` |
| Ekip duyurusu: Ödül (reward) | SimilarClub Sistem kartı | Ionicons "gift" | `app/src/components/team-inbox.tsx:25` |
| Ekip duyurusu: Kural (rule) | SimilarClub Sistem kartı | Ionicons "shield-checkmark" | `app/src/components/team-inbox.tsx:26` |
| Ekip duyurusu: Duyuru (notice) ve bilinmeyen tür | SimilarClub Sistem kartı | Ionicons "megaphone" (bilinmeyen tür için de yedek) | `app/src/components/team-inbox.tsx:27`, `:200` |

Toplam: 18

### Mesajlar sekmesi: liste ve özel satırlar (`app/src/app/(tabs)/mesajlar.tsx`, `message-prefs.tsx`, `message-tools-card.tsx`, `opener-notice.tsx`)
Üstteki üç büyük kutucuğun (SimilarClub Sistem, Çevrim içi hizmet, Ajansım) resimleri var (`mesajlar.tsx:349-351`), listelenmedi.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Canlı Odalar özel satırı | Mesajlar › Tümü, liste başı | Ionicons "mic" (gradyan daire) | `app/src/app/(tabs)/mesajlar.tsx:199` |
| Aileni bul özel satırı | Mesajlar › Tümü, liste başı | yedek ikon (3D jeton `coin`; aileye özel değil) | `app/src/app/(tabs)/mesajlar.tsx:208` |
| Profil ziyaretçilerin özel satırı | Mesajlar › Tümü, liste başı | Ionicons "eye" | `app/src/app/(tabs)/mesajlar.tsx:219` |
| Arkadaş satırı: mesaj düğmesi | Mesajlar › Arkadaşlarım | Ionicons "chatbubble-ellipses" | `app/src/app/(tabs)/mesajlar.tsx:497` |
| Arama yönü (Gelen / Giden / Cevapsız) | Mesajlar › Aramalar satırı | Ionicons "arrow-down" / "arrow-up" / "close" | `app/src/app/(tabs)/mesajlar.tsx:503-506`, `:525` |
| Arama türü (sesli / görüntülü) | Mesajlar › Aramalar satırı | Ionicons "call" / "videocam" | `app/src/app/(tabs)/mesajlar.tsx:526` |
| Geri ara düğmesi | Mesajlar › Aramalar satırı | Ionicons "call" / "videocam" | `app/src/app/(tabs)/mesajlar.tsx:540` |
| Sesli arama kabul et | Mesaj tercihleri | Ionicons "call" | `app/src/components/message-prefs.tsx:24` |
| Görüntülü arama kabul et | Mesaj tercihleri | Ionicons "videocam" | `app/src/components/message-prefs.tsx:25` |
| Mesaj bildirimleri al | Mesaj tercihleri | Ionicons "notifications" | `app/src/components/message-prefs.tsx:26` |
| Yalnızca samimi kişilerden bildirim | Mesaj tercihleri | Ionicons "heart" | `app/src/components/message-prefs.tsx:27` |
| Otomatik sohbet başlangıçlarını al | Mesaj tercihleri | Ionicons "chatbubbles" | `app/src/components/message-prefs.tsx:70` |
| Benim adıma ücretsiz sohbet başlat | Mesaj tercihleri | Ionicons "sparkles" | `app/src/components/message-prefs.tsx:73` |
| Otomatik mesajlarım gönderilsin | Mesaj tercihleri | Ionicons "paper-plane" | `app/src/components/message-prefs.tsx:79` |
| Sohbet başlatma yardımı kartı | Mesajlar listesi üstü (canlı) | Ionicons "sparkles" | `app/src/components/opener-notice.tsx:36` |
| Otomatik Mesajlarım | Yayıncı Merkezi › mesaj araçları kartı | Ionicons "chatbubbles-outline" | `app/src/components/message-tools-card.tsx:18` |
| Mesaj Performansım | Yayıncı Merkezi › mesaj araçları kartı | Ionicons "stats-chart-outline" | `app/src/components/message-tools-card.tsx:19` |

Toplam: 17

### Birebir sohbet: araçlar, ek türleri, menüler (`app/src/components/chat-thread.tsx`, `app/src/app/sohbet/[id].tsx`)
Ücretli mesaj şeridindeki jeton 3D (`chat-thread.tsx:469`), listelenmedi.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Hediye gönder | Sohbet yazma çubuğu | Ionicons "gift-outline" | `app/src/components/chat-thread.tsx:497` |
| Fotoğraf gönder | Sohbet yazma çubuğu | Ionicons "image-outline" | `app/src/components/chat-thread.tsx:508` |
| Hazır cevap düğmesi | Sohbet yazma çubuğu (yayıncı) | Ionicons "flash-outline" | `app/src/components/chat-thread.tsx:518` |
| Hazır cevap seçenekleri | Hazır cevap sayfası satırları | Ionicons "flash-outline" (her satırda aynı) | `app/src/components/chat-thread.tsx:552` |
| Emoji / çıkartma paneli düğmesi | Sohbet yazma çubuğu | Ionicons "happy-outline" | `app/src/components/chat-thread.tsx:493` |
| Hediye mesajı: katalogda olmayan hediye | Sohbet balonu | yedek ikon: emoji 🎁 (`GiftArt` resim bulamazsa) | `app/src/components/chat-thread.tsx:583` |
| Hediye mesajı türü etiketi ("Hediye gönderdi/gönderdin") | Sohbet balonu | emoji 🎁 (metin; 3D gift kullanılmıyor) | `app/src/components/chat-thread.tsx:585` |
| Oda daveti kartı "Odaya katıl" | Sohbet balonu | emoji 🎙️ (metin; 3D mic kullanılmıyor) | `app/src/components/chat-thread.tsx:605` |
| Etkinlik paylaşım kartı | Sohbet balonu | Ionicons "calendar" | `app/src/components/chat-thread.tsx:619` |
| Şüpheli mesaj uyarısı | Gelen balonun altı | Ionicons "shield-half" | `app/src/components/chat-thread.tsx:654` |
| Mesaj menüsü: Kopyala / Şikâyet et / Sil | Mesaja uzun basınca | Ionicons "copy-outline" / "flag-outline" / "trash-outline" | `app/src/components/chat-thread.tsx:271-275` |
| Sohbet menüsü: Profili gör | Sohbet üst menüsü (…) | Ionicons "person-outline" | `app/src/app/sohbet/[id].tsx:50` |
| Sohbet menüsü: Şikâyet et | Sohbet üst menüsü | Ionicons "flag-outline" | `app/src/app/sohbet/[id].tsx:53` |
| Sohbet menüsü: Engelle / Engeli kaldır | Sohbet üst menüsü | Ionicons "ban-outline" | `app/src/app/sohbet/[id].tsx:63` |
| Sohbet menüsü: Sohbeti sil | Sohbet üst menüsü | Ionicons "trash-outline" | `app/src/app/sohbet/[id].tsx:76` |

Toplam: 15

Not: Emoji/çıkartma panelinin içeriği (`components/EmojiPanel.tsx`) tepkiler bölümüne ait, burada taranmadı.

### Grup sohbeti (aile / ajans grubu, `app/src/components/GroupChat.tsx`)

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| "Sohbet" sekmesi | Grup sohbeti üst sekmeleri | emoji 💬 (metin; 3D chat kullanılmıyor) | `app/src/components/GroupChat.tsx:90` |
| "Üyeler" sekmesi | Grup sohbeti üst sekmeleri | emoji 👥 (metin; 3D group kullanılmıyor) | `app/src/components/GroupChat.tsx:91` |
| Sabit duyuru | Grup sohbeti üstü | emoji 📣 | `app/src/components/GroupChat.tsx:117` |
| Grup odası kartı: dinleyici sayısı | Grup sohbeti üstü | emoji 🎙️ (metin) | `app/src/components/GroupChat.tsx:134` |
| Şifreli oda işareti | Grup odası kartı, üye satırı | emoji 🔒 | `app/src/components/GroupChat.tsx:131`, `:264` |
| Üye durumu çipi: Partide / Görüşmede / Çevrimiçi | Çevrimiçi üyeler şeridi | emoji 🎉 / 📞 / 💬 (metin) | `app/src/components/GroupChat.tsx:148` |
| Hediye düğmesi | Grup sohbeti yazma çubuğu | emoji 🎁 (metin; 3D gift kullanılmıyor) | `app/src/components/GroupChat.tsx:207` |

Toplam: 7

Not: Ajans/aile grup sohbetlerinin hızlı eylemleri (📊🏦🌐🎯💰) Aile ve Ajans bölümlerinde sayıldı, burada tekrarlanmadı. "Uyum Köşesi" hızlı eyleminin resmi var (`iliski-cift-cp-en-tatli-cift`), listelenmedi. 

### Keşfet / Ana Sayfa kişi listesi (`app/src/app/(tabs)/kesfet.tsx`, `app/src/data/social-ui.ts`)
"Aile" kutucuğu (3D çadır) ve "Jeton Kazan" kutucuğu (3D jeton) resimli, listelenmedi.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Selamlama çubuğu el simgesi | Keşfet üstü ("İyi günler, …") | emoji 👋 (3D karşılığı yok) | `app/src/app/(tabs)/kesfet.tsx:118` |
| Hemen Tanış kutucuğu | Keşfet dört kutucuk | Ionicons "mic" + "videocam" (veride emoji 📞 duruyor, kullanılmıyor) | `app/src/app/(tabs)/kesfet.tsx:272-276`, `app/src/data/social-ui.ts:22` |
| Canlı Odalar kutucuğu | Keşfet dört kutucuk | Ionicons "people" + "wifi" (veride emoji 🎉, kullanılmıyor) | `app/src/app/(tabs)/kesfet.tsx:279-283`, `app/src/data/social-ui.ts:23` |
| Ülke: Tüm ülkeler | Ülke seç sayfası, etkin filtre satırı | emoji 🌍 | `app/src/data/social-ui.ts:54`; çizim `kesfet.tsx:180`, `:472` |
| Ülke: Türkiye | Ülke seç sayfası | emoji 🇹🇷 | `app/src/data/social-ui.ts:55` |
| Ülke: Azerbaycan | Ülke seç sayfası | emoji 🇦🇿 | `app/src/data/social-ui.ts:56` |
| Ülke: Almanya | Ülke seç sayfası | emoji 🇩🇪 | `app/src/data/social-ui.ts:57` |
| Ülke: Hollanda | Ülke seç sayfası | emoji 🇳🇱 | `app/src/data/social-ui.ts:58` |
| Ülke: Kıbrıs | Ülke seç sayfası | emoji 🇨🇾 | `app/src/data/social-ui.ts:59` |
| "Gerçek kişi" doğrulama rozeti | Kişi kartı, isim yanı | Ionicons "checkmark-circle" | `app/src/app/(tabs)/kesfet.tsx:369` |
| Selam düğmesi | Kişi kartı | Ionicons "hand-left" | `app/src/app/(tabs)/kesfet.tsx:403` |
| Sohbet düğmesi (selam sonrası) | Kişi kartı | Ionicons "chatbubble-ellipses" | `app/src/app/(tabs)/kesfet.tsx:398` |
| Takip et / Takipte | Kişi kartı | Ionicons "heart-outline" / "heart" | `app/src/app/(tabs)/kesfet.tsx:409` |
| Sıralama düğmesi | Keşfet sekme çubuğu | Ionicons "trophy-outline" | `app/src/app/(tabs)/kesfet.tsx:168` |
| Ülke seç düğmesi | Keşfet sekme çubuğu | Ionicons "globe-outline" | `app/src/app/(tabs)/kesfet.tsx:172` |

Toplam: 15

Not: Altı ülkenin hepsinin resmi zaten var (`Art.tsx:236-241`, `ulke-*`; Odalar sekmesi `countryArt` ile kullanıyor). Keşfet'teki bayraklar tasarım değil, bağlama işi.

### Anlar (`app/src/app/(tabs)/anlar.tsx`, `server/api/moments.mjs`)
Konu kartlarının beşinin de resmi var (`social-ui.ts:79-83`, `Art.tsx:159-163`), listelenmedi.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ana hediye gönder | An kartı alt çubuğu | Ionicons "gift-outline" | `app/src/app/(tabs)/anlar.tsx:813` |
| Beğen | An kartı alt çubuğu | Ionicons "thumbs-up-outline" / "thumbs-up" | `app/src/app/(tabs)/anlar.tsx:818` |
| Yorumlar | An kartı alt çubuğu | Ionicons "chatbubble-outline" | `app/src/app/(tabs)/anlar.tsx:822` |
| Paylaş | An kartı | Ionicons "arrow-redo-outline" | `app/src/app/(tabs)/anlar.tsx:803` |
| Selam / Sohbet | An kartı, yazar yanı | Ionicons "hand-left" / "chatbubble-ellipses" | `app/src/app/(tabs)/anlar.tsx:792` |
| Yeni an paylaş (FAB) / kilitli | Anlar sağ alt düğme | Ionicons "add" / "lock-closed" | `app/src/app/(tabs)/anlar.tsx:524` |
| Paylaşım çubuğu fotoğraf simgesi / kilitli | Anlar akış başı | Ionicons "image-outline" / "lock-closed-outline" | `app/src/app/(tabs)/anlar.tsx:597` |
| An menüsü: Anı sil | An … menüsü | Ionicons "trash-outline" | `app/src/app/(tabs)/anlar.tsx:350` |
| An menüsü: Şikâyet et | An … menüsü | Ionicons "flag-outline" | `app/src/app/(tabs)/anlar.tsx:352` |
| An menüsü: Engelle | An … menüsü | Ionicons "ban-outline" | `app/src/app/(tabs)/anlar.tsx:353` |

Toplam: 10

### Başka kişinin profili: sosyal eylemler (`app/src/app/kullanici/[id].tsx`)
Profil bilgileri, rozetler, madalyalar, vitrin ve bağlar profil bölümünde; burada yalnızca takip/mesaj/arama/hediye ve bağlantılar var. "Şu an odada" kartı 3D mikrofonlu, listelenmedi.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Takip et / Takipte | Profil alt çubuğu | Ionicons "add" / "checkmark" | `app/src/app/kullanici/[id].tsx:1137` |
| Mesaj | Profil alt çubuğu | Ionicons "chatbubble-ellipses" | `app/src/app/kullanici/[id].tsx:1140` |
| Ara | Profil alt çubuğu | Ionicons "call" | `app/src/app/kullanici/[id].tsx:1141-1142` |
| Hediye | Profil alt çubuğu (vurgulu) | Ionicons "gift" | `app/src/app/kullanici/[id].tsx:1143` |
| Arama seçimi: Sesli / Görüntülü (canlı) | Ara sayfası | Ionicons "call-outline" / "videocam-outline" | `app/src/app/kullanici/[id].tsx:1186-1187` |
| Arama seçimi: Sesli / Görüntülü (demo) | Ara sayfası | emoji 📞 / 🎥 ve 🪙 (satır metninde) | `app/src/app/kullanici/[id].tsx:1190-1191` |
| "Şu an görüşmede" durum kartı | Profil başı | Ionicons "call" (odadaki hali 3D mic) | `app/src/app/kullanici/[id].tsx:790` |
| Bağlantılar: Arkadaş | Profil › Bağlar sekmesi | Ionicons "people-outline" | `app/src/app/kullanici/[id].tsx:1079` |
| Bağlantılar: Takipçi | Profil › Bağlar sekmesi | Ionicons "person-add-outline" | `app/src/app/kullanici/[id].tsx:1080` |
| Bağlantılar: Takip | Profil › Bağlar sekmesi | Ionicons "person-outline" | `app/src/app/kullanici/[id].tsx:1081` |
| Hayran kulübü kartı | Profil sekmesi | Ionicons "heart"; kulüp seviyelerinin rozeti yok (yalnızca "Lv.N" metni) | `app/src/app/kullanici/[id].tsx:1311-1314` |
| Profil menüsü: Odama davet et | Profil … menüsü (demo) | Ionicons "mic-outline" | `app/src/app/kullanici/[id].tsx:1153` |
| Profil menüsü: Profili paylaş | Profil … menüsü | Ionicons "share-social-outline" | `app/src/app/kullanici/[id].tsx:1154` |
| Profil menüsü: Kullanıcı adını kopyala | Profil … menüsü | Ionicons "copy-outline" | `app/src/app/kullanici/[id].tsx:1156` |
| Profil menüsü: Şikâyet et | Profil … menüsü | Ionicons "flag-outline" | `app/src/app/kullanici/[id].tsx:1159` |
| Profil menüsü: Engelle / Engeli kaldır | Profil … menüsü | Ionicons "ban-outline" | `app/src/app/kullanici/[id].tsx:1162` |

Toplam: 16

Not: Hayran kulübü seviyeleri (`FAN_LEVELS`) için ayrı rozet beklenip beklenmediği belli değil; "boş" olarak not edildi.

### Ziyaretçiler ve takip listeleri (`app/src/components/visitors-sheet.tsx`, `follow-list-sheet.tsx`)
Takip listesi satırları yalnızca avatar + isim (hepsi aynı), simge beklenmiyor.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| "Kimlerin baktığını gör" abonelik teklifi | Ziyaretçiler sayfası | Ionicons "eye-off" | `app/src/components/visitors-sheet.tsx:88` |
| Gizli ziyaretçi avatarı | Ziyaretçiler sayfası (abonelik yoksa) | yedek ikon: Ionicons "person" silueti + "lock-closed" | `app/src/components/visitors-sheet.tsx:156-159` |

Toplam: 2

### Hemen Tanış ve birebir arama (`app/src/app/eslesme.tsx`, `tanis.tsx`, `arama/[id].tsx`)
Arama kontrol düğmeleri (mikrofon, kamera, kapat, sonraki) gezinme/denetim glifi sayıldı, listelenmedi.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Sesli eşleşme başlat kartı | Hemen Tanış | Ionicons "mic" | `app/src/app/eslesme.tsx:186` |
| Görüntülü eşleşme başlat kartı | Hemen Tanış | Ionicons "videocam" | `app/src/app/eslesme.tsx:186` |
| Kart fiyat etiketi ("… /dk · bağlanınca") | Hemen Tanış başlat kartları | emoji 🪙 (metin; 3D coin kullanılmıyor) | `app/src/app/eslesme.tsx:188` |
| Aranıyor / Yeni biriyle tanış büyük görseli | Eşleşme ekranı | Ionicons "videocam" / "mic" (`StateIcon`, 96 px) | `app/src/app/tanis.tsx:90`, `:102` |
| Eşleşme başlat / Sonraki eşleşme | Eşleşme ekranı | Ionicons "flash" | `app/src/app/tanis.tsx:124` |
| "Odada dinleyici olarak kalıyorsun" satırı | Eşleşme görüşmesi | Ionicons "radio" | `app/src/app/tanis.tsx:170` |
| Görüşme menüsü: Şikâyet et / Engelle ve bitir | Eşleşme … menüsü | Ionicons "flag-outline" / "ban-outline" | `app/src/app/tanis.tsx:217-220` |
| Arama sırasında hediye gönder | Birebir arama ekranı | Ionicons "gift" | `app/src/app/arama/[id].tsx:193` |

Toplam: 8

### Arkadaşını Getir: davet ve davet ödülleri (`app/src/app/davet.tsx`, `components/invite-live.tsx`, `server/api/referrals.mjs`)
Ödül kahramanı ve "Davetlerden kazandığın" satırı 3D jetonlu (`davet.tsx:91`, `invite-live.tsx:35`), listelenmedi. Sunucu davet/hoş geldin ödülü yalnızca jeton veriyor (`referrals.mjs:91`, `:161-162`); ayrı rozet ya da ödül resmi yok.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| "Nasıl çalışır?" kartı | Davet ekranı | Ionicons "help-circle-outline" | `app/src/app/davet.tsx:119` |
| Davet bağlantını paylaş | Davet ekranı alt düğme | Ionicons "share-social" | `app/src/app/davet.tsx:139` |
| Davet istatistikleri kartı (Katılan / Ödül alan) | Davet ekranı (canlı) | Ionicons "people-outline" | `app/src/components/invite-live.tsx:26` |
| Girdiğim davet kodunun durumu (ödendi / bekliyor) | Davet ekranı (canlı) | Ionicons "checkmark-circle" / "mail-open-outline" | `app/src/components/invite-live.tsx:69` |
| "Davet kodun var mı?" kartı | Davet ekranı (canlı) | Ionicons "ticket-outline" | `app/src/components/invite-live.tsx:97` |

Toplam: 5

### Metin içi emoji
- `server/api/system-notices.mjs`: 11 tane; SimilarClub Sistem kart başlıklarında (ör. "🎁 Bonus Kazandın", "🏆 PK Sonucu", `📞`/`📹` arama başlıkları, "💎" kazanç satırı, "🎉").
- `server/api/auto-chat.mjs`: 5 tane; quota/performans/özet başlıkları (ör. "⚠️ Hazır cevap hakkın bitti", "🔔 Otomatik mesaj hakkın bitti", "💎 Mesaj Kazanç Özeti").
- `server/api/messages.mjs`: 1 tane; "💎 +N elmas kazandın" bildirimi (`:230`).
- `server/api/room-rocket.mjs`: 1 tane; "🚀 Roket Ödülü" (`:252`).
- `server/api/bond-life.mjs`: 6 tane; bağ bildirimleri (ör. "🔗 Bağ kuruldu", "⚠️ Bağın bitmek üzere").
- `app/src/lib/msg-reward.ts`: 2 tane; ücretli mesaj ödül notu ("💎 +N Elmas", "💎 +N kazanıldı.").
- `app/src/app/tanis.tsx`: 2 tane; görüşme ücreti "🪙" ve "⚠️ Bakiyen … yetmiyor".
- `app/src/app/eslesme.tsx`: 2 tane, "Nasıl çalışır" satırında; ör. "Sesli 🪙 …/dk" (`:135`).
- `app/src/app/kullanici/[id].tsx`: 2 tane; hesap durumu notu "⚠️ Bu hesap geçici olarak kısıtlı", "⛔ Bu hesap askıya alındı" (`:782`).
- `app/src/app/ajans/sohbet.tsx`: 1 tane; sabit duyuru metni "📢 Bu hafta: PK turnuvası…" (`:35`).
- `app/src/data/social-ui.ts`: demo biyografileri, anlar ve yorumlar içinde yaklaşık 25 tane (ör. "Karaoke kraliçesi 🎤", "Rövanş istiyoruz ⚔️"); kullanıcı içeriği örnekleri.

### Yönetim ekranları
Bu bölümde yönetimde kalan ikonsuz öğe bulunmadı. `GET /api/admin/system-notices` (`server/api/system-notices.mjs:6`) yalnızca sayı döndürüyor; `app/src/app/ajans/yonetim/[id].tsx:98` kullanıcıya giden "business" bildirimi yukarıda Bildirimler grubunda.

Toplam: 0

## 8. Oyunlar, Oyun Salonu, oda oyunları, roket, görevler, etkinlikler, Koruma

### Oyun kapakları (katalog: Oyun Merkezi, oda menüsü, oyun paneli)
Kapak `components/GameArt.tsx` `COVER` / `SALON_COVER` içinde yoksa: Oyun Merkezi kartında (`fx/float` FloatIcon) ve oda menüsünde ham emoji, oyun paneli başlığında ve oyun değiştirme çiplerinde emoji + ad gösteriliyor (`app/src/app/oyunlar.tsx:151`, `:211`; `app/src/components/room/live-room.tsx:3315`, `:3332`; `app/src/components/games/game-panel.tsx:141-144`, `:190`).

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Okey (okey) | Oda oyunları kartı, oda menüsü Oyunlar, oyun paneli | emoji 🀄 | `app/src/data/games.ts:70` |
| Renk Kartları (cards) | Oda oyunları kartı, oda menüsü, oyun paneli | emoji 🃏 | `app/src/data/games.ts:53` |
| Domino (domino) | Oda oyunları kartı ("yakında") | emoji 🁫 | `app/src/data/games.ts:86` |
| Yıldız Avı (olympus) | Oyun Salonu kartı, oda menüsü, oyun paneli, Profil › Oyun Merkezi kısayolu | dosya eksik (`oyun-yildiz-avi`) → emoji 🔭 | `app/src/components/games/fx/salon-art.tsx:271`, `app/src/data/games.ts:150`, `app/src/app/(tabs)/profil.tsx:282` |
| Balon Avı (fish) | Oyun Salonu kartı, oda menüsü, oyun paneli, Profil kısayolu | dosya eksik (`oyun-balon-avi`) → emoji 🎈 (eski balık oltası kapağı bilerek kaldırılmış) | `app/src/components/games/fx/salon-art.tsx:270`, `app/src/data/games.ts:165`, `app/src/components/GameArt.tsx:23`, `app/src/app/(tabs)/profil.tsx:283` |
| Yörünge (rocket) | Oyun Salonu kartı, oda menüsü, oyun paneli | emoji 🚀. Not: `assets/art/oyun-roket.png` (`Art.tsx:194`) var, oyun sahnesinde roket olarak kullanılıyor ama kapak eşlemesinde (`COVER`) yok | `app/src/data/games.ts:180`, `app/src/components/GameArt.tsx:9-24` |
| Pachinko (bilye) | Oyun Salonu kartı, oda menüsü, oyun paneli | dosya eksik (`oyun-pachinko`) → emoji 🔮 (Sihir Destesi ile aynı emoji) | `app/src/components/games/fx/salon-art.tsx:273`, `app/src/data/games.ts:315` |
| Altın Kasa (fortune) | Oyun Salonu (şu an kapalı, `active: false`) | emoji 🏦. Not: oyun kapalı | `app/src/data/games.ts:347` |

Toplam: 8

### Oyun Merkezi ekranı
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Oyun geçmişi yüzen düğmesi | Oyun Merkezi sağ alt | Ionicons "time". Not: gezinme düğmesine yakın, isteğe bağlı | `app/src/app/oyunlar.tsx:279` |

Toplam: 1

### Rüzgâr Gülü (çark)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Tur özeti rozeti (`ruzgar-ozet-rozet`) | 10/50 çevirme sonrası özet kartı | dosya eksik → boş (kartta resim yok, yalnızca yazı) | `app/src/components/games/fx/salon-art.tsx:239`, `app/src/components/games/wheel.tsx:429-455` |
| Çark oku (`ruzgar-ok`) | Çark ibresi | dosya eksik → ortak `cark-ibre.png` çiziliyor. Not: `ruzgar-ok` kodda hiç çağrılmıyor | `app/src/components/games/fx/salon-art.tsx:241`, `app/src/components/games/fx/wheel-stage.tsx:150` |
| JACKPOT dilimi | Çarkın üstündeki JACKPOT dilimi | Ionicons "trophy" (`ruzgar-jackpot.png` var, yalnızca üst JACKPOT kutusunda kullanılıyor) | `app/src/components/games/wheel.tsx:347` |

Toplam: 3

### Yörünge (roket oyunu) ve Canlı Yörünge
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Roket (`yorunge-roket`) | Rampa ve uçuş | dosya eksik → yedek ikon (`oyun-roket.png`, eski genel kapak) | `app/src/components/games/fx/salon-art.tsx:248`, `app/src/components/games/rocket-stage.tsx:16` |
| Gezegen (`yorunge-gezegen`) | Sahnenin altı | dosya eksik → kod çizimi (turuncu degrade daire) | `app/src/components/games/fx/salon-art.tsx:249`, `app/src/components/games/rocket-stage.tsx:122-138` |
| Rampa (`yorunge-rampa`) | Roketin durduğu rampa | dosya eksik → kod çizimi | `app/src/components/games/fx/salon-art.tsx:250`, `app/src/components/games/rocket-stage.tsx:121-122` |
| Fırlat düğmesi simgesi | Yörünge alt çubuğu | Ionicons "rocket". Not: diğer kontrollerde `dugme-*` resimleri var, Fırlat için yok | `app/src/components/games/rocket.tsx:400` |
| Yakıt bidonları (+250 … düğmeleri) | Canlı Yörünge bahis sırası | Ionicons "flame" | `app/src/components/games/rocket-live.tsx:572` |
| Uçan yakıt kapsülü | Canlı Yörünge, bidona dokununca | Ionicons "flame" | `app/src/components/games/rocket-live.tsx:474` |
| KAÇ düğmesi simgesi | Canlı Yörünge | Ionicons "rocket" | `app/src/components/games/rocket-live.tsx:613` |
| Turun en iyileri kürsüsü | Canlı Yörünge tur sonu | yedek ikon (Ionicons "person-circle", oyuncu fotoğrafı yok) | `app/src/components/games/rocket-live.tsx:526` |

Toplam: 8

### Balon Avı
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Kalp Balon (sardine, ×3) | Gökyüzünde uçan balon | dosya eksik (`balonavi-kalp`) → emoji 💖 | `app/src/components/games/fx/salon-art.tsx:252`, `app/src/lib/fish-hunt.ts:24`, `app/src/components/games/fish-stage.tsx:187` |
| Ay Balon (octopus, ×10) | Balon | dosya eksik (`balonavi-ay`) → emoji 🌙 | `app/src/components/games/fx/salon-art.tsx:255`, `app/src/lib/fish-hunt.ts:27` |
| Uçurtma (turtle, ×15) | Balon | dosya eksik (`balonavi-ucurtma`) → emoji 🪁 | `app/src/components/games/fx/salon-art.tsx:256`, `app/src/lib/fish-hunt.ts:28` |
| Disko Balonu (dolphin, ×20) | Balon | dosya eksik (`balonavi-disko`) → emoji 🪩 | `app/src/components/games/fx/salon-art.tsx:257`, `app/src/lib/fish-hunt.ts:29` |
| Uçan Daire (shark, ×30) | Balon | dosya eksik (`balonavi-ucan-daire`) → emoji 🛸 | `app/src/components/games/fx/salon-art.tsx:258`, `app/src/lib/fish-hunt.ts:30` |
| Dev Balon (whale, ×50) | Balon | dosya eksik (`balonavi-dev`) → emoji 🎈 | `app/src/components/games/fx/salon-art.tsx:259`, `app/src/lib/fish-hunt.ts:31` |
| Altın Ejderha (dragon, ×100) | Balon | dosya eksik (`balonavi-ejderha`) → emoji 🐉 | `app/src/components/games/fx/salon-art.tsx:260`, `app/src/lib/fish-hunt.ts:32` |
| Top namlusu (`balonavi-top-namlu`) | Sahnenin altındaki top | dosya eksik → kod çizimi (gri degrade namlu) | `app/src/components/games/fx/salon-art.tsx:261`, `app/src/components/games/fish-stage.tsx:210-221` |
| Top kaidesi (`balonavi-top-kaide`) | Topun gövdesi | dosya eksik → kod çizimi (degrade kaide) | `app/src/components/games/fx/salon-art.tsx:262`, `app/src/components/games/fish-stage.tsx:224` |
| Bulutlar (`balonavi-bulutlar`) | Sahnenin alt kenarı | dosya eksik → beyaz yuvarlak kutular | `app/src/components/games/fx/salon-art.tsx:263`, `app/src/components/games/fish-stage.tsx:113-115` |
| Kurallar tablosundaki balon simgeleri (10 balon) | "?" kurallar sayfası | emoji 🎈💖🌟🎊🌙🪁🪩🛸🎈🐉 (resmi olan Küçük/Yıldız/Konfeti balonları da emoji) | `app/src/components/games/fish.tsx:522` |
| Kilit kartı | Sağdaki güç kartları | Ionicons "locate" | `app/src/components/games/fish.tsx:482` |
| Dondur kartı | Sağdaki güç kartları | Ionicons "snow" | `app/src/components/games/fish.tsx:486` |
| OTO kartı | Sağdaki güç kartları | Ionicons "play"/"pause". Not: Yörünge/Pachinko'daki OTO düğmesi `dugme-oto.png` kullanıyor | `app/src/components/games/fish.tsx:502` |

Toplam: 14

### Yıldız Avı
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Küçük yıldız (`yildizavi-kucuk`) | Gece göğü ızgarası, kurallar tablosu | dosya eksik → emoji ✨ | `app/src/components/games/fx/salon-art.tsx:264`, `app/src/components/games/fener-stage.tsx:38`, `app/src/components/games/fener.tsx:466` |
| Orta yıldız (`yildizavi-orta`) | Izgara, kurallar | dosya eksik → emoji ⭐ | `app/src/components/games/fx/salon-art.tsx:265`, `app/src/components/games/fener-stage.tsx:37` |
| Büyük yıldız (`yildizavi-buyuk`) | Izgara, kurallar | dosya eksik → emoji 🌟 | `app/src/components/games/fx/salon-art.tsx:266`, `app/src/components/games/fener-stage.tsx:35` |
| Altın yıldız (`yildizavi-altin`) | Izgara, kurallar | dosya eksik → emoji 🌟 (büyükle aynı emoji) | `app/src/components/games/fx/salon-art.tsx:267`, `app/src/components/games/fener-stage.tsx:33` |
| Kuyruklu yıldız (`yildizavi-kuyruklu`) | Izgara (Yıldız Yağmuru tetikleyicisi) | dosya eksik → emoji ☄️ | `app/src/components/games/fx/salon-art.tsx:268`, `app/src/components/games/fener-stage.tsx:143` |
| Gözlem kulesi (`yildizavi-kule`) | Izgaranın yanındaki kule | dosya eksik → kod çizimi (gri degrade) | `app/src/components/games/fx/salon-art.tsx:269`, `app/src/components/games/fener-stage.tsx:51` |
| Parlaklık göstergesi | Üst bilgi çubuğu | Ionicons "telescope" | `app/src/components/games/fener.tsx:420` |
| YILDIZ YAĞMURU başlığı | Yağmur başlarken çıkan pano | Ionicons "sparkles" | `app/src/components/games/fener.tsx:434` |

Toplam: 8

### Pachinko
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Bilye (`bilye-top`) | Düşen top | dosya eksik → kod çizimi (gümüş degrade küre) | `app/src/components/games/fx/salon-art.tsx:274`, `app/src/components/games/bilye.tsx:39-44` |
| Çivi (`bilye-civi`) | Tahtadaki çiviler | dosya eksik → pirinç renkli yuvarlak kutu | `app/src/components/games/fx/salon-art.tsx:275`, `app/src/components/games/bilye.tsx:70`, `:353` |
| Altın kupa (`bilye-kupa-altin`) | Alt kupa | dosya eksik → degrade kupa | `app/src/components/games/fx/salon-art.tsx:276`, `app/src/components/games/bilye.tsx:74-77` |
| Yakut kupa (`bilye-kupa-yakut`) | Alt kupa | dosya eksik → degrade kupa | `app/src/components/games/fx/salon-art.tsx:277`, `app/src/components/games/bilye.tsx:74-77` |
| Zümrüt kupa (`bilye-kupa-zumrut`) | Alt kupa | dosya eksik → degrade kupa | `app/src/components/games/fx/salon-art.tsx:278`, `app/src/components/games/bilye.tsx:74-77` |
| Tahta zemini (`bilye-tahta`) | Oyun tahtası | dosya eksik → boş (sahnenin düz degradesi) | `app/src/components/games/fx/salon-art.tsx:279`, `app/src/components/games/bilye.tsx:247` |
| Fırlatma kanalı (`bilye-kanal`) | Sağdaki kanal ve üst ray | dosya eksik → düz renkli kutu | `app/src/components/games/fx/salon-art.tsx:280`, `app/src/components/games/bilye.tsx:56-57` |

Toplam: 7

### Diğer salon makineleri ve kazanç gösterisi
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Konfeti Kutusu kabini (çerçeve) | Makinenin makara çerçevesi | dosya eksik (adı listede bile yok) → kod çizimi mercan çerçeve | `app/src/components/games/fx/slot-skin.tsx:137-138` |
| Altın Kasa sembolleri (10: Jeton, Banknot, Yüzük, Saat, Elmas, Taç, Spor Araba, Özel Jet, Kese, Kasa) | Makaralar ve kurallar tablosu | emoji 🪙💵💍⌚💎👑🏎️🛩️💰🏦 (metin olarak, 3D ikona çevrilmeden). Not: oyun kapalı | `app/src/lib/fortune-slot.ts:22-31`, `app/src/components/games/fortune.tsx:219`, `:345` |
| BÜYÜK / DEV / EFSANE KAZANÇ / JACKPOT şeridi | Kendi kabin resmi olmayan oyunlarda (Yörünge, Balon Avı, Yıldız Avı, Pachinko, Gece Yarısı Çarkı, Lezzet Çarkı, Sihir Destesi, Rüzgâr Gülü) büyük kazanç gösterisi | yedek ikon (kod çizimi degrade şerit; `levha-buyuk-kazanc.png` burada kullanılmıyor) | `app/src/lib/win-tier.ts:24`, `app/src/components/games/fx/win-fx.tsx:46-51`, `:349-353` |
| DEV KAZANÇ / EFSANE KAZANÇ levhası | Kabinli makinelerde kazanç gösterisi | yedek ikon (üçü de aynı `levha-buyuk-kazanc.png` üstüne yazı) | `app/src/components/games/fx/jackpot-show.tsx:30`, `:250-256` |

Toplam: 4

### Oda oyunları (masa parçaları, `table-art.tsx` içinde hepsi `null`)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ludo taşı turkuaz (`ludo-tas-turkuaz`) | Ludo tahtası | dosya eksik → kod çizimi (degrade piyon) | `app/src/components/games/room/table-art.tsx:10`, `app/src/components/games/room/ludo-board.tsx:339-343` |
| Ludo taşı pembe (`ludo-tas-pembe`) | Ludo tahtası | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:11` |
| Ludo taşı altın (`ludo-tas-altin`) | Ludo tahtası | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:12` |
| Ludo taşı yeşil (`ludo-tas-yesil`) | Ludo tahtası | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:13` |
| Ludo tahta zemini (`ludo-tahta-zemin`) | Ludo tahtası | dosya eksik → düz çerçeve zemini | `app/src/components/games/room/table-art.tsx:14`, `app/src/components/games/room/ludo-board.tsx:225-228` |
| Ludo güvenli kare yıldızı (`ludo-yildiz`) | Yıldızlı kareler | dosya eksik → Ionicons "star" | `app/src/components/games/room/table-art.tsx:15`, `app/src/components/games/room/ludo-board.tsx:279` |
| Ludo kupası (`ludo-kupa`) | Tahta ortası ve el sonu kartı | dosya eksik → Ionicons "trophy" | `app/src/components/games/room/table-art.tsx:16`, `app/src/components/games/room/ludo-board.tsx:331`, `app/src/components/games/room/ludo.tsx:300` |
| Renk kartı turkuaz yüzü (`renk-kart-turkuaz`) | Renk Kartları | dosya eksik → kod çizimi (degrade kart) | `app/src/components/games/room/table-art.tsx:18`, `app/src/components/games/room/card-face.tsx:86` |
| Renk kartı kızıl yüzü (`renk-kart-kizil`) | Renk Kartları | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:19` |
| Renk kartı altın yüzü (`renk-kart-altin`) | Renk Kartları | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:20` |
| Renk kartı yeşil yüzü (`renk-kart-yesil`) | Renk Kartları | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:21` |
| Amblem damla (`renk-amblem-damla`) | Turkuaz kartlar, renk seçimi | dosya eksik → Ionicons "water" | `app/src/components/games/room/table-art.tsx:22`, `app/src/components/games/room/card-face.tsx:18`, `:33` |
| Amblem alev (`renk-amblem-alev`) | Kızıl kartlar | dosya eksik → Ionicons "flame" | `app/src/components/games/room/table-art.tsx:23`, `app/src/components/games/room/card-face.tsx:19` |
| Amblem güneş (`renk-amblem-gunes`) | Altın kartlar | dosya eksik → Ionicons "sunny" | `app/src/components/games/room/table-art.tsx:24`, `app/src/components/games/room/card-face.tsx:20` |
| Amblem yaprak (`renk-amblem-yaprak`) | Yeşil kartlar | dosya eksik → Ionicons "leaf" | `app/src/components/games/room/table-art.tsx:25`, `app/src/components/games/room/card-face.tsx:21` |
| İşaret Atla (`renk-isaret-atla`) | Atla kartı | dosya eksik → Ionicons "ban" | `app/src/components/games/room/table-art.tsx:26`, `app/src/components/games/room/card-face.tsx:23` |
| İşaret Yön (`renk-isaret-yon`) | Yön kartı | dosya eksik → Ionicons "swap-vertical" | `app/src/components/games/room/table-art.tsx:27`, `app/src/components/games/room/card-face.tsx:23` |
| İşaret +2 (`renk-isaret-arti2`) | +2 kartı | dosya eksik → yazı "+2" | `app/src/components/games/room/table-art.tsx:28`, `app/src/components/games/room/card-face.tsx:69` |
| Joker (`renk-joker`) | Joker kartı | dosya eksik → kod çizimi (dört renkli disk) | `app/src/components/games/room/table-art.tsx:29`, `app/src/components/games/room/card-face.tsx:87`, `:115` |
| Joker +4 (`renk-joker-arti4`) | +4 kartı | dosya eksik → kod çizimi (dört renkli disk) | `app/src/components/games/room/table-art.tsx:30`, `app/src/components/games/room/card-face.tsx:87` |
| Kart arkası (`renk-kart-arka`) | Deste, rakip elleri | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:31`, `app/src/components/games/room/card-face.tsx:143-150` |
| Renk Kartları masası (`renk-masa`) | Masa keçesi | dosya eksik → düz keçe zemini | `app/src/components/games/room/table-art.tsx:32`, `app/src/components/games/room/cards.tsx:289`, `:397` |
| XOX X işareti (`xox-x`) | XOX tahtası | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:34`, `app/src/components/games/room/xox.tsx:72` |
| XOX O işareti (`xox-o`) | XOX tahtası | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:35`, `app/src/components/games/room/xox.tsx:72` |
| Dört Taş pembe taş (`dort-tas-pembe`) | Dört Taş tahtası | dosya eksik → degrade disk | `app/src/components/games/room/table-art.tsx:37`, `app/src/components/games/room/four.tsx:39` |
| Dört Taş altın taş (`dort-tas-altin`) | Dört Taş tahtası | dosya eksik → degrade disk | `app/src/components/games/room/table-art.tsx:38`, `app/src/components/games/room/four.tsx:39` |
| Dört Taş hücresi (`dort-tas-hucre`) | Tahta hücreleri | dosya eksik → kod çizimi | `app/src/components/games/room/table-art.tsx:39`, `app/src/components/games/room/four.tsx:131` |
| Masa kazanan rozeti | Oyuncu çipinde kazananın köşesi (tüm masa oyunları) | Ionicons "trophy" | `app/src/components/games/room/table-kit.tsx:247` |
| El sonu kupası (kazandın / berabere / kaybettin) | El sonu kartı (Renk Kartları, XOX, Dört Taş; Ludo kupa resmi gelene kadar) | Ionicons "trophy" / "hand-left" / "ribbon" | `app/src/components/games/room/table-kit.tsx:458` |
| Okey bot avatarı | Okey koltuğundaki bot | emoji 🤖 | `app/src/components/games/okey.tsx:315` |
| Sahte okey taşı | Okey taşı yüzü | yıldız karakteri ★ (metin). Not: emoji değil, yazı glifi | `app/src/components/games/okey.tsx:353` |

Toplam: 31

### Oda roketi
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Roket Lv.1–Lv.5 | Oda başlığı hapı, roket sayfası, kalkış animasyonu | yedek ikon (`hediye-roket.png` hediye resmi, beş seviyede aynı) | `app/src/components/room/room-rocket.tsx:25`, `:43`, `:105`, `:251` |

Toplam: 1 (2 satır başka bölümde sayıldı)

### PK
PK ekranlarında (`room/pk.tsx`, `pk-premium.tsx`, `pk-result.tsx`) mod kartları, arma, defne, aslan/kurt, kupa, hedef resimleri var; eksik öğe bulunmadı (yalnızca metin içi emoji, aşağıda).

Toplam: 0

### Görevler
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Görev ödülü Çantam eşyaları (çerçeve, giriş vb.) | Görüntülü arama görevi ödül satırı | boş (yalnızca eşya adı yazıyor; yanındaki hediye ödülünün resmi var) | `app/src/app/gorevler.tsx:183-188`, `app/src/lib/bag-core.ts:62`, `server/api/task-rewards.mjs:37` |
| Günlük giriş ödülü günleri (1., 2., 3., 5., 6. gün) | Giriş ödülü şeridi | yedek ikon (3D "envelope"; ödül jeton olduğu hâlde zarf, 4. gün coin, 7. gün gift) | `app/src/app/gorevler.tsx:104`, `app/src/data/economy.ts:54` |

Toplam: 2

### Etkinlik Merkezi
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Oda içi etkinlik bandı (9 tema) | Odada süren/yaklaşan etkinlik şeridi | Ionicons tema simgesi (sparkles, hand-left, gift, musical-notes, star, trophy, heart, flame, diamond); tema kapak resimleri burada kullanılmıyor | `app/src/components/events/room-events.tsx:59`, `app/src/lib/events.ts:29-38` |
| Oda Etkinlikler listesi satırı (9 tema) | Odanın Etkinlikler sayfası | Ionicons tema simgesi degrade kutuda | `app/src/components/events/room-events.tsx:163` |
| Oda etkinlik efekt parçacıkları (konfeti, kalp, nota, yıldız) | Etkinlik süren odada yükselen parçacıklar | Ionicons "sparkles" / "heart" / "musical-note" / "star" | `app/src/components/events/room-events.tsx:109`, `:140` |
| Yönetimin sonradan eklediği etkinlik türü | Etkinlik kartı etiketi, kapak, ayrıntı | Ionicons (`category.icon`, yoksa "sparkles"). Not: 8 hazır türün resmi var | `app/src/components/events/event-card.tsx:47`, `app/src/components/events/event-detail.tsx:205`, `app/src/components/events/event-art.ts:37` |
| Katılım ödülü notu | Etkinlik ayrıntısı | Ionicons "gift-outline" | `app/src/components/events/event-detail.tsx:241` |
| Etkinlik raporu satırı | Etkinlik Merkezi › Benim | Ionicons "bar-chart-outline" | `app/src/components/events/event-center.tsx:418` |

Toplam: 6

### Koruma
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Koruma puanı kalbi | Benim Koruma üst kısım (iki fotoğraf arası) | Ionicons "heart" (108 pt) | `app/src/app/koruma/index.tsx:111` |
| Koruma listesi satırı puan simgesi | Koruma Listesi her satır | Ionicons "heart-circle" | `app/src/app/koruma/index.tsx:170` |
| Başlık süs kalpleri | "Koruma Listesi" başlığı, Koruma kuralları başlıkları | Ionicons "heart" ×2 (her iki ekranda). Not: süs | `app/src/app/koruma/index.tsx:124`, `:126`, `app/src/app/koruma/kurallar.tsx:61`, `:63` |

Toplam: 3

### Patron koltuğu
Koltuk, mini koltuk ve sayfa `oda-patron-koltugu.png` kullanıyor; eksik öğe bulunmadı (sayfadaki işlem düğmeleri Ionicons, düğme sayıldığı için listelenmedi).

Toplam: 0

### Şanslı torba
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|

Toplam: 0 (1 satır başka bölümde sayıldı)

### Coins Bank ve Jeton Noktası
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Bonus Kredi birimi | Para birimleri kartı, Bonus defteri tutarları | emoji 🎟️ | `app/src/app/coins-bank.tsx:203`, `:220` |
| Oyun jetonu birimi | Son hareketler tutarı | emoji 🎮 | `app/src/app/coins-bank.tsx:249` |
| Ajansım kartı | Ajans sekmesi başlığı | emoji 🏢 | `app/src/app/coins-bank.tsx:340` |
| Ödeme hesabı türü (banka / sağlayıcı) | Ödeme hesabı kartı | Ionicons "business" / "globe" | `app/src/app/coins-bank.tsx:568` |
| Jeton Noktası satırı | Jeton Noktaları listesi (canlı) | yedek ikon (fotoğrafı yoksa baş harf avatarı; Jeton Noktası rozeti yok). Not: Avatar bileşeninin davranışına göre | `app/src/components/coins-bank-live.tsx:254` |

Toplam: 5 (4 satır başka bölümde sayıldı)

### Yönetim ekranları
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Renk Kartları | Oyun Yönetimi › Oda oyunları | emoji 🃏 | `app/src/app/oyun-yonetimi.tsx:118` |
| Domino | Oyun Yönetimi › Oda oyunları | emoji 🁫 | `app/src/app/oyun-yonetimi.tsx:118` |
| Yıldız Avı | Oyun Yönetimi › Oyun Salonu | emoji 🔭 | `app/src/app/oyun-yonetimi.tsx:145` |
| Balon Avı | Oyun Yönetimi › Oyun Salonu | emoji 🎈 | `app/src/app/oyun-yonetimi.tsx:145` |
| Yörünge | Oyun Yönetimi › Oyun Salonu | emoji 🚀 | `app/src/app/oyun-yonetimi.tsx:145` |
| Pachinko | Oyun Yönetimi › Oyun Salonu | emoji 🔮 | `app/src/app/oyun-yonetimi.tsx:145` |
| Altın Kasa | Oyun Yönetimi › Oyun Salonu | emoji 🏦 | `app/src/app/oyun-yonetimi.tsx:145` |

Toplam: 7 (2 satır başka bölümde sayıldı)

### Metin içi emoji
- `app/src/components/room/pk.tsx` – 4 (PK saat metni: `📨 0:45`, `⏳`, `⏱`)
- `app/src/components/room/room-rocket.tsx` – 2 ("Kalktı 🚀", "Lv.3 roketi kalktı! 🚀")
- `server/api/room-rocket.mjs` – 1 (🚀 duyuru)
- `app/src/app/coins-bank.tsx` – ~12 (madde metinlerinde 🪙 💎 🎟️, tutarlarda `… 💎`)
- `app/src/components/games/fortune.tsx` – 3 ("🏦 KASA AÇILDI!", "🏦 ALTIN KASA", "🎮 Kazançlar …"; oyun kapalı)
- `app/src/components/games/okey.tsx` – 1 ("🏆 Elini bitirdin")
- `app/src/lib/room-games/*.ts` (cards, four, ludo, seam, xox) – 7 (masa günlüğü "🏆 … kazandı!")
- `server/api/room-games/*.mjs` (cards, four, ludo, xox) – 5 (aynı "🏆" günlük metinleri)

## 9. Oda, ana sayfa ve sekmeler, menüler, ayarlar, cüzdan, destek

Genel notlar (koddan):
- `app/src/components/RoomArt.tsx` başındaki yorum eski: Ailem, konuşmacı kuyruğu, oda botu ve gizli giriş resimleri artık var (`components/Art.tsx:168-171`) ve kullanılıyor. Kamera düğmesi hâlâ Ionicons.
- `ROOM_ICON_ART.soundOff` (`assets/room/oda-oda-sesi-kapali.png`) dosyası var ama hiçbir yerde kullanılmıyor. Alt çubuktaki "Oda sesi" düğmesi Ionicons gösteriyor.
- Oda menüsünün "Oda" bölümünde (`menu.tsx:65`) `icon` alanı `art` alanından önce geliyor: Ionicons verilmiş öğe, resmi olsa bile Ionicons gösterir.
- Sunucudaki oda dosyalarında (`rooms.mjs`, `room-rules.mjs`, `room-social.mjs`, `room-owner.mjs`, `room-video.mjs`, `music.mjs`) emoji, icon ya da resim alanı yok. Oda türü ve tema simgeleri yalnız uygulamada tanımlı.

### Oda menüsü – "Oda" araç bölümü
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Kuyruktan çık | Oda menüsü › Oda | Ionicons "exit-outline" | `app/src/components/room/live-room.tsx:3345` |
| Paylaş | Oda menüsü › Oda | Ionicons "arrow-redo-outline" | `app/src/components/room/live-room.tsx:3346` |
| Efektler ve ses | Oda menüsü › Oda | Ionicons "sparkles-outline" (Not: `ROOM_ICON_ART.sound` resmi var, burada kullanılmıyor) | `app/src/components/room/live-room.tsx:3347` |
| Aktivite | Oda menüsü › Oda | Ionicons "calendar-outline" (Not: `ROOM_ICON_ART.activity` resmi var) | `app/src/components/room/live-room.tsx:3348` |
| Günlük görev | Oda menüsü › Oda | Ionicons "checkbox-outline" (Not: 3D "tasks" var) | `app/src/components/room/live-room.tsx:3349` |

Toplam: 5

### Oda kartı (RoomInfoSheet)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Oda ayarları (kısayol) | Oda kartı kısayol ızgarası | Ionicons "settings-outline" | `app/src/components/room/live-room.tsx:3392` |
| Odadakiler | Oda kartı kısayolları | Ionicons "people-outline" (Not: 3D "group" var) | `app/src/components/room/live-room.tsx:3393` |
| Etkinlikler | Oda kartı kısayolları | Ionicons "calendar-outline" | `app/src/components/room/live-room.tsx:3395` |
| Yayına Katılma Modu | Oda kartı kısayolları | Ionicons "grid-outline" | `app/src/components/room/live-room.tsx:3396` |
| Mikrofon istekleri | Oda kartı kısayolları (yönetici) | Ionicons "hand-left-outline" (Not: Art "oda-konusmaci-kuyrugu-el-kaldir" var) | `app/src/components/room/live-room.tsx:3397` |
| Moderasyon | Oda kartı kısayolları (yönetici) | Ionicons "shield-checkmark-outline" (Not: `ROOM_ICON_ART.moderation` var) | `app/src/components/room/live-room.tsx:3398` |
| Efekt ayarları | Oda kartı kısayolları | Ionicons "sparkles-outline" | `app/src/components/room/live-room.tsx:3399` |
| Oda ayarlarını aç (dişli) | Oda kartı başlığının sağı | Ionicons "settings-outline" | `app/src/components/room/owner.tsx:349` |
| Trafik paneli izleme | Oda kartı › Oda Sahibi Merkezi | Ionicons "stats-chart" | `app/src/components/room/owner.tsx:435` |
| Oda Sahibi Payı | Oda kartı › Oda Sahibi Merkezi (demo) | boş (yanındaki kartlarda resim var: Oda seviyesi, Aile) | `app/src/components/room/owner.tsx:427` |
| Oda teması (alt satır) | Oda kartı başlığının altı: "🇹🇷 │ tema │ tür │ ID" | emoji (tema emojisi, ör. 💬 🥊 🎵 🎮 🎉 💜). Not: `ROOM_THEME_ART` resimleri var, burada kullanılmıyor | `app/src/components/room/owner.tsx:345`, `app/src/data/catalog.ts:558-565` |
| Oda türü (alt satır) | Aynı satır | emoji (💬 🎭 ❓ 🎵 📅 🔒). Not: `ROOM_TYPE_ART` var, kullanılmıyor | `app/src/components/room/owner.tsx:345`, `app/src/data/catalog.ts:536-543` |
| Aile kartı (aile adı) | Oda kartı › Aile kutusu | emoji (`FAMILIES[].emoji` + ad). Yalnız aile yokken "Ailem" Art'ı çıkıyor | `app/src/components/room/live-room.tsx:3422`, `:3429` |

Toplam: 13 (1 satır başka bölümde sayıldı)

### Oda üst çubuğu ve alt çubuk
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Şifreli oda işareti | Üst çubuk, oda adının önü | Ionicons "lock-closed" | `app/src/components/room/live-room.tsx:3842` |
| Oda ayarları | Üst çubuk | Ionicons "settings-outline" | `app/src/components/room/live-room.tsx:3882` |
| Bire bir görüşmedesin bandı | Sahnenin üstü | Ionicons "call" | `app/src/components/room/live-room.tsx:3910` |
| Menü | Alt çubuk | Ionicons "ellipsis-horizontal" (Not: oda menüsünü açan ana düğme) | `app/src/components/room/live-room.tsx:4042`, `parts.tsx:651` |
| Emoji | Alt çubuk, yazı alanının içi | Ionicons "happy-outline" | `app/src/components/room/live-room.tsx:4054` |
| Sorular (Soru-cevap odası) | Alt çubuk | Ionicons "help" (Not: `ROOM_ICON_ART.questions` var) | `app/src/components/room/live-room.tsx:4082` |
| Mesajlar | Alt çubuk | Ionicons "chatbubble-ellipses" (Not: 3D "chat" var) | `app/src/components/room/live-room.tsx:4083` |
| Mikrofon AÇIK | Alt çubuk mikrofon düğmesi | Ionicons "mic" (Not: 3D "mic" var) | `app/src/components/room/parts.tsx:663` |
| Mikrofon KAPALI | Alt çubuk mikrofon düğmesi | Ionicons "mic-off" | `app/src/components/room/parts.tsx:664` |
| EL KALDIR | Alt çubuk (koltukta değilken) | Ionicons "hand-left" (Not: Art "oda-konusmaci-kuyrugu-el-kaldir" var) | `app/src/components/room/parts.tsx:665` |
| SIRADA | Alt çubuk (kuyruktayken) | Ionicons "hourglass" | `app/src/components/room/parts.tsx:666` |
| DURAKLADI (ses gitmiyor) | Alt çubuk | Ionicons "mic-outline" | `app/src/components/room/parts.tsx:667` |
| Oda sesi açık | Alt çubuk | Ionicons "volume-high" (Not: `ROOM_ICON_ART.sound` var) | `app/src/components/room/parts.tsx:725` |
| Oda sesi kapalı | Alt çubuk | Ionicons "volume-mute" (Not: `ROOM_ICON_ART.soundOff` dosyası var ama hiç kullanılmıyor) | `app/src/components/room/parts.tsx:725`, `app/src/components/RoomArt.tsx:67` |

Toplam: 14 (1 satır başka bölümde sayıldı)

### Koltuk menüsü (mikrofona dokununca)
Hepsi `app/src/components/room/seat-menu.tsx:57` ile Ionicons olarak çiziliyor.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Profilim | Kendi koltuğum | Ionicons "person-circle-outline" | `app/src/components/room/live-room.tsx:2418` |
| Kamerayı aç | Kendi koltuğum (kamera izinli) | Ionicons "videocam-outline" | `app/src/components/room/live-room.tsx:2419` |
| Kamerayı kapat | Kendi koltuğum | Ionicons "videocam-off-outline" | `app/src/components/room/live-room.tsx:2419` |
| Koltuktan in | Kendi koltuğum | Ionicons "arrow-down-circle-outline" | `app/src/components/room/live-room.tsx:2420` |
| Profil | Başkasının koltuğu | Ionicons "person-circle-outline" | `app/src/components/room/live-room.tsx:2430` |
| Mikrodan at | Başkasının koltuğu (yönetici) | Ionicons "arrow-down-circle-outline" | `app/src/components/room/live-room.tsx:2437` |
| Mikrofonu kilitle (kişiyi indirip) | Başkasının koltuğu | Ionicons "lock-closed-outline" | `app/src/components/room/live-room.tsx:2457` |
| Odadan at | Başkasının koltuğu | Ionicons "exit-outline" | `app/src/components/room/live-room.tsx:2474` |
| Koltuk değiştir | Başkasının koltuğu | Ionicons "swap-horizontal-outline" | `app/src/components/room/live-room.tsx:2478` |
| Mikrofonunu aç | Başkasının koltuğu | Ionicons "mic-outline" | `app/src/components/room/live-room.tsx:2487` |
| Mikrofonunu sustur | Başkasının koltuğu | Ionicons "mic-off-outline" | `app/src/components/room/live-room.tsx:2487` |
| Süreli sustur | Başkasının koltuğu | Ionicons "timer-outline" | `app/src/components/room/live-room.tsx:2500` |
| Hediye gönder | Başkasının koltuğu | Ionicons "gift-outline" (Not: 3D "gift" var) | `app/src/components/room/live-room.tsx:2503` |
| Mesaj gönder | Başkasının koltuğu | Ionicons "chatbubble-outline" (Not: 3D "chat" var) | `app/src/components/room/live-room.tsx:2504` |
| Yönetici yap / Yöneticilikten al | Başkasının koltuğu (sahip) | Ionicons "shield-half-outline" | `app/src/components/room/live-room.tsx:2512` |
| Süper Yönetici yap / al | Başkasının koltuğu (sahip) | Ionicons "star-half-outline" | `app/src/components/room/live-room.tsx:2537` |
| DJ yap / DJ'likten al | Başkasının koltuğu (sahip) | Ionicons "musical-notes-outline" | `app/src/components/room/live-room.tsx:2556` |
| Kara listeye ekle | Başkasının koltuğu | Ionicons "ban-outline" | `app/src/components/room/live-room.tsx:2564` |
| Yetkin yok (üst rol) | Başkasının koltuğu | Ionicons "lock-closed-outline" | `app/src/components/room/live-room.tsx:2590` |
| Davet et | Boş koltuk | Ionicons "person-add-outline" | `app/src/components/room/live-room.tsx:2614` |
| Bu koltuğa geç | Boş koltuk | Ionicons "enter-outline" | `app/src/components/room/live-room.tsx:2621` |
| Mikrofonu kilitle | Boş koltuk | Ionicons "lock-closed-outline" | `app/src/components/room/live-room.tsx:2622` |
| Kilidi aç | Kilitli koltuk | Ionicons "lock-open-outline" | `app/src/components/room/live-room.tsx:2622` |
| Oda sohbeti (yazılı) | Süreli sustur › "ne susturulsun?" | Ionicons "chatbubble-outline" | `app/src/components/room/room-mute.tsx:66` |
| Mikrofon (sesli) | Süreli sustur › "ne susturulsun?" | Ionicons "mic-off-outline" | `app/src/components/room/room-mute.tsx:67` |

Toplam: 25

### Balkon (odadakiler listesi) kişi işlemleri
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Mikrofona davet et | Balkon › kişi satırı açılınca | Ionicons "mic-outline" | `app/src/components/room/balcony.tsx:226` |
| Mikrofonunu aç | Balkon › kişi | Ionicons "mic-outline" | `app/src/components/room/balcony.tsx:228` |
| Mikrofonunu sustur | Balkon › kişi | Ionicons "mic-off-outline" | `app/src/components/room/balcony.tsx:228` |
| Profil | Balkon › kişi | Ionicons "person-circle-outline" | `app/src/components/room/balcony.tsx:230` |
| Hediye gönder | Balkon › kişi | Ionicons "gift-outline" (Not: 3D "gift" var) | `app/src/components/room/balcony.tsx:231` |
| Odadan çıkar | Balkon › kişi | Ionicons "exit-outline" | `app/src/components/room/balcony.tsx:232` |
| Engelle / Engeli kaldır | Balkon › kişi | Ionicons "ban-outline" | `app/src/components/room/balcony.tsx:233` |
| Şikâyet et | Balkon › kişi | Ionicons "flag-outline" | `app/src/components/room/balcony.tsx:234` |

Toplam: 8

### Oda yönetimi seçim listeleri (yasaklar, yöneticiler, DJ'ler)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| "… · yasağı kaldır" satırı | Oda ayarları › Giriş yasakları | Ionicons "lock-open-outline" | `app/src/components/room/live-room.tsx:2276` |
| Süper Yönetici (liste satırı) | Oda ayarları › Oda yöneticileri | Ionicons "star-outline" | `app/src/components/room/live-room.tsx:2299` |
| Yönetici (liste satırı) | Oda ayarları › Oda yöneticileri | Ionicons "shield-half-outline" | `app/src/components/room/live-room.tsx:2299` |
| Süper Yönetici yap / Süper Yöneticilikten al | Yönetici satırı menüsü | Ionicons "star-half-outline" | `app/src/components/room/live-room.tsx:2314` |
| Yöneticilikten al | Yönetici satırı menüsü | Ionicons "remove-circle-outline" | `app/src/components/room/live-room.tsx:2324` |
| Kimi DJ yapalım? (kişi satırı) | Oda ayarları › DJ'ler › DJ ekle | Ionicons "person-add-outline" | `app/src/components/room/live-room.tsx:2360` |
| "… · DJ'likten al" | Oda ayarları › DJ'ler | Ionicons "remove-circle-outline" | `app/src/components/room/live-room.tsx:2365` |
| DJ ekle (odadakilerden) | Oda ayarları › DJ'ler | Ionicons "add-circle-outline" | `app/src/components/room/live-room.tsx:2366` |

Toplam: 8

### Oda ayarları satırları (simgesiz)
Bu listede yalnız "Oda botu" satırında resim var (`owner.tsx:866`, Art "oda-oda-botu"). "Oda tipi", "Oda teması" ve "Oda seviyesi" satırlarında değerin yanında resim var. Aşağıdakilerin hiç simgesi yok. Not: Bu satırlara simge konup konmayacağı bir tasarım kararı.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Oda kilitli | Oda ayarları › Standart | boş | `app/src/components/room/owner.tsx:773` |
| Oda Günlüğü | Oda ayarları › Standart | boş | `app/src/components/room/owner.tsx:794` |
| Oda Süslemesi | Oda ayarları › Görünüm | boş | `app/src/components/room/owner.tsx:801` |
| Oda Kapağı | Oda ayarları › Görünüm | boş | `app/src/components/room/owner.tsx:807` |
| Sahne Düzeni | Oda ayarları › Mikrofon pozisyonu | boş | `app/src/components/room/owner.tsx:816` |
| Klasik düzen mikrofon sayısı | Oda ayarları › Mikrofon pozisyonu | boş | `app/src/components/room/owner.tsx:817` |
| Mikrofon kuyruğu | Oda ayarları › Mikrofon pozisyonu | boş (Not: Art "oda-konusmaci-kuyrugu-el-kaldir" var) | `app/src/components/room/owner.tsx:819` |
| Mikrofon izni | Oda ayarları › Mikrofon pozisyonu | boş | `app/src/components/room/owner.tsx:824` |
| Patron Koltuğu | Oda ayarları › Mikrofon pozisyonu | boş (Not: `ROOM_ICON_ART.bossSeat` var) | `app/src/components/room/owner.tsx:831` |
| Koltuk modu | Oda ayarları › Mikrofon pozisyonu | boş | `app/src/components/room/owner.tsx:837` |
| Oda üyesi başvurusu | Oda ayarları › Oda üyeleri | boş (Not: `ROOM_ICON_ART.join` var) | `app/src/components/room/owner.tsx:841` |
| Oda üyelerini yönet | Oda ayarları › Oda üyeleri | boş | `app/src/components/room/owner.tsx:842` |
| Otomatik eleme | Oda ayarları › Oda üyeleri | boş | `app/src/components/room/owner.tsx:844` |
| Oda işlevlerini yönet | Oda ayarları › Oda üyeleri | boş | `app/src/components/room/owner.tsx:849` |
| Oda yöneticileri (demo) | Oda ayarları › Oda üyeleri | boş | `app/src/components/room/owner.tsx:850` |
| Katılımcı limiti | Oda ayarları › Oda üyeleri | boş | `app/src/components/room/owner.tsx:851` |
| Oda kara listesi | Oda ayarları › Gizlilik & Güvenlik | boş | `app/src/components/room/owner.tsx:854` |
| Profilimde göster | Oda ayarları › Gizlilik & Güvenlik | boş | `app/src/components/room/owner.tsx:856` |
| Ekran kaydını engelle | Oda ayarları › Gizlilik & Güvenlik | boş | `app/src/components/room/owner.tsx:861` |
| Moderasyon | Oda ayarları › Oda yönetimi | boş (Not: `ROOM_ICON_ART.moderation` var) | `app/src/components/room/live-room.tsx:3362` |
| Giriş yasakları | Oda ayarları › Oda yönetimi | boş | `app/src/components/room/live-room.tsx:3365` |
| Oda yöneticileri | Oda ayarları › Oda yönetimi | boş | `app/src/components/room/live-room.tsx:3366` |
| DJ'ler | Oda ayarları › Oda yönetimi | boş | `app/src/components/room/live-room.tsx:3369` |
| Koltuk rengi | Oda ayarları › Oda yönetimi | boş | `app/src/components/room/live-room.tsx:3370` |
| Efektler ve ses | Oda ayarları › Benim ayarlarım | boş (Not: `ROOM_ICON_ART.sound` var) | `app/src/components/room/live-room.tsx:3382` |
| Mesaj ayarları | Oda ayarları › Benim ayarlarım | boş | `app/src/components/room/live-room.tsx:3383` |
| Süsler | Oda ayarları › Benim ayarlarım | boş | `app/src/components/room/live-room.tsx:3384` |

Toplam: 27

### Oda kartı rozetleri, rol işaretleri, kamera
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ajans rozeti (sunucu odası) | Odalar listesi oda kartı; Çıkış ekranı "Şu an popüler" | Ionicons "business" (Not: `ROOM_ICON_ART.agency` var) | `app/src/data/rooms-ui.ts:73`, `app/src/app/(tabs)/index.tsx:622`, `app/src/components/room/leave-sheet.tsx:187` |
| Aile rozeti (sunucu odası) | Aynı yerler | Ionicons "people" (Not: 3D "tent" ve Art "oda-ailem" var) | `app/src/data/rooms-ui.ts:74` |
| Ajans rozeti (demo) | Aynı yerler | emoji (ajansın `logo` emojisi) | `app/src/data/rooms-ui.ts:76` |
| Aile rozeti (demo) | Aynı yerler | emoji (`FAMILIES[].emoji`) | `app/src/data/rooms-ui.ts:78` |
| Süper Yönetici işareti | Mikrofondaki adın önü, üye listesinde avatar | Ionicons "star" | `app/src/components/room/role-mark.tsx:14` |
| Yönetici işareti | Aynı | Ionicons "shield-checkmark" | `app/src/components/room/role-mark.tsx:15` |
| DJ işareti | Aynı | Ionicons "headset" | `app/src/components/room/role-mark.tsx:16` |
| "SimilarClub" sistem bildirimi etiketi | Oda sohbetinde resmi bildirim | Ionicons "shield-checkmark" | `app/src/components/room/parts.tsx:533` |
| Kamerası açık rozeti | Koltuk fotoğrafının köşesi | Ionicons "videocam" | `app/src/components/room/parts.tsx:258` |
| Kamera durumu | Sahne düzeni yuvası | Ionicons "videocam" / "videocam-off-outline" | `app/src/components/room/stage-layout.tsx:80` |
| Susturulmuş rozeti | Koltuk fotoğrafının köşesi | Ionicons "mic-off" / "mic-off-outline" | `app/src/components/room/parts.tsx:263` |
| Kadın + yaş çipi | Kişi kartı | Ionicons "female" (Not: Art "cinsiyet-kadin" var, Ana Sayfa'da kullanılıyor) | `app/src/components/room/person-card.tsx:76` |

Toplam: 12

### Sahne düzeni, çıkış, üyelik, patron koltuğu
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ses (mod sekmesi) | Yayına Katılma Modu sekmeleri | boş (veride Ionicons adı "mic" var ama çizilmiyor) | `app/src/data/room-layouts.ts:64`, `app/src/components/room/layout-picker.tsx:141` |
| Video (mod sekmesi) | Aynı | boş (veride "videocam") | `app/src/data/room-layouts.ts:66` |
| Sinema Salonu (mod sekmesi) | Aynı | boş (veride "film") | `app/src/data/room-layouts.ts:67` |
| Çift Odası (mod sekmesi) | Aynı | boş (veride "heart") | `app/src/data/room-layouts.ts:68` |
| Klasik düzen satırı | Yayına Katılma Modu altı | Ionicons "grid-outline" | `app/src/components/room/layout-picker.tsx:192` |
| Küçült | Odadan çıkış sayfası | Ionicons "contract" (ışıklı küre içinde) | `app/src/components/room/leave-sheet.tsx:96` |
| Çıkış | Odadan çıkış sayfası | Ionicons "log-out-outline" | `app/src/components/room/leave-sheet.tsx:99` |
| Şu an popüler (başlık) | Odadan çıkış sayfası | Ionicons "flame" | `app/src/components/room/leave-sheet.tsx:105` |
| Takipçi sayısı (oda sahibi) | Oda kartı › üyeler | Ionicons "heart" | `app/src/components/room/members.tsx:87` |
| Bekleyen başvuru zili | Oda kartı › üyeler başlığı | Ionicons "notifications" | `app/src/components/room/members.tsx:168` |
| Başvurun onay bekliyor | Oda kartı › üyelik durumu | Ionicons "hourglass-outline" | `app/src/components/room/members.tsx:207` |
| Bu odanın üyesisin | Oda kartı › üyelik durumu | Ionicons "checkmark-circle" | `app/src/components/room/members.tsx:219` |
| Yönetici olarak üyesin | Oda kartı › üyelik durumu | Ionicons "shield-checkmark" | `app/src/components/room/members.tsx:229` |
| Patron koltuğuna otur | Patron Koltuğu sayfası | Ionicons "arrow-up-circle-outline" (Not: `ROOM_ICON_ART.bossSeat` var) | `app/src/components/room/owner.tsx:1317` |
| Hediye gönder | Patron Koltuğu sayfası (Otomatik mod) | Ionicons "gift" (Not: 3D "gift" var) | `app/src/components/room/owner.tsx:1319` |
| Profili gör | Patron Koltuğu sayfası | Ionicons "person-outline" | `app/src/components/room/owner.tsx:1320` |
| Koltuktan kalk | Patron Koltuğu sayfası | Ionicons "arrow-down-circle-outline" | `app/src/components/room/owner.tsx:1321` |
| Koltuktan indir | Patron Koltuğu sayfası (yönetici) | Ionicons "arrow-down-circle-outline" | `app/src/components/room/owner.tsx:1322` |

Toplam: 18

### Topluluk, müzik, roket, hediye paneli sekmeleri
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Odaya davet et (takipçilere) | Odayı paylaş sayfası | Ionicons "megaphone-outline" | `app/src/components/room/community.tsx:594` |
| Diğer uygulamalarla paylaş | Odayı paylaş sayfası | Ionicons "share-social-outline" | `app/src/components/room/community.tsx:623` |
| Anket kartı başlığı | Odadaki açık anket | emoji 📊 (Not: `ROOM_ICON_ART.poll` var) | `app/src/components/room/community.tsx:80` |
| Topluluk hedefi kartı | Odadaki açık hedef | emoji 🎯 (+ ücretliyse 💰). Not: `ROOM_ICON_ART.goal` var | `app/src/components/room/community.tsx:154` |
| Hedef türü: Yeni katılımcı | Hedef oluştur çipleri | emoji 👥 (Text içinde, 3D'ye çevrilmiyor) | `app/src/components/room/community.tsx:183` |
| Hedef türü: Beğeni | Hedef oluştur çipleri | emoji ❤️ (Text içinde) | `app/src/components/room/community.tsx:184` |
| Hedef türü: Etkinlik katılımı | Hedef oluştur çipleri | emoji 📅 | `app/src/components/room/community.tsx:185` |
| Hatırlat / Hatırlatılacak | Oda etkinlikleri satırı düğmesi | emoji 🔕 / 🔔 | `app/src/components/room/community.tsx:254` |
| Çalan parça çubuğu | Sahnenin üstü (müzik çalarken) | emoji 🎵 (Not: `ROOM_ICON_ART.music` var) | `app/src/components/room/panels.tsx:115` |
| Lisanslı kütüphane satırı (demo) | Müzik sayfası | emoji 🎶 | `app/src/components/room/panels.tsx:231` |
| Çalma listesi boş | Müzik sayfası (canlı) | Ionicons "musical-notes-outline" | `app/src/components/room/room-music.tsx:367` |
| Kütüphanen boş | Müzik › Kütüphane | Ionicons "library-outline" | `app/src/components/room/room-music.tsx:759` |
| Roket ödülü: Çerçeve | Oda roketi sayfası ödülleri | dosya eksik → emoji 🖼️ (mağaza/çerçeve resmi yoksa) | `app/src/components/room/room-rocket.tsx:29`, `:56` |
| Roket ödülü: Giriş efekti | Oda roketi ödülleri | dosya eksik → emoji ✨ | `app/src/components/room/room-rocket.tsx:29` |
| Roket ödülü: Araç | Oda roketi ödülleri | dosya eksik → emoji 🏎️ | `app/src/components/room/room-rocket.tsx:29` |
| Roket ödülü: Sohbet balonu | Oda roketi ödülleri | dosya eksik → emoji 💬 (Text içinde) | `app/src/components/room/room-rocket.tsx:29` |
| Roket ödülü: Mikrofon dalgası | Oda roketi ödülleri | dosya eksik → emoji 🔊 | `app/src/components/room/room-rocket.tsx:29` |
| Roket ödülü: bilinmeyen tür | Oda roketi ödülleri | yedek ikon (emoji 🎁) | `app/src/components/room/room-rocket.tsx:56` |
| Roket katkı sırası 1-2-3 | Oda roketi › Katkı sıralaması | emoji 🥇 🥈 🥉 (Not: Art "derece-1/2/3" var) | `app/src/components/room/room-rocket.tsx:139` |

Not: Oda roketinin şu an kapalı olması mümkün (sahibin açık kararı). Hediye paneli rafları bölüm 1'de sayıldı.

Toplam: 19 (3 satır başka bölümde sayıldı)

### Alt sekme çubuğu
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Ana Sayfa | Alt sekme | Ionicons "home-outline" / "home" | `app/src/app/(tabs)/_layout.tsx:91` |
| Anlar | Alt sekme | Ionicons "aperture-outline" / "aperture" | `app/src/app/(tabs)/_layout.tsx:92` |
| Odalar | Alt sekme | Ionicons "mic-outline" / "mic" | `app/src/app/(tabs)/_layout.tsx:97` |
| Mesajlar | Alt sekme | Ionicons "chatbox-ellipses-outline" / "chatbox-ellipses" | `app/src/app/(tabs)/_layout.tsx:106` |
| Ben | Alt sekme | Ionicons "person-circle-outline" / "person-circle" | `app/src/app/(tabs)/_layout.tsx:109` |

Toplam: 5

### Odalar sekmesi
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Sıralama | Odalar başlığı | Ionicons "trophy-outline" (Not: 3D "trophy" var) | `app/src/app/(tabs)/index.tsx:178` |
| Etkinlikler | Odalar başlığı | Ionicons "calendar-outline" | `app/src/app/(tabs)/index.tsx:182` |
| Bildirimler | Odalar başlığı | Ionicons "notifications" | `app/src/app/(tabs)/index.tsx:188` |
| Aile kur / katıl | Kategori çubuğunun sağı | Ionicons "people" + "add" (Not: 3D "tent" var) | `app/src/app/(tabs)/index.tsx:395` |
| Ülke seç: Tüm ülkeler seçiliyken | Kategori çubuğunun sağı | Ionicons "globe" (Not: Art "ulke-tum-ulkeler" var) | `app/src/app/(tabs)/index.tsx:403`, `:213` |
| Ülke listesi: Tüm ülkeler | "Ülke seç" sayfası | emoji 🌍 (Not: Art var) | `app/src/app/(tabs)/index.tsx:283`, `app/src/data/rooms-ui.ts:24` |
| Ülke listesi: Türkiye | "Ülke seç" sayfası | emoji 🇹🇷 (Not: Art "ulke-turkiye" var) | `app/src/data/rooms-ui.ts:25` |
| Ülke listesi: Azerbaycan | "Ülke seç" sayfası | emoji 🇦🇿 (Not: Art var) | `app/src/data/rooms-ui.ts:26` |
| Ülke listesi: Almanya | "Ülke seç" sayfası | emoji 🇩🇪 (Not: Art var) | `app/src/data/rooms-ui.ts:27` |
| Öneri nedeni: takip ettiğin kişi | Sana göre / öne çıkan oda kartı | Ionicons "person" | `app/src/app/(tabs)/index.tsx:295` |
| Öneri nedeni: son girdiğin | Aynı | Ionicons "time" | `app/src/app/(tabs)/index.tsx:295` |
| Öneri nedeni: ilgi alanı | Aynı | Ionicons "sparkles" | `app/src/app/(tabs)/index.tsx:295` |
| Öneri nedeni: yakınında | Aynı | Ionicons "location" | `app/src/app/(tabs)/index.tsx:295` |
| Öneri nedeni: popüler | Aynı | Ionicons "flame" | `app/src/app/(tabs)/index.tsx:295` |
| "SANA EN YAKIN ODA" etiketi | Öne çıkan oda kartı | Ionicons "compass" | `app/src/app/(tabs)/index.tsx:309` |
| Kapalı oda rozeti | Oda kartı kapağı | Ionicons "moon" | `app/src/app/(tabs)/index.tsx:591` |
| Şifreli oda işareti | Odam kartı, oda kartı, oda arama | Ionicons "lock-closed" | `app/src/app/(tabs)/index.tsx:499`, `:604`, `:728` |
| Dinleyici sayısı | Odam kartı, oda arama | Ionicons "stats-chart" | `app/src/app/(tabs)/index.tsx:513`, `:736` |

Toplam: 18

### Ana Sayfa sekmesi (kesfet)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Hemen Tanış kutucuğu | Ana Sayfa üstündeki 4 kutucuk | Ionicons "mic" + "videocam" (Aile ve Jeton Kazan kutucuklarında 3D var) | `app/src/app/(tabs)/kesfet.tsx:274-275` |
| Canlı Odalar kutucuğu | Aynı | Ionicons "people" + "wifi" | `app/src/app/(tabs)/kesfet.tsx:281-282` |
| Şehir bazlı keşif açık | Yakındakiler sekmesi bandı | Ionicons "location" | `app/src/app/(tabs)/kesfet.tsx:190` |

Toplam: 3 (5 satır başka bölümde sayıldı)

### Anlar sekmesi
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Bildirimler | Anlar başlığı | Ionicons "notifications-outline" | `app/src/app/(tabs)/anlar.tsx:575` |
| Görüntülenme sayısı | Konu kartı | Ionicons "eye-outline" | `app/src/app/(tabs)/anlar.tsx:685` |

Toplam: 2 (8 satır başka bölümde sayıldı)

### Mesajlar sekmesi (sistem satırları)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Gelen arama | Arama geçmişi satırı | Ionicons "arrow-down" | `app/src/app/(tabs)/mesajlar.tsx:504` |
| Giden arama | Arama geçmişi satırı | Ionicons "arrow-up" | `app/src/app/(tabs)/mesajlar.tsx:505` |
| Cevapsız arama | Arama geçmişi satırı | Ionicons "close" | `app/src/app/(tabs)/mesajlar.tsx:506` |

Toplam: 3 (4 satır başka bölümde sayıldı)

### "Ben" sekmesi menü satırları
Bu satırların bir kısmında 3D resim var (Gelir, Jeton Noktası, Çarşı, Çantam, Cömertlik ve Yankı, Benim Koruma, Yayıncı Merkezi, Ajans, Sıralama, Hemen Tanış). Aşağıdakiler `profil.tsx:327` ile Ionicons gösteriyor.

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Çıkış yap | Ben sayfasının altı | Ionicons "log-out-outline" | `app/src/app/(tabs)/profil.tsx:310` |

Toplam: 1 (7 satır başka bölümde sayıldı)

### Ayarlar (`app/src/app/ayarlar.tsx`)
Bütün satırlar `components/list.tsx` ListRow ile Ionicons çiziyor. Satırlar sırayla:

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| E-posta / E-posta ekle | Ayarlar › Hesap | Ionicons "mail-outline" | `app/src/app/ayarlar.tsx:208` |
| Telefon / Telefonunu doğrula | Ayarlar › Hesap | Ionicons "call-outline" | `app/src/app/ayarlar.tsx:218` |
| İşlem geçmişi | Ayarlar › Hesap | Ionicons "receipt-outline" | `app/src/app/ayarlar.tsx:226` |
| Oturum: web cihazı | Ayarlar › Aktif oturumlar | Ionicons "desktop-outline" | `app/src/app/ayarlar.tsx:123`, `:236` |
| Oturum: telefon | Ayarlar › Aktif oturumlar | Ionicons "phone-portrait-outline" | `app/src/app/ayarlar.tsx:123`, `:236` |
| Oturumlar yüklenemedi | Ayarlar › Aktif oturumlar (canlı) | Ionicons "cloud-offline-outline" | `app/src/app/ayarlar.tsx:116` |
| Oturumlar yükleniyor… | Ayarlar › Aktif oturumlar (canlı) | Ionicons "time-outline" | `app/src/app/ayarlar.tsx:118` |
| Yakındakileri göster | Ayarlar › Keşfet | Ionicons "location-outline" | `app/src/app/ayarlar.tsx:288` |
| Profilim herkese açık | Ayarlar › Gizlilik | Ionicons "globe-outline" | `app/src/app/ayarlar.tsx:298` |
| Çevrimiçi durumumu göster | Ayarlar › Gizlilik | Ionicons "radio-button-on-outline" | `app/src/app/ayarlar.tsx:302` |
| Son görülme bilgimi göster | Ayarlar › Gizlilik | Ionicons "time-outline" | `app/src/app/ayarlar.tsx:303` |
| Bulunduğum odayı profilimde göster | Ayarlar › Gizlilik | Ionicons "mic-outline" | `app/src/app/ayarlar.tsx:306` |
| Profilime iz bırakılmasın | Ayarlar › Gizlilik | Ionicons "sparkles-outline" | `app/src/app/ayarlar.tsx:313` |
| Adım genel duyurularda görünmesin | Ayarlar › Gizlilik | Ionicons "earth-outline" | `app/src/app/ayarlar.tsx:320` |
| Kazançlarımda adım görünsün (demo) | Ayarlar › Gizlilik | Ionicons "megaphone-outline" | `app/src/app/ayarlar.tsx:323` |
| Aynı şehirde keşfedilebilir ol (demo) | Ayarlar › Gizlilik | Ionicons "location-outline" | `app/src/app/ayarlar.tsx:324` |
| Odalara gizli giriş (demo) | Ayarlar › Gizlilik | Ionicons "eye-off-outline" (Not: Art "oda-gizli-giris" ve "ayricalik-gizli-oda-girisi" var) | `app/src/app/ayarlar.tsx:327` |
| Koruma | Ayarlar › Gizlilik (canlı) | Ionicons "shield-half-outline" | `app/src/app/ayarlar.tsx:335` |
| Eski ayarları sıfırla | Ayarlar › Gizlilik | Ionicons "refresh-outline" | `app/src/app/ayarlar.tsx:338` |
| Kimseyi engellemedin | Ayarlar › Engellenenler (boş) | Ionicons "shield-checkmark-outline" | `app/src/app/ayarlar.tsx:388` |
| Güvenlik kaydı yok | Ayarlar › Güvenlik kayıtları (boş) | Ionicons "document-text-outline" | `app/src/app/ayarlar.tsx:413` |
| Güvenlik kaydı satırı | Ayarlar › Güvenlik kayıtları | Ionicons "document-text-outline" | `app/src/app/ayarlar.tsx:418` |
| Görünüm: Sistem | Görünüm seçici | Ionicons "phone-portrait-outline" | `app/src/app/ayarlar.tsx:82` |
| Görünüm: Açık | Görünüm seçici | Ionicons "sunny-outline" | `app/src/app/ayarlar.tsx:83` |
| Görünüm: Koyu | Görünüm seçici | Ionicons "moon-outline" | `app/src/app/ayarlar.tsx:84` |
| Animasyon ve giriş efektlerini kapat | Ayarlar › Görünüm ve erişilebilirlik | Ionicons "sparkles-outline" | `app/src/app/ayarlar.tsx:429` |
| Dokunuş titreşimi | Ayarlar › Görünüm ve erişilebilirlik | Ionicons "pulse-outline" | `app/src/app/ayarlar.tsx:430` |
| Hareketi azalt | Ayarlar › Görünüm ve erişilebilirlik | Ionicons "contrast-outline" | `app/src/app/ayarlar.tsx:431` |
| Düşük veri modu | Ayarlar › Görünüm ve erişilebilirlik | Ionicons "cellular-outline" | `app/src/app/ayarlar.tsx:432` |
| Sosyal | Ayarlar › Bildirimler | Ionicons "chatbubbles-outline" | `app/src/app/ayarlar.tsx:436` |
| Takip ettiklerin canlı yayında | Ayarlar › Bildirimler | Ionicons "radio-outline" | `app/src/app/ayarlar.tsx:56` |
| Oda ve arkadaş davetleri | Ayarlar › Bildirimler | Ionicons "mail-outline" | `app/src/app/ayarlar.tsx:57` |
| Etkinlik hatırlatmaları | Ayarlar › Bildirimler | Ionicons "calendar-outline" | `app/src/app/ayarlar.tsx:59` |
| Ajans duyuruları | Ayarlar › Bildirimler | Ionicons "business-outline" | `app/src/app/ayarlar.tsx:60` |
| Hayran kulübü | Ayarlar › Bildirimler | Ionicons "heart-outline" | `app/src/app/ayarlar.tsx:61` |
| Oyun ve turnuva | Ayarlar › Bildirimler | Ionicons "game-controller-outline" | `app/src/app/ayarlar.tsx:62` |
| Ödeme ve hak ediş | Ayarlar › Bildirimler | Ionicons "card-outline" | `app/src/app/ayarlar.tsx:63` |
| Sistem | Ayarlar › Bildirimler | Ionicons "settings-outline" | `app/src/app/ayarlar.tsx:64` |
| Destek merkezi | Ayarlar › Destek | Ionicons "help-buoy-outline" | `app/src/app/ayarlar.tsx:465` |
| Bir karara itiraz et | Ayarlar › Destek | Ionicons "scale-outline" | `app/src/app/ayarlar.tsx:467` |
| Kullanım Koşulları | Ayarlar › Destek | Ionicons "document-text-outline" | `app/src/app/ayarlar.tsx:472` |
| Gizlilik Politikası | Ayarlar › Destek | Ionicons "shield-checkmark-outline" | `app/src/app/ayarlar.tsx:473` |
| Açık kaynak lisansları | Ayarlar › Destek | Ionicons "code-slash-outline" | `app/src/app/ayarlar.tsx:474` |
| Güncelleme mevcut | Ayarlar › Destek | Ionicons "cloud-download-outline" | `app/src/app/ayarlar.tsx:478` |
| Uygulama sürümü | Ayarlar › Destek | Ionicons "information-circle-outline" | `app/src/app/ayarlar.tsx:491` |
| Bağlantı testi | Ayarlar › Destek | Ionicons "pulse-outline" | `app/src/app/ayarlar.tsx:620` |
| Verilerimin kopyasını iste | Ayarlar › Hesap verileri | Ionicons "download-outline" | `app/src/app/ayarlar.tsx:508`, `:516` |
| Çıkış yap | Ayarlar › Hesap verileri | Ionicons "log-out-outline" | `app/src/app/ayarlar.tsx:519` |
| Demo verilerini sıfırla | Ayarlar › Hesap verileri (demo) | Ionicons "refresh-outline" | `app/src/app/ayarlar.tsx:533` |
| Hesabı sil | Ayarlar › Hesap verileri | Ionicons "trash-outline" | `app/src/app/ayarlar.tsx:547` |

Not: `spend-limit-live.tsx`, `licenses-sheet.tsx` ve `data/privacy.ts` içinde simge yok (yalnız metin ve seçim çipleri).

Toplam: 50

### Mesaj ayarları (`components/message-prefs.tsx`)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|

Toplam: 0 (7 satır başka bölümde sayıldı)

### Cüzdan (Jeton Yükle / Hareketler)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Hareketler / Jeton Yükle geçişi | Cüzdan başlığı | Ionicons "document-text-outline" / "wallet-outline" | `app/src/app/cuzdan.tsx:125` |
| Destek | Cüzdan başlığı | Ionicons "headset-outline" | `app/src/app/cuzdan.tsx:128` |
| Filtre: Jeton | Hareketler filtre çipi | emoji 🪙 (Text içinde; 3D "coin" var) | `app/src/app/cuzdan.tsx:141` |
| Filtre: Elmas | Hareketler filtre çipi | emoji 💎 (Text içinde; 3D "diamond" var) | `app/src/app/cuzdan.tsx:142` |
| Hareket satırı (tür simgesi) | Hareketler listesi (canlı ve demo) | boş: satırda yalnız açıklama ve tutar var (Not: yükleme iskeleti 36 pt yüz yeri ayırıyor) | `app/src/app/cuzdan.tsx:168-182`, `:189-200` |
| Kampanya kartı (+% ek jeton) | Jeton Yükle | Ionicons "gift" (Not: 3D "gift" var) | `app/src/app/cuzdan.tsx:237` |
| Demo: test jetonu | Jeton Yükle (demo) | Ionicons "flask-outline" | `app/src/app/cuzdan.tsx:226` |

Toplam: 7

### Gelir ve gelir kaynakları
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Arkadaşını Getir | Gelir başlığı | Ionicons "gift" (Not: 3D "gift" ve "envelope" var) | `app/src/app/gelir/index.tsx:127` |
| Müşteri hizmetleri | Gelir başlığı | Ionicons "headset" | `app/src/app/gelir/index.tsx:130` |
| Çekilebilir | Bakiye kartı | Ionicons "lock-open" | `app/src/app/gelir/index.tsx:154` |
| Kilitli | Bakiye kartı | Ionicons "lock-closed" | `app/src/app/gelir/index.tsx:162` |
| Çevir (elmas → jeton) | Bakiye kartı | Ionicons "swap-horizontal" | `app/src/app/gelir/index.tsx:170` |
| Kilitli elmas (başlık) | Gelir | Ionicons "lock-closed" | `app/src/app/gelir/index.tsx:211` |
| Kilitli elmasın yok | Gelir (boş) | Ionicons "lock-open" | `app/src/app/gelir/index.tsx:222` |
| Kilit satırı (kaynak) | Kilitli elmas listesi | boş (hediye adı ya da kaynak metni; resim yok) | `app/src/app/gelir/index.tsx:300-305` |
| Oda hediyeleri | Gelir › kaynaklar (canlı) | Ionicons "mic-outline" | `app/src/components/income-sources.tsx:23`, `server/api/wallet.mjs:307` |
| Şanslı hediyeler | Gelir › kaynaklar | Ionicons "sparkles-outline" | `app/src/components/income-sources.tsx:24`, `server/api/wallet.mjs:308` |
| Mesajdan gelen hediyeler | Gelir › kaynaklar | Ionicons "chatbubble-outline" | `app/src/components/income-sources.tsx:25`, `server/api/wallet.mjs:309` |
| Anlar hediyeleri | Gelir › kaynaklar | Ionicons "images-outline" | `app/src/components/income-sources.tsx:26`, `server/api/wallet.mjs:310` |
| Profilden gelen hediyeler | Gelir › kaynaklar | Ionicons "person-outline" | `app/src/components/income-sources.tsx:27`, `server/api/wallet.mjs:311` |
| Aile sohbetinden gelen hediyeler | Gelir › kaynaklar | Ionicons "people-outline" | `app/src/components/income-sources.tsx:28`, `server/api/wallet.mjs:312` |
| Diğer hediyeler | Gelir › kaynaklar | Ionicons "gift-outline" | `app/src/components/income-sources.tsx:29`, `server/api/wallet.mjs:313` |
| Mesaj ücretleri | Gelir › kaynaklar | Ionicons "mail-outline" | `app/src/components/income-sources.tsx:30`, `server/api/wallet.mjs:314` |
| Sesli arama ve eşleşme | Gelir › kaynaklar | Ionicons "call-outline" (Not: Art "finans-ucretli-aramalar" var, kullanılmıyor) | `app/src/components/income-sources.tsx:31`, `server/api/wallet.mjs:315` |
| Görüntülü arama ve eşleşme | Gelir › kaynaklar | Ionicons "videocam-outline" | `app/src/components/income-sources.tsx:32`, `server/api/wallet.mjs:316` |
| Ajans asistanı payı | Gelir › kaynaklar | Ionicons "ribbon-outline" | `app/src/components/income-sources.tsx:34`, `server/api/wallet.mjs:321` |
| Bilinmeyen kaynak | Gelir › kaynaklar (sunucu yeni anahtar gönderirse) | yedek ikon (Ionicons "diamond-outline") | `app/src/components/income-sources.tsx:78` |

Not: `Art "finans-hediyelerden-kazan"` da var, hediye kaynaklarında kullanılmıyor.

Toplam: 20

### Jeton Noktası (`coins-bank.tsx` demo, `coins-bank-live.tsx` canlı)
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Cüzdanım (sekme) | Jeton Noktası (demo) | Ionicons "wallet" | `app/src/app/coins-bank.tsx:65` |
| Yayıncı (sekme) | Jeton Noktası (demo) | Ionicons "mic" | `app/src/app/coins-bank.tsx:66` |
| Ajans (sekme) | Jeton Noktası (demo) | Ionicons "business" | `app/src/app/coins-bank.tsx:67` |
| BD (sekme) | Jeton Noktası (demo) | Ionicons "git-network" | `app/src/app/coins-bank.tsx:68` |
| Para birimleri | Bölüm başlığı (demo) | Ionicons "information-circle" | `app/src/app/coins-bank.tsx:200` |
| Bonus defteri | Bölüm başlığı (demo) | Ionicons "pricetags" | `app/src/app/coins-bank.tsx:207` |
| Son hareketler | Bölüm başlığı (demo) | Ionicons "receipt" | `app/src/app/coins-bank.tsx:229` |
| Kazançlarım | Bölüm başlığı (demo) | Ionicons "stats-chart" | `app/src/app/coins-bank.tsx:294` |
| Komisyon kuralı | Bölüm başlığı (demo) | Ionicons "calculator" | `app/src/app/coins-bank.tsx:353` |
| Uygun kazanç raporu | Bölüm başlığı (demo) | Ionicons "people" | `app/src/app/coins-bank.tsx:362` |
| Komisyon geçmişi | Bölüm başlığı (demo) | Ionicons "list" | `app/src/app/coins-bank.tsx:384` |
| BD ↔ ajans ilişkileri | Bölüm başlığı (demo) | Ionicons "link" | `app/src/app/coins-bank.tsx:455` |
| BD komisyon kuralı | Bölüm başlığı (demo) | Ionicons "calculator" | `app/src/app/coins-bank.tsx:479` |
| Çift komisyon engellendi | Bölüm başlığı (demo) | Ionicons "shield" | `app/src/app/coins-bank.tsx:487` |
| BD komisyon defteri | Bölüm başlığı (demo) | Ionicons "list" | `app/src/app/coins-bank.tsx:505` |
| Ödeme hesabı | Bölüm başlığı (demo) | Ionicons "card" | `app/src/app/coins-bank.tsx:565` |
| Para çekme talebi | Bölüm başlığı (demo) | Ionicons "cash" | `app/src/app/coins-bank.tsx:655` |
| Ödeme geçmişi | Bölüm başlığı (demo) | Ionicons "time" | `app/src/app/coins-bank.tsx:696` |
| Yayıncı kazancın yok | Kilitli kart (demo) | Ionicons "mic-off" | `app/src/app/coins-bank.tsx:274` |
| Ajans defteri kilitli | Kilitli kart (demo) | Ionicons "lock-closed" | `app/src/app/coins-bank.tsx:327` |
| BD komisyon defteri (kilitli) | Kilitli kart (demo) | Ionicons "git-network" | `app/src/app/coins-bank.tsx:433` |
| Prototip uyarısı | Jeton Noktası (demo) | Ionicons "flask" | `app/src/app/coins-bank.tsx:158` |
| Jeton sat | Bölüm başlığı (canlı) | Ionicons "swap-horizontal" | `app/src/components/coins-bank-live.tsx:145` |
| Anında bozdur | Bölüm başlığı (canlı) | Ionicons "flash" | `app/src/components/coins-bank-live.tsx:210` |
| Jeton Noktaları | Bölüm başlığı (canlı) | Ionicons "storefront" | `app/src/components/coins-bank-live.tsx:246` |
| İşlemlerim | Bölüm başlığı (canlı) | Ionicons "receipt" | `app/src/components/coins-bank-live.tsx:276` |

Not: `exchange-sheet.tsx`, `lib/ledger-view.ts`, `lib/withdraw-*.ts` içinde eksik simge yok (elmas ve jeton 3D).

Toplam: 26

### Destek ve yaptırım ekranı
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Müşteri hizmetleri ana sayfa | Destek sekme çubuğu | Ionicons "home" | `app/src/app/destek.tsx:124` |
| SSS (başlık) | Destek ana sayfa | Ionicons "help-circle" | `app/src/app/destek.tsx:165` |
| Çevrimiçi müşteri hizmetleri | Destek ana sayfa satırı | Ionicons "headset" | `app/src/app/destek.tsx:178` |
| Geri bildirim | Destek ana sayfa satırı | Ionicons "create" | `app/src/app/destek.tsx:179` |
| Sorun Takibi | Destek ana sayfa satırı | Ionicons "chatbubbles" | `app/src/app/destek.tsx:180` |
| Resmi e-posta | Destek ana sayfa satırı | Ionicons "mail" | `app/src/app/destek.tsx:181` |
| Kısıt: Oda sohbetine yazamazsın | Yaptırım ekranı kısıt listesi | yedek ikon (bütün kısıtlarda aynı Ionicons "remove-circle") | `app/src/components/sanction-screen.tsx:33`, `:71` |
| Kısıt: Odada mikrofonu açamazsın | Aynı | yedek ikon (Ionicons "remove-circle") | `app/src/components/sanction-screen.tsx:34` |
| Kısıt: Özel mesaj gönderemezsin | Aynı | yedek ikon (Ionicons "remove-circle") | `app/src/components/sanction-screen.tsx:35` |
| Kısıt: Sesli arama yapamazsın | Aynı | yedek ikon (Ionicons "remove-circle") | `app/src/components/sanction-screen.tsx:36` |
| Kısıt: Hesapla giriş yapılamaz | Aynı | yedek ikon (Ionicons "remove-circle") | `app/src/components/sanction-screen.tsx:37` |
| Kısıt: Bu cihazdan giriş yapılamaz | Aynı | yedek ikon (Ionicons "remove-circle") | `app/src/components/sanction-screen.tsx:38` |
| İtirazın (durum) | Yaptırım ekranı | Ionicons "document-text-outline" | `app/src/components/sanction-screen.tsx:93` |
| Destek e-postası | Yaptırım ekranı | Ionicons "mail-outline" | `app/src/components/sanction-screen.tsx:158` |
| Susturma bandı | Oda / mesaj ekranında susturma bandı | Ionicons "volume-mute" | `app/src/components/sanction-screen.tsx:261` |

Not: `report-sheet.tsx` içinde simge yok. Destek konu çipleri yalnız metin.

Toplam: 15

### Boş durum, hata ve bilgi ekranları
Not: Boş durum maskotu (`Art "maskot-bos-durum-maskotu"`) var ama yalnız `gelir/detay.tsx:304` ve `kullanici/[id].tsx:945` kullanıyor. Aşağıdakiler Ionicons (çoğu `StateIcon`).

| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Bu bölüm yakında | Açılmamış ekranlar | Ionicons "time-outline" | `app/src/components/coming-soon.tsx:19` |
| Aramalar yakında | Arama kapalıyken | Ionicons "call-outline" | `app/src/components/calls-unavailable.tsx:18` |
| Yükleme hatası satırı | Birçok ekranda "Tekrar dene" kutusu | Ionicons "cloud-offline-outline" | `app/src/components/load-error.tsx:14` |
| Yetkin yok | Yetkisiz ekran | Ionicons "lock-closed-outline" | `app/src/components/no-access.tsx:16` |
| Uygulama çöktü | Hata ekranı | Ionicons "refresh" | `app/src/components/crash-screen.tsx:30` |
| Yeni sürüm hazır | Güncelleme kartı | Ionicons "cloud-download" | `app/src/components/update-prompt.tsx:50` |
| Oda bulunamadı | Oda bağlantısı hatalıyken | Ionicons "radio-outline" | `app/src/app/oda/[id].tsx:42` |
| Şifreli oda kapısı (canlı) | Şifreli odaya girerken | Ionicons "lock-closed" | `app/src/app/oda/[id].tsx:136` |
| Şifreli oda kapısı (demo) | Şifreli odaya girerken | Ionicons "lock-closed" | `app/src/components/room/panels.tsx:82` |
| Arkadaşların anı yok | Anlar › Arkadaşlar (boş) | Ionicons "people-outline" | `app/src/app/(tabs)/anlar.tsx:111`, `:481` |
| Bu konuda an yok | Anlar › konu (boş) | Ionicons "moon-outline" | `app/src/app/(tabs)/anlar.tsx:111`, `:481` |
| Anlar yüklenemedi | Anlar | Ionicons "cloud-offline-outline" | `app/src/app/(tabs)/anlar.tsx:470` |
| Şehir bazlı keşfi aç | Ana Sayfa › Yakındakiler | Ionicons "location-outline" | `app/src/app/(tabs)/kesfet.tsx:202` |
| Kişiler yüklenemedi | Ana Sayfa | Ionicons "cloud-offline-outline" | `app/src/app/(tabs)/kesfet.tsx:220` |
| Kişi bulunamadı / yükleniyor | Ana Sayfa (boş liste) | Ionicons "search-outline" (büyük boş durum resmi olarak) | `app/src/app/(tabs)/kesfet.tsx:227` |

Toplam: 15 (1 satır başka bölümde sayıldı)

### Giriş, kayıt ve doğrulama
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Google ile devam et | Giriş ekranı | Ionicons "logo-google" (Not: marka logosu; yeni çizim gerekmeyebilir) | `app/src/app/giris/index.tsx:107`, `:150` |
| Apple ile devam et | Giriş ekranı (demo) | Ionicons "logo-apple" (Not: marka logosu) | `app/src/app/giris/index.tsx:151` |
| E-posta ile devam et | Giriş ekranı | Ionicons "mail" | `app/src/app/giris/index.tsx:108` |
| Telefonla devam et | Giriş ekranı | Ionicons "call" | `app/src/app/giris/index.tsx:109`, `:133` |
| Bu telefondaki hesapla giriş yap | Giriş ekranı | Ionicons "log-in" | `app/src/app/giris/index.tsx:111` |
| Bu telefonla hesap oluştur | Giriş ekranı | Ionicons "person-add" | `app/src/app/giris/index.tsx:112` |
| Demo hesabıyla hızlı giriş | Giriş ekranı (demo) | Ionicons "flash" | `app/src/app/giris/index.tsx:154` |
| Aydınlık bir yerde ol | Selfie doğrulama ipuçları | Ionicons "sunny-outline" | `app/src/app/giris/dogrulama.tsx:21` |
| Gözlük ve şapkayı çıkar | Selfie doğrulama ipuçları | Ionicons "glasses-outline" | `app/src/app/giris/dogrulama.tsx:22` |
| Yüzün tam ortada olsun | Selfie doğrulama ipuçları | Ionicons "happy-outline" | `app/src/app/giris/dogrulama.tsx:23` |
| Selfie çerçevesi | Selfie doğrulama | Ionicons "scan-outline" | `app/src/app/giris/dogrulama.tsx:74` |
| Profil fotoğrafı ekle | Kayıt › profil | Ionicons "camera" | `app/src/app/giris/profil.tsx:153` |
| WhatsApp ile doğrula | Telefon doğrulama sayfası | Ionicons "logo-whatsapp" (Not: marka logosu) | `app/src/components/verify-sheet.tsx:296` |
| Doğrulandı rozeti | Ayarlar › E-posta/Telefon satırı | Ionicons "checkmark-circle" | `app/src/components/verify-sheet.tsx:40` |

Not: `starter.tsx` (ilk adımlar) satırları 3D resimli; eksik yok.

Toplam: 14

### Arama ekranları
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Şikâyet et / engelle düğmesi | Görüşme ekranı üstü | Ionicons "shield-checkmark-outline" | `app/src/components/call-stage.tsx:106` |
| Şikâyet et | Görüşme menüsü | Ionicons "flag-outline" | `app/src/components/call-stage.tsx:116` |
| Engelle | Görüşme menüsü | Ionicons "ban-outline" | `app/src/components/call-stage.tsx:117` |
| Güzellik | Görüşme araçları | Ionicons "sparkles" | `app/src/components/call-stage.tsx:230` |
| Maske | Görüşme araçları | Ionicons "glasses" | `app/src/components/call-stage.tsx:231` |
| Kamera kapalı (kendi önizleme) | Görüntülü görüşme | Ionicons "videocam-off" | `app/src/components/call-stage.tsx:241` |
| Mikrofonu kapat | Görüşme kontrolleri | Ionicons "mic" | `app/src/components/call-stage.tsx:277` |
| Mikrofonu aç | Görüşme kontrolleri | Ionicons "mic-off" | `app/src/components/call-stage.tsx:277` |
| Kamerayı kapat | Görüşme kontrolleri | Ionicons "videocam" | `app/src/components/call-stage.tsx:278` |
| Kamerayı aç | Görüşme kontrolleri | Ionicons "videocam-off" | `app/src/components/call-stage.tsx:278` |
| Kamerayı çevir | Görüşme kontrolleri | Ionicons "camera-reverse" | `app/src/components/call-stage.tsx:279` |
| Hediye gönder | Görüşme kontrolleri | Ionicons "gift" (Not: 3D "gift" var) | `app/src/components/call-stage.tsx:280` |
| Görüşmeyi bitir | Görüşme kontrolleri | Ionicons "call" (döndürülmüş) | `app/src/components/call-stage.tsx:283` |
| Aramayı reddet | Gelen arama kartı | Ionicons "call" (döndürülmüş) | `app/src/components/incoming-call.tsx:72` |
| Aramayı cevapla | Gelen arama kartı | Ionicons "call" / "videocam" | `app/src/components/incoming-call.tsx:75` |
| Reddet / İptal | Arama ekranı | Ionicons "call" (döndürülmüş) | `app/src/components/live-call.tsx:181` |
| Cevapla | Arama ekranı | Ionicons "call" / "videocam" | `app/src/components/live-call.tsx:182` |

Toplam: 17

### Metin içi emoji
- `app/src/components/room/live-room.tsx`: yaklaşık 99 emoji, sohbet sistem mesajlarında ve uyarılarda (ör. "📣 Oda daveti …", "📨 … odaya girdi", "🎁 … gönderdi", "✨").
- `app/src/components/room/community.tsx`: 14 tane (ör. "⛔ … süreyle", "❌ İPTAL", "🎤 seçildi", sayfa başlıkları "📨 Odayı paylaş", "🎁 Gönderim sonucu"). Kart ve çip olanlar "Topluluk, müzik, roket" tablosunda.
- `app/src/components/room/room-rocket.tsx`: 11 tane; ödül ve sıra emojileri "Topluluk, müzik, roket" tablosunda, kalanı "Kalktı 🚀" metinleri.
- `app/src/components/room/panels.tsx`: 10 tane (ör. "🙋 istek", "▶", "Dağıt · 🪙", "🏆/😢" zar sonucu).
- `app/src/components/room/room-screen.tsx`: 6 tane (ör. "📺 Ortak ekranda …", "⚠️ Bu cihazda", "⏸/▶/⏹").
- `app/src/components/room/pk.tsx`: 4 tane, süre etiketleri (📨 ⏳ ⏱).
- `app/src/components/room/owner.tsx`: 4 tane (oda seviyesi listesi "✅/🔒 LV…", "🪙 tutar", "🛡️ yönetici adı").
- `app/src/components/room/gift-sheet.tsx`: 2 tane ("🎧" dinleyici etiketi, "💗 yakınlık").
- `app/src/components/room/room-music.tsx`, `lucky-bag.tsx`, `gift-combo.tsx`, `balcony.tsx`, `layout-picker.tsx`, `lib/room-invites.ts`: 1-2'şer tane, uyarı ve bildirim metinlerinde.
- `app/src/app/coins-bank.tsx`: 13 tane (💎 🪙 🎟 🎮 🏢 tutar ve açıklama metinlerinde).
- `app/src/app/gelir/index.tsx` ve `gelir/detay.tsx`: 8'er tane (💎 tutarlar, 🎁).
- `app/src/components/call-stage.tsx`: 7 tane (💎 🎁 kazanç notları). `live-call.tsx`: 1 tane (💎).
- `app/src/app/(tabs)/profil.tsx`: 7 tane (kısayolların emojisi 3D'ye çevriliyor. Oyun kutucuklarının emojileri oyun bölümüne ait).
- `app/src/app/cuzdan.tsx`: 5 tane ("Bugün: 🪙 … harcandı", 🎉). Filtre çipleri "Cüzdan" tablosunda.
- `app/src/app/giris/index.tsx`: 5 tane (demo profil ilgi alanları "🎧 Müzik 🎮 Oyun 💬 Sohbet"). `giris/profil.tsx`: 2 tane (👋 🎉). `giris/dogrulama.tsx`: 1 tane (🎉).
- `app/src/components/exchange-sheet.tsx` 3, `income-sources.tsx` 2, `ayarlar.tsx` 2 (💩 açıklamada), `(tabs)/kesfet.tsx` 1 (👋), `(tabs)/anlar.tsx` 1 (💬).

### Yönetim ekranları
| Öğe | Nerede görünüyor | Şu an ne gösteriliyor | Kaynak |
|---|---|---|---|
| Animasyon kataloğu yönetimi (demo) | Ben › büyüme grubu | Ionicons "sparkles-outline" | `app/src/app/(tabs)/profil.tsx:52` |
| PK yönetimi (demo) | Ben › büyüme grubu | Ionicons "flash-outline" | `app/src/app/(tabs)/profil.tsx:53` |
| Şanslı hediye yönetimi (demo) | Ben › büyüme grubu | Ionicons "leaf-outline" | `app/src/app/(tabs)/profil.tsx:54` |
| Rol ve Yetki Merkezi (demo) | Ben › büyüme grubu | Ionicons "key-outline" | `app/src/app/(tabs)/profil.tsx:55` |
| Ajans başvuru yönetimi (demo) | Ben › büyüme grubu | Ionicons "briefcase-outline" | `app/src/app/(tabs)/profil.tsx:56` |
| Bekleyen: Para çekme | Yönetim › Özet kutucukları | Ionicons "cash-outline" | `app/src/components/admin/overview.tsx:96` |
| Bekleyen: Ajans ödemesi | Yönetim › Özet kutucukları | Ionicons "business-outline" | `app/src/components/admin/overview.tsx:97` |
| Bekleyen: Şikâyet | Yönetim › Özet kutucukları | Ionicons "flag-outline" | `app/src/components/admin/overview.tsx:98` |
| Bekleyen: Destek | Yönetim › Özet kutucukları | Ionicons "chatbubbles-outline" | `app/src/components/admin/overview.tsx:99` |
| Yönetim sekmeleri (14 sekme: Özet … Yaptırımlar) | Yönetim paneli sekme çubuğu | boş (yalnız metin) | `app/src/components/admin/admin-panel.tsx:38-52` |
| Oyun jetonu bakiyesi | Sunucu hesabı | Ionicons "game-controller" (jeton ve elmasta 3D var) | `app/src/app/sunucu-hesabi.tsx:112` |
| Yönetim boş durumları | Şikâyet, ödeme, iade listeleri | Ionicons ("file-tray-outline", "checkmark-done-outline", "receipt-outline", "cloud-offline-outline") | `app/src/components/admin/reports.tsx:32`, `agency-payouts.tsx:39-40`, `refunds.tsx:99`, `parts.tsx:170` |
| Oyun adı (kapak yoksa) | Oyun kataloğu yönetimi | emoji (oyun emojisi) | `app/src/app/oyun-yonetimi.tsx:78` |

Toplam: 13 (3 satır başka bölümde sayıldı)

## Sayılar

### Bölüm başına

| # | Bölüm | İkonu olmayan öğe | Yönetim ekranı |
|---|---|---|---|
| 1 | Hediyeler, Şanslı paketleri, çıkartmalar, animasyonlar | 54 | 8 |
| 2 | Mağaza (Çarşı), Çanta, VIP, Rütbe, seviyeler | 47 | 0 |
| 3 | Profil: izler, rozetler, madalyalar, unvanlar, yetkili/yayıncı rozetleri, ek bilgiler | 66 | 6 |
| 4 | Bağlar | 14 | 0 |
| 5 | Aile / Kabile | 46 | 0 |
| 6 | Ajans | 40 | 8 |
| 7 | Bildirimler, mesajlar ve sosyal | 138 | 0 |
| 8 | Oyunlar, Oyun Salonu, oda oyunları, roket, görevler, etkinlikler, Koruma | 101 | 7 |
| 9 | Oda, ana sayfa ve sekmeler, menüler, ayarlar, cüzdan, destek | 345 | 13 |
| | **Toplam** | **851** | **42** |

### Alt grup başına

| Bölüm | Alt grup | Adet |
|---|---|---|
| 1 | Hediye paneli: sekmeler ve rozetler | 18 |
| 1 | Hediyenin emojiyle yazıldığı listeler (GiftArt kullanılmıyor) | 6 |
| 1 | Bilinmeyen hediye yedeği | 3 |
| 1 | Şanslı (Lucky) paketleri | 6 |
| 1 | Büyük hediye gösterileri: parça resimleri eksik | 13 |
| 1 | Çıkartmalar ve emoji paneli | 5 |
| 1 | Animasyonlar ve efekt hediyeleri | 1 |
| 1 | Şanslı çanta (odada hediye/jeton çantası) | 2 |
| 2 | Çarşı (mağaza) | 6 |
| 2 | Çantam | 5 |
| 2 | Oda süsleri ve koltuk rengi | 1 |
| 2 | VIP (VIP 1–10 ve Abonelik) | 5 |
| 2 | VIP hakları ↔ `Art.tsx` `ayricalik-*` eşleşmesi | 0 |
| 2 | Rütbe (Şövalye … Dük) | 10 |
| 2 | Seviyeler (Cömertlik / Yankı) | 9 |
| 2 | Kalp seviyesi (sohbet kalbi) | 5 |
| 2 | Oda seviyesi ve oda katkısı | 5 |
| 2 | Para ürünleri (mağaza/VIP bağlamı) | 1 |
| 3 | Profil izleri (Muzip hediyeler) | 4 |
| 3 | Profil rozet satırı ve bağlılık hapları | 7 |
| 3 | Profil sayfası kartları (Bağlar, Temel Bilgiler, Vitrin başlıkları) | 21 |
| 3 | Madalyalar ve unvanlar | 7 |
| 3 | Profil ek bilgileri (ilgi alanları, burç, etiketler, ilişki, eğitim) | 12 |
| 3 | VIP / Rütbe hakları (data/status.ts) | 0 |
| 3 | Yayıncı Merkezi ve yayıncı rozetleri | 8 |
| 3 | Profil sekmesi menüsü (kendi profilim) | 7 |
| 4 | Bağ türleri (Bağ kur menüsü, oda sohbeti bağ çipi) | 8 |
| 4 | Bağ ödülleri ve bağ eylemleri | 6 |
| 5 | Aile kimliği (amblem, rütbe, seviye) | 16 |
| 5 | Aile görevleri | 7 |
| 5 | Aile sandıkları ve kasa | 7 |
| 5 | Aile ekranı kutucukları, kısayollar, listeler | 16 |
| 6 | Ajans kimliği, statü ve kademeler | 12 |
| 6 | Ajans başvurusu | 6 |
| 6 | Ajans ofisi (sahip/ekip ekranı) | 12 |
| 6 | Ajans girişi (yayıncı tarafı) ve demo ajans ekranları | 10 |
| 7 | Bildirimler ekranı: bildirim türleri | 25 |
| 7 | SimilarClub Sistem (Mesajlar › resmî bildirim sohbeti, `app/src/components/team-inbox.tsx`) | 18 |
| 7 | Mesajlar sekmesi: liste ve özel satırlar | 17 |
| 7 | Birebir sohbet: araçlar, ek türleri, menüler | 15 |
| 7 | Grup sohbeti (aile / ajans grubu, `app/src/components/GroupChat.tsx`) | 7 |
| 7 | Keşfet / Ana Sayfa kişi listesi | 15 |
| 7 | Anlar | 10 |
| 7 | Başka kişinin profili: sosyal eylemler | 16 |
| 7 | Ziyaretçiler ve takip listeleri | 2 |
| 7 | Hemen Tanış ve birebir arama | 8 |
| 7 | Arkadaşını Getir: davet ve davet ödülleri | 5 |
| 8 | Oyun kapakları (katalog: Oyun Merkezi, oda menüsü, oyun paneli) | 8 |
| 8 | Oyun Merkezi ekranı | 1 |
| 8 | Rüzgâr Gülü (çark) | 3 |
| 8 | Yörünge (roket oyunu) ve Canlı Yörünge | 8 |
| 8 | Balon Avı | 14 |
| 8 | Yıldız Avı | 8 |
| 8 | Pachinko | 7 |
| 8 | Diğer salon makineleri ve kazanç gösterisi | 4 |
| 8 | Oda oyunları (masa parçaları, `table-art.tsx` içinde hepsi `null`) | 31 |
| 8 | Oda roketi | 1 |
| 8 | PK | 0 |
| 8 | Görevler | 2 |
| 8 | Etkinlik Merkezi | 6 |
| 8 | Koruma | 3 |
| 8 | Patron koltuğu | 0 |
| 8 | Şanslı torba | 0 |
| 8 | Coins Bank ve Jeton Noktası | 5 |
| 9 | Oda menüsü – "Oda" araç bölümü | 5 |
| 9 | Oda kartı (RoomInfoSheet) | 13 |
| 9 | Oda üst çubuğu ve alt çubuk | 14 |
| 9 | Koltuk menüsü (mikrofona dokununca) | 25 |
| 9 | Balkon (odadakiler listesi) kişi işlemleri | 8 |
| 9 | Oda yönetimi seçim listeleri (yasaklar, yöneticiler, DJ'ler) | 8 |
| 9 | Oda ayarları satırları (simgesiz) | 27 |
| 9 | Oda kartı rozetleri, rol işaretleri, kamera | 12 |
| 9 | Sahne düzeni, çıkış, üyelik, patron koltuğu | 18 |
| 9 | Topluluk, müzik, roket, hediye paneli sekmeleri | 19 |
| 9 | Alt sekme çubuğu | 5 |
| 9 | Odalar sekmesi | 18 |
| 9 | Ana Sayfa sekmesi (kesfet) | 3 |
| 9 | Anlar sekmesi | 2 |
| 9 | Mesajlar sekmesi (sistem satırları) | 3 |
| 9 | "Ben" sekmesi menü satırları | 1 |
| 9 | Ayarlar | 50 |
| 9 | Mesaj ayarları | 0 |
| 9 | Cüzdan (Jeton Yükle / Hareketler) | 7 |
| 9 | Gelir ve gelir kaynakları | 20 |
| 9 | Jeton Noktası | 26 |
| 9 | Destek ve yaptırım ekranı | 15 |
| 9 | Boş durum, hata ve bilgi ekranları | 15 |
| 9 | Giriş, kayıt ve doğrulama | 14 |
| 9 | Arama ekranları | 17 |

## Tasarımcıya öncelik sırası

Önce para getiren ve en çok görünen yerler gelir. Yukarıdaki "Önce kod işi" satırları bu sıraya girmez; onları yazılımcı kapatır.

1. **Büyük hediye gösterileri (13 hediye, 36 parça dosyası).** En pahalı hediyelerin tam ekran gösterisi şu an tek 512 px resimle oynuyor. Önce videosu da olmayanlar: Yıldız Faytonu, Atlıkarınca Gecesi, Gökyüzü Turu, Düğün Günü. Dosya adları bölüm 1'de.
2. **Oyun Salonu setleri (dosyası eksik 31 resim + kapaklar).** Balon Avı (7 balon, top, bulut), Yıldız Avı (5 yıldız, kule), Pachinko (top, çivi, 3 kupa, tahta, kanal), Yörünge (roket, gezegen, rampa); Balon Avı, Yıldız Avı ve Pachinko kapakları. Jeton harcatan oyunlar bugün emojiyle oynanıyor. Kodda yerleri hazır, dosya gelince doğrudan bağlanır (bölüm 8).
3. **Oda içi simge seti.** Alt çubuk (mikrofonun durumları, mesaj, menü, emoji), oda menüsü, koltuk menüsü ve Balkon işlemleri (Profil, Hediye, Mesaj, Sustur, At, Kilitle, Yönetici, DJ, Kara liste). 40'tan fazla satır ama 15–16 farklı simge. Bunlara para kazandıran her yerde kullanılacak tek bir **hediye düğmesi simgesi** eklenmeli (sohbet, Anlar, profil, arama). Bölüm 9 ve 7.
4. **Satış ekranları.** 9 jeton paketine büyüyen ayrı resimler (küçük yığından sandığa), hediye paneli rafları (Popüler, Çift, Aile ve Dost, Muzip, Özel, Global, Şanslı, Favoriler) ve "3D", "Global", VIP kilit rozetleri, emoji panelindeki çıkartma paketi sekmeleri, Çarşı'daki "Ses dalgası" sekmesi, Ejderha giriş efekti. Bölüm 1 ve 2.
5. **Oda oyunları masa setleri.** Ludo, Renk Kartları, XOX ve Dört Taş parçaları (`table-art.tsx` içinde 27 boş yer) ile Okey, Renk Kartları ve Domino kapakları. Bu set ancak tamamı gelince devreye giriyor (bölüm 8).
6. **Statü rozetleri ve bildirimler.** Unvanlar, yayıncı seviyeleri, aile rütbe, seviye ve güç kademeleri, ajans kademeleri, 4 resimsiz rütbe hakkı. Bildirimler için 10–12 simgelik ortak bir set; bugün 25 bildirim türü ve 18 sistem türünün hepsi Ionicons (bölüm 2, 3, 5, 6, 7).
7. **En son.** Ayarlar ve mesaj ayarları için küçük çizgisel bir set (57 satır), Jeton Noktası bölüm başlıkları, giriş ve boş durum ekranları, yönetim ekranları.

**Sahiplerin kararı gerekenler:**
- Aile amblemi ve ajans logosu için sunucuda alan yok. Bugün liderin fotoğrafı ya da baş harfi görünüyor. Tasarımdan önce, bunların yüklenebilir olup olmayacağına karar verilmeli.
- Çıkartma paketlerinin kendi simgesi için de veri alanı yok. Çizimden önce kod işi gerekiyor.
- 552 Ionicons satırı özel simgeye geçecek mi? Önerimiz: 3. ve 6. maddedeki yerler geçsin, ayarlar gibi küçük satırlar sonra gelsin.
