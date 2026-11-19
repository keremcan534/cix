# Para denetimi: para doğru yazılıyor mu, kaybolur mu

Tarih: 15 Kasım 2026. Uygulamada jeton, elmas ya da oyun jetonu hareket ettiren her yer tek tek çıkarıldı. Toplam 40'tan
fazla yol var: hediye, satın alma, iade, bağ, çanta, oyun, Jeton Noktası, para çekme, ajans, davet ve diğerleri.
Bunların hepsi otomatik testlerle denendi.

## Kısaca

- **Para kaybolmuyor ve yoktan oluşmuyor.** Bütün bakiye değişiklikleri tek bir yerden geçiyor
  (`server/api/core.mjs` `move`) ve her biri değiştirilemez bir kayıt defteri satırı bırakıyor. Testlerde bunun
  dışında değişen tek bir bakiye çıkmadı.
- **Ama gerçek açıklar ve hatalar bulundu:** 2 açık kapatıldı, 3 hata düzeltildi (aşağıda). Kalan işler ve sizden
  gereken kararlar en sonda.
- **Artık sürekli denetleniyor:**
  - Her otomatik testin sonunda para denetimi çalışıyor. Sunucunun 794 testi aynı zamanda birer para testi.
  - Canlı sunucuda saatte bir çalışıyor. Bir tutarsızlık bulursa sunucunun sağlık kontrolü kırmızıya döner ve GitHub
    size e-posta atar.

## Denetimin baktığı kurallar (`server/api/money-check.mjs`)

| Kural | Ne demek |
| --- | --- |
| Bakiye | Her hesabın jetonu, elması ve oyun jetonu, kayıt defterindeki son satırla aynı |
| Zincir | Her satırın bakiyesi = bir önceki satırın bakiyesi + bu satırın tutarı. Araya satır sokulamaz, satır silinemez |
| Partiler | Her hesabın jetonu, nereden geldiği bilinen jeton partilerinin toplamına eşit |
| Hareket | Her jeton satırı hangi partiden geldiğini yazıyor ve tutar tutuyor |
| Kilit | Kilitli elmas, hesaptaki elmastan fazla değil |
| Hediye | Her hediyede alıcıya tam tutarda elmas geçti. Anında ödenen hediyede gönderenden tam tutarda jeton düştü |
| Ücretli | Her ücretli mesajda ve arama dakikasında ödenen jeton, kazanılan elmasa eşit |

## Nasıl denetleniyor

1. **Her testten sonra:** Her test dosyası kendi boş veritabanında çalışıyor. Dosya bitince denetim, testlerin
   bıraktığı bütün parayı kontrol ediyor (`server/api/test/harness.mjs`). Böylece yeni yazılan her test de kendiliğinden
   bir para testi oluyor.
2. **Aynı anda rastgele işlem (`test/money-fuzz.test.mjs`):**
   - 10 kişi ve bir Jeton Noktası, 8'er 8'er aynı anda 500 rastgele para işlemi yapıyor: yükleme, satın alma, hediye,
     Çevir, bağ, çanta, mağaza, oyun, Jeton Noktası satışı, elmas bozdurma, iade.
   - İşlemlerin onda biri aynı anda iki kez gönderiliyor (çift dokunma ya da yeniden deneme gibi).
   - Hiçbiri sunucu hatası vermemeli ve sonunda para denetiminden geçmeli.
   - Düzeltmelerden sonra 1500 işlemlik 13 tur daha çalıştırıldı, toplam yaklaşık 20.000 işlem. Hiç hata çıkmadı,
     para tuttu.
3. **Canlıda:**
   - Saatte bir arka planda çalışıyor (`MONEY_CHECK_MIN`, varsayılan 60). Sorun bulursa `/api/health`'te
     `money_mismatch` görünür ve uptime kontrolü e-posta atar.
   - Yönetici ya da panel denetimi istediği an çalıştırabilir: `GET /api/admin/money-check`.
   - Canlı sunucu, test sunucusu olduğu dönemin eski kayıtlarını değil, `071` geçişinden sonrasını izliyor. Eski
     kayıtlar istenirse `?all=1` ile denetlenir. Yayında temiz veritabanıyla başlanınca her şey izlenir.

## Bulunan ve düzeltilenler

