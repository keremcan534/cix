# Oyun Merkezi, Casino ve Oda İçi Oyunlar

Kaynak: *Similarclup – Oyun Merkezi, Casino Tarzı Oyunlar ve Oda İçi Aktivite Sistemi*.

## Mimari

| Dosya | Görevi |
|---|---|
| `src/data/games.ts` | İki bağımsız katalog: **Oda oyunları** (ücretsiz, VIP yok) ve **Casino** (oyun başına minimum Servet Seviyesi, varsayılan Servet Lv.2). |
| `src/lib/games.ts` | Ortak oyun platformu. Tek cüzdan (uygulamanın jeton bakiyesi), tek geçmiş. Casino turları sunucu mantığıyla işlenir. |
| `src/components/games/game-panel.tsx` | Oyun yüzeyi. Odada koltukların altında açılan bir panel, profilde tam ekran. |
| `src/components/games/room-games.tsx` | Ludo (hızlı sürüm), Renk Kartları (UNO benzeri, özgün ad), XOX. |
| `src/components/games/casino.tsx` | Şans Çarkı, Zar, Lucky 77, Dragon Tiger. |
| `src/app/oyunlar.tsx` | Profildeki **Oyun Merkezi**: Casino · Oda oyunları · Geçmiş. |
| `src/app/oyun-yonetimi.tsx` | Yönetim paneli (`games.manage` yetkisi). |

Erişim noktaları:
- **Profil:** Ben sekmesindeki Oyun Merkezi kartı ve `/oyunlar`. Eski `/cark` bağlantısı da casino Şans Çarkı'na gider.
- **Oda:** Menü › *Oda Oyunları · ücretsiz* ve *Casino · Servet Lv.2*.

İki giriş noktası aynı platformu, aynı bakiyeyi ve aynı geçmişi kullanır.

## En kritik kural: sesli sohbet kesintisiz

- `lib/games.ts` ve oyun bileşenleri odaya, koltuğa, mikrofona ve görüşmeye **hiç dokunmaz**. Medya yöneticisi (`lib/media`) içe aktarılmaz.
- Odadaki panel koltukların altında açılır; oda ekranı kapanmaz, ses kanalından çıkılmaz. Küçültülen oyun arka planda devam eder.
- Paneldeki mikrofon şeridi yalnızca durumu gösterir. Mikrofonu açıp kapatmak sadece kullanıcının kendi dokunuşuyla olur.
- Oyun sesi ayrı ayarlanır (*Kapalı / Düşük / Orta / Yüksek*). Oyun sesleri sohbet sesini kısmaz.

## Casino güvenliği (`playCasino`)

İsteğin işlenme sırası:
1. **Tekrar kontrolü:** Aynı istek kimliğiyle tekrar gelen istek aynı sonucu döndürür; ikinci kez jeton düşülmez.
2. **Erişim:** Oyun aktif mi, sağlayıcı ayakta mı, bu giriş noktası (profil/oda) izinli mi, Servet Seviyesi yeterli mi? Seviye her turda yeniden okunur, ekrandaki bilgiye güvenilmez.
3. **Limit:** Bahis tutarı ve günlük limit kontrolü.
4. **Tahsilat:** Bahis tek bir hareketle düşülür.
5. **Sağlayıcı:** Sağlayıcı hata verirse bahis aynı işlem numarasıyla iade edilir.
6. **Ödeme:** Kazanç varsa yatırılır.

Her tur `GM-…` işlem numarasıyla Oyun Merkezi › Geçmiş'te ve cüzdan hareketlerinde görünür; reddedilen istekler de kayda geçer.

**Servet Seviyesi kalıcıdır** (düşmez); bu yüzden oyun sırasında erişim kaybı olmaz.

## Kasa kuralı: %60 kasa, %40 dağıtım

Bütün jetonlu oyunlarda (Şans Çarkı, Zar, Lucky 77, Dragon Tiger ve odadaki Zar Düellosu) oynanan jetonun %60'ı kasaya kalır, %40'ı kazananlara rastgele dağılır.

- **Olasılıklar** (`app/src/lib/casino-odds.ts`): her oyun ve her seçimde beklenen geri ödeme %40'tır. Testler bütün sonuçları tek tek sayarak bunu kanıtlar (`tests/casino-odds.test.ts`). Dragon Tiger'da Ejder/Kaplan seçimi %39,94'tür (kart farkı kuralı tam %40'a bölünmüyor; kasa lehine yuvarlandı).
- **Havuz** (`app/src/lib/games.ts`): her bahsin %60'ı anında kasaya yazılır, %40'ı ödül havuzuna girer; kazançlar yalnızca havuzdan ödenir. Havuz bir turun en yüksek ödülünü karşılayamıyorsa tur jeton düşülmeden reddedilir. Havuz 200.000 jetonluk başlangıç avansıyla açılır (ilk turların büyük ödülü karşılanabilsin diye). Yönetim ekranında "Kasa defteri" oynanan, kasa, dağıtılan ve havuz tutarlarını gösterir.

