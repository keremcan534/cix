# Lucky Hediye Modülü

Kaynak: *LUCKY HEDİYE VE ÇARPANLI COIN KAZANMA MODÜLÜ*.

Kullanıcı Lucky kategorisinden bir hediye gönderir. Sunucu yayımlanmış olasılıklara göre bir çarpan çeker. Kazanırsa **hediye bedeli × çarpan** kadar jeton gönderenin bakiyesine eklenir. Hediyeyi alan kişiye hediye değerinin **%20'si** elmas olarak yazılır (`LUCKY_RECIPIENT_SHARE`, `src/data/rules.ts`); PK'da da aynı %20 puan sayılır. Gönderenin ödülü bundan ayrı hesaplanır.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `src/lib/lucky.ts` | Sunucunun yerine geçen katman: paketler, olasılıklar, çekiliş, ödül rezervi, kayıtlar, denetim. |
| `src/components/room/gift-sheet.tsx` | Hediye paneli › **🍀 Lucky** rafı: paketler, tam olasılık tablosu, Geçmişim. |
| `src/components/room/lucky-combo.tsx` | Sağ alttaki tekrar çarkı: çember etrafında dolan çizgi, basınca aynı hediyeyi aynı kişilere tekrar gönderir (×1, ×2, ×3 …). |
| `src/lib/broadcast.ts`, `src/components/fx/win-banner.tsx` | Tüm odalara kazanç duyurusu: üst ortada ışıltılı bant, sırayla gösterilir. |
| `src/components/room/lucky-result.tsx` | Odadaki sonuç kartı (çarpan + ödül veya "ödül çıkmadı"). Dokunmaları engellemez, mikrofona dokunmaz. |
| `src/app/oda/[id].tsx` | `sendLuckyGift`: alıcının hediye kaydı, PK puanı, sohbet bildirimi. |
| `src/app/lucky-yonetimi.tsx` | Yönetim paneli (`lucky.manage`). |

## Kurallar

- **Çarpanlar:** 2x, 5x, 10x, 20x, 50x, 100x, 200x, 500x ve 1.000x. Her pakette hepsinin bulunması gerekmez.
  - Olasılıklar 100.000 üzerinden tam sayı tutulur (en küçük adım %0,001).
  - "Ödül yok" da tabloda bir satırdır; tablo her zaman %100'e tamamlanır.
- **Varsayılan oranlar:** Beklenen geri dönüş yaklaşık ×0,65. Bunlar örnek değerlerdir; gerçek oranlar ekonomi ve hukuk incelemesinden sonra belirlenmeli.
  - Belgedeki test tablosu (her gönderim en az 2x kazanır) yönetim panelinde **Belgedeki test tablosu** düğmesiyle uygulanabilir.
- **Gönderim akışı:**
  1. Panelde fiyat, her çarpanın olasılığı ve ödülü gösterilir.
  2. **Onay yok:** Hiçbir hediye onay sormaz; tek dokunuşla gönderilir.
  3. Gönderimden sonra sağ altta o hediyeye ait çark çıkar. Çevresindeki çizgi 5 saniyede tamamlanır; bu sürede çarka basmak aynı hediyeyi aynı kişilere tekrar gönderir ve sayaç ×1, ×2, ×3 diye ilerler. Her basış çizgiyi baştan başlatır, çizgi kapanınca çark kaybolur.
  4. Sunucu sırayla şunları yapar: aynı işlem mi diye bakar, paketi kontrol eder, jetonu düşer, çeker, ödülü yazar, kaydeder.
- **Alıcılar:** Tek kişiye, seçilen kişilere veya "Tümü" ile mikrofondaki herkese gönderilebilir. Adet seçilebilir (×1, ×10, ×66 …); her hediye için ayrı çekiliş yapılır (ayrı işlem kimliği). Bakiye bir yerde biterse kalan hediyeler gönderilmez ve sohbette yazılır.
- **Tekrar eden istek:** Aynı işlem kimliği gelirse ilk sonuç döner. İkinci kez jeton düşülmez, ödül verilmez.
- **Bütçe:**
  - Her gönderimin bir payı (varsayılan %70) ödül rezervine aktarılır.
  - Rezerv bir paketin en yüksek ödülünü karşılayamazsa ya da günlük ödül limiti dolarsa paket **jeton düşülmeden önce** kapanır.
- **Ayar sürümü:** Her değişiklik sürümü artırır. Her kayıt, çekildiği olasılık tablosunu ve sürümü saklar.
- **Gönderim sınırı yok:** Kullanıcı jetonu yettiği kadar Lucky gönderebilir; günlük ya da dakikalık kullanıcı sınırı yoktur.
  - Yaş sınırı 18; kişi kendine Lucky gönderemez.
