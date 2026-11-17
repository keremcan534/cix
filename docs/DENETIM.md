# Denetim: yayından ve reklamdan önce eksikler ve riskler

Tarih: 15 Kasım 2026. Bütün depo, canlı sunucunun açık uçları (`/api/health`, `/api/config`), yayın belgeleri
([`YAYIN_HAZIRLIGI.md`](YAYIN_HAZIRLIGI.md), [`DURUM_LISTESI.md`](DURUM_LISTESI.md), [`SUNUCU.md`](SUNUCU.md)) ve otomatik
kurulum incelendi. Her maddede kimin işi olduğu yazılı: **siz** (karar, hesap, hukuk, para) ya da **Claude** (kod).
Her iş bittiğinde buradan düşülür; yeni bir risk görülünce buraya eklenir.

**Kısaca:** Kod tarafı sağlam ve testli (sunucu 796, uygulama 1187, panel 45 otomatik test). Yayını ve reklamı
tehlikeye atanlar başka yerde: şans oyunlarının hukuki durumu, tek ve küçük sunucu, canlı sunucunun hâlâ test
modunda olması, hata takibi olmaması ve kırık kodun birleşmeden önce yakalanmaması.

---

## 🔴 Kritik: reklam ve yayından önce mutlaka

### 1. Şans oyunları ve nakde dönüş (siz + avukat)
- **Şanslı hediye** satın alınan jetonla oynanıyor ve kazancı **normal jeton** olarak ödüyor (`server/api/lucky.mjs`,
  kanal `ugurlu`). Bu jeton hediyeye dönüşüyor, hediye alıcıda elmasa, elmas da **para çekmeyle nakde** dönüyor. Yani
  şans oyunundan gerçek paraya giden bir yol var. Google Play bunu "gerçek paralı kumar" sayar (lisans ve onay ister);
  Türkiye'de de lisans gerekir. Kodda varsayılan olarak **açık** (Cömertlik Lv.2 ve 18 yaş şartıyla). Panelin "Şanslı
  hediye ayarı" sayfasından paket paket kapatılabiliyor.
- **Oyun Salonu** kazancı ayrı oyun jetonuna gidiyor (`casino.mjs`, `game_coins`), bu daha güvenli. Ama bahis satın
  alınan jetonla da yapılabiliyor. Varsayılan olarak yalnız yöneticilere açık. Oyun başına günlük sınır (Oyun Salonu,
  Rüzgâr Gülü, Zar Düellosu) Kasım 2026'da sahiplerin isteğiyle kaldırıldı: bir kişinin bir günde oynayabileceği
  jetonun üst sınırı yok; yalnız kişinin kendi koyduğu harcama limiti duruyor. Canlı ayarlar › Oyun Salonu › Günlük
  sınır (ve `WHEEL_DAILY`) ile yeniden konabilir.
- **Öneri:** İlk sürümde Şanslı hediye kapalı olsun, ya da kazancı nakde dönmeyen ayrı bir bakiyeye gitsin (Oyun
  Salonu gibi). Kararı bir avukat görüşüyle siz verin; kapatma ya da ayrı bakiye işini Claude yapar.

### 2. Sunucu kapasitesi (siz: bir tık ve bir karar · Claude: yük testi yapıldı)
- Canlı sunucu **1 çekirdek / 6 GB**. Ses odaları (LiveKit), veritabanı, API ve panel aynı makinede.
- **Yük testi yapıldı** ([`YUK_TESTI.md`](YUK_TESTI.md)):
  - Bu makine, 200 kişilik bir dolu oda ve birkaç yüz aktif kullanıcıyla doluyor. İki dolu oda sesi bozuyor.
  - Çekirdek dolunca bütün odalar ve uygulama birlikte bozulur.
  - Koddaki iki darboğaz giderildi: sıralama ve odadaki kişi sayısı.
- **Hemen:** Oracle'da makineyi **4 çekirdek / 24 GB**'a büyütün. Ücretsiz sınırın içinde kalır; makine birkaç dakika
  kapanıp açılır.
- **Oda kişi sınırı (siz: karar):**
  - Odanın seviyesine göre kişi sınırı 5000'e kadar çıkıyor. Tek makine bunu taşımaz.
  - Öneri: ses sunucusu ayrılana kadar geçici bir üst sınır koymak, 4 çekirdekte 500 kişi. Panelden değiştirilebilir
    olur.
- **Büyüyünce:** Ses sunucusu (LiveKit) ayrı makineye ya da LiveKit Cloud'a, veritabanı ayrı makineye.

