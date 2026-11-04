# Yayına hazırlık: durum ve eksikler

Bu belge mağazaya (Google Play, App Store) ve web'e çıkış için gereken her şeyin tek listesidir. Ayrıntılı denetim notları PR #35'te; sunucu `docs/SUNUCU.md`'de. Her satırın sahibi yazılı: **siz** (hesap, para, hukuk veya ürün kararı) ya da **biz** (mühendislik).

Durum: ✅ hazır · 🟡 kısmen · ⏳ yapılacak · ⛔ sizden bir şey bekliyor

---

## 1. Sizden gerekenler

Bunlar olmadan ilgili mühendislik işi bitemez. Sıra, yayına etkisine göre.

| # | Ne | Neden gerekli | Durum |
|---|---|---|---|
| 1 | **Şans ve para kararları:** Uğurlu hediye, Oyun Salonu oyunları, Jeton Noktası, para çekme ve ajans/davet komisyonları ilk sürümde olacak mı? | Satın alınan jetonla şans çekilişi ve nakde dönen kazanç; mağazalar bunu gerçek paralı kumar sayar, Türkiye'de lisans gerekir. Önerimiz: ilk sürümde kapalı. Hukuk görüşü alınmalı. | ⛔ |
| 2 | **Alan adı** | Sunucu adresi, web sürümü, paylaşım bağlantıları, destek e-postası, gizlilik politikası adresi. Şu an geçici `sslip.io` adresi kullanılıyor. | ⛔ |
| 3 | **Apple Developer** (şirket adına) ve **Google Play Console** (şirket adına) hesapları | Mağazaya yükleme, uygulama içi satın alma, Apple ile giriş. Bireysel Play hesaplarında üretime çıkmadan önce kapalı test şartı olabilir; şirket hesabı önerilir. | ⛔ |
| 4 | **Expo hesabı** (EAS) | Mağaza derlemesi, gerçek imza, telefonda gerçek ses için development build, push bildirimleri, uzaktan güncelleme. Ücretsiz planla başlanabilir. | ⛔ |
| 5 | **SMS sağlayıcısı** hesabı ve API anahtarı (Netgsm veya Twilio; sunucu ikisini de tanıyor) | Telefonla giriş. Sunucudaki kod gönderme ve doğrulama hazır; anahtar `.env`'e girince gerçek SMS gider. Uygulama hâlâ demo girişte her 6 haneli kodu kabul ediyor (bağlantı adımına kadar). | ⛔ |
| 6 | **Dosya depolama** (Cloudflare R2 önerilir: ücretsiz 10 GB, çıkış trafiği ücretsiz) | Profil fotoğrafı, anlar, yedeklerin sunucu dışına kopyası. Sunucudaki yükleme adresi ve yedek kopyalama hazır; anahtar bekliyor. | ⛔ |
| 7 | **Yasal metinler:** gizlilik politikası, kullanım koşulları (EULA), KVKK aydınlatma metni, selfie için açık rıza, VERBİS kaydı | Mağazalar zorunlu tutuyor; şu an uygulamada yer tutucu metin var. Metinleri bir hukukçu yazmalı; biz sayfaları ve onay adımını bağlarız. | ⛔ |
| 8 | **Jeton paketleri ve fiyat basamakları** (mağaza ürünleri) | Uygulama içi satın almada her paket bir mağaza ürünü olur; fiyatı mağaza basamaklarından seçilir. | ⛔ |
| 9 | **GitHub'a sunucu anahtarı:** Settings → Secrets → `DEPLOY_SSH_KEY` = `~/.ssh/oracle.key` içeriği | Sunucu kodu ana dala girince otomatik kurulsun diye. Eklenmezse sunucuyu elle güncellemek gerekir (`docs/SUNUCU.md`). | ⛔ |
| 10 | **Rastgele görüntülü eşleşme** kapsamı | Apple "rastgele görüntülü sohbet" uygulamalarına ek moderasyon şartı koyuyor. | ⛔ |
| 11 | **Yasal metinler sıfırdan:** Kullanım koşulları, gizlilik/KVKK ve topluluk kuralları avukatla sıfırdan yazılacak; rakip metinlerinden uyarlama yapılmayacak | Başka uygulamaların metinleri hem telif hem uyum riski taşır; metin bizim veri akışımızı ve kurallarımızı anlatmalı. | ⛔ |
| 12 | **Ad ve mevzuat taraması:** Uygulama adı için TÜRKPATENT/EUIPO taraması; Oyun Salonu (jetonlu şans oyunları) mevzuat incelemesi | Ad, mağaza kaydından ve bundle ID'den önce kesinleşmeli. Oyun Salonu madde 1'deki kararla birlikte değerlendirilir. | ⛔ |
| 13 | **Görsel kaynakları:** arka plan fotoğraflarının kaynağı ve lisansı | Kaynağı bilinmeyen görsel yayına çıkmaz. Liste: [`docs/VARLIK_KAYNAKLARI.md`](VARLIK_KAYNAKLARI.md). | ⛔ |

