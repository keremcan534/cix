# Yük testi: sunucu ne kadar kaldırıyor

Tarih: 15 Kasım 2026. Canlı sunucunun bir kopyası ayrı bir makinede kuruldu ve canlıdaki gibi **tek bir işlemci
çekirdeğine** sıkıştırıldı. Kopyada aynı ses sunucusu (LiveKit 1.9.1), aynı API ve Postgres veritabanı vardı. Sanal
konuşmacılar, dinleyiciler ve kullanıcılar başka çekirdeklerden yük verdi.

Bu makinenin çekirdeği (Intel Xeon 2,1 GHz) canlıdaki Ampere çekirdeğine yakın, ama gerçek sonuç biraz farklı
olabilir. Testte HTTPS (Caddy) ve finans paneli yoktu. Canlıda bu ikisi de biraz yük ekler.

## Kısaca

- **Bugünkü makine reklam trafiğini taşımaz.** Ses odaları, uygulama ve veritabanı tek bir çekirdeği paylaşıyor.
  - **Ses:** 200 kişilik bir oda, 3 kişi konuşurken çekirdeğin üçte birini kullanıyor. 10 kişi aynı anda konuşursa
    çekirdeğin neredeyse tamamı gidiyor. İki dolu oda sesi bozmaya yetiyor.
  - **Uygulama:** Uygulama 500 çok aktif kullanıcıda rahat, 750'de yavaşlıyor, 1000'de tıkanıyor. Tıkanınca her
    istek 1–2 saniye bekliyor.
  - **İkisi birlikte:** 200 kişilik bir oda ve 250 aktif kullanıcı birlikte rahat çalışıyor. 500 kullanıcıda çekirdek
    doluyor: ses yine kayıpsız, ama uygulama yavaşlıyor.
  - **Çekirdek dolunca:** Bütün odalarda ses bozulur ve uygulama herkes için yavaşlar.
- **Makineyi 4 çekirdeğe büyütmek** kapasiteyi kabaca 4 katına çıkarır ve Oracle'ın ücretsiz sınırının içinde kalır.
  Ses ve veritabanı yükü çekirdeklere dağılıyor: 2 çekirdekte iki dolu oda kayıpsız çalıştı.
- **Bu turda koddaki iki darboğaz giderildi** (aşağıda). Yine de asıl kazanç makineyi büyütmekten gelir.

## Sizden

1. **Oracle'da makineyi 4 OCPU / 24 GB yapın.** En önemli adım bu.
   - Makine birkaç dakika kapanıp açılır. Bunu kullanıcı az olduğu bir saatte yapın.
   - Oracle'ın ücretsiz Ampere sınırı toplam tam bu kadar. Hepsini canlıya verirseniz, test sunucusu
     ([`DENETIM.md`](DENETIM.md) Kritik 6) için ücretsiz yer kalmaz; o zaman test sunucusu küçük ve ücretli bir makine
     olur. Önerim: 4 çekirdeğin hepsini canlıya verin.
   - Frankfurt'ta Ampere kapasitesi bazen doluyor. Oracle "out of capacity" derse birkaç saat sonra tekrar deneyin.
2. **Oda kişi sınırı için karar verin.** Odanın seviyesine göre kişi sınırı 50'den 5000'e kadar çıkıyor
   (`server/api/room-rules.mjs`), ama tek makine bunu taşıyamaz.
   - 5000 kişilik bir oda tek başına, 3 kişi konuşurken yaklaşık 9 çekirdek ister, 10 kişi konuşurken yaklaşık 21.
   - **Öneri:** Ses sunucusu ayrı makineye geçene kadar bütün odalara geçici bir üst sınır koyalım: 4 çekirdekte 500
     kişi, panelin Canlı ayarlar sayfasından değiştirilebilir. Bu, yüksek seviyeli odaların ödülünü geçici olarak
     kısar. Karar sizin, işi Claude yapar.

## Ses (LiveKit), tek çekirdek

| Oda | İşlemci (1 çekirdek = %100) | Sonuç |
| --- | --- | --- |
| 10 konuşan + 50 dinleyen | %28 | Kayıpsız |
| 3 konuşan + 200 dinleyen (tipik dolu oda) | ortalama %35, tepe %57 | Kayıpsız, 1,1 GB bellek |
| 10 konuşan + 200 dinleyen | ortalama %84, tepe %99 | Kayıpsız (2000 ses akışı), 856 MB bellek |
| 15 konuşan + 200 dinleyen | %97–100 | %0,06 kayıp, sınırda |
| 2 oda × (10 konuşan + 200 dinleyen) | Doldu | Dinleyicilere sesin yarısı ulaştı, %1,5–2,5 kayıp: **ses bozuk** |
| Aynısı, 2 çekirdekte | %177 | Kayıpsız: çekirdek eklenince kapasite aynı oranda artıyor |

