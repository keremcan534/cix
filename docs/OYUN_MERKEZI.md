# Oyun Merkezi, Oyun Salonu ve Oda İçi Oyunlar

Kaynak: *Similarclup – Oyun Merkezi, Casino Tarzı Oyunlar ve Oda İçi Aktivite Sistemi*.

## Mimari

| Dosya | Görevi |
|---|---|
| `src/data/games.ts` | İki bağımsız katalog: **Oda oyunları** (ücretsiz, VIP yok) ve **Oyun Salonu** (oyun başına minimum Cömertlik Seviyesi, varsayılan Cömertlik Lv.2). |
| `src/lib/games.ts` | Ortak oyun platformu. Tek cüzdan (uygulamanın jeton bakiyesi), tek geçmiş. Oyun Salonu turları sunucu mantığıyla işlenir. |
| `src/components/games/game-panel.tsx` | Oyun yüzeyi. Odada koltukların altında açılan bir panel, profilde tam ekran. |
| `src/components/games/room/cards.tsx`, `card-face.tsx` | **Renk Kartları**: bizim destemiz (102 kart, dört renk ve amblemleri, Atla, Yön, +2, Joker, Joker +4), yelpaze el, elden desteye uçan kart, renk ve yön göstergesi, Joker için renk seçimi, SON KART duyurusu. Deneme oyunu ve canlı masa aynı sahneyi kullanır. |
| `src/components/games/room/xox.tsx` | **XOX**: çizilerek gelen işaretler, üstü çizilen ve atan üçlü, iki oyuncunun skoru ve sıra halkası. |
| `src/components/games/room/four.tsx` | **Dört Taş**: 7 × 6 delikli tahta, sütununa düşüp seken taş, atan dörtlü; ilk taş her elde el değiştirir. |
| `src/components/games/room/table-kit.tsx` | Bu üç oyunun ortak parçaları: süre halkalı oyuncu yüzü, iki kişilik oyunların başlığı ve skoru, el sonu kartı, deneme masası (rakipler kendi oynar, sıramda masanın 30 saniyesi işler). |
| `src/lib/room-games/cards.ts`, `xox.ts`, `four.ts`, `seam.ts` | Bu üç oyunun kurallarının uygulamadaki kopyası ve deneme rakipleri (sunucudaki `server/api/room-games/*.mjs` ve `room-games-rules.mjs` ile aynı; `tests/cards.test.ts`, `xox.test.ts`, `four.test.ts` iki tarafı adım adım karşılaştırır). |
| `src/components/games/room/ludo.tsx`, `ludo-board.tsx` | **Ludo**: gerçek tahta (15 × 15 haç, dört yuva, yıldızlı güvenli kareler, ev üçgenleri), zar ve taş animasyonları. Deneme oyunu ve canlı masa aynı sahneyi kullanır. |
| `src/lib/room-games/ludo.ts`, `ludo-board.ts` | Ludo kurallarının uygulamadaki kopyası (sunucudaki `server/api/room-games/ludo.mjs` ile aynı; `tests/ludo.test.ts` ikisini adım adım karşılaştırır) ve tahta geometrisi. |
| `src/components/games/room-tables.tsx` | Canlı odada sunucudaki masa (`server/api/room-games.mjs`): masa açma, oturma, başlatma, kalkma her oyunda ortak; her oyunun kendi ekranı (Ludo, Renk Kartları, XOX, Dört Taş) masasını ve bu düğmeleri alır. |
| `src/components/games/casino.tsx` | Şans Çarkı, Zar, Gece Yarısı Çarkı, Ejder ile Kaplan. |
| `src/components/games/wheel.tsx` | **Rüzgâr Gülü**: 3 alanlı, JACKPOT fonlu çark. Sonuç sunucuda belirlenir, kazanç oyun jetonudur. Ayrıntılar: `docs/RUZGAR_GULU.md`. |
| `src/components/games/fortune.tsx` | Altın Kasa (5×3 slot): makaralar, kazanan çizgiler, bedava dönüş, büyük kazanç ekranı, otomatik çevirme. |
| `src/lib/fortune-slot.ts` | Altın Kasa matematiği: makara şeritleri, ödeme tablosu, 10 çizgi, tam beklenen geri ödeme hesabı. |
| `src/components/games/bilye.tsx`, `src/lib/bilye/` | **Pachinko** (özgün bilye/çivi oyunu; kod içi kimliği `bilye`): tahta (`board.ts`), fizik (`physics.ts`), olasılık tablosu (`table.ts`, `scripts/bilye-table.ts` üretir), kurallar (`rules.ts`, sunucuda `server/api/casino-bilye.mjs`), ekrandaki yol (`path.ts`). Ayrıntılar aşağıda. |
| `src/components/admin/casino-report.tsx` | Yönetim › **Oyun Salonu** raporu (`GET /api/admin/casino/report`, yalnız yönetici): kasa defteri, JACKPOT fonları, dönem ve oyun oyun oynanan, ödenen, kasa payı. |
| `src/app/oyunlar.tsx` | Profildeki **Oyun Merkezi**: Oyun Salonu · Oda oyunları · Geçmiş. |
| `src/app/oyun-yonetimi.tsx` | Yönetim paneli (`games.manage` yetkisi). |

Erişim noktaları:
- **Profil:** Ben sekmesindeki Oyun Merkezi kartı ve `/oyunlar`. Eski `/cark` bağlantısı da Oyun Salonu'ndaki Şans Çarkı'na gider.
- **Oda:** Menü › *Oda Oyunları · ücretsiz* ve *Oyun Salonu · Cömertlik Lv.2*.

İki giriş noktası aynı platformu, aynı bakiyeyi ve aynı geçmişi kullanır.

## Sunum katmanı: oyunların görünüşü ve sesi

Tur her zaman önce çözülür (canlıda sunucuda, denemede `lib/games.ts` içinde); ekran yalnızca çözülmüş sonucu oynatır. Bu katman hiçbir oranı, bahsi, ödemeyi ya da havuz kuralını değiştirmez.