---

## 2. Mühendislik durumu

| Alan | Durum | Not |
|---|---|---|
| Sunucu altyapısı (LiveKit sesli odalar, Postgres, API, HTTPS, gecelik yedek) | ✅ | Frankfurt, tek makine, aylık 0 TL |
| Cüzdan ve işlem kaydı (sunucuda, çift işlem korumalı) | ✅ | |
| Profil, takip, engelleme, şikâyet, hesap silme (sunucu) | ✅ | Testli; mali kayıtlar saklanır, kişisel veriler silinir |
| Mesajlaşma (sunucu, kalıcı) | ✅ | Yeni mesajda push gönderiyor; dakikada 30 mesaj sınırı |
| Odalar, oda yöneticileri, atma, kara liste, şifreli oda (sunucu) | ✅ | Ses token'ı yasakları uyguluyor |
| Moderasyon (şikâyet kuyruğu, askıya alma) — sunucu uçları | ✅ | Yetkili web paneli ⏳ |
| Otomatik test ve sunucu kurulumu (GitHub) | ✅ | Kurulum, madde 9'daki anahtar eklenince çalışır |
| Uygulamada demo kısayollarını kapatan mağaza bayrağı (`EXPO_PUBLIC_DEMO=0`) | ✅ | |
| Giriş koruması, Türkçe izin metinleri, sürüm numaraları | ✅ | |
| **Uygulamanın sunucuya bağlanması** (profil, takip, mesaj, oda listesi, şikâyet, engelleme, hesap silme, cüzdan ve hediye) | 🟡 | Test APK'sında (canlı mod, `EXPO_PUBLIC_API_URL` dolu) bağlı: kayıt, profil, takip, mesaj, oda listesi ve oda açma, cüzdan (ücretsiz test jetonu, elmas → jeton), odada hediye. Hâlâ telefonda kalanlar: kozmetik/VIP alımı, görev ödülleri, oyun kazançları, para çekme, şifreli oda, fotoğraf yükleme. Keşfet/arama/son odalar ekranlarından açılan demo odalarında botlar çalışmaya devam ediyor. |
| Hediye kataloğu, fiyatlar, İnci sınırları ve sıralamalar sunucuda | ✅ | Bedeli sunucu hesaplıyor; uygulamadaki fiyatlarla eşitliği testle korunuyor |
| Odadaki dinleyici sayısı (LiveKit'ten) ve oda listesinin doluluğa göre sıralanması | ✅ | LiveKit sunucuya kimin girip çıktığını bildiriyor |
| Oda içi durum (kim hangi koltukta, mikrofon) sunucuda | 🟡 | Canlı modda LiveKit üzerinden: herkes kendi koltuğunu bildiriyor, konuşanlar halkayla görünüyor, sohbet ve hediye animasyonu odadakilere gidiyor. Sunucuda saklanmıyor; iki telefon aynı koltuğa aynı anda oturursa çakışabilir. Sahibi çıkınca oda sunucuda kapanmıyor (tekrar açınca aynı oda kullanılıyor) |
| Telefonla giriş (SMS kodu, 5 yanlış denemede kilit, oturum listesi ve kapatma) | 🟡 | Sunucu hazır ve testli; madde 5'teki anahtar bekliyor. İnceleme hesabı için sabit numara ve kod ayarı var |
| Apple ile giriş, Google ile giriş | ⛔ | Madde 3 |
| Uygulama içi satın alma + sunucuda makbuz doğrulama | 🟡 | Google Play ve App Store doğrulaması sunucuda yazılı, ilk alım hediyesi ve çift kullanım koruması testli; madde 3 ve 8 bekliyor |
| Fotoğraf ve video yükleme | 🟡 | Sunucu, telefona doğrudan depolamaya yükleme adresi veriyor (5 MB fotoğraf, 50 MB video); madde 6 bekliyor |
| Push bildirimleri (mesaj, yeni takipçi) | 🟡 | Sunucu gönderiyor, geçersiz cihazları siliyor; madde 4 bekliyor |
| İstek sınırları, istek kaydı, sağlık kontrolü, sorunsuz yeniden başlatma | ✅ | Mobil operatörlerde aynı IP'yi paylaşanlar için IP sınırı geniş tutuldu |
| Kurulumdan sonra sürüm kontrolü | ✅ | Kurulum işi, yeni sürüm canlıda cevap verene kadar bekliyor |
| Telefonda gerçek ses (LiveKit React Native, arka planda ses) | 🟡 | Kod hazır (APK'da LiveKit var); gerçek telefonda henüz denenmedi. Arka planda ses madde 4 |
| Mağaza derlemesi (EAS, gerçek imza, AAB, otomatik sürüm) | ⛔ | Madde 3 ve 4 |
| Yetkili (moderatör) web paneli | ⏳ | Sunucu uçları hazır |
| Gecelik yedeğin sunucu dışına kopyası (rclone, 60 gün) | 🟡 | Betik hazır; madde 6 bekliyor |
| Yedekten geri yükleme ve aylık deneme (`restore.sh --check`) | ✅ | |
| İzleme ve alarm | 🟡 | GitHub her 15 dakikada API, veritabanı ve LiveKit'i yokluyor; düşerse ya da sunucu alarm verirse (disk, 5xx, finans aktarımı, olağandışı iade / elmas / test jetonu) e-posta. Uygulama ve sunucu hataları için Sentry kodu hazır ama **Sentry hesabı ve DSN henüz yok**, yani şimdilik kapalı; yedek alarmı (healthchecks.io) da hesap bekliyor. Özellik kapatma, zorunlu güncelleme ve duyuru `.env`'den (`docs/SUNUCU.md` → Hata izleme ve acil durum). Uzaktan güncelleme (EAS Update) kodu hazır; Expo hesabı, `eas init` ve EAS ile yeni bir derleme bekliyor. Gerçek telefonda ve EAS derlemesinde henüz denenmedi |
| Finans paneli (Finance Control) sunucuda, para hareketleri otomatik aktarılıyor | 🟡 | `https://panel.<adres>`; API işlem kaydını panele gönderiyor (satış, hediye, harcama, iade, Jeton Noktası, çevirme), panel kapalıyken kaybolmuyor, testli ve gerçek panelle denendi. Kurulum madde 9'daki anahtarla gelir; sonra panelde ödeme kanalları ve anahtar bir kez tanımlanır (`docs/SUNUCU.md` → Finans paneli) |
| Yeni sunucuyu tek komutla kurma (`server/infra/setup.sh`) | ✅ | Alan adı gelince taşınma için |
| Test (staging) ortamı | ⏳ | |
| Yasal metin sayfaları ve kayıtta onay kutusu | ⛔ | Madde 7 |
| Uğurlu, Oyun Salonu, Jeton Noktası | ⛔ | Madde 1; karara göre kapatılır veya ayrı bakiyeye alınır |
| Ajans ağı: üst ve alt ajans, performansa bağlı komisyon, transfer, ödeme onayı, merkez paneli | 🟡 | Sunucu ve ekranlar hazır, testli (`docs/AJANS_HIYERARSI.md`). Komisyonun nakde dönmesi madde 1'deki hukuk kararına bağlı. Canlı sunucuya madde 9'daki anahtarla kurulur; o zamana kadar ekranlar "Örnek veri" etiketiyle açılır |

---

## 3. Mağaza hazırlığı

| | Durum |
|---|---|
| Yaş derecesi anketleri (IARC, Apple): 18+, kullanıcı içeriği, varsa simüle şans oyunu | ⏳ |
| Veri güvenliği formu (Play) ve gizlilik etiketleri (Apple): telefon, ad, doğum tarihi, şehir, fotoğraf/selfie, ses, mesajlar, satın almalar | ⏳ |
| Uygulama içi hesap silme | ✅ sunucu · ⏳ uygulama bağlantısı |
| Web'den hesap silme bağlantısı (Play şartı) | ⏳ alan adıyla |
| İncelemeci hesabı, inceleme notları, ekran görüntüleri | ⏳ |
| TestFlight ve Play kapalı test | ⏳ |

### Google Play ile jeton satın alma

Uygulama hazır (`app/src/lib/live/billing.ts`, expo-iap): cüzdan Play'deki paketleri Play'in yerel fiyatıyla gösterir, ödemeden sonra makbuzu sunucuya gönderir; jetonu yalnız sunucu yükler (`POST /api/wallet/purchase`). Cevap gelmezse makbuz telefonda saklanır, sonraki açılışta veya cüzdana girişte yeniden doğrulanır; sunucu her makbuzu bir kez yükler. Açmak için:

1. **Play Console › Para kazanma › Uygulama içi ürünler**: her paket için *tek seferlik (tüketilebilir)* ürün oluştur, kimlikleri tam olarak şunlar olsun: `coins_1000`, `coins_5000`, `coins_10000`, `coins_20000`, `coins_50000`, `coins_100000`, `coins_200000`, `coins_500000`, `coins_1000000` (`server/api/catalog.mjs` PACKS). Fiyatları ver, ürünleri **etkin** yap. Play'de olmayan paket cüzdanda görünmez.
2. Uygulama, ürünlerin görünmesi için Play'e en az bir kez (iç test kanalı yeterli) **imzalı** olarak yüklenmiş olmalı. GitHub'daki önizleme APK'sı hata ayıklama anahtarıyla imzalı; Play ödemesi onunla açılmaz, Play'den kurulan sürümle denenir.
3. **Google Cloud**: Play Android Developer API'yi aç, bir hizmet hesabı oluştur, JSON anahtarını indir. **Play Console › Kullanıcılar ve izinler**'de bu hesaba uygulama için *finansal verileri görüntüleme* ve *siparişleri yönetme* izni ver.
4. Sunucu `.env`: JSON'un tamamı tek satır olarak `GOOGLE_SERVICE_ACCOUNT=...`, paket adı farklıysa `GOOGLE_PLAY_PACKAGE`. Sonra `docker compose up -d api`. Bu olmadan uygulama paketleri göstermez ("çok yakında açılıyor").
5. **Lisans testçileri** (Play Console › Ayarlar › Lisans testi): test edecek Google hesaplarını ekle; bu hesaplar ödeme alınmadan test kartıyla satın alır. Bekleyen ödemeyi de ("yavaş test kartı") buradan denersin.
6. Yayında `.env`'de `ALLOW_TEST_TOPUP=0`: ücretsiz test paketleri cüzdandan kalkar, sunucu da reddeder.

---

## Yol haritası

1. **Kararlar ve hesaplar** (siz): madde 1–13.
2. **Uygulamayı sunucuya bağlamak** (biz, hemen başlanabilir; sunucu tarafı ve uygulamadaki istemci fonksiyonları hazır): giriş, profil, takip, engelleme, şikâyet, mesajlar, oda listesi, hesap silme, cüzdan ve hediyeler.
3. **Hesaplar gelince** (biz): anahtarları `.env`'e girmek (SMS, depolama, mağaza doğrulama), Apple/Google ile giriş, telefonda gerçek ses, EAS ile mağaza derlemesi.
4. **Yetkili paneli, staging** (biz).
5. **Mağaza hazırlığı**: formlar, kapalı test, inceleme.
