# Canlı Oda: Balkon, oda sayacı, katılımcı yönetimi ve sohbet filtreleri

Kaynak: *SimilarClub — Canlı Oda UX/UI ve İşlevsel Geliştirme Şartnamesi*.

> Prototip: backend yok. `src/lib/room-presence.ts` ve `src/lib/chat-feed.ts` sunucunun yerine geçer; diğer kişilerin katılması, ayrılması, mesajları ve hediyeleri simüle edilir. Kurallar ve doğrulamalar bu katmanlarda, arayüzden bağımsız.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `src/lib/room-presence.ts` | Oda başına **tek katılımcı modeli**: odadaki benzersiz kişiler, mikrofon koltukları, moderatör mikrofon susturması, odadan çıkarma yasakları, mikrofon davetleri, olay tekilleştirme, izleyicinin bağlantı durumu. |
| `src/lib/chat-feed.ts` | Sohbet olaylarının türü (sohbet / hediye / sistem / bot), filtreler, tekilleştirme, tür başına geçmiş sınırı. |
| `src/components/room/balcony.tsx` | Balkon şeridi, toplam kullanıcı sayacı, "Odadaki Kullanıcılar" penceresi, mikrofon daveti istemi, bağlantı bandı. |
| `src/components/room/chat-feed.tsx` | Tümü / Hediyeler / Sohbet sekmeleri ve listeleri. |
| `src/components/room/parts.tsx` | Sohbet satırı (hediye satırı ve "gönderilemedi" durumu), koltuk (kişisel sessiz rozeti). |
| `src/components/room/live-room.tsx` (eski `src/app/oda/[id].tsx`) | Entegrasyon: koltuklar artık oda katılımcı modelinden okunur; tüm koltuk, moderasyon ve davet işlemleri o katmandan geçer. |
| `src/data/mock.ts` | Oda dinleyicileri için belirlenimci "misafir" kullanıcılar (`gx-<oda>-<n>`), böylece sayılar gerçek kişilere karşılık gelir ve profilleri açılır. |
| `tests/room-presence.test.ts`, `tests/chat-feed.test.ts` | Otomatik testler. |

## Katılımcı sayımı

Tek kaynak: `deriveView(room)` (başka hiçbir yerde sayı hesaplanmaz).

