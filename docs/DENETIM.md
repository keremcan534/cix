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
- **Şanslı hediyede ×777 (22 Kasım 2026, sahip kararı, "hukuki yanı bize ait"):** örnek videolardaki gibi Şanslı
  hediyeye ×777 adedi eklendi (normal hediyelerde yok). Bir gönderim 20 kişiye kadar ×777 gidebilir (en çok 16.000
  çekiliş; önce 5.000'di), yani tek dokunuşta harcanan jeton ve olası kazanç büyüdü. Satın alınan jetonla oynanan ve
  nakde dönebilen şans özelliğini **genişletir**; sahipler hukuki sorumluluğu üstlendi. Aşağıdaki avukat sorusu yine
  geçerli. Gerekirse paketler panelden kapatılır; adedi geri almak sunucu güncellemesi ister (`lucky.mjs` `LUCKY_COUNTS`).
- **Şanslı hediye genişledi (19 Kasım 2026, sahip kararı, hukuk riski açık):** Sahipler avukat görüşünü beklemeden
  panelden **yeni Şanslı paketi** eklenmesini (en çok 20 paket; her birinin adı, emojisi, fiyatı, olasılık tablosu,
  açık/kapalı) ve her pakete **ikon ve video** verilmesini istedi; yapıldı (Güncelleme 7 madde 10,
  [`LUCKY_HEDIYE.md`](LUCKY_HEDIYE.md)). Yeni oyun türü yok, kazanç yine normal jeton. Bu, satın alınan jetonla oynanan
  ve nakde dönebilen şans özelliğini **genişletir**: daha çok paket, daha çekici gösterim. Aşağıdaki öneri ve avukat
  sorusu aynen geçerli; karar ve risk sahiplerindir. Yayından önce avukat görüşü alınmalı, gerekirse paketler panelden
  kapatılır. Oyun ekranlarında kasa payı ya da kazanç tutarı yazmaz (Güncelleme 7 madde 6); yalnız nasıl oynanır ve
  olasılık tablosu.
- **Oyun Salonu** kazancı ayrı oyun jetonuna gidiyor (`casino.mjs`, `game_coins`), bu daha güvenli. Ama bahis satın
  alınan jetonla da yapılabiliyor. Varsayılan olarak yalnız yöneticilere açık. Kasım 2026'da Yörünge canlı ve çok
  oyunculu oldu (`rocket-live.mjs`, herkes aynı roketi izler): aynı anahtarın arkasında, ama kasa payı canlı ayardan
  düşürülebiliyor (varsayılan %60) ve oyunun çekiciliği arttı; hukuk sorusu onu da kapsar. Oyun başına günlük sınır (Oyun Salonu,
  Rüzgâr Gülü, Zar Düellosu) Kasım 2026'da sahiplerin isteğiyle kaldırıldı: bir kişinin bir günde oynayabileceği
  jetonun üst sınırı yok; yalnız kişinin kendi koyduğu harcama limiti duruyor. Canlı ayarlar › Oyun Salonu › Günlük
  sınır (ve `WHEEL_DAILY`) ile yeniden konabilir.
- **Oda roketi** (17 Kasım, `room-rocket.mjs`, [`ODA_ROKETI.md`](ODA_ROKETI.md)): odadaki hediyelerle dolan roketin ödülleri o seviyeye
  katkı verenler arasında şansla dağılır. Jeton ödülü sahibin kararıyla **normal jeton** (Şanslı hediye kazancıyla aynı): hediyeyle
  elmasa, elmas da nakde dönebilir. Yani Şanslı hediye ile aynı risk. **Kapalı gelir**, panelden açılır; açmadan önce aynı avukat
  görüşüne katın. Riski azaltmak için ödül yalnız süreli mağaza eşyası yapılabilir.
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

0. **Para çekme kuralı cinsiyet beyanına dayanıyor (siz: karar):** Erkek hesaplar 18 Kasım'dan beri para çekemiyor ([`YAYINCI_KURALLARI.md`](YAYINCI_KURALLARI.md)). Cinsiyet hesap sahibinin kendi seçimi: kendini kadın seçen erkek hesap kuralı aşar. Ödeme öncesi kimlik kontrolü bu açığı kapatır.
1. **Reklam ölçümü yok (siz + Claude):** Uygulamada analitik ya da yükleme kaynağı ölçümü yok. Reklam ekibi hangi
   reklamın kullanıcı ve ödeme getirdiğini göremez. Firebase Analytics ve Google Ads dönüşümü, ya da AppsFlyer / Adjust
   gibi bir ölçüm hizmeti kurulmalı.
2. **Görsel moderasyon (siz: hizmet seçimi · Claude: bağlantı):** Anlar'daki ve mesajlardaki fotoğraflar otomatik
   denetlenmiyor (yazı filtreleniyor). 18+ sosyal uygulamada çıplaklık ya da şiddet içeren tek bir görsel mağazadan
   kaldırılmaya yol açabilir. Google Vision SafeSearch, AWS Rekognition ya da Sightengine eklenmeli.
3. **Push bildirimleri (siz: Firebase dosyaları):** Uygulama kapalıyken arama çalmıyor, mesaj bildirimi gitmiyor.
   Kullanıcıyı geri getirmenin ana yolu bu. Kod tarafındaki engel 19 Kasım 2026'da kalktı: Firebase'in reddettiği `from`
   alanı artık `sender` olarak gidiyor. Kalan iş `GOOGLE_SERVICES_JSON` ve `FCM_SERVICE_ACCOUNT` dosyaları ile yeni APK.
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
- **Kimlik numarası sınırı:** Kişi ID'lerinin bugünkü biçiminde yaklaşık 1.010.000 hesaplık yer var. 900 bin hesaba
  yaklaşmadan biçim, iletişim filtresinin kullanıcı ID'si kuralıyla birlikte genişletilmeli
  ([`KIMLIK_NUMARASI.md`](KIMLIK_NUMARASI.md)).

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

## Bağlar, Güncelleme 7 (19 Kasım 2026, sahiplerin kararları)

Ayrıntı: [`BAGLAR.md`](BAGLAR.md). Bağ hediyesi bağı olana normal hediye olarak tekrar gider, puan hediyesiz gecelerde düşer, 30 gün hediyesiz bağ biter, Aile ve Kanka bağları pratikte sınırsız (1000), her bağ değişikliği SimilarClub Sistem'e yazılır.

- **Eski APK'lara duyuru (siz: bir metin):** eski APK'nın Bağlar kuralları yazısı uygulamanın içinde ve hâlâ "Puan düşmez" diyor; sunucu ise artık puan düşürüyor ve bağı bitirebiliyor. Bir duyuru (Canlı ayarlar › Duyuru ya da Similar Ekibi) önerilir: "Bağ puanları artık hediyesiz gecelerde düşüyor; 30 gün hediye gitmeyen bağ kendiliğinden bitiyor. Bağ hediyesini tekrar göndermek için uygulamayı güncelleyin." Kurulu bağların sayacı güncellemenin yapıldığı gün başlar: ilk bitiş en erken 30 gün sonra.
- **Taciz kanalı (moderasyon):** sınırsız bağ, çok kişiye istek atmayı kolaylaştırır. Sınırlayanlar: her istek jetonu bekletir, aynı anda en çok 10 bekleyen istek, dakikada 10 istek, engel. Şikâyet gelirse Canlı ayarlar › Bağlar'dan sınır düşürülür.
- **Para:** bağ hediyesinin tekrarı her hediye gibi `gifts/send`'den gider (fiyat ekrandaki, istek kimliği, kilit sırası aynı). Yazılırken, aynı anda bağ bitirme ve hediye testinde eski bir kilitlenme bulundu ve düzeltildi: bağı bitirme hesap kilitlerini almadan bağ satırını yazıyordu, hediye ise hesapları kilitleyip bağ satırını bekliyordu (Kasım dersiyle aynı: `ended_by` hesap satırını denetler). Artık bitirme de önce iki hesabı, sonra bağı kilitler. Para karıştırma testine bağ hediyesi ve bitirme eklendi.
- **Bağ Yüzüğü (Çift) panelden gizlenemez:** rafta değil (katalogda `bag-cift` yok), tekrarı yalnız profildeki düğmeden ve uygulamanın fiyatıyla gider. Gizlemek ya da fiyatını değiştirmek gerekirse önce rafa eklenmeli (iki tarafta derlenmiş katalog değişikliği, yeni APK).
- **Yük:** gece işi her etkin bağ satırına günde bir kez yazar (500'erli, hesap kilidi yok); oda listesi `among` artık kesilmeden, kişi başına endeksle okur; profil 50'şer sayfalanır. Bağ sayısı yüz binleri geçerse gece işinin süresi `bond drop:` kaydından izlenmeli. Yük testi bu sürümle tekrarlanmadı.

## Şanslı hediye: yeni paket, ikon ve video (19 Kasım 2026, sahip kararı)

Hukuk riski Kritik §1'de. Bu işte ayrıca:

- **Gösterilen fiyat ve olasılık (kapandı, yeni APK):** Şanslı gönderimi önce ekranda görülen fiyatı ve ayar sürümünü
  taşımıyordu: yönetici sayfa açıkken fiyatı ya da olasılıkları değiştirirse kişi görmediği fiyatla ödüyor, görmediği
  oranlarla çekiliyordu (Google Play "önceden göster" şartı). Yeni APK ikisini de gönderir; değiştiyse 409 ve jeton
  düşmez. **Eski APK'lar için açık kalıyor** (iki alanı göndermezler): yeni APK dağıtılınca Canlı ayarlar › Zorunlu sürüm
  yükseltilmeli; o zamana kadar paketin fiyatını ve olasılıklarını yoğun saatlerde değiştirmemek iyi olur.
- **Ayar kayıtları denetime (kapandı):** Şanslı ayarı kayıtları artık `audit_events`'te önceki ve sonraki haliyle ve
  panel kullanıcısının adıyla.
- **İki kilitlenme (kapandı, para testi buldu):** Şanslı gönderimi rastgele para testine eklenince iki gerçek hata çıktı:
  odada gönderilen hediye ve Şanslı hediye oda sahibinin hesabını sıra dışı kilitliyordu; Şanslı gönderimi aynı jeton
  partisine iki kez yazdığı için o partinin satın alımını ve Jeton Noktası'nı da bekliyordu. Kullanıcı "sunucu hatası"
  görüyordu, para kaymıyordu (işlem geri alınıyordu). Artık bunlar baştan, sırayla kilitleniyor (`server/api/send-locks.mjs`).
- **Panel sayfası (Claude, sonra):** "Yeni paket" formu, %100'e tamamlanan olasılık düzenleyici ve ikon/video yükleme
  finans paneli deposunda yapılmadı; uçlar `PANEL_ROUTES`'ta hazır.
- **Yük:** videolar öteki hediye videoları gibi API sunucusundan iner (CDN yok, "Medya dağıtımı"); yalnız satıştaki
  paketlerin videosu ve yalnız yeni APK'ya listelenir.

## Özel albüm: onaysız ücretli fotoğraf, mağaza riski (24 Kasım 2026, sahiplerin kararı)

Ajanstaki onaylı yayıncılar profillerine jetonla açılan bir "özel albüm" koyabiliyor ([`OZEL_ALBUM.md`](OZEL_ALBUM.md)).
Fotoğraflar **onaylanmadan hemen** görünür (sizin kararınız); sorunlu olan şikâyetle ve panelden kaldırılır.

- **Mağaza riski:** 18+ bir uygulamada kullanıcıların para karşılığı açılan fotoğraf satması, Google Play'in **cinsel
  içerik** ve **kullanıcı içeriği** politikalarında ve App Store 1.1 / 3.1'de en çok bakılan şeylerden. Bir incelemeci
  ya da şikâyet "ücretli müstehcen içerik" görürse uygulama kaldırılabilir.
- **İlk istenecekler:** yüklemeden önce onay (panelde bir onay sırası) ya da otomatik içerik taraması. Gerekirse
  Claude ekler; altyapı hazır (fotoğraflar sunucuda tek tabloda, kaldırma ve denetim kaydı var).
- **Para:** jeton hediye gibi yayıncıya elmas olarak geçer, ajans komisyonu hediye gibi işler; para denetimi ve
  finans paneli bunu görür. Fiyat Canlı ayarlar › Özel albüm (0: kapalı).

## Muzip hediyeler ve profil izleri: taciz ve mağaza riski (19–20 Kasım 2026, sahiplerin kararı)

Muzip rafında iz bırakan hediyeler var: 💩 Kaka Şakası ve 🩴 Terlik Geldi!. Alıcının profil fotoğrafına herkesin
göreceği bir "pislik" ya da "kırık cam" bırakırlar. İz süresi dolunca ya da başkası temizleyen hediyeyi (💧 Temizlik
Suyu, Cam Tamiri) gönderince gider ([`PROFIL_IZLERI.md`](PROFIL_IZLERI.md)).

- **Ücretsiz kaldırma yok: sizin kararınız (20 Kasım 2026).** Kişi kendi izini kendisi kaldıramaz. Şartnamenin güvenlik
  kuralı (§7C: "profil sahibi istemediği izi ücretsiz, hemen kaldırabilir") bilerek uygulanmadı.
  - **Mağaza riski:** Herkese görünen aşağılayıcı bir işaret birini küçük düşürmek için kullanılabilir. Google Play
    **Zorbalık ve taciz** politikası ve App Store 1.1 buna bakar, en çok kadın yayıncılara karşı.
  - Kişinin izi kaldırmasının tek hızlı yolu başkasının para harcaması. Bu, "utancını parayla temizlet" diye
    manipülatif bir ödeme düzeni gibi görülebilir.
  - Mağaza incelemesi ya da bir şikâyet bunu sorarsa ilk istenecek şey tek dokunuşla ücretsiz kaldırmadır. Gerekirse
    Claude ekler (kod hazır değil, bilerek yapılmadı).
  - Karar sizin; riski burada yazılı.
- **Azaltanlar (yapıldı):**
  - "Kimler profilime iz bırakabilir" **varsayılanı "Yalnız takip ettiklerim"**: kişinin takip etmediği biri iz
    bırakamaz. Ayarı hiç seçmemiş herkes ve eski APK kullananlar da bu kuraldadır.
  - "Kimse" seçeneği ve "Profilime iz bırakılmasın" anahtarı yeni izi engeller. Reddedilen gönderimde jeton düşmez.
  - İz kendiliğinden gider (pilotlarda 24 saat).
  - Engelleme hem yeni izi önler hem o kişinin bıraktığı izi hemen kaldırır (bugünkü gibi kaldı). Fiilen tek ücretsiz
    kaldırma yolu bu. **Engel yarışı (kapandı, incelemede bulundu):** engellemeden hemen önce yola çıkmış bir iz hediyesi
    engelden sonra işlenip izi 24 saat bırakabiliyordu. Artık engel iki kişinin kilidi altında yeniden okunur: yoldaki
    hediye ya reddedilir ya da engel izi hemen ardından kaldırır (test 20 turda 0; düzeltmesiz aynı test iz bırakıyor).
  - **Ucuz temizleme yok (kapandı, sahiplerin ikinci kararı, 20 Kasım 2026):** iz varken başka türden bir iz hediyesi
    izi değiştirmez, düz hediye olarak gider; aynı tür izi hiç kısaltmaz. Önceden 500 jetonluk başka tür bir hediye
    24 saatlik izin yerine geçebiliyor, 777 jetonluk 5 dakikalık aynı tür hediye onu 5 dakikaya indirebiliyordu.
  - Yönetim izi kaldırır (`POST /api/admin/marks/clear`, denetim kaydıyla).
  - Bir tür panelden anında kapatılır. Canlı ayarlar › Profil izleri › süre 0 bütün özelliği kapatır.
  - İz hediyesi Global olamaz: bütün ülkeye duyurulmaz.
  - Hiçbir ekranda "temizlemek için harca" yok.
- **Değişen (sizin kararınız):** "Profilime iz bırakılmasın" artık **profildeki izi kaldırmaz**, yalnız yenisini
  engeller.
- **Değişen (müşterinin isteği, 20 Kasım 2026): iz yüzü kapatabilir.** Panelden yüklenen iz resmi artık bütün
  fotoğrafı, yüzü de kaplayabilir (buz gibi). Önceden fotoğrafın görünmesi şarttı (en az %30 saydam, yüzün en çok
  %20'si dolu). Taciz riski büyür: birinin yüzü iz süresince (24 saate kadar) tamamen kapanabilir ve kişi bunu
  ücretsiz kaldıramaz. Azaltanlar aynı: varsayılan "Yalnız takip ettiklerim", engelleme izi hemen kaldırır, yönetim
  kaldırır. Mağaza incelemesi sorarsa ilk istenecek yine tek dokunuşla ücretsiz kaldırma.
- **Sıklık sınırı yok (sizin kararınız):** Aynı kişi aynı kişiye art arda iz bırakabilir. Taciz şikâyeti gelirse ilk
  bakılacak önlem bu. Panelde "bu kişinin bıraktığı izler" görünümü ve şikâyette "profil izi" sebebi de yok, sonraki
  iş.
- **İçerik derecesi:** Mağaza formunda "kaba mizah" işaretlenmesi gerekebilir ([`YAYIN_HAZIRLIGI.md`](YAYIN_HAZIRLIGI.md)).
  Doğrulanmadı.
- **Açık kalanlar:**
  - Panelde İz türleri, iz kaldırma ve hediye formundaki dakika alanı panel deposunun dalında hazır, birleşmedi.
  - Eski APK'larda Gizlilik'te "Kimler iz bırakabilir" yok; varsayılan onlar için de geçerli.
  - Odadaki görünüm paketinde kimin izin verildiği kişiye göre değil. Eski APK, "Yalnız takip ettiklerim" diyen birine
    hediyeyi bazen soluk göstermeden dener; sunucu jeton düşmeden reddeder.
  - **G7 APK'nın (preview-191/192) içindeki üç eski cümle** artık doğru değil ve sunucu değiştiremez: Gizlilik
    anahtarının açıklaması ("profilindeki iz de hemen gider"), kendi izinin notu ("İstemezsen Ayarlar › Gizlilik'ten
    kapatabilirsin": kapatmak olan izi kaldırmaz) ve hediye panelinin reddi ("profiline iz bırakılmasını kapattı",
    "Yalnız takip ettiklerim" yüzünden reddedilenlere de). Para ve kurallar doğru çalışır, yalnız yazılar yanlış. G7 iz
    varken başka türün hediyesinin düz gittiğini de söylemez. **Çaresi (siz):** 1.1.0 dağıtılınca Canlı ayarlar ›
    Zorunlu sürüm `1.1.0`, 1.1.0 APK'nın Yönetim › Canlı ayarlar ekranından (panel sürüm göndermediği için oradan
    kaydedilmez). Ayrıntı [`PROFIL_IZLERI.md`](PROFIL_IZLERI.md) › "Hangi uygulama ne görür".

## Mesaj bildirimi varsayılanı (18 Kasım 2026, sahip kararı)

Mesajlar'daki "Yalnızca samimi kişilerden bildirim al" seçeneği herkeste açık başlar. Bu yüzden karşılıklı takipleşmeyen ve aralarında kalp seviyesi olmayan birinin mesajı telefona bildirim düşürmez. Yayıncılar, ilk kez yazıp ücret ödeyen kişinin mesajını uygulamayı açınca görür; yayıncı geliri düşerse ilk bakılacak yer burasıdır. Eski APK bu seçeneği göstermediği için eski APK kullanan kişi kapatamaz. Varsayılan `server/api/privacy.mjs` ve `migrations/095_contact_prefs.sql` içindedir.

## Otomatik mesaj ve 5 dakika kuralı (18 Kasım 2026)

Şartname V2.0 uygulandı ([`OTOMATIK_MESAJ.md`](OTOMATIK_MESAJ.md)). Sahiplerin kararları: cevapsız kalan ücretli mesajın jetonu erkeğe iade edilir; erkek adına ücretsiz sohbet başlangıcı varsayılan açık, kapatılabilir.

- **Eski APK'daki yayıncı (siz: bir ayar):** 5 dakika kuralı sunucuda, herkese birden başlar. Eski APK geri sayımı göstermez; o yayıncı cevap vermeyi bilmeden kazanç kaçırabilir. Yeni APK dağıtılınca Canlı ayarlar › Zorunlu sürüm yükseltilmeli. O zamana kadar istenirse Canlı ayarlar › Otomatik mesaj › "Mesaj cevap süresi" 0 yapılır: eski hâl (yayıncı hemen kazanır, iade yok).
- **Erkek ajans ve aile sahipleri (siz: karar):** yayıncı kuralı onları da yayıncı sayıyor; ücretli mesajdan kazanmaya devam ederler (aynı 5 dakika kuralıyla). Şartname "erkek kullanıcılar mesaj kazancından elmas kazanamaz" diyor. Otomatik mesaj, hazır cevap ve şablonlar yalnız kadın yayıncılarda. Erkek yayıncıların mesaj kazancı kapatılsın mı, karar sizin.
- **Sistemin başlattığı mesaja ödül (siz: karar, şartnamenin "canlıya almadan önce" maddesi):** bugün güvenli kural uygulanıyor: erkek adına gönderilen ücretsiz başlangıç hiç elmas üretmez; erkeğin sonraki gerçek (ücretli) mesajı normal kurala girer. Ayrı bir promosyon ödülü ve bütçesi yapılmadı.
- **Kişi adına mesaj (mağaza):** ücretsiz başlangıç karşı tarafta "Otomatik sohbet başlangıcı", gönderende "Senin adına gönderilen…" diye yazıyor ve uygulama anlatmadan gitmiyor. Google Play incelemesinde sorulursa bu açıklama gösterilebilir.
- **Panel sayfası (Claude, sonra):** Canlı ayarlar kendiliğinden görünüyor. Rapor (yayıncı ve ajans performansı, hazır cevap kullanımı, şüpheli ikililer, bildirim kayıtları) için sunucu uçları `PANEL_ROUTES`'ta hazır; panel deposunda sayfası ve `APP_ROUTES` izni yapılmadı.
- **Yük:** eşleştirme dakikada bir, en çok 100 yayıncı ve 500 aday erkekle çalışır; ücretli mesaj başına bir satır daha yazılır. Yük testi bu sürümle tekrarlanmadı; canlı kullanıcı artınca `server/infra/loadtest/` ile denenmeli.


## Global hediye (19 Kasım 2026, Güncelleme 7 madde 12)

Yöneticinin "Global" işaretlediği pahalı hediye (en az 300.000 jeton) gönderilince gönderenin ülkesindeki bütün odalarda
adlarıyla duyurulur ([`HEDIYE_YONETIMI.md`](HEDIYE_YONETIMI.md) › Global hediye).

- **Moderasyon (siz: bilin):** gönderenin ve alıcının adı bütün platformda görünür; alıcı buna onay vermedi. Biri bunu
  birini herkesin önünde rahatsız etmek için kullanabilir (alıcının adı herkese gider). Önlemler: adlar zaten iletişim
  filtresinden geçmiş; yeni uygulamada herkes Gizlilik › "Adım genel duyurularda görünmesin" ile kendi adını
  gizleyebilir (gönderen de alıcı da, ayrı ayrı); engelleşen kişiler birbirinin duyurusunu görmez. Kötüye kullanılırsa
  hediyenin işareti panelden kaldırılır.
  - **Eski APK kullananlar adlarını gizleyemez** (düğme onlarda yok), alıcı da. Karar sizin: öneri, alıcının adını,
    uygulaması bu düğmeyi bilen bir sürüme geçene kadar varsayılan olarak gizlemek ya da global hediyeyi herkes yeni
    sürüme geçene kadar işaretlememek.
  - Kasım 2026 incelemesinde düzeltildi: yalnız **odada** gönderilen global hediye duyurulur (birebir sohbet, profil,
    aile sohbeti ve Anlar'dan gönderilen duyurulmaz); özel ya da şifreli odanın, dinlenen odanın, "Bulunduğum odayı
    göster"i kapalı ya da adını gizlemiş birinin odası duyuruda adlandırılmaz.
- **Hukuk:** Şanslı paketleri hiçbir zaman global olamaz (şans oyunu tanıtılmaz; Şanslı gönderimi bu yoldan geçmez).
  Bu sınır gevşetilirse Kritik 1'deki soruya dahil edin.
- **Yük:** her duyuru açık her hatta bir kısa yazı (ucuz); 10 saniyede en çok bir duyuru. Hediyenin videosu başka
  odalarda **oynamaz ve indirilmez** (1 çekirdekli sunucu, CDN yok: binlerce telefon aynı videoyu çekmesin).
- **Tek süreç (sonra):** duyuru sırası ve canlı hatlar tek API sürecinin belleğinde. Birden fazla API sürecine
  geçilirken ortak kanal (Postgres LISTEN/NOTIFY ya da Redis) ve tek sıra kurulmalı; yoksa her süreç yalnız kendi
  hatlarına duyurur ve aralık süreç başına sayılır.
- **Eski APK'lar:** duyuruyu görmez; gönderildiği odada normal hediye görür.
- **Panel (Claude, sonra):** Hediyeler formundaki "Global" kutusu panel deposunda yapılmadı; sunucu ucu hazır
  (`global` alanı, `globalMinPrice`).