### 3. Canlı sunucu hâlâ test modunda (siz + Claude)
- `/api/config`: yalnız **cihazla giriş** açık. Telefon (SMS), Google ve e-posta girişi kapalı, çünkü anahtarları yok.
  Ücretsiz test jetonu da açık (`TEST_MODE=1`).
- **Yayın günü:**
  - GitHub değişkeni `TEST_MODE=0` yapılır.
  - En az bir gerçek giriş yolu açılır (SMS, Google ya da e-posta anahtarı).
  - **Temiz bir veritabanıyla** başlanır: test kullanıcıları ve test jetonları yayına taşınmaz. Para çekme zaten test
    verisi görmüş veritabanında ödeme yapmıyor.
- Yayın günü adımlarını tek bir "açılış listesi" olarak Claude hazırlar.

### 4. Hata ve çökme takibi yok (siz: hesap · Claude: bağlantı)
- Sentry kodu hazır ama hesap ve DSN yok (`docs/SUNUCU.md` → Sentry). Reklamla gelen kişinin telefonunda uygulama
  çökerse bunu hiç görmeyiz.
- **Yapılacak:** Ücretsiz Sentry hesabı açılır, iki DSN verilir, Claude bağlar.

### 5. Kırık kod birleşmeden önce yakalanmıyordu (Claude, bu PR'da yapıldı · siz: bir ayar)
- Uygulama testleri PR'da hiç çalışmıyordu, yalnız birleştikten sonra çalışıyordu. Tip denetimi ve lint hiç
  çalışmıyordu. PR'lar çoğu zaman açıldıktan birkaç dakika sonra birleşiyor; testler bitmeden birleşen kod canlıya
  gidebilir.
- **Yapıldı:** `.github/workflows/app-check.yml`, her PR'da uygulamanın tip denetimini, lint'ini ve testlerini çalıştırıyor.
- **Sizden:** GitHub → Settings → Branches → varsayılan dal için kural: "Require status checks to pass" ile
  **App checks / check** ve **Server / test** işaretli olsun. Testler kırmızıyken birleştirme düğmesi açılmaz.

### 6. Test (staging) sunucusu yok (siz: onay · Claude: kurulum)
- Birleşen her PR doğrudan tek ve canlı sunucuya kuruluyor. Gerçek kullanıcılar gelince yeni özellik önce ayrı bir test
  sunucusunda denenmeli.
- Oracle'ın ücretsiz Ampere sınırı toplam 4 çekirdek / 24 GB. Canlı sunucu 4 çekirdeğin hepsini alırsa (Kritik 2), test
  sunucusu küçük ve ücretli bir makine olur.

### 7. Hesaplar ve yasal metinler (siz)
- [`YAYIN_HAZIRLIGI.md`](YAYIN_HAZIRLIGI.md) §1:
  - Alan adı.
  - Şirket adına Google Play, Apple ve Expo hesapları.
  - Jeton paketlerinin mağaza ürünleri.
  - Avukatın sıfırdan yazacağı gizlilik politikası (KVKK), kullanım koşulları ve topluluk kuralları.
  - Uygulama adı için marka taraması.
- Bunlar olmadan mağazaya çıkılamaz.
- Ayrıca `app/eas.json` mağaza profili (`production`) hâlâ geçici sunucu adresine bakıyor; alan adı gelince değişecek.

### 8. Yedeklerin sunucu dışı kopyası doğrulanmalı (Claude kontrol eder · siz: hesap)
- Gecelik yedek alınıyor, ama sunucu dışına kopya (`BACKUP_RCLONE_REMOTE`, R2) ve "yedek gelmedi" alarmı
  (`BACKUP_PING_URL`, healthchecks.io) canlıda açık mı bilinmiyor. Makine giderse kullanıcıların jeton ve elmas kaydı da
  gider.
- Bir kez kontrol edilir, aylık geri yükleme denemesi (`restore.sh --check`) takvime konur.

---

## 🟠 Önemli: ilk haftalarda

1. **Reklam ölçümü yok (siz + Claude):** Uygulamada analitik ya da yükleme kaynağı ölçümü yok. Reklam ekibi hangi
   reklamın kullanıcı ve ödeme getirdiğini göremez. Firebase Analytics ve Google Ads dönüşümü, ya da AppsFlyer / Adjust
   gibi bir ölçüm hizmeti kurulmalı.
2. **Görsel moderasyon (siz: hizmet seçimi · Claude: bağlantı):** Anlar'daki ve mesajlardaki fotoğraflar otomatik
   denetlenmiyor (yazı filtreleniyor). 18+ sosyal uygulamada çıplaklık ya da şiddet içeren tek bir görsel mağazadan
   kaldırılmaya yol açabilir. Google Vision SafeSearch, AWS Rekognition ya da Sightengine eklenmeli.