| Dosya | Görevi |
|---|---|
| `src/lib/game-sound.ts`, `assets/sfx/*.wav` | 27 kısa oyun sesi (`playSfx('coin')`). Hepsi gerçek kayıt: Kenney'nin CC0 paketlerinden (Casino Audio, Music Jingles, Sci-Fi, RPG, Interface, Impact; kaynakları `docs/VARLIK_KAYNAKLARI.md` §6), `app/scripts/kenney-sfx.py` ile birleştirildi. Kasım 2026: kazanç müzikleri (`win`, `fanfare`, `win-big`, `jackpot`, `levelup`) çelik davul, pizzicato ve saksafon cıngıllarından; Çevir'in sesi (`spin`) artık hışırtı değil, mekanik bir kavrama "klak"ı ve kısa makara tıkırtısı; `lever` slot kolunun yay ve mandal sesi; `tap` her düğmeye basışta çalan yumuşak tık. `make-sfx.py` yalnız `tease`, `turn`, `shot`, `splash`'i üretir, kayıtların üstüne yazmaz. Düzeyi oyun sesi ayarından gelir; odanın sesiyle karışır, onu kısmaz ve hata vermez. Müzikler dinlenmeden, ses analiziyle seçildi: önce `fanfare`, `win-big` ve `jackpot` dinlenmeli. |
| `src/lib/win-tier.ts` | Kazanç basamakları: bahsin 5, 15 ve 40 katı ile JACKPOT. **Bahsi geçmeyen ödeme kazanç sayılmaz.** |
| `src/components/games/fx/win-fx.tsx`, `coins.tsx` | `useWinFx()`: basamağa göre kazanç kutlaması: başlık, sayan tutar, jeton fıskiyesi, yağmuru ve ortadan patlaması. Jetonlar gerçek 3D altın para olarak havada döner (`assets/fx/coin-spin.png`: Blender'da çizilmiş 16 karelik bir tur; kendi para resmini getiren makinenin parası eskisi gibi düz döner). Büyük kazançta tutar sayılırken başlık **Büyük → Dev → Efsane Kazanç** diye yükselir (kazancın kendi kademesini geçmez). Her darbede (başlangıç, her yükseliş, tutarın oturması) gösteri sarsılır ve öne vurur, ekran parlar, iki halka ve ışık çizgileri yayılır, ortadan jeton patlar; başlık yükseldikçe darbe sertleşir. Efsane ve JACKPOT'ta havai fişek patlar ve telefon titrer. Yükselen kazanç önce bir darbe ve sayarken yükselen bir sesle gerilim kurar (tutar plakası titrer), her basamakta fanfar çalar, tutar oturunca büyük kazanç müziği gelir. Titreşim, Ayarlar'daki titreşim seçeneğine uyar. Hepsi yönetimde **Oyun kataloğu › Oyun Salonu › Kazanç efektleri** kartında kazanmadan izlenir. |
| `src/components/games/fx/reel.tsx`, `src/lib/reel-plan.ts` | Makara: duruştan kalkarken önce çeyrek sembol yukarı gerilir, sonra fırlar; sunucu cevabı beklenirken döner, soldan sağa sırayla durur, büyük ödül ihtimalinde son makaralar bekletir. Tam hızda semboller uzar, dururken eski boylarına döner. Akıcılık (25 Kasım 2026, sahipler telefonda donma hissetti): gerilme, tam hız ve duruş tek bir yerel (native) zamanlamanın parçalarıdır; makara aralarında JS'i beklemez (eskiden duruşu JS başlattığı için JS meşgulken makara bir an duruyordu). Uzama da yerel bir değerle, React durumuyla değil; yeni bir tur hücreleri baştan kurmaz, yalnız resimleri değiştirir; makara yalnız kendi değişen bilgisinde yeniden çizilir (`renderKey`). Android'de bütün sütuna uygulanan bulanıklık filtresi kalktı. Gerçek kazançta kazanan semboller makara makara öne fırlar, üstlerinde bir yıldız parlar (`sparkle.tsx`), sonra atarken arkası ışır. |
| `src/components/games/fx/win-lines.tsx` | Kazanan çizgiler (Kasım 2026): gerçek kazançta kazanan çizgilerin hepsi bir an birlikte, sonra tek tek, sembollerin ortasından geçen parlayan bir çizgi ve üstünde o çizginin kazancıyla çizilir; her çizgide bir tık. Yeni tur silene kadar döner. Bahsin altındaki ödemede çizilmez. |
| `src/components/games/fx/slot-lever.tsx` | Slot kolu (Kasım 2026, makaralı ve giydirilmiş makineler): makinenin sağında krom kol ve kırmızı top. Her turda (Çevir'le ya da Oto'yla) aşağı iner, mandal sesi ve titreşimle oturur, yaylanarak döner. Oyuncu topu aşağı çekerse (yarıdan fazla) ya da dokunursa tur başlar; kısa çekiş geri yaylanır. Kol makinenin sağ kenarının üstünde durur, makineyi daraltmaz (25 Kasım 2026: kola yer açmak semboller küçültmüştü). |
| `src/components/games/fx/gold-text.tsx` | Oyun Salonu yazısı (Kasım 2026): kazanç levhası, büyük kazanç başlığı ve tutarı, JACKPOT, düğme etiketleri Cinzel / Cinzel Decorative (Türkçe harflerin hepsi var) ile, katman katman metal: koyu dış çizgi, parıltı, altın, aydınlık üst yarı ve koyu alt kenar. `FitBox` satırı ölçer ve kutuya sığmazsa küçültür: kazanç yazısı levhanın kenarından taşmaz. Her makinenin levhasında yazının durduğu koyu pencere resimlerden ölçülüp `slot-skin.tsx` içinde (`window`) yazılıdır. |
| `src/components/games/fx/slot-skin.tsx`, `jackpot-show.tsx` | Gerçek görsellerle giydirilmiş makineler (Kızıl Yedi, Hazine Kulesi, Vahşi Patika, Kayıp Parşömen, Neon Bulvar, Bereket Ağacı; Konfeti Kutusu çizilmiş kutuda; `docs/GORSEL_URETIM_LISTESI.md` §24) ve onların JACKPOT / Büyük Kazanç gösterisi; başlık burada da tutar sayılırken yükselir. Çerçevelerin çoğu geniş ve alçak bir pencere açar; telefonda boş yükseklik kalınca çerçevenin düz yan kısımları (`stretch` bantları: süssüz direkler, neon borular) uzatılır, pencere genişliğinden biraz uzun hücrelere kadar büyür, semboller büyür ve ekran dolar. Süslü kısımlar (köşe taşları, aslan başı) uzamaz. Yeni bir çerçeve geldiğinde düz bantları da yazılmalı; yazılmazsa çerçeve eskisi gibi oranıyla çizilir. |
| `src/components/games/fx/divine-fx.native.tsx`, `divine-look.ts` | **Oyunlarda güçlü efektler** (1.2.0): büyük kazançta ekran kartında çizilen katman (Skia + Reanimated). Başlığın arkasında dönen ışık hüzmeleri ve sıcak çekirdek, sürekli yükselen kıvılcımlar, her vuruşta üç halkalı şok dalgası ve kıvılcım fırtınası; EFSANE KAZANÇ ve JACKPOT'ta başlığa inen şimşekler, JACKPOT'ta yukarıdan ışık sütunu. Makaralı oyunlarda büyük ödül için bekletilen makaranın çerçevesi parlar, etrafında iki ışık döner (`TeaseAura`). İlk saniyede kare kaçıran telefon az kıvılcımla çizer. Ayarlar › "Oyunlarda güçlü efektler" kapatır; "Hareketi azalt" ve "Animasyon ve giriş efektlerini kapat" da kapatır. Web sürümü çizmez (`divine-fx.tsx`). |
| `src/components/games/fx/quake.tsx`, `divine-fx.native.tsx` (`ReelSpark`), `salon.tsx` (`usePressRings`) | Oyunun kendisi titrer: oyun paneli oyunu `QuakeView` ile sarar; her kazanç (küçük 3 piksel), büyük kazancın her vuruşu ve her makara duruşu (sonuncusu daha sert) oyun ekranını sarsar. Küçük kazanç da kısa bir ışık ve kıvılcım patlaması alır. Duran makaranın üstünden beyaz bir ışık iner, dibinden kıvılcım sıçrar. Çevir düğmesine basınca iki ışık halkası yayılır. "Hareketi azalt" ve "Animasyon ve giriş efektlerini kapat" hepsini kapatır. |
| `src/components/games/fx/spin-plan.ts`, `wheel-stage.tsx`, `chips.tsx`, `flights.tsx` | Çarkın dönüş planı ve sahnesi, bahis fişleri, uçan fiş ve jetonlar. |
| `src/components/games/fx/info-sheet.tsx` | Her oyunun "?" sayfası: nasıl oynanır, ödeme tablosu, oyun bakiyesi notu. Ekranda uzun açıklama durmaz. |
| `src/components/games/fx/result-trail.tsx` | Son sonuçların şeridi. |
| `src/components/games/slot-kit.tsx`, `salon.tsx` (`LuxFrame`) | Bakiye kutusu (`BalancePill`), bahis seçici (`BetStepper`) ve makaralı oyunların ortak düğme bloğu (`SpinControls`). Kasım 2026: kontrollerin hepsi aynı kalıpta: eğimli altın kenar, koyu mine yüzey, iç gölge ve cam parıltısı; seçili düğme içten amber yanar. Parmak değdiği anda yumuşak bir tık (büyük düğmelerde hafif titreşim), bahis değişince fiş sesi. Çevir düğmesi basınca bir tur döner, tur sürerken çevresinde bir ışık dolaşır. |

Her oyunun uyduğu kurallar:
- **Bahsin altında kalan ödeme kutlanmaz.** "ÖDEME 100" diye sade yazılır; jeton yağmaz, zafer sesi çalmaz, satır yeşile dönmez, sembolün arkası ışımaz.
- **Bakiye sonuçtan önce değişmez.** Tur sürerken kutu bahsi düşülmüş tutarı gösterir; kazanç, ekranda görüldüğü anda eklenir.
- **Hareketi azalt** ayarı açıkken uçuşlar, parlamalar, sarsıntı, makara bulanıklığı ve jeton yağmuru atlanır; başlık yükselmeden kazancın kendi kademesiyle gelir; sonuç yine gösterilir.
- **Tek ses düğmesi** panel başlığındadır; sahnelerde ikinci bir düğme yoktur.
- **360 × 780 ekranda** her oyun kaydırmadan sığar ve hiçbir yazı kesilmez (Playwright taramasıyla denetlenir).

Görsellerin çoğu yer tutucudur (emoji, düz şekiller, Ionicons); çizilecekler `docs/GORSEL_URETIM_LISTESI.md` bölüm 15–18'de, kazanç gösterisinin levhaları bölüm 25'te listelidir.

### Yeni oda oyunu eklemek

1. Sunucu: `server/api/room-games/<kimlik>.mjs` (`meta`, `start`, `move`, `view` ve süre dolunca çalışan `auto` ya da `timeout`), `room-games-rules.mjs` içine kayıt, `room_tables.game` denetimine kimliği ekleyen göç dosyası.
2. Uygulama: kuralların kopyası `src/lib/room-games/<kimlik>.ts` ve iki tarafı adım adım karşılaştıran test; deneme ve canlı masayı aynı sahnede çizen `src/components/games/room/<kimlik>.tsx`; `lib/api.ts` içindeki masa ve hamle türleri; `room-tables.tsx` ve `game-panel.tsx` bağlantısı.
3. `server/api/Dockerfile` `room-games` klasörünü kopyalar; klasör dışına dosya konursa o da eklenmelidir.

Eski uygulama sürümleri yeni masaları çizemez: oda oyunlarında sunucu ve uygulama birlikte yayınlanır.

## Pachinko

Şartname: `docs/PACHINKO_SARTNAME.md`. Bu sürüm 1. aşamadır (tek tahta, fizik, cepler, ödül, mobil arayüz) ve 2. aşamanın kayıt ve rapor kısmını mevcut Oyun Salonu altyapısıyla karşılar.

- **Tahta:** 10 sıra çivi, 9 alt cep (0, 0,2, 0,5 ve 1 kat), 3 kupa: Zümrüt 2 kat, Yakut 5 kat, Altın 20 kat. Sağdaki kanaldan fırlatılan bilye üst raydan tahtaya girer. Atış gücü üç: Hafif, Orta, Güçlü (bilyenin tahtaya girdiği yeri değiştirir). Telefon eğme, sallama ya da başka bir sensörle kontrol yoktur.
- **Fizik:** yerçekimi, yuvarlak bilye ve çiviler, duvarlar ve kupa ağızları. Hesap yalnızca dört işlem ve karekökle yapılır; aynı atış her telefonda aynı yolu çizer.
- **Sonuç sunucuda:** tur, diğer oyunlar gibi `POST /api/casino/play` ile oynanır (`game: 'bilye'`, `pick`: atış gücü). Sunucu bilyenin düşeceği hedefi çeker; ekran o hedefe giden, simülasyonda gerçekten oraya düşmüş bir uçuşu oynatır. Telefon sonucu belirlemez.
- **Olasılık:** her atış gücü için 400.000 atış simüle edildi ve bilyenin gerçekten nereye düştüğü sayıldı. Ödeyen hedeflerin payları, beklenen geri ödeme %40'ı geçmeyecek biçimde ölçeklendi (Hafif %39,98, Orta %39,99, Güçlü %40,00); kalan pay ödemesiz ceplere gider. Altın kupa her atış gücünde %1'in altındadır. Tahta ya da fizik değişirse `node --experimental-strip-types --no-warnings --import ./tests/register.mjs scripts/bilye-table.ts` yeniden çalıştırılır; testler eski tablo kalırsa kırılır.
- **Ekonomi:** ayrı bir sistem kurulmadı. Bahis önce oyun bakiyesinden düşer; kazanç oyun bakiyesine yazılır (hediye edilemez, paraya çevrilemez). Bahsin %60'ı kasaya, %40'ı ödül havuzuna; kazanç yalnızca havuzdan ödenir, havuz en yüksek ödülü karşılayamıyorsa tur reddedilir. **Günlük sınır yok** (sahipler kaldırdı, Kasım 2026): Canlı ayarlar › Oyun Salonu › Günlük sınır varsayılanı 0 = sınırsız; bir sayı yazılırsa kişi başı her oyunda günde en yüksek bahisle o kadar tur oynanır. En yüksek bahis ve oyunu kapatma da oradan. Kişinin kendi koyduğu harcama limiti oyunlarda da geçerli.
- **Rapor:** Yönetim › Oyun Salonu (yalnız yönetici). Turlar 180 gün saklanır; kasa defteri başlangıçtan bu yanadır. Açıp kapatma: "Oyun anahtarları" bölümü.
- **Henüz yok (sonraki aşamalar, karar gerektirir):** oyuncu oranının panelden değiştirilmesi (60/40 kuralını değiştirir), Pachinko'ya özel Jackpot ve Fever modu, ikinci tahta, oda içi skor tablosu, düello ve turnuvalar.

## Canlı Yörünge (herkes aynı roket)

Yörünge, sunucusu destekleyen uygulamada **canlı ve çok oyunculu** oynanır (sunucuda `server/api/rocket-live.mjs` ve `rocket-live-rules.mjs`; uygulamada `components/games/rocket-live.tsx`, `lib/live/rocket-live.ts`, `lib/rocket-live.ts`). Demo sürümü ve bunu bilmeyen bir sunucu tek kişilik Yörünge'yi (hedefi önceden seçilen) gösterir; eski APK'lar da tek kişilik Yörünge'yi oynamaya devam eder. Örnek: sahibin gönderdiği başka bir uygulamanın "Rocket" oyunu (Kasım 2026); ad ve görseller bizim.

- **Tur:** 10 saniyelik geri sayımda yakıt alınır: her bidona dokunuş bir bahis basamağıdır (250 – 25.000), bir turda kişi başı en çok `casino_max_bet`. Motor ateşlenir, roket 1,00×'tan tırmanır: çarpan t saniyede e^(0,075·t) (2× 9 sn, 10× 31 sn, 100× 61 sn). Oyuncu istediği an **Kaç**'a basar; isteğin sunucuya ulaştığı andaki çarpanla ödenir. **Oto kaç** (1,01×–1.000×) turun ilk yakıtıyla seçilir; roket o çarpana gelince kendiliğinden kaçar. Roket patlayınca kaçmayanların yakıtı gider. Patlamadan sonra 5 sn kürsü (en yüksek çarpanla kaçan ilk 3), sonra yeni tur. Turlar biri ekranı açınca başlar, kimse bakmayınca durur.
- **Ekran:** geri sayım, rampadaki roket, herkesin yakıtı roketin yanına uçar (adlar maskeli: "Ahm**"), soldaki yakıt listesi (kaçanın kazancı yeşil, yananlar soluk), tırmanış izi ve tırmanışla büyüyen çarpan ölçeği, kaçanlar kendi çarpanlarında paraşütle iner, patlama, kürsü, son patlama noktaları şeridi ve **Tümü** (son 50 tur; son 10/20/50/100 turun 1–2×, 2–3×, 3–5×, 5–10×, 10×+ dağılımı). "?" sayfasında kurallar ve kasa payına göre ulaşma şansı tablosu.
- **Kasa payı canlı ayar:** Canlı ayarlar › Oyun Salonu › **Canlı Yörünge: kasa payı (%)** (`rocket_house_pct`, 3–90, varsayılan 60; sahibin kararı, 17.11.2026). Patlama noktası tur açılırken bu payla çekilir: x çarpanına ulaşma şansı (100 − pay)% / x. Yani %60 payda **her 100 turun yaklaşık 60'ında roket kalkmadan patlar** (1,00×), 2×'e ulaşma şansı %20, 10×'a %4. Payı düşürmek iki kez onay ister; yeni pay bir sonraki turdan başlar. Diğer oyunların payı %60 kalır (uygulama onların ödeme tablolarını gösteriyor).
- **Para:** yakıt, diğer oyunlar gibi önce oyun bakiyesinden sonra jetondan düşer (`spendCoins`, günlük harcama sınırı); kazanç oyun bakiyesine yazılır. Kalkışta turun yakıtı kasa defterine girer (kasa payı ve havuz) ve turun en çok ödeyebileceği tutar havuzdan turun ayrılmış payına geçer; havuz yetmezse roket o çarpanda patlar ("?" sayfasında yazar). Havuz turdaki yakıtın en az 2 katını ödeyemiyorsa yeni yakıt alınmaz.
- **Adil oyun:** patlama noktası tur açılırken sunucuda çekilir ve patlayana kadar hiçbir telefona gitmez; tırmanışın hızı her turda aynıdır; otomatik kaçış hedefe varınca ödenir (önceden ödense roketin oraya varacağı anlaşılırdı).
- **Sunucu yeniden başlarsa** (dağıtım): kalkmamış turun bütün yakıtı, havadaki turun kaçmamış yakıtı geldiği yere iade edilir; kaçanların ödemesi kalır.
- **Yük:** ekran açıkken telefon turu canlı hattan alır (saniyede en çok birkaç olay, yalnız ekranı açık olanlara) ve 10 sn'de bir yeniden okur; hat kopuksa 2,5 sn'de bir. Herkese açmadan önce yük testi yapılmalı (yapılmadı).
- **Testler:** `server/api/test/rocket-live.test.mjs` (kurallar, yakıt, elle ve otomatik kaçış, geç kalan kaçış, rampa, havuz kesmesi, kurallar ve reddetmeler, aynı istek, kasa payı ayarı, canlı hat, yeniden başlatmada iade; her dosyanın sonunda para denetimi), para karıştırma testinde yakıt ve kaçış, `app/tests/rocket-live.test.ts` (kuralların sunucuyla aynılığı, sunucu cevabının güvenli okunması, turun anı).
- **Görsel ve his (25 Kasım 2026):** Yörünge'nin kendi seti (`assets/games/yorunge/`, OpenAI görsel üretimi): boyalı uzay ve nebula, kraterli gezegen, rayı roketin altından geçen rampa, 3D roket ve titreyen gerçek alev, ateş topu ve duman patlaması, paraşüt, bidonlu yakıt düğmeleri, uçları bozulmadan uzayan yeşil Kaç düğmesi; çarpan Cinzel metal harflerle (tırmanırken altın, patlayınca yakut, geri sayımda gümüş). Geri sayımın son 3 saniyesinde tık, titreşim ve rakamın zıplaması; kalkışta sert titreşim ve oyunun sarsılması; 2×, 3×, 5×, 10×, 20×, 50×, 100× geçilince titreşim, jeton sesi ve çarpanın parlaması (10×'tan sonra sarsıntı da); patlamada güçlü titreşim ve sarsıntı; kaçınca başarı titreşimi. Oyun Salonu oyunları odada ekranın neredeyse tamamını kaplar (`game-panel`), alttaki düğmeler telefonun gezinme çubuğunun üstünde kalır.
- **Akıcılık (25 Kasım 2026):** ekran artık saniyede 5 kez değil, yalnız bir şey değiştiğinde yeniden çizilir: geri sayımın her saniyesi, son 300 ms, kalkış ve sunucudan gelen her değişiklik (`useMoment`). Uçuş boyunca yıldızlar üç derinlikte akar (`Space` `cruise`). Kontroller (yakıt bidonları, Yakıtın, Oto Kaç) Blender tuşlarında (aşağıda). 26 Kasım: çarpan saniyede 20, Kaç'ın tutarı saniyede 12 kez yazılır (eskiden 30 + 30) ve parıltısı yazıyla birlikte yeniden çizilmez, arkasında duran bir ışıktır; motorun titremesi, alevi ve roketin dönüşü yalnız motor yanarken çalışır; paraşütler ve gelen yakıtlar her sunucu mesajında baştan kurulmaz; oyun odada küçültülünce sayaçlar ve döngüler durur. Geliştirirken: web önizlemesi adrese `?rocketsim` eklenerek açılırsa canlı turlar sunucusuz, cihazın kendisinde oynanır (`lib/live/rocket-sim.ts`; yalnız geliştirme sürümünde, jeton yürümez).
- **Akıcılık (Kasım 2026):** roket ve arkasındaki iz telefonun arayüz iş parçacığında (Reanimated) her karede çizilir; çarpan, ölçek ve Kaç'ın tutarı yalnız kendi küçük yazılarını saniyede 30 / 5 kez yeniler. Eskiden uçuş boyunca bütün sahne ve altın Kaç düğmesi her karede yeniden çiziliyordu; sunucudan mesaj geldiğinde roket takılıyordu. Canlı sunucuya bağlı bir telefonda denenmeli (demo tek kişilik Yörünge'yi açar).
- **3D görseller (26 Kasım 2026, sahiplerin isteği: "roket Blender'dan yapılmış 3D olsun, patlama kaliteli olsun"):** uzay ve gezegen dışında her şey Blender'da modellenip işlendi (`app/scripts/yorunge-3d/`): uçarken kendi ekseninde dönen krom-kırmızı roket (lombarı görünüp kaybolur), dilleri akan hacimli alev, gerçek ateş ve duman simülasyonuyla patlama (parlak ateş topu, kıvılcımlar, kopan parçalar, ardından sönen duman; 1,35 sn), ışıklı kafes rampa ve kule, paraşüt ve kaçış kapsülü, yakıt bidonu, duman. Alttaki tuşlar (bakiye, Yakıtın, Oto Kaç, yakıt bidonları, bekleme yazısı) Blender'da yapılmış altın çerçeveli emaye tuşlar; seçili tuş yakut. Yazıları markanın kalın yazı tipiyle, net. Kareler sprite sayfası olarak telefonun arayüz iş parçacığında oynar (`fx/sprite-sheet`, `lib/sprite-steps`): JS meşgulken de takılmaz. Uygulamaya eklenen görseller toplam yaklaşık 1 MB.
- **Akıcılık, 3. tur (27 Kasım 2026, sahipler: "oyunlar hâlâ kasıyor, kaçınca kazanç efekti yarım çıkıyor"):** tırmanan çarpan ve Kaç'ın tutarı artık Skia ile telefonun arayüz iş parçacığında her karede çiziliyor (`fx/climb-label`): uçuş boyunca JS'te hiçbir şey yeniden çizilmiyor (eskiden saniyede 20 + 12 kez altı katmanlı yazı). Kaçınca bütün ekranı kaplayan kazanç gösterisi yerine çarpanın altına hafif bir "KAÇTIN · 1,52× +152" plakası düşüyor (eski gösteri sahnenin yalnız sağ %70'ine çizildiği için yarım görünüyordu ve uçan roketin üstünde kare kaybettiriyordu). Roket, alev ve patlama kareleri oyun açılınca görünmeden çözülüyor (`SheetPreload`): kalkışta ve patlamada büyük resim açılırken takılma yok. Ölçek yazıları saniyede 2,5 kez. Bütün Salon oyunlarının büyük kazanç gösterisinde sayan tutar da aynı Skia yazısıyla (`win-fx`, `jackpot-show`). Web önizlemede denendi, telefonda denenmedi.
- **Henüz yok:** ödüllü sıralama (videodaki kupa ve ödüller), her tur aynı yakıtı kendiliğinden koyan "otomatik yakıt".

## En kritik kural: sesli sohbet kesintisiz

- `lib/games.ts` ve oyun bileşenleri odaya, koltuğa, mikrofona ve görüşmeye **hiç dokunmaz**. Medya yöneticisi (`lib/media`) içe aktarılmaz.
- Odadaki panel koltukların altında açılır; oda ekranı kapanmaz, ses kanalından çıkılmaz. Küçültülen oyun arka planda devam eder.
- Paneldeki mikrofon şeridi yalnızca durumu gösterir. Mikrofonu açıp kapatmak sadece kullanıcının kendi dokunuşuyla olur.
- Oyun sesi ayrı ayarlanır (*Kapalı / Düşük / Orta / Yüksek*). Oyun sesleri sohbet sesini kısmaz.

## Oyun Salonu güvenliği (`playCasino`)

İsteğin işlenme sırası:
1. **Tekrar kontrolü:** Aynı istek kimliğiyle tekrar gelen istek aynı sonucu döndürür; ikinci kez jeton düşülmez.
2. **Erişim:** Oyun aktif mi, sağlayıcı ayakta mı, bu giriş noktası (profil/oda) izinli mi, Cömertlik Seviyesi yeterli mi? Seviye her turda yeniden okunur, ekrandaki bilgiye güvenilmez.
3. **Limit:** Bahis tutarı kontrolü; Canlı ayarlar'da günlük sınır konmuşsa o da (varsayılan: sınır yok).
4. **Tahsilat:** Bahis tek bir hareketle düşülür.
5. **Sağlayıcı:** Sağlayıcı hata verirse bahis aynı işlem numarasıyla iade edilir.
6. **Ödeme:** Kazanç varsa yatırılır.

Her tur `GM-…` işlem numarasıyla Oyun Merkezi › Geçmiş'te ve cüzdan hareketlerinde görünür; reddedilen istekler de kayda geçer.

**Cömertlik Seviyesi kalıcıdır** (düşmez); bu yüzden oyun sırasında erişim kaybı olmaz.

## Kasa kuralı: %60 kasa, %40 dağıtım

**Oyuncuya yazılmaz (Güncelleme 7, sahip kararı, Kasım 2026).** Bu bölüm personel bilgisidir. Oyunlarda ve Şanslı
hediyede kasa payı ("kasaya %60 kalır, %40'ı kazananlara dağılır"), JACKPOT'a giden pay ("her bahsin %2'si"), ortalama
geri ödeme ("100 jetonun ortalama N'i döner"), "çarpan × şans %40 eder" ve Rüzgâr Gülü'nün fon payı kaldırıldı; Canlı
Yörünge'nin başlığındaki "kasa payı %N" de. Kalanlar: oyunun nasıl oynandığı, ödeme tabloları, en yüksek kazanç
sınırları (oyun kuralıdır) ve **olasılık tabloları**. Olasılıklar kaldırılamaz: Google Play (Ödemeler politikası §7)
ve Apple (3.1.1), satın alınan jetonla oynanan rastgele ödüllerde olasılıkların satın almadan önce gösterilmesini
ister. Canlı Yörünge'de "Ödül havuzu yetmezse roket daha erken patlayabilir" cümlesi de kalır; yoksa tablo şansı
olduğundan yüksek gösterir. Havuz yetmediğinde gelen ret de kasa ayrıntısı vermez: "Bu bahis şu an alınamıyor. Daha
küçük bir bahisle dene; jetonun düşülmedi." (sunucunun yazısı, eski APK'lara da hemen gider). Uygulamadaki yazılar
yeni APK ile gelir; eski APK'lar eski yazıları gösterir. `app/tests/game-texts.test.ts` bu sözlerin oyuncu
ekranlarına geri dönmesini ve olasılık tablolarının kaybolmasını yakalar. Odadaki Zar Düellosu sohbet satırındaki
"kasa kazandı" yazısı oda ekranındadır (`live-room.tsx`), ayrı iş.

Bütün jetonlu oyunlarda (Şans Çarkı, Zar, Gece Yarısı Çarkı, Ejder ile Kaplan, Altın Kasa ve odadaki Zar Düellosu) oynanan jetonun %60'ı kasaya kalır, %40'ı kazananlara rastgele dağılır.

- **Olasılıklar** (`app/src/lib/casino-odds.ts`): her oyun ve her seçimde beklenen geri ödeme %40'tır. Testler bütün sonuçları tek tek sayarak bunu kanıtlar (`tests/casino-odds.test.ts`). Ejder ile Kaplan'da Ejder/Kaplan seçimi %39,94'tür (kart farkı kuralı tam %40'a bölünmüyor; kasa lehine yuvarlandı).
- **Havuz** (`app/src/lib/games.ts`): her bahsin %60'ı anında kasaya yazılır, %40'ı ödül havuzuna girer; kazançlar yalnızca havuzdan ödenir. Havuz bir turun en yüksek ödülünü karşılayamıyorsa tur jeton düşülmeden reddedilir. Havuz 200.000 jetonluk başlangıç avansıyla açılır (ilk turların büyük ödülü karşılanabilsin diye). Yönetim ekranında "Kasa defteri" oynanan, kasa, dağıtılan ve havuz tutarlarını gösterir.

