# Oyun Merkezi, Casino ve Oda İçi Oyunlar

Kaynak: *Similarclup – Oyun Merkezi, Casino Tarzı Oyunlar ve Oda İçi Aktivite Sistemi*.

## Mimari

| Dosya | Görevi |
|---|---|
| `src/data/games.ts` | İki bağımsız katalog: **Oda oyunları** (ücretsiz, VIP yok) ve **Casino** (oyun başına minimum VIP, varsayılan VIP2). |
| `src/lib/games.ts` | Ortak oyun platformu. Tek cüzdan (uygulamanın jeton bakiyesi), tek geçmiş. Casino turları sunucu mantığıyla işlenir. |
| `src/components/games/game-panel.tsx` | Oyun yüzeyi. Odada koltukların altında açılan bir panel, profilde tam ekran. |
| `src/components/games/room-games.tsx` | Ludo (hızlı sürüm), Renk Kartları (UNO benzeri, özgün ad), XOX. |
| `src/components/games/casino.tsx` | Şans Çarkı, Zar, Lucky 77, Dragon Tiger. |
| `src/app/oyunlar.tsx` | Profildeki **Oyun Merkezi**: Casino · Oda oyunları · Geçmiş. |
| `src/app/oyun-yonetimi.tsx` | Yönetim paneli (`games.manage` yetkisi). |

Erişim noktaları:
- **Profil:** Ben sekmesindeki Oyun Merkezi kartı ve `/oyunlar`. Eski `/cark` bağlantısı da casino Şans Çarkı'na gider.
- **Oda:** Menü › *Oda Oyunları · ücretsiz* ve *Casino · VIP2*.

İki giriş noktası aynı platformu, aynı bakiyeyi ve aynı geçmişi kullanır.

## En kritik kural: sesli sohbet kesintisiz

- `lib/games.ts` ve oyun bileşenleri odaya, koltuğa, mikrofona ve görüşmeye **hiç dokunmaz**. Medya yöneticisi (`lib/media`) içe aktarılmaz.
- Odadaki panel koltukların altında açılır; oda ekranı kapanmaz, ses kanalından çıkılmaz. Küçültülen oyun arka planda devam eder.
- Paneldeki mikrofon şeridi yalnızca durumu gösterir. Mikrofonu açıp kapatmak sadece kullanıcının kendi dokunuşuyla olur.
- Oyun sesi ayrı ayarlanır (*Kapalı / Düşük / Orta / Yüksek*). Oyun sesleri sohbet sesini kısmaz.

## Casino güvenliği (`playCasino`)

İsteğin işlenme sırası:
1. **Tekrar kontrolü:** Aynı istek kimliğiyle tekrar gelen istek aynı sonucu döndürür; ikinci kez jeton düşülmez.
2. **Erişim:** Oyun aktif mi, sağlayıcı ayakta mı, bu giriş noktası (profil/oda) izinli mi, VIP seviyesi yeterli mi? VIP her turda yeniden okunur, ekrandaki bilgiye güvenilmez.
3. **Limit:** Bahis tutarı ve günlük limit kontrolü.
4. **Tahsilat:** Bahis tek bir hareketle düşülür.
5. **Sağlayıcı:** Sağlayıcı hata verirse bahis aynı işlem numarasıyla iade edilir.
6. **Ödeme:** Kazanç varsa yatırılır.

Her tur `GM-…` işlem numarasıyla Oyun Merkezi › Geçmiş'te ve cüzdan hareketlerinde görünür; reddedilen istekler de kayda geçer.

**VIP oyun sırasında biterse:** Başlamış tur tamamlanır, yeni tur VIP kontrolünde reddedilir.

## VIP2 eşlemesi (ürün kararı gerekli)

Uygulamadaki "VIP seviyesi" üç kaynaktan gelir: SVIP (yükleme deneyimi, kalıcı), Asil (30 günlük unvan) ve VIP aboneliği. Şu an kullanılan kural: **VIP2 = gösterilen VIP seviyesi 2 ve üzeri.** Bu, SVIP2+ veya herhangi bir Asil unvanı (Şövalye = VIP3) anlamına gelir; VIP aboneliği tek başına VIP1 sayılıyor. Belgedeki "aktif üye" ifadesi süreli üyeliği kastediyorsa bu eşleme değişmeli.

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
- VIP0 kullanıcıda casino kilitli görünüyor.
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