- **Toplam** = odadaki benzersiz kişiler.
- **Mikrofonda** = odadaki ve bir mikrofon koltuğunda veya **patron koltuğunda** oturan benzersiz kişiler (patron koltuğu konuşan bir koltuktur; PK'ye de katılır).
- **Balkon** = odadaki ama mikrofonda olmayan kişiler. Toplam = Mikrofonda + Balkon her zaman.
- Bir kişi aynı anda iki listede olamaz; koltukta görünüp odada olmayan biri sayılmaz.
- Mikrofon **kapasitesi** (ör. 12) ile mikrofondaki kişi sayısı ayrı tutulur.
- Katılma ve ayrılma olayları olay kimliği taşır; aynı olay bir kez uygulanır. Gecikmiş bir "katıldı" olayı, sonradan ayrılmış birini geri eklemez.
- Gizli giriş: Balkon'dayken listede ve sayıda görünmez; mikrofona geçince görünür.
- Mikrofon sayısı azalırsa kaldırılan koltuktakiler Balkon'a geçer, odadan düşmez.
- Odalar ilk açıldıklarında oda kartındaki dinleyici sayısıyla başlar; sonraki ziyaretlerde oda olduğu gibi bulunur. Odadan çıkınca yalnızca sen ayrılırsın.
- Aynı oda iki kez açılmış olabilir (oda → profil → aynı oda). Odadan ancak o odanın son ekranı kapanınca ayrılırsın.
- Kara liste (oda ayarları) sunucu modeline eşitlenir: listedekiler odadan çıkar ve giremez; listeden çıkarılan tekrar girebilir. Süresi dolan 10 dk yasaklar etkin sayılmaz.

Örnek (test edildi): 20 mikrofonun hepsi dolu, odada 50 kişi → Balkon 30, Mikrofonda 20, Toplam 50.

## Balkon ve toplam sayaç

- Mikrofonların hemen altında: solda **Balkon · N kişi** ve birkaç küçük avatar + "+kalan"; sağda turkuaz **👥 Toplam** sayacı. Dar ekranda daha az avatar gösterilir, etiket ve sayı kısalmaz.
- Sayacın tamamı dokunulabilir (≥ 40 px yükseklik, erişilebilir etiket). Balkon şeridine dokunmak da aynı pencereyi açar; iki farklı davranış yoktur.
- Mikrofon alanı (panolar ve koltuklar) ekranın en fazla %58'ini kaplar, daha uzunsa kendi içinde kayar. Böylece Balkon ve sohbet küçük telefonlarda da yerini korur.
- Bağlantı yokken sayaç bulut ikonuna döner ve soluklaşır; bant "son alınan durumu gösteriyor" der.

## Odadaki Kullanıcılar penceresi

- Başlık: `N kişi · M mikrofonda · B balkonda` (canlı, modelden).
- Sekmeler: **Balkon** (varsayılan), Mikrofonda, Tümü; isimle arama; kaydırılabilir, sanallaştırılmış liste (yüzlerce kişi).
- Sıra: önce sen, sonra oda sahibi ve yöneticiler, sonra katılma sırası.
- Her satır: avatar, isim (👑 sahip, 🛡️ yönetici), durum (Balkon / N. mikrofon, "mikrofonu kapatıldı", "davet bekliyor", "senin için sessizde", "engelledin"). Satıra dokununca işlemler açılır.

### İşlemler ve yetkiler

Arayüz yalnızca yetkili olunan işlemleri gösterir; **her işlem ayrıca sunucu katmanında doğrulanır** ve reddedilen denemeler denetim kaydına yazılır.

| İşlem | Kim görür | Sunucu kuralı |
|---|---|---|
| Mikrofona davet et | Sahip, yönetici; hedef Balkon'da | Hedef odada ve mikrofonda değil; bekleyen davet yok; aynı kişiye 20 sn içinde yeni davet yok; o an boş (kilitsiz) mikrofon var. |
| Mikrofonunu sustur / aç | Yalnızca **mikrofondaki** kişi için, hedeften üst rol | Balkon'daki kişiye uygulanamaz (açık mikrofonu yok). |
| Benim için sessize al | Herkes (kendisi hariç) | Yalnızca senin ekranında: o kişinin sohbet satırları ve konuşma göstergesi gizlenir. Kimseyi etkilemez, odadan çıkarma veya engelleme değildir. |
| Odadan çıkar | Hedeften üst rol | Onay sorulur. Kişi odadan ve mikrofondan çıkar, **10 dk** tekrar giremez (kalıcı engel değildir; süre dolunca normal oda kurallarıyla girebilir). Kendini ve oda sahibini çıkaramazsın; yönetici yöneticiyi çıkaramaz. |
| Kara listeye ekle (koltuk menüsü, sahip) | Oda sahibi | Kalıcı giriş yasağı. |
| Profil, hediye gönder, engelle, şikâyet et | Herkes | Mevcut profil, hediye, engelleme ve destek talebi işlevlerine bağlı. |

Koltuk menüsündeki "Mikrodan at", "Mikrofonu kilitle", "Odadan at" (artık onaylı), "Mikrofonunu sustur", "Koltuk değiştir" de aynı sunucu kurallarından geçer. Başkasını mikrofona almak (konuşma isteğini kabul, koltuk değiştirme) yönetici ister; mikrofondaki birini taşımak için ondan üst rol gerekir.

### Mikrofon daveti akışı

1. Yönetici davet eder (pencereden veya boş koltuğun "Davet et" seçeneğinden, o koltuk için).
2. Sunucu yetkiyi, hedefi, sınırı ve boş mikrofonu kontrol eder; davet 30 sn geçerlidir.
3. Davet edilen kişi **kabul eder veya reddeder**; davet kimseyi otomatik oturtmaz. Sana gelen davette ekranın üstünde Kabul / Reddet istemi açılır (başkasının odasında Balkon'dayken oda sahibi bir kez davet eder).
4. Kabulde o anki boş mikrofona geçilir. Bu arada mikrofonlar dolduysa kimse oturtulmaz ve "boş mikrofon kalmadı" denir.
5. Sonuç (kabul, ret, yanıt yok, boş mikrofon kalmadı) daveti gönderenin sohbetine bir kez yazılır. Davet edilen odadan ayrılırsa davet iptal olur.

"Konuşma istekleri" (kişinin kendi isteği) kabulünde doğrudan mikrofona alma aynen sürüyor; istek zaten kişinin rızası.

## Sohbet filtreleri

| Sekme | Gösterir |
|---|---|
| **Tümü** (varsayılan) | Sohbet, hediye, sistem ve bot olayları tek akışta, zaman sırasıyla. Kişisel "Mesaj ayarları" yalnızca bu sekmeye uygulanır. |
| **Hediyeler** | Yalnızca hediye olayları: gönderen → alan, hediye, adet, Lucky; ücretli efekt hediyeleri ve Lucky kazanç duyuruları. |
| **Sohbet** | Yalnızca kişilerin oda sohbet mesajları. |

**Sınıflandırma kuralı** (`kindOf`): yazarı olan mesaj → sohbet; yapılandırılmış hediye verisi taşıyan veya hediye türünde işaretlenen olay → hediye; etiketli oda botu → bot; geri kalan her şey (katılma, mikrofon değişikliği, moderasyon, PK durumu, duyuru, zarf) → sistem ve yalnızca Tümü'de. Yazarı olmayan bir olay asla Sohbet'e düşmez.

Davranış:

- Her sekmenin kendi listesi açık kalır: sekme değiştirmek bağlantıyı yenilemez, geçmişi silmez, veri indirmez, hediye animasyonunu veya puanı yeniden çalıştırmaz; her sekme kendi okuma konumunu korur.
- Yeni olaylar hangi sekme açıksa ona uygun görünür; başka türde olay gelince sekme değişmez.
- Eski mesajları okurken yeni olaylar ekranı kaydırmaz (konum sabit kalır, ölçüldü); "↓ N yeni" düğmesi en yeniye götürür. En alttaysan yeni mesajlar akışı izler.
- Olaylar kimlikleriyle bir kez eklenir; geçmiş tür başına sınırlanır (sohbet 300, hediye 200, sistem 150, bot 40), böylece yoğun sohbet hediye geçmişini silmez.

## Gerçek zamanlı tutarlılık ve bağlantı

- Katılımcılar benzersiz kullanıcı kimliğiyle tutulur; yeniden bağlanma ikinci kayıt oluşturmaz.
- Hediye olaylarının sohbet kimliği işlem kimliğinden gelir (`gift:<txId>`); aynı olay tekrar gelirse ikinci satır ve ikinci puan oluşmaz.
- **Bağlantı kopması (test):** Menü › Oda Araçları › *Ses ve bağlantı testi* › *Ağ bağlantısını kes* bu cihazın bağlantısını, aynı yerden geri getirilene kadar keser (yeniden bağlanma kuralları: [`ODA_OTURUMU.md`](ODA_OTURUMU.md)). Bu sürede:
  - sayaçlar, listeler ve PK son alınan durumu gösterir (sunucu değişmeye devam eder);
  - hediye, mikrofon (oturma, inme, kilit, taşıma, istek kabulü), davet, moderasyon, PK başlatma ve iptal yapılmaz, jeton düşülmez ("Bağlantı yok");
  - yazdığın mesaj "Gönderilemedi · tekrar dene" olarak işaretlenir;
  - gelen olaylar tamponlanır. Bağlantı dönünce zaman sırasına göre eklenir, sunucunun yeniden gönderdiği eski olaylar kimlikten elenir ve "N olay eşitlendi" yazılır.

## Hata ve istisna durumları

| Durum | Davranış |
|---|---|
| Balkon boş | Şerit kısa kalır: "Herkes mikrofonda". Pencerede açıklamalı boş durum. |
| Mikrofonda kimse yok / oda boş | Sayılar 0; sekmelerde açıklamalı boş durum. |
| Sayının hızla değişmesi | Tek modelden türetildiği için sayılar her an tutarlı. |
| Mikrofon değiştirirken odadan ayrılma | Ayrılma koltuğu boşaltır, bekleyen davetleri iptal eder. |
| Pencere açıkken verinin değişmesi | Liste ve başlık canlı güncellenir. |
| Davet sırasında boş mikrofonun dolması | Kabul oturtmaz; "boş mikrofon kalmadı". |
| Davetin reddi / zaman aşımı | Kimse oturtulmaz; gönderene bildirilir. |
| Yetkisiz moderasyon | Sunucu reddeder, neden gösterilir, denetim kaydına yazılır. |
| Odadan çıkarma başarısız | Neden gösterilir; sayılar değişmez. |
| Mesaj gönderilemedi | Satır işaretlenir, tekrar denenebilir. |
| Hediye olayı tekrar gelirse | Tek satır, tek puan. |
| Bağlantı kopması / yeniden bağlanma | Yukarıdaki kurallar. |
| Uzun mesaj, çok katılımcı | Satırlar sarılır; listeler sanallaştırılmış; Balkon şeridi en fazla 5 avatar gösterir. |

## Testler

`cd app && npm test` — `tests/room-presence.test.ts` (sayım, Balkon/mikrofon geçişleri, ayrılma, tekrar olaylar, çevrimdışı görüntü, gizli giriş, kapasite azalması, yetkiler, odadan çıkarma ve yasak süresi, mikrofon susturma, davet kabul/ret/zaman aşımı/sınır/dolan mikrofon/iptal) ve `tests/chat-feed.test.ts` (sınıflandırma, filtrelerin kaynağı değiştirmemesi, tekilleştirme, yoğun sohbette hediye geçmişi, yeniden bağlanmada sıra).

Playwright (web, 390/360/320 px): sayaç ve pencere başlığı tutarlılığı, Balkon varsayılan sekmesi, davet ve sonucunun duyurulması, tekrar davetin engellenmesi, onaylı odadan çıkarmada sayaçların birlikte düşmesi, kişisel sessiz, oda sahibinin daveti ve kabulde mikrofona geçiş, odadan çıkıp girince tek kayıt, filtre sekmeleri, kaydırma konumunun korunması ve "yeni" düğmesi, bağlantı kopması/geri gelmesi, yatay taşma olmaması.

## Bilinen sınırlar ve karar bekleyenler

- Gerçek zamanlı altyapı yok: bağlantı kopması bir test anahtarıyla simüle ediliyor. Gerçek sunucuda katılımcı listesi ve olaylar için anlık görüntü + sıra numaralı olay akışı önerilir.
- "Okuma konumunu koruma" web'de ölçüldü; iOS/Android'de `maintainVisibleContentPosition` ile aynı davranış beklenir, cihazda doğrulanmalı.
- Odadan çıkarma yasağı süresi (10 dk) ve davet sınırları (30 sn geçerlilik, 20 sn tekrar bekleme) ürün onayı bekliyor.
- Kişisel sessiz şu an oturum boyunca geçerli; kalıcı olsun mu?
- Engellenen kişiler sayılara dahil (odadalar); listede "engelledin" diye işaretli ve soluk görünüyorlar.
- Oda kartındaki "N dinleyici" ile odanın içindeki sayı, odaya girildikten sonra simüle katılma/ayrılmalarla farklılaşabilir; gerçek sunucuda ikisi aynı kaynaktan gelmeli.