| Oyun | Kazandıran sonuç | Çarpan | Olasılık |
|---|---|---|---|
| Şans Çarkı | 8 dilim: 0x, 0,5x, 1x, 2x, 3x, 5x, 10x, 20x | ağırlıklar 740/90/80/50/25/12/2/1 (binde) | — |
| Zar | Büyük 10–12 veya Küçük 2–4 | 2,4x | 6/36 |
| Gece Yarısı Çarkı | Üç 7 / üç aynı meyve | 30x / 5x | 1/125 / 4/125 |
| Ejder ile Kaplan | Seçilen taraf en az 4 yüksek / beraberlik | 1,5x / 5,2x | 45/169 / 13/169 |
| Zar Düellosu (oda) | Rakipten en az 3 fazla | 2,4x | 6/36 |
| Altın Kasa | 10 çizgide soldan 3/4/5 aynı; 3+ Kasa → 8 bedava dönüş ×2 | çizgi bahsinin 3–50 katı; tur başına en fazla 850x | kazanç her ~2,3 dönüşte bir, bedava dönüş ~1/117 |

**Oyun bakiyesi:** kazançlar cüzdana değil ayrı oyun bakiyesine yazılır; bahisler önce oradan düşer. Oyun bakiyesi hediye edilemez, elmasa veya paraya çevrilemez (kazancın paraya dönüşmesi gerçek paralı kumar sayılır). Sağlayıcı hatasında bahis geldiği yere iade edilir. Testler: `tests/game-balance.test.ts`.