- **Konuşmacılar:** Testteki konuşmacılar hiç susmadan konuşuyor, yani bu en kötü durum. Gerçek bir odada aynı anda
  bir iki kişi konuşur. Sessiz bir mikrofon neredeyse yük getirmez, çünkü uygulama sessizlikte ses göndermiyor.
- **İnternet trafiği:**
  - Dolu bir oda (10 konuşan + 200 dinleyen) saniyede yaklaşık 50 megabit veri gönderiyor. Tipik bir oda yaklaşık
    17 megabit.
  - Oracle'da ayda 10 TB dışarı trafik ücretsiz. Bu kota, gece gündüz dolu bir odayla yaklaşık 18 günde, tipik bir
    odayla yaklaşık 54 günde biter. Aşan kısım ücretlidir.

## Uygulama (API ve veritabanı), tek çekirdek

Her sanal kullanıcı, uygulamanın açık tuttuğu canlı bağlantıyı tutuyor ve ortalama 2,5 saniyede bir istek yapıyor.
İstekler şunlar:
- Oda listesi
- Profil
- Hediye gönderme (gerçek jeton hareketi)
- Sıralama
- Mesaj kutusu
- Ses token'ı

Bu çok hareketli bir kullanıcı. Odada oturan biri dakikada 2–3 istek yapar. Yani tablodaki 500 kullanıcı, odalarda
oturan birkaç bin kişinin uygulama yüküne yakın.

| Kullanıcı | Saniyede istek | Önce: yanıt süresi (yarısı / 100'de 95'i) | Şimdi | İşlemci (şimdi) |
| --- | --- | --- | --- | --- |
| 500 | 200 | 9 ms / 53 ms | 7 ms / 34 ms | %66 |
| 750 | 290 | 74 ms / 339 ms | 15 ms / 135 ms | %89 |
| 1000 | 270 (şimdi 310) | 1,1 sn / 2,2 sn | 0,6 sn / 1,5 sn | %99, tıkalı |

- **Hata ve sınırlar:** Hiç hata olmadı. Test, hız sınırları kapalıyken yapıldı.
- **Tıkalı sunucu:** 1000 kullanıcıda çekirdek dolu. O noktada kodu iyileştirmek yetmez, makine büyümeli.
- **Kayıt hızı:** Sunucu boşken saniyede yaklaşık 100 yeni hesap açılıyor, yük altında 20–50. Reklamla gelen bir kayıt
  dalgasına yeter.
- **Oda değişince gelen ani yük:** Bir oda seviye atladığında, ya da düzeni, etkinliği veya müziği değiştiğinde, içindeki
  bütün telefonlar odayı aynı anda yeniden okuyor. 500 kullanıcının yükü üstüne 200 telefon 1,2 saniyede okudu
  (önce 1,4 saniye). Bu sorun değil. 4 çekirdekte çok daha kısa sürer.

### İkisi birlikte (bugünkü canlı sunucu gibi)

Aynı çekirdekte 200 kişilik bir oda (3 konuşan) açıkken uygulama yükü:

| Kullanıcı | Yanıt süresi (yarısı / 100'de 95'i) | Ses | İşlemci (ses + API + veritabanı) |
| --- | --- | --- | --- |
| 250 | 10 ms / 41 ms | Kayıpsız | Yaklaşık %70 |
| 500 | 30 ms / 178 ms (oda yokken 7 ms / 34 ms) | Kayıpsız | Yaklaşık %100, dolu |

Yani bugünkü canlı sunucu, bir dolu oda ve birkaç yüz aktif kullanıcıyla sınırda. Reklamla gelen kalabalıkta ikinci
bir dolu oda ya da daha fazla kullanıcı, uygulamayla birlikte sesi de bozar (yukarıdaki iki odalı satır).

## Bu turda düzeltilenler

1. **Sıralama önbelleği** (`server/api/gifts.mjs`):
   - Sıralama ekranı, dönemdeki bütün hediyeleri baştan topluyordu. Yük altında veritabanının zamanının üçte birinden
     fazlası buna gidiyordu.
   - Bu iş, gönderilen hediye sayısıyla birlikte büyüyor. Dönemde 10 bin hediye varken sorgu 8 ms, 100 bin hediyede
     84 ms, 1 milyon hediyede 0,8 saniye sürüyor. Önbellek olmasaydı, 500 kullanıcı ve dönemde 100 bin hediye olunca
     yalnız bu sorgu çekirdeği doldururdu.
   - Artık her pano 30 saniyede bir okunuyor ve o arada açan herkes aynı sonucu görüyor (`RANKINGS_CACHE_MS`,
     varsayılan 30000). Gönderilen bir hediye sıralamaya en geç 30 saniyede yansır.