| Oyun | Kazandıran sonuç | Çarpan | Olasılık |
|---|---|---|---|
| Şans Çarkı | 8 dilim: 0x, 0,5x, 1x, 2x, 3x, 5x, 10x, 20x | ağırlıklar 740/90/80/50/25/12/2/1 (binde) | — |
| Zar | Büyük 10–12 veya Küçük 2–4 | 2,4x | 6/36 |
| Lucky 77 | Üç 7 / üç aynı meyve | 30x / 5x | 1/125 / 4/125 |
| Dragon Tiger | Seçilen taraf en az 4 yüksek / beraberlik | 1,5x / 5,2x | 45/169 / 13/169 |
| Zar Düellosu (oda) | Rakipten en az 3 fazla | 2,4x | 6/36 |

**Oyun bakiyesi:** kazançlar cüzdana değil ayrı oyun bakiyesine yazılır; bahisler önce oradan düşer. Oyun bakiyesi hediye edilemez, elmasa veya paraya çevrilemez (kazancın paraya dönüşmesi gerçek paralı kumar sayılır). Sağlayıcı hatasında bahis geldiği yere iade edilir. Testler: `tests/game-balance.test.ts`.

Lucky hediye bu kurala dahil değildir; ayrı bir modüldür (`lib/lucky.ts`, beklenen geri ödeme %65).

## Erişim kuralı: Servet Seviyesi 2

Ürün kararıyla (26.10) casino erişimi **VIP2 yerine Servet Seviyesi 2 ve üzeri** oldu. Servet seviyesi geçerli jeton harcamasından gelir ve kalıcıdır (bkz. `docs/SEVIYELER.md`). Casino ve zar düellosu bahisleri servet puanı kazandırmaz; yani oyun oynayarak seviye yükseltilemez. Yönetim panelinde oyun başına eşik Servet Lv.1 / 2 / 3 / 5 / 10 olarak seçilebilir.

## Kabul testleri (§5.4)

Web prototipinde Playwright ile çalıştırıldı:

| # | Test | Sonuç |
|---|---|---|
| 1 | Mikrofondayken Ludo açılır | ✅ Mikrofon açık, kişi koltukta |
| 2 | Mikrofondayken casino oyunu (Zar) oynanır | ✅ Mikrofon açık, koltuk aynı |
| 3 | Oyun ekranı kapatılır | ✅ Mikrofon açık |
| 4 | Ludo'dan Zar'a geçilir | ✅ Mikrofon ve koltuk korunur |
| 5 | Diğer üyeler sesi duymaya devam eder | ⏳ Gerçek ses altyapısı (LiveKit) ve birden fazla cihazla test edilmeli |
| 6 | Sağlayıcı hatası | ✅ Bahis iade edilir (net 0), mikrofon ve oda korunur |
| 7 | Oyundan çıkılır | ✅ Koltuk ve oda üyeliği korunur |
| 8 | Mikrofon kapalıyken oyun açılır | ✅ Kapalı kalır |
| 9 | Oyun sesleri sohbeti bastırmaz | ⏳ Ayrı ses ayarı hazır; ses karışımı gerçek cihazda doğrulanmalı |
| 10 | Odada değilken profilden casino açılır | ✅ Kullanıcı Oyun Merkezi'nde kalır, odaya sokulmaz |

Ek kontroller:
- Servet Lv.0–1 kullanıcıda casino kilitli görünüyor; 30 servet puanına (Lv.2) ulaşınca açılıyor.
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

- Jetonlar gerçek paraya çevrilemiyor, ama hediye olarak gönderilip yayıncının elması olabiliyor ve **elmas paraya çevrilebiliyor**. Bu yüzden casino kazançlarının dolaylı yoldan paraya dönüşmesi mümkün.
- Casino kazancı olarak gelen jetonların hediyeye harcanmasının engellenmesi (ayrı bir "oyun jetonu" olması) gerekip gerekmediği **hukukçuyla değerlendirilmeden casino canlıya alınmamalı**.
- Ödeme ve ödül oranları da yönetim panelinden değiştirilebilir hâle getirilmeli. Şu an kurallar kodda.

## Sonraki adımlar

1. Sağlayıcı araştırması ve lisanslar (§7).
2. Ludo'nun gerçek sağlayıcı entegrasyonu ve gerçek cihazda mikrofon sürekliliği testi.
3. Sunucu: `game_sessions`, `game_rounds` (benzersiz `request_id`), `wallet_transactions` bağlantısı, sağlayıcı geri çağrısının imza doğrulaması.
4. Oyun geçmişinin kalıcı hâle getirilmesi (şu an oturum boyunca tutuluyor; jeton hareketleri cüzdanda kalıcı).