**Altın Kasa:** 5 makara × 3 sıra, 30 duraklı sabit makara şeritleri, 10 sabit çizgi (bahis çizgilere eşit bölünür). 💰 Servet (Wild) yalnızca 2.–4. makarada çıkar ve Kasa dışında her sembolün yerine geçer. 🏦 Kasa (Scatter) ekranın herhangi bir yerinde 3+ gelirse 8 bedava dönüş verir; bedava dönüşlerde kazançlar 2 katıdır ve yeniden tetiklenmez. Bütün tur (bedava dönüşler dahil) tek istekte sunucuda çözülür, tek bahis ve tek ödeme yazılır; ekran sadece sonucu oynatır. Beklenen geri ödeme %39,97'dir (makara sayıları tam %40'a bölünmüyor; kasa lehine). Kombinasyon sayısı (30⁵) tek tek saymaya çok büyük olduğu için oran şerit sayılarından tam olarak hesaplanır ve 200.000 turluk simülasyonla doğrulanır (`tests/fortune-slot.test.ts`). Havuz kontrolü için en yüksek çarpan 850x alınır (her çizgi en yüksek ödemede, ana dönüş + 8 bedava dönüş ×2). Otomatik çevirme 10/25/50 tur; bedava dönüşte, 10x+ kazançta, seçilen kayıp limitinde ve reddedilen turda kendiliğinden durur.

