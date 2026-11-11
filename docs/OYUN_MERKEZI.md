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
| `src/components/games/bilye.tsx`, `src/lib/bilye/` | **Bilye Şelalesi** (özgün bilye/çivi oyunu): tahta (`board.ts`), fizik (`physics.ts`), olasılık tablosu (`table.ts`, `scripts/bilye-table.ts` üretir), kurallar (`rules.ts`, sunucuda `server/api/casino-bilye.mjs`), ekrandaki yol (`path.ts`). Ayrıntılar aşağıda. |
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
| `src/lib/game-sound.ts`, `assets/sfx/*.wav` | 22 kısa oyun sesi (`playSfx('coin')`). Düzeyi oyun sesi ayarından gelir; odanın sesiyle karışır, onu kısmaz ve hata vermez. Sesler `scripts/make-sfx.py` ile kodla üretilmiş **yer tutuculardır**; lisanslı bir ses paketi aynı dosya adlarıyla konursa başka değişiklik gerekmez. |
| `src/lib/win-tier.ts` | Kazanç basamakları: bahsin 5, 15 ve 40 katı ile JACKPOT. **Bahsi geçmeyen ödeme kazanç sayılmaz.** |
| `src/components/games/fx/win-fx.tsx`, `coins.tsx` | `useWinFx()`: basamağa göre kazanç kutlaması (başlık, sayan tutar, jeton fıskiyesi ya da yağmuru). |
| `src/components/games/fx/reel.tsx`, `src/lib/reel-plan.ts` | Makara: sunucu cevabı beklenirken döner, soldan sağa sırayla durur, büyük ödül ihtimalinde son makaralar bekletir. |
| `src/components/games/fx/spin-plan.ts`, `wheel-stage.tsx`, `chips.tsx`, `flights.tsx` | Çarkın dönüş planı ve sahnesi, bahis fişleri, uçan fiş ve jetonlar. |
| `src/components/games/fx/info-sheet.tsx` | Her oyunun "?" sayfası: nasıl oynanır, ödeme tablosu, oyun bakiyesi notu. Ekranda uzun açıklama durmaz. |
| `src/components/games/fx/result-trail.tsx` | Son sonuçların şeridi. |
| `src/components/games/slot-kit.tsx` | Bakiye kutusu (`BalancePill`), bahis seçici (`BetStepper`) ve makaralı oyunların ortak düğme bloğu (`SpinControls`). |

Her oyunun uyduğu kurallar:
- **Bahsin altında kalan ödeme kutlanmaz.** "ÖDEME 100" diye sade yazılır; jeton yağmaz, zafer sesi çalmaz, satır yeşile dönmez.
- **Bakiye sonuçtan önce değişmez.** Tur sürerken kutu bahsi düşülmüş tutarı gösterir; kazanç, ekranda görüldüğü anda eklenir.
- **Hareketi azalt** ayarı açıkken uçuşlar, parlamalar ve jeton yağmuru atlanır; sonuç yine gösterilir.
- **Tek ses düğmesi** panel başlığındadır; sahnelerde ikinci bir düğme yoktur.
- **360 × 780 ekranda** her oyun kaydırmadan sığar ve hiçbir yazı kesilmez (Playwright taramasıyla denetlenir).

Görsellerin çoğu yer tutucudur (emoji, düz şekiller, Ionicons); çizilecekler `docs/GORSEL_URETIM_LISTESI.md` bölüm 15–18'de listelidir.

### Yeni oda oyunu eklemek

1. Sunucu: `server/api/room-games/<kimlik>.mjs` (`meta`, `start`, `move`, `view` ve süre dolunca çalışan `auto` ya da `timeout`), `room-games-rules.mjs` içine kayıt, `room_tables.game` denetimine kimliği ekleyen göç dosyası.
2. Uygulama: kuralların kopyası `src/lib/room-games/<kimlik>.ts` ve iki tarafı adım adım karşılaştıran test; deneme ve canlı masayı aynı sahnede çizen `src/components/games/room/<kimlik>.tsx`; `lib/api.ts` içindeki masa ve hamle türleri; `room-tables.tsx` ve `game-panel.tsx` bağlantısı.
3. `server/api/Dockerfile` `room-games` klasörünü kopyalar; klasör dışına dosya konursa o da eklenmelidir.

Eski uygulama sürümleri yeni masaları çizemez: oda oyunlarında sunucu ve uygulama birlikte yayınlanır.

## Bilye Şelalesi

Şartname: `docs/PACHINKO_SARTNAME.md`. Bu sürüm 1. aşamadır (tek tahta, fizik, cepler, ödül, mobil arayüz) ve 2. aşamanın kayıt ve rapor kısmını mevcut Oyun Salonu altyapısıyla karşılar.