2. **Odadaki kişi sayısı** (`server/api/live.mjs`):
   - Oda listesi ve oda sayfası, kişi sayısını ses sunucusundan 10 saniyede bir okuyor.
   - Önceden bu süre dolduğu anda gelen yüzlerce isteğin her biri ses sunucusuna ayrı ayrı soruyordu. Artık hepsi aynı
     okumayı paylaşıyor.

## Sonra: büyürken

- **Ses sunucusuna koruma sınırı (Claude, makine büyüyünce):**
  - LiveKit dolmaya yaklaşınca yeni gelenleri geri çevirebiliyor (`livekit.yaml` → `limit.bytes_per_sec`). Böylece bir
    oda fazla kalabalıklaşınca herkesin sesi bozulmaz, yalnız yeni gelen "dolu" görür.
  - Bu değer makinenin çekirdek sayısına göre ayarlanır.
  - Canlıdaki `livekit.yaml` dağıtımla güncellenmiyor, makinede bir kez elle değiştirilir.
- **API'yi birden çok süreçle çalıştırmak (Claude):**
  - API tek bir Node süreci ve en çok bir çekirdek kullanabiliyor. 1000 kullanıcıda çekirdeğin dörtte birini kullandı.
  - Yani tek süreç yaklaşık 3000–4000 çok aktif kullanıcıya kadar yeter. Sonrası için birden çok süreç gerekir.
- **Ses sunucusunu ayırmak:** LiveKit ayrı bir makineye ya da LiveKit Cloud'a, sonra veritabanı da ayrı bir makineye
  taşınır ([`DENETIM.md`](DENETIM.md) Kritik 2).
- **Sıralamanın günlük toplamı (Claude):** Ayda milyonlarca hediye olunca, sıralama tek tek hediyelerden değil, günlük
  toplamlardan okunmalı.
- **Hız sınırları:**
  - IP başına dakikada 600 istek ve 20 giriş sınırı var.
  - Aynı internet bağlantısını paylaşan kişiler (yurt, kafe, bazı mobil operatörler) birlikte sayılır. Bu sınır
    yaklaşık 25 çok aktif kişiye kadar sorun çıkarmaz.
  - Reklamdan sonra API kaydındaki 429 hatalarına bakılır, gerekirse `RATE_IP` yükseltilir.
- **Gerçek makinede ölçüm:** Makine büyüyünce, yayından önce (sunucu hâlâ test modundayken) aynı test canlı makineye
  karşı bir kez çalıştırılmalı. En doğru sayıyı bu verir. Bunun için testin GitHub Actions'tan çalışacak şekilde
  hazırlanması gerekir, çünkü Claude'un çalıştığı ortamdan ses bağlantısı kurulamıyor.

## Testi tekrar çalıştırmak

Araçlar `server/infra/loadtest/` klasöründe. **Canlı sunucuya karşı çalıştırmayın.** Araçlar gerçek hesaplar açar
ve sunucuyu bilerek doldurur.

| Dosya | Ne yapar |
| --- | --- |
| `build-tools.sh` | Canlıdakiyle aynı sürüm LiveKit'i ve yükü veren `lk` aracını kurar. Go ve ffmpeg gerekir. `lk`'nin içindeki örnek ses dosyaları gerçek ses olmadığı için yerlerine konuşma gibi ses koyar. |
| `livekit-load.py` | Oda başına N konuşan ve M dinleyen oluşturur. Ses sunucusunun işlemci ve bellek kullanımını, her dinleyiciye ulaşan sesi ve kaybı yazar. |
| `api-load.mjs` | Sanal kullanıcılarla API'yi kademe kademe yükler. Her kademede gecikmeyi, hataları ve API ile veritabanının işlemci kullanımını yazar. `--burst` ile odanın aynı anda yeniden okunmasını da dener. |

Örnek (sunucu çekirdek 0'da, yükü veren araçlar 1–3'te):

```sh
server/infra/loadtest/build-tools.sh ./tools
taskset -c 0 ./tools/livekit-server --config livekit.yaml &        # keys: yuk: <secret>
LK=./tools/lk LIVEKIT_API_KEY=yuk LIVEKIT_API_SECRET=<secret> python3 server/infra/loadtest/livekit-load.py oda 3 200 1 60

# API: ALLOW_DEV_AUTH=1 ALLOW_TEST_TOPUP=1, hız sınırları yüksek (RATE_IP, RATE_AUTH, RATE_ALL), çekirdek 0'da
taskset -c 1-3 node server/infra/loadtest/api-load.mjs --base http://127.0.0.1:7890 --stages 250,500,750,1000 \
  --seconds 45 --burst 200 --api-pid <API süreci>
```