Uğurlu hediye bu kurala dahil değildir; ayrı bir modüldür (`lib/lucky.ts`, beklenen geri ödeme %65).

## Oyun anahtarları: her oyun sunucudan açılır ve kapanır

Sahiplerin isteği (26 Kasım 2026): oyunlar sunucudan açılıp kapatılabilsin. Yeni sürüm gerekmez; finans paneli › Canlı
ayarlar › Oyun ve şanslı hediyeler (ya da uygulamada Yönetim › Canlı ayarlar › Oyun Salonu ve oyunlar):

| Ayar | Ne yapar |
|---|---|
| **Kapalı oyunlar** | Seçilen oyun herkese kapanır, yöneticiler dahil. |
| **Yalnız yöneticilere açık oyunlar** | Seçilen oyunu yalnız yönetici hesapları görür ve oynar; diğer herkese kapalı görünür. Yeni bir oyunu herkese açmadan önce denemek için. Bir şans oyununu bu listeden çıkarmak (herkese açmak) iki kez onay ister. |
| **Jetonlu oyunlar herkese açık** | Oyun Salonu ve Rüzgâr Gülü'nün hepsi için; kapalıyken zaten yalnız yöneticilere açık (aşağıda). |
| Acil durum › **Oyunlar** | Hepsini birden durdurur. |