- **Alıcı ve PK:** Alıcıya hediye değerinin %20'si elmas yazılır (aşağı yuvarlanır). PK'da alıcının (Takım PK'da takımının) puanına da aynı %20 eklenir; gönderenin kazandığı ödül PK'ya hiç sayılmaz. Normal hediyeler değişmedi (tam değer).
- **Servet puanı:** Harcanan jeton sayılır, kazanılan ödül sayılmaz.
- **Duyuru:** Herhangi bir odada biri kazanç elde edince (Lucky veya Oyun Merkezi) **tüm odalarda** üst ortada ışıltılı bir bant çıkar: "X kazandı! Lucky › Uğur Böceği ×10 · +1.000 jeton · oda adı".
  - Bantlar sırayla gösterilir (en fazla 6 bekler); 30 saniyeden eski duyuru gösterilmez.
  - Bir gönderimde birden çok kazanç varsa tek bant: en yüksek çarpan ve toplam ödül.
  - Kullanıcı Ayarlar › Gizlilik'ten adının gizlenmesini seçebilir; o zaman "Bir kullanıcı kazandı" yazar.
  - ×50 ve üzeri kazanç ayrıca o odanın sohbetine de yazılır.
  - Prototipte diğer odaların kazançları 25–50 saniyede bir örnek olarak üretilir; gerçek sistemde sunucunun yayın kanalından gelir.
- **Mikrofon ve oda:** Sonuç kartı yalnızca görseldir. Koltuk, mikrofon ve ses bağlantısı değişmez.

## Kabul testleri (web prototipi, Playwright)

| Test | Sonuç |
|---|---|
| Fiyat ve olasılık tablosu gönderimden önce görünür | ✅ |
| Onay penceresi çıkmaz; çarka 3 kez basınca ×4, 4 ayrı kayıt; 5 sn sonra çark kaybolur | ✅ |
| Çarpan ve ödülü sunucu belirler; bakiye doğru güncellenir | ✅ ×100: −100 +10.000 |
| Tekrar gönderilen istek ikinci kez ücretlendirilmez ve ödül verilmez | ✅ |
| Olasılık toplamı %100 olmayan paket kaydedilmez | ✅ "%136; %100 olmalı" |
| Gösterilen oranlar gerçek yapılandırmayla aynı (sürüm numarası) | ✅ |
| Geçmiş: harcanan, çarpan, ödül, ayar sürümü | ✅ Kullanıcı (Geçmişim) ve yönetim panelinde |
| Mikrofondaki 5 kişiye tek dokunuşla gönderim: 5 ayrı çekiliş ve kayıt, bakiye doğru | ✅ −500 +1.000 (×10) |
| Kazanç tüm odalarda bantla duyurulur; başka odaların kazançları da görünür | ✅ |
| Rezerv yetersizse paket gönderime kapanır | ✅ ("Rezervi 1.000’e düşür (test)") |
| Lucky gönderiminde koltuk ve mikrofon korunur | ✅ |

## Sunucuya taşınacaklar

- **Tablolar:**
  - `lucky_packages (id, name, price, enabled, version)`
  - `lucky_odds (package_id, version, mult, weight)`
  - `lucky_sends (tx_id unique, user_id, room_id, package_id, to_id, price, mult, reward, config_version, created_at)`
  - `lucky_pool_ledger`
- **Tek işlem:** Jeton düşümü, çekiliş, ödül ve kayıt tek bir veritabanı işleminde yapılmalı.
- **Rastgele sayı:** Çekiliş için kriptografik bir rastgele sayı üreteci kullanılmalı.
- **Test aracı:** "Sonraki sonucu zorla" yalnızca bu demoda vardır; üretimde olmamalı.

## Karar bekleyenler

- **Ödül kaynağı:** Rezerv payı (%70) ve günlük limit.
- **Alıcının geliri (karar verildi):** Lucky hediyede alıcıya hediye değerinin %20'si elmas olarak yazılır (`RULES.luckyHostShare`, aşağı yuvarlanır); kalan kısım ödülleri karşılar. Her gönderimin kaydında `hostDiamonds` alanı tutulur.
- **Hukuk:** Mevzuat, mağaza kuralları ve yaş sınırı incelemesi.
  - Jetonlar nakde çevrilemez.
  - Gerçek para karşılığı ödül, hukuki onay olmadan eklenmeyecek.