1. **Ücretli arama bedavaya getirilebiliyordu (açık):**
   - Sunucu bir dakikanın ücretini, kimliği tahmin edilebilen bir kayıtla yazıyordu (`call-12-2`).
   - Arayan kişi bu kimliği önceden başka bir harcamada kullanırsa, 2. dakika ve sonrası hiç ücretlenmiyordu. Kazanan
     yayıncı da hiçbir şey alamıyordu.
   - Düzeltme: Sunucunun kendi kayıtları artık hiçbir isteğin kullanamayacağı bir biçimde yazılıyor (`call:12:2`).
     Aynı durum ücretli mesaj ve bağ kayıtlarında da düzeltildi.
   - Bunu deneyen bir test var.
2. **İade edilen jeton geri dönebiliyordu (açık):**
   - Biri jeton satın alıp bu jetonu bekleyen bir Bağ isteğine ya da açık bir Şanslı çantaya koyduktan sonra mağazadan
     parasını iade alırsa, iade bu bekleyen jetonları görmüyordu.
   - Sonuç: Bağ reddedilince ya da çanta açılmayınca jetonlar ona geri dönüyordu, yani hem parası hem jetonu oluyordu.
     Bağ kabul edilirse ya da çanta dağıtılırsa da karşı tarafa iade edilmiş paradan elmas geçiyordu.
   - Düzeltme: İade artık bekleyen bağ isteğini ve açık çantayı da kapatıyor. İade edilen kısım geri gelmiyor, temiz
     kısım sahibine dönüyor.
3. **İade ile hediye aynı anda kilitleniyordu (hata):**
   - Aynı kişilere aynı anda dokunan bir iade ile bir hediye, veritabanında birbirini bekleyip kilitleniyordu.
   - Kullanıcı "Sunucu hatası" görüyordu. Para kaybolmuyordu; işlem tamamen geri alınıyordu.
   - Düzeltme: İade, hesapları sunucunun geri kalanıyla aynı sırada kilitliyor. Kapattığı bağ isteğinin karşı
     tarafını da baştan kilitliyor, çünkü iade kaydında o kişinin adı geçiyor.
   - Bu hatayı aynı anda rastgele işlem testi iki ayrı biçimde buldu. İkincisi 8 turdan yalnız birinde çıkıyordu.
4. **Ajans asistanı payı geri alınınca kilit kalıyordu (hata):**
   - Pay geri alınınca o paya ait elmas kilidi kalkmıyordu. Asistanın çekebileceği elmas 7 güne kadar olduğundan az
     görünüyordu.
   - Düzeltme: Geri alınan payın kilidi de kalkıyor. Başkasının hediyesinden gelen kilitli elmas alınmıyor, çünkü o
     elmas hediyenin olası iadesini karşılıyor.
5. **Bazı kayıtlar hangi jeton partisinden düştüğünü yazmıyordu (eksik):**
   - İade ve davet ödülü geri alımı için geçerliydi. Artık yazıyor.
6. **Finans paneline gitmeyen para hareketleri (eksik):**
   - Ücretli mesajlar ve arama dakikaları, ödül jetonları (hoş geldin, davet, görev, aile sandığı) ve geri alınmaları,
     aile kurma, oda animasyonu, koltuk rengi, özel oda görseli ve Şanslı çantadan çıkan hediye elmasları panele hiç
     gitmiyordu.
   - Artık hepsi panelin zaten tanıdığı olay türleriyle gidiyor. Panelin kendi kodunda denendi: hepsi kabul edildi.

7. **Odada gönderilen hediye ve Şanslı hediye kilitlenebiliyordu (hata, 19 Kasım 2026):**
   - Odadaki hediye, oda sahibinin hesabını (oda puanı için) gönderen ve alandan sonra, sırasız kilitliyordu. Oda sahibi
     aynı anda o kişilerden birine hediye gönderince ikisi birbirini bekliyordu.
   - Şanslı gönderimi gönderenin aynı jeton partisine iki kez yazıyor (alıcının payı ve kalan). Veritabanı ikinci yazışta
     partinin satın alımını ve jetonu satan Jeton Noktası'nı yeniden denetliyor; aynı anda bir iade ya da Jeton Noktası
     satışı varsa kilitleniyordu.
   - Kullanıcı "Sunucu hatası" görüyordu, para kaymıyordu. Düzeltme: oda sahibi, satın alım ve satan hesap baştan,
     sunucunun geri kalanıyla aynı sırada kilitleniyor (`server/api/send-locks.mjs`).
   - Rastgele işlem testi Şanslı gönderimi (eski sayfanın fiyatı ve sürümü dahil) ve odada hediye eklenince buldu.