Listedeki oyunlar: Oyun Salonu'nun bütün oyunları (Yörünge ve Pachinko dahil), Rüzgâr Gülü, Şanslı hediyeler, ücretsiz oda
oyunları (Ludo, Renk Kartları, XOX, Dört Taş). Oda roketinin düğmesi kendi sayfasında (`docs/ODA_ROKETI.md`).

- **Kapalı oyun hiçbir yerde görünmez:** oda menüsü, oyun panelinin "başka oyuna geç" listesi, odadaki çark kısayolu,
  hediye panelinin Şanslı rafı, Oyun Merkezi. Uygulama listeyi `GET /api/config`'ten okur, en geç yarım dakikada öğrenir.
- **Sunucu da reddeder,** eski APK'larda da: yeni tur, Şanslı gönderim, yeni masa, masaya oturma ve yeni el olmaz, jeton
  düşmez. Oyun bakiyesi ve geçmiş kalır. Başlamış bir oda eli bitirilebilir; Yörünge'de havadaki yakıtla kaçış açık kalır.
- **Eski APK'lar** Oyun Salonu ve Yörünge'de kapalı oyunu gizler (listeyi sunucudan okur). Rüzgâr Gülü'nü ve oda oyunlarını
  gösterir, dokununca "Rüzgâr Gülü şu an kapalı" gibi bir cümle görür; Şanslı rafı boş kalır. Oyun Salonu'nun bütün oyunları
  ve Rüzgâr Gülü kapalıysa eski APK'larda da Oyun Salonu ve çark hiç görünmez.