3. **Push bildirimleri (siz: Firebase dosyaları):** Uygulama kapalıyken arama çalmıyor, mesaj bildirimi gitmiyor.
   Kullanıcıyı geri getirmenin ana yolu bu.
4. **Uzaktan güncelleme yok (siz: Expo hesabı):** Her düzeltme yeni APK demek. EAS Update kodu hazır.
5. **Telefonda denenmemiş özellikler:** [`DURUM_LISTESI.md`](DURUM_LISTESI.md)'de "Telefonda denenmeli" yazan 11
   madde var (gerçek ses, gürültü engelleme, mikrofon eşzamanı…). Yayından önce gerçek telefonlarla bir deneme turu
   yapılmalı. Claude her madde için adım adım deneme listesi çıkarır.
6. **Finans paneli güvenliği (siz):** Panel para çekme ve ajans ödemelerini onaylıyor. Her panel kullanıcısında iki
   adımlı doğrulama açık olmalı; panel adresi yalnız ekibe verilmeli.
7. **Panel (siz: iki PR'ı sırayla birleştirmek):** Hediyeler, Emojiler ve Yönetim'in kalanı (Yaptırımlar, Ajans
   personeli, Mağaza eşyaları, Jeton Noktası, Moderatör rolü) panel deposunda
   [PR #7](https://github.com/keremcan534/similarclup-finance-control/pull/7)'de, uygulama tarafı #152'de. Önce panelinki,
   sonra #152 birleştirilir. Kurulum uygulamadaki Yönetim'i siteye kendisi çevirir
   ([`YONETIM_SITESI.md`](YONETIM_SITESI.md)).

---

## 🟢 Sonra: büyüme

- **Uçtan uca testler:** Uygulamayı baştan sona kullanan testler (kayıt, jeton, hediye, oda, para çekme), her gece.
- **Gece kontrolü:**
  - Testler ve sunucu sağlığı.
  - Jeton/elmas defterinin denk geldiği (`coins.test.mjs`'teki eşitliğin canlıda da denenmesi).
  - Son birleşenlerin kod incelemesi.
  - Sabah rapor.
- **Medya dağıtımı:** Fotoğraf ve videolar bugün API sunucusundan geçiyor. Kullanıcı artınca Cloudflare (CDN) önüne alınmalı.
- **Yatay büyüme:** Birden fazla API sunucusu, ayrı veritabanı, LiveKit kümesi.

---

## Bu turda yapılanlar

- `CLAUDE.md`: Claude'un her oturumda okuduğu proje rehberi. Mimari, asla atlanmayacak kurallar (para, eski APK'lar,
  veri, panel, mağaza ve hukuk) ve her işte uygulanacak kontrol listesi.
- `.github/workflows/app-check.yml`: her PR'da uygulamanın tip denetimi, lint'i ve testleri (Kritik 5).
- Bu rapor.
- Yük testi ve sonuçları: [`YUK_TESTI.md`](YUK_TESTI.md). Testi tekrar çalıştırmak için araçlar
  `server/infra/loadtest/` klasöründe.
- Sıralama artık 30 saniyelik önbellekten okunuyor. Odadaki kişi sayısını soran istekler ses sunucusunda tek bir okumayı
  paylaşıyor.
- Para denetimi ([`PARA_DENETIMI.md`](PARA_DENETIMI.md)):
  - Her testin sonunda ve canlıda saatte bir çalışıyor; tutarsızlıkta `money_mismatch` alarmı veriyor.
  - Aynı anda rastgele işlem testi eklendi.
  - Kapatılan açıklar: ücretli aramanın bedavaya getirilmesi ve iade sonrası jetonun Bağ isteğinden ya da Şanslı
    çantadan geri dönmesi.
  - Düzeltilen hatalar: iade ile hediyenin kilitlenmesi ve asistan payının kilidi.
  - Finans paneline giden olaylar tamamlandı.

## Sıradaki iş (önerilen sıra)

1. **Oda kişi üst sınırı** (sizin kararınızla) ve makine büyüyünce ses sunucusuna koruma sınırı (Kritik 2).
   **Para denetiminden kalanlar** ([`PARA_DENETIMI.md`](PARA_DENETIMI.md) "Kalanlar"): ekranda görülen fiyat
   kontrolü olmayan yerler (karar sizin, yeni APK), hesap geçmişinde sayfalama, panele abonelik satışları.
2. **Açılış listesi:** Yayın günü adım adım (Kritik 3); test sunucusu kurulumu (Kritik 6).
3. **Uçtan uca testler ve gece kontrolü** (Sonra).
4. Sizden gelecek hesaplar geldikçe: Sentry, analitik, push, görsel moderasyon bağlantıları.