- **Tahta:** 10 sıra çivi, 9 alt cep (0, 0,2, 0,5 ve 1 kat), 3 kupa: Zümrüt 2 kat, Yakut 5 kat, Altın 20 kat. Sağdaki kanaldan fırlatılan bilye üst raydan tahtaya girer. Atış gücü üç: Hafif, Orta, Güçlü (bilyenin tahtaya girdiği yeri değiştirir). Telefon eğme, sallama ya da başka bir sensörle kontrol yoktur.
- **Fizik:** yerçekimi, yuvarlak bilye ve çiviler, duvarlar ve kupa ağızları. Hesap yalnızca dört işlem ve karekökle yapılır; aynı atış her telefonda aynı yolu çizer.
- **Sonuç sunucuda:** tur, diğer oyunlar gibi `POST /api/casino/play` ile oynanır (`game: 'bilye'`, `pick`: atış gücü). Sunucu bilyenin düşeceği hedefi çeker; ekran o hedefe giden, simülasyonda gerçekten oraya düşmüş bir uçuşu oynatır. Telefon sonucu belirlemez.
- **Olasılık:** her atış gücü için 400.000 atış simüle edildi ve bilyenin gerçekten nereye düştüğü sayıldı. Ödeyen hedeflerin payları, beklenen geri ödeme %40'ı geçmeyecek biçimde ölçeklendi (Hafif %39,98, Orta %39,99, Güçlü %40,00); kalan pay ödemesiz ceplere gider. Altın kupa her atış gücünde %1'in altındadır. Tahta ya da fizik değişirse `node --experimental-strip-types --no-warnings --import ./tests/register.mjs scripts/bilye-table.ts` yeniden çalıştırılır; testler eski tablo kalırsa kırılır.
- **Ekonomi:** ayrı bir sistem kurulmadı. Bahis önce oyun bakiyesinden düşer; kazanç oyun bakiyesine yazılır (hediye edilemez, paraya çevrilemez). Bahsin %60'ı kasaya, %40'ı ödül havuzuna; kazanç yalnızca havuzdan ödenir, havuz en yüksek ödülü karşılayamıyorsa tur reddedilir. Günlük sınır, en yüksek bahis ve oyunu kapatma Canlı ayarlar › Oyun Salonu'ndan.
- **Rapor:** Yönetim › Oyun Salonu (yalnız yönetici). Turlar 180 gün saklanır; kasa defteri başlangıçtan bu yanadır.
- **Henüz yok (sonraki aşamalar, karar gerektirir):** oyuncu oranının panelden değiştirilmesi (60/40 kuralını değiştirir), Bilye'ye özel Jackpot ve Fever modu, ikinci tahta, oda içi skor tablosu, düello ve turnuvalar.

## En kritik kural: sesli sohbet kesintisiz

- `lib/games.ts` ve oyun bileşenleri odaya, koltuğa, mikrofona ve görüşmeye **hiç dokunmaz**. Medya yöneticisi (`lib/media`) içe aktarılmaz.
- Odadaki panel koltukların altında açılır; oda ekranı kapanmaz, ses kanalından çıkılmaz. Küçültülen oyun arka planda devam eder.
- Paneldeki mikrofon şeridi yalnızca durumu gösterir. Mikrofonu açıp kapatmak sadece kullanıcının kendi dokunuşuyla olur.
- Oyun sesi ayrı ayarlanır (*Kapalı / Düşük / Orta / Yüksek*). Oyun sesleri sohbet sesini kısmaz.

## Oyun Salonu güvenliği (`playCasino`)

İsteğin işlenme sırası:
1. **Tekrar kontrolü:** Aynı istek kimliğiyle tekrar gelen istek aynı sonucu döndürür; ikinci kez jeton düşülmez.
2. **Erişim:** Oyun aktif mi, sağlayıcı ayakta mı, bu giriş noktası (profil/oda) izinli mi, Cömertlik Seviyesi yeterli mi? Seviye her turda yeniden okunur, ekrandaki bilgiye güvenilmez.
3. **Limit:** Bahis tutarı ve günlük limit kontrolü.
4. **Tahsilat:** Bahis tek bir hareketle düşülür.
5. **Sağlayıcı:** Sağlayıcı hata verirse bahis aynı işlem numarasıyla iade edilir.
6. **Ödeme:** Kazanç varsa yatırılır.

Her tur `GM-…` işlem numarasıyla Oyun Merkezi › Geçmiş'te ve cüzdan hareketlerinde görünür; reddedilen istekler de kayda geçer.

**Cömertlik Seviyesi kalıcıdır** (düşmez); bu yüzden oyun sırasında erişim kaybı olmaz.

## Kasa kuralı: %60 kasa, %40 dağıtım

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

Şans oyunlarının adları özgündür. Kimlikler (`id`) ve görsel dosya adları kod içi anahtardır, ekranda görünmez.

| Kimlik | Ad |
|---|---|
| `slot` | Gece Yarısı Çarkı |
| `jackpot` | Hazine Kulesi |
| `olympus` | Fener Kayalığı |
| `fish` | Mercan Avı |
| `rocket` | Yörünge |
| `super777` · `jungle` · `goldtree` | Kızıl Yedi · Vahşi Patika · Bereket Ağacı |
| `foodwheel` · `magiccard` | Liman Pazarı · Sihir Destesi |
| `pinata` · `spellbook` · `neon` | Konfeti Kutusu · Kayıp Parşömen · Neon Bulvar |
| `dragon` | Ejder ile Kaplan |
| oda menüsü `c2` | Meyve Bahçesi |
| `wheel` (oda menüsü `cg-ruzgar`) | Rüzgâr Gülü |
| `bilye` | Bilye Şelalesi |

Yayından önce bu adlar için TÜRKPATENT'te marka taraması yapılmalı.