- **Yönetim › Oyun kataloğu** ekranındaki ayarlar yalnız o telefonda denemedir; canlı sürümde "Aktif" yerine oyunun
  sunucudaki durumu yazar.
- **Mağaza:** bu düğmeler oyunları uygulamadan çıkarmaz, oyunlar mağaza sürümünün içindedir. Google Play ve App Store
  incelemesinde bütün oyunlar açıkça beyan edilir; inceleme sırasında kapatıp sonra açmak "gizli özellik" sayılır ve hesap
  kapatmaya kadar gider (`docs/YAYIN_HAZIRLIGI.md` §3).
- Kod: `server/api/game-switch.mjs`, `app/src/lib/game-switch.ts`. Testler: `server/api/test/game-switch.test.mjs`,
  `app/tests/game-switch.test.ts`.

## Erişim kuralı: şimdilik yalnız yöneticiler

Ürün kararıyla (11.11) jetonlu oyunlar (Oyun Salonu ve Rüzgâr Gülü) **şimdilik yalnızca yönetici hesaplarına** (`users.role = 'admin'`, Actions › "Yetki ver") açıktır. Diğer herkeste sekme, kartlar, oda menüsündeki bölüm ve odadaki çark kısayolu görünmez; sunucu turu da reddeder (`wheel.mjs paidGamesOpen`). Oda oyunları (Ludo, Renk Kartları, Dört Taş, XOX, Okey) herkese açık kalır; Uğurlu hediyeler bu kuraldan etkilenmez.

- Herkese açmak için yeni sürüm gerekmez: Yönetim › Canlı ayarlar › Oyun Salonu › **Jetonlu oyunlar herkese açık** (canlı ayar `casino_open`). Açınca aşağıdaki seviye kuralı herkes için geçerli olur; kapatınca yeniden yalnız yöneticiler görür.
- Yönetici de seviye kuralına tabidir (Cömertlik Lv.2).
- Uygulama, hesabın durumunu `GET /api/me` cevabındaki `paidGames` alanından öğrenir; alan gelene kadar oyunları gizli tutar.
- Testler: `server/api/test/paid-games.test.mjs`, `app/tests/casino-visibility.test.ts`.

## Erişim kuralı: Cömertlik Seviyesi 2

Ürün kararıyla (26.10) Oyun Salonu erişimi **VIP2 yerine Cömertlik Seviyesi 2 ve üzeri** oldu. Cömertlik seviyesi geçerli jeton harcamasından gelir ve kalıcıdır (bkz. `docs/SEVIYELER.md`). Oyun Salonu ve zar düellosu bahisleri cömertlik puanı kazandırmaz; yani oyun oynayarak seviye yükseltilemez. Yönetim panelinde oyun başına eşik Cömertlik Lv.1 / 2 / 3 / 5 / 10 olarak seçilebilir.

