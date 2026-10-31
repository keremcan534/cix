# Yayına hazırlık: durum ve eksikler

Bu belge mağazaya (Google Play, App Store) ve web'e çıkış için gereken her şeyin tek listesidir. Ayrıntılı denetim notları PR #35'te; sunucu `docs/SUNUCU.md`'de. Her satırın sahibi yazılı: **siz** (hesap, para, hukuk veya ürün kararı) ya da **biz** (mühendislik).

Durum: ✅ hazır · 🟡 kısmen · ⏳ yapılacak · ⛔ sizden bir şey bekliyor

---

## 1. Sizden gerekenler

Bunlar olmadan ilgili mühendislik işi bitemez. Sıra, yayına etkisine göre.

| # | Ne | Neden gerekli | Durum |
|---|---|---|---|
| 1 | **Şans ve para kararları:** Lucky hediye, casino oyunları, Coins Bank, para çekme ve ajans/davet komisyonları ilk sürümde olacak mı? | Satın alınan jetonla şans çekilişi ve nakde dönen kazanç; mağazalar bunu gerçek paralı kumar sayar, Türkiye'de lisans gerekir. Önerimiz: ilk sürümde kapalı. Hukuk görüşü alınmalı. | ⛔ |
| 2 | **Alan adı** | Sunucu adresi, web sürümü, paylaşım bağlantıları, destek e-postası, gizlilik politikası adresi. Şu an geçici `sslip.io` adresi kullanılıyor. | ⛔ |
| 3 | **Apple Developer** (şirket adına) ve **Google Play Console** (şirket adına) hesapları | Mağazaya yükleme, uygulama içi satın alma, Apple ile giriş. Bireysel Play hesaplarında üretime çıkmadan önce kapalı test şartı olabilir; şirket hesabı önerilir. | ⛔ |
| 4 | **Expo hesabı** (EAS) | Mağaza derlemesi, gerçek imza, telefonda gerçek ses için development build, push bildirimleri, uzaktan güncelleme. Ücretsiz planla başlanabilir. | ⛔ |
| 5 | **SMS sağlayıcısı** hesabı ve API anahtarı (Netgsm veya Twilio; sunucu ikisini de tanıyor) | Telefonla giriş. Sunucudaki kod gönderme ve doğrulama hazır; anahtar `.env`'e girince gerçek SMS gider. Uygulama hâlâ demo girişte her 6 haneli kodu kabul ediyor (bağlantı adımına kadar). | ⛔ |
| 6 | **Dosya depolama** (Cloudflare R2 önerilir: ücretsiz 10 GB, çıkış trafiği ücretsiz) | Profil fotoğrafı, anlar, yedeklerin sunucu dışına kopyası. Sunucudaki yükleme adresi ve yedek kopyalama hazır; anahtar bekliyor. | ⛔ |
| 7 | **Yasal metinler:** gizlilik politikası, kullanım koşulları (EULA), KVKK aydınlatma metni, selfie için açık rıza, VERBİS kaydı | Mağazalar zorunlu tutuyor; şu an uygulamada "Demo metni" yazıyor. Metinleri bir hukukçu yazmalı; biz sayfaları ve onay adımını bağlarız. | ⛔ |
| 8 | **Jeton paketleri ve fiyat basamakları** (mağaza ürünleri) | Uygulama içi satın almada her paket bir mağaza ürünü olur; fiyatı mağaza basamaklarından seçilir. | ⛔ |
| 9 | **GitHub'a sunucu anahtarı:** Settings → Secrets → `DEPLOY_SSH_KEY` = `~/.ssh/oracle.key` içeriği | Sunucu kodu ana dala girince otomatik kurulsun diye. Eklenmezse sunucuyu elle güncellemek gerekir (`docs/SUNUCU.md`). | ⛔ |
| 10 | **Rastgele görüntülü eşleşme** kapsamı | Apple "rastgele görüntülü sohbet" uygulamalarına ek moderasyon şartı koyuyor. | ⛔ |

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
| **Uygulamanın sunucuya bağlanması** (profil, takip, mesaj, oda listesi, şikâyet, engelleme, hesap silme, cüzdan ve hediye) | ⏳ | Sıradaki en büyük iş. Şu an bu ekranlar telefondaki örnek veriyle çalışıyor. |
| Hediye kataloğu, fiyatlar, SVIP sınırları ve sıralamalar sunucuda | ✅ | Bedeli sunucu hesaplıyor; uygulamadaki fiyatlarla eşitliği testle korunuyor |
| Odadaki dinleyici sayısı (LiveKit'ten) ve oda listesinin doluluğa göre sıralanması | ✅ | LiveKit sunucuya kimin girip çıktığını bildiriyor |
| Oda içi durum (kim hangi koltukta, mikrofon) sunucuda | ⏳ | Şu an her telefon kendi hesaplıyor |
| Telefonla giriş (SMS kodu, 5 yanlış denemede kilit, oturum listesi ve kapatma) | 🟡 | Sunucu hazır ve testli; madde 5'teki anahtar bekliyor. İnceleme hesabı için sabit numara ve kod ayarı var |
| Apple ile giriş, Google ile giriş | ⛔ | Madde 3 |
| Uygulama içi satın alma + sunucuda makbuz doğrulama | 🟡 | Google Play ve App Store doğrulaması sunucuda yazılı, ilk alım hediyesi ve çift kullanım koruması testli; madde 3 ve 8 bekliyor |
| Fotoğraf ve video yükleme | 🟡 | Sunucu, telefona doğrudan depolamaya yükleme adresi veriyor (5 MB fotoğraf, 50 MB video); madde 6 bekliyor |
| Push bildirimleri (mesaj, yeni takipçi) | 🟡 | Sunucu gönderiyor, geçersiz cihazları siliyor; madde 4 bekliyor |
| İstek sınırları, istek kaydı, sağlık kontrolü, sorunsuz yeniden başlatma | ✅ | Mobil operatörlerde aynı IP'yi paylaşanlar için IP sınırı geniş tutuldu |
| Kurulumdan sonra sürüm kontrolü | ✅ | Kurulum işi, yeni sürüm canlıda cevap verene kadar bekliyor |
| Telefonda gerçek ses (LiveKit React Native, arka planda ses) | ⛔ | Madde 4 (development build) |
| Mağaza derlemesi (EAS, gerçek imza, AAB, otomatik sürüm) | ⛔ | Madde 3 ve 4 |
| Yetkili (moderatör) web paneli | ⏳ | Sunucu uçları hazır |
| Gecelik yedeğin sunucu dışına kopyası (rclone, 60 gün) | 🟡 | Betik hazır; madde 6 bekliyor |
| Yedekten geri yükleme ve aylık deneme (`restore.sh --check`) | ✅ | |
| İzleme ve alarm | ✅ | GitHub her 15 dakikada API, veritabanı ve LiveKit'i yokluyor; düşerse e-posta |
| Yeni sunucuyu tek komutla kurma (`server/infra/setup.sh`) | ✅ | Alan adı gelince taşınma için |
| Test (staging) ortamı | ⏳ | |
| Yasal metin sayfaları ve kayıtta onay kutusu | ⛔ | Madde 7 |
| Lucky, casino, Coins Bank | ⛔ | Madde 1; karara göre kapatılır veya ayrı bakiyeye alınır |

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

---

## Yol haritası

1. **Kararlar ve hesaplar** (siz): madde 1–10.
2. **Uygulamayı sunucuya bağlamak** (biz, hemen başlanabilir; sunucu tarafı ve uygulamadaki istemci fonksiyonları hazır): giriş, profil, takip, engelleme, şikâyet, mesajlar, oda listesi, hesap silme, cüzdan ve hediyeler.
3. **Hesaplar gelince** (biz): anahtarları `.env`'e girmek (SMS, depolama, mağaza doğrulama), Apple/Google ile giriş, telefonda gerçek ses, EAS ile mağaza derlemesi.
4. **Yetkili paneli, staging** (biz).
5. **Mağaza hazırlığı**: formlar, kapalı test, inceleme.