## Kalanlar

**Sizden karar gerekenler:**
- **Ekranda görülen fiyat kontrolü olmayan yerler:**
  - Ücretli mesaj ve arama fiyatı (Canlı ayarlar), bağ, aile kurma, animasyon ve koltuk rengi. Şanslı hediye
    Güncelleme 7 madde 10'da kapandı (yeni APK fiyatı ve ayar sürümünü gönderir; eski APK'lar için Zorunlu sürüm).
  - Kuralımız şu: Fiyat değiştiyse işlem reddedilir, eski fiyattan para alınmaz. Bunun için uygulamanın gördüğü fiyatı
    göndermesi gerekiyor, yani yeni APK. Öneri: Hediyede yaptığımız gibi yapalım.
- **Jeton Noktası'nda elmas bozdurma ile Çevir farklı kurla çalışıyor:**
  - Bozdurma derlenmiş kuru kullanıyor, Çevir ise panelden ayarlanan canlı kuru. Kur değişince ikisi ayrışır.
  - Öneri: İkisi de canlı kuru kullansın.
- **Şanslı hediyenin günlük ödeme sınırı aşılabiliyor:**
  - Sınır tek bir çekilişe bakıyor, ama bir gönderimde birden çok çekiliş oluyor.
  - Şans özelliği hukuken açık bir konu ([`DENETIM.md`](DENETIM.md) Kritik 1).
- **Ajans transfer ücreti:** Ücreti yayıncının ödediği ayar ile üst ajans değişikliği bir araya gelince işlem hata
  veriyor. Bu durumda ücreti kimin ödeyeceğine karar verilmeli.

**Claude'un sıradaki işleri:**
- **Kullanıcının hesap geçmişi:**
  - Uygulama yalnız son 50 hareketi gösteriyor, daha eskisine ulaşılamıyor.
  - Sunucuda sayfalama ve uygulamada "daha fazla" düğmesi gerekiyor (yeni APK).
- **Finans paneline hâlâ gitmeyenler:**
  - Abonelik (VIP) satın alımları: gerçek para olduğu için önemli.
  - Çantam'dan gönderilen ücretsiz hediyelerin elması.
  - Ajans asistanı payları.
  - Bunlar panelde yeni bir olay türü gerektiriyor, yani panel deposunda da değişiklik.
- **Günlük mutabakat:**
  - Panelin her gün uygulamayla toplamları karşılaştırması gerekiyor.
  - Sebep: Aktarım satırları sırayla okuyor. Çok uzun süren bir işlem 60 saniyelik payı aşarsa, satırı nadiren de olsa
    atlayabilir. Mutabakat bunu da yakalar.
- **Ajans komisyonu:** Tek bir bozuk gelir kaydı, bütün bekleyen komisyonların hesaplanmasını durdurabiliyor. Her
  kaydın kendi içinde hata verip geçmesi gerekiyor.
- **Silinmiş hesaplar:** Silinmiş bir hesap Şanslı çantadan pay alabiliyor. Küçük bir düzeltme.

## Kendiniz denetlemek için

- **Yönetici hesabıyla:** `GET /api/admin/money-check` çalıştırın. Panelde de çağrılabilir (`PANEL_ROUTES`). Sonuç
  boşsa para tutuyor demektir.
- **Bir hesabın bütün hareketleri:** `GET /api/admin/wallet/audit?user=<id>`.
- **Testler:** `cd server/api && PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=… node --test --test-concurrency=4 test/*.test.mjs`
- **Daha uzun rastgele tur:** `MONEY_FUZZ_OPS=1500 MONEY_FUZZ_SEED=<sayı> node --test test/money-fuzz.test.mjs`
  - Hata mesajında, hatayı veren tohum yazar. Aynı tohumla aynı tur tekrarlanır.