## Kabul testleri (§5.4)

Web prototipinde Playwright ile çalıştırıldı:

| # | Test | Sonuç |
|---|---|---|
| 1 | Mikrofondayken Ludo açılır | ✅ Mikrofon açık, kişi koltukta |
| 2 | Mikrofondayken Oyun Salonu oyunu (Zar) oynanır | ✅ Mikrofon açık, koltuk aynı |
| 3 | Oyun ekranı kapatılır | ✅ Mikrofon açık |
| 4 | Ludo'dan Zar'a geçilir | ✅ Mikrofon ve koltuk korunur |
| 5 | Diğer üyeler sesi duymaya devam eder | ⏳ Gerçek ses altyapısı (LiveKit) ve birden fazla cihazla test edilmeli |
| 6 | Sağlayıcı hatası | ✅ Bahis iade edilir (net 0), mikrofon ve oda korunur |
| 7 | Oyundan çıkılır | ✅ Koltuk ve oda üyeliği korunur |
| 8 | Mikrofon kapalıyken oyun açılır | ✅ Kapalı kalır |
| 9 | Oyun sesleri sohbeti bastırmaz | ⏳ Ayrı ses ayarı hazır; ses karışımı gerçek cihazda doğrulanmalı |
| 10 | Odada değilken profilden Oyun Salonu açılır | ✅ Kullanıcı Oyun Merkezi'nde kalır, odaya sokulmaz |

Ek kontroller:
- Cömertlik Lv.0–1 kullanıcıda Oyun Salonu kilitli görünüyor; 30 cömertlik puanına (Lv.2) ulaşınca açılıyor.
- Aynı istek tekrar gönderildiğinde jeton değişimi 0.
- Yönetim panelinden "Hata" seçilince tur iade ediliyor.

**Teslim kriteri hakkında not:** Belge, sesli sohbet sürekliliğinin "gerçek cihazlarda ve birden fazla katılımcıyla" test edilmesini istiyor. Bu testler, ses SDK'sı (LiveKit) ve oyun sağlayıcı SDK'ları bağlandıktan sonra yapılabilir.

## Sağlayıcı araştırması (§7): yapılacak

Bu belgede **hiçbir sağlayıcı adı doğrulanmış değildir**. Kataloğun "sağlayıcı" alanları yer tutucudur. Her aday için doğrulanacaklar:
- Gerçekte mevcut oyunlar, Android/iOS desteği
- Entegrasyon yöntemi: SDK, API veya HTML5 (WebView)
- **Ses SDK'sı ile birlikte çalışma:** Oyun kendi ses oturumunu açıp sohbet sesini kesiyor mu? Kesiyorsa o sağlayıcı elenir.
- Çok oyunculu senkronizasyon ve oda entegrasyonu; profilden tek başına başlatma desteği
- Sonuç doğrulama: sağlayıcıdan imzalı sonuç ve geri çağrı (callback) yöntemi
- Lisans, maliyet ve Türkiye'de kullanılabilirlik

**Öneri:** Oda oyunlarında HTML5 oyunları uygulama içi WebView ile açmak, ses SDK'sı ile çakışma riskini en aza indirir: WebView'in ses oturumu ayrı yönetilir, oda bağlantısı aynı süreçte kalır.

## Hukuki uyarı

- Jetonlar gerçek paraya çevrilemiyor, ama hediye olarak gönderilip yayıncının elması olabiliyor ve **elmas paraya çevrilebiliyor**. Bu yüzden Oyun Salonu kazançlarının dolaylı yoldan paraya dönüşmesi mümkün.
- Oyun Salonu kazancı olarak gelen jetonların hediyeye harcanmasının engellenmesi (ayrı bir "oyun jetonu" olması) gerekip gerekmediği **hukukçuyla değerlendirilmeden Oyun Salonu canlıya alınmamalı**.
- Ödeme ve ödül oranları da yönetim panelinden değiştirilebilir hâle getirilmeli. Şu an kurallar kodda.

## Sonraki adımlar

1. Sağlayıcı araştırması ve lisanslar (§7).
2. Oda oyunlarının (Ludo, Renk Kartları, XOX, Dört Taş) gerçek cihazlarda, birden fazla kişiyle ve mikrofon açıkken denenmesi; oyun seslerinin telefonda dinlenmesi.
3. Sunucu: `game_sessions`, `game_rounds` (benzersiz `request_id`), `wallet_transactions` bağlantısı, sağlayıcı geri çağrısının imza doğrulaması.
4. Oyun geçmişinin kalıcı hâle getirilmesi (şu an oturum boyunca tutuluyor; jeton hareketleri cüzdanda kalıcı).

## Oyun adları

Şans oyunlarının adları özgündür. Kimlikler (`id`) ve görsel dosya adları kod içi anahtardır, ekranda görünmez. Uygulamada deniz ya da denizcilik temalı ad kullanılmaz (sahip kararı, 11.2026): bazı kimlikler (`fish`, `olympus`, Rüzgâr Gülü alanları `kiyi` · `acik` · `okyanus`, Yıldız Avı hücreleri `sea` · `ship` · `lamp`) oyunların ilk adlarından kalmadır; geçmiş kayıtlar ve sunucu bunlara bağlı olduğu için değişmez.

| Kimlik | Ad |
|---|---|
| `slot` | Gece Yarısı Çarkı |
| `jackpot` | Hazine Kulesi |
| `olympus` | Yıldız Avı |
| `fish` | Balon Avı |
| `rocket` | Yörünge (canlı sürümü de aynı kimlikle) |
| `super777` · `jungle` · `goldtree` | Kızıl Yedi · Vahşi Patika · Bereket Ağacı |
| `foodwheel` · `magiccard` | Lezzet Çarkı · Sihir Destesi |
| `pinata` · `spellbook` · `neon` | Konfeti Kutusu · Kayıp Parşömen · Neon Bulvar |
| `dragon` | Ejder ile Kaplan |
| oda menüsü `c2` | Meyve Bahçesi |
| `wheel` (oda menüsü `cg-ruzgar`) | Rüzgâr Gülü |
| `bilye` | Pachinko |

Yayından önce bu adlar için TÜRKPATENT'te marka taraması yapılmalı.
