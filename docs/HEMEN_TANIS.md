# Hemen Tanış (rastgele sesli/görüntülü eşleşme)

Kaynak: *Similarclup – Hemen Tanış Özellik Gereksinimleri*. Uygulama şu an prototip olduğu için eşleştirme sunucusu yerine zamanlayıcılar kullanılıyor. Durum geçişleri, ücret ve kaynak kuralları ise gerçek akışla aynı.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `src/lib/media.ts` | Mikrofon ve kameranın sahibi: oda mı, bire bir görüşme mi? Aynı anda tek bire bir görüşmeye izin verir. |
| `src/lib/match.ts` | Eşleşme motoru: belgedeki 12 durum, ücretlendirme, iade, meşgul kontrolü. |
| `src/components/match-layer.tsx` | Her ekranda görünen katman: arama göstergesi, eşleşme kartı (odadayken de çıkar), sonuç bildirimleri. |
| `src/app/eslesme.tsx` | Hemen Tanış ekranı: Sesli Tanış / Görüntülü Tanış, filtre, test senaryoları, durum geçmişi. |
| `src/app/tanis.tsx` | Görüşme ekranı: mikrofon, kamera, sonlandır, sonraki, şikâyet, engelle, görüşme sonu özeti. |
| `src/app/oda/[id].tsx` | Oda kamerası. Görüşme başlayınca koltuk bırakılır, mikrofon ve kamera kapanır, kullanıcı odada kalır. |
| `src/app/arama/[id].tsx` | Doğrudan aramalar da aynı medya kuralına bağlı (Senaryo C). |

## Kurallar

- **Ücret:**
  - Sesli 20 jeton/dk, görüntülü 40 jeton/dk (`MATCH_PRICE`).
  - Arama ve kabul bekleme ücretsiz. Ücret bağlantı kurulduğu an başlar.
  - İlk dakika bağlantıda alınır. Görüşme 10 saniye dolmadan biterse ilk dakika iade edilir.
  - Sonraki her dakika başında ücret alınır. Bakiye bir sonraki dakikaya yetmeyecekse uyarı çıkar; dakika dolunca görüşme güvenli şekilde sonlanır.
  - Bakiye yetersizse görüşme hiç başlatılmaz.
- **Reddetme, iptal, bağlantı hatası:** Ücret alınmaz.
- **Oda:**
  - Kabul edince mikrofon koltuğu (patron koltuğu dahil) boşaltılır, mikrofon ve kamera kapanır, konuşmacı sırasından çıkılır. Kullanıcı odada kalır.
  - Görüşme boyunca odada koltuğa oturma, mikrofon, kamera ve sıraya girme kilitlidir; dokununca nedeni yazar.
  - Görüşme bitince hiçbir şey kendiliğinden açılmaz.
  - Görüşme sürerken odaya giren kişi dinleyici olarak başlar.
- **Meşgul:** Başka bir bire bir görüşmedeyken yeni eşleşme başlamaz, bulunan eşleşme "meşgul" ile kapanır. Doğrudan arama da "Meşgulsün" uyarısıyla reddedilir.
- **Güvenlik:** Görüşme ekranından şikâyet etme ve "engelle ve görüşmeyi bitir" var. Eşleşme havuzu engellenenleri, arama kabul etmeyenleri ve kısıtlı hesapları dışarıda bırakır.

## Kabul testleri (web prototipinde, Playwright ile)

| # | Senaryo | Sonuç |
|---|---|---|
| 1 | Mikrofonu açık kullanıcı eşleşmeyi kabul eder | ✅ Koltuktan iner, odada kalır, odada "görüşmedesin" şeridi çıkar |
| 2 | Kamerası açık kullanıcı kabul eder | ✅ Oda kamerası kapanır, üyelik sürer |
| 3 | Dinleyici kabul eder | ✅ Odadan çıkarılmaz |
| 4 | Görüşmede oda mikrofonu | ✅ Mikrofon/el kaldırma kilitli, uyarı gösterilir |
| 5 | Görüşmede oda kamerası | ✅ Kamera düğmesi yok/kilitli, ikinci yayın oluşmaz |
| 6 | Görüşme sonrası | ✅ Koltuğa ve kameraya otomatik dönüş yok (odaya yeniden girişte de) |
| 7 | Görüşmedeyken ikinci görüşme | ✅ "Meşgulsün: Zaten bir Hemen Tanış görüşmesindesin" |
| 8 | Karşı taraf reddeder / bağlantı kurulamaz / görüşme kopar | ✅ Üçünde de ücret 0, oda üyeliği korunur |
| 9 | Ücret | ✅ 15 sn sesli görüşme = 20 jeton; 10 sn altı = 0 (iade) |

Test senaryoları telefonda da denenebilir: *Hemen Tanış → Test senaryosu (demo)*.

**Not:** Bu testler web sürümünde, tek kişiyle ve sahte (simüle) ses/görüntüyle yapıldı. Belgenin istediği gerçek cihaz ve çok katılımcılı testler için önce ses/görüntü altyapısının (LiveKit) kurulması gerekiyor.

## Sunucuya taşınacaklar

- **Durum makinesi:** Eşleşme durumları ve geçişleri sunucuda olmalı (`match_sessions`: id, kullanıcılar, mod, durum, zaman damgaları). İstemci yalnızca olayları gösterir.
- **Ücret:** Süre ve ücret, medya sunucusunun "bağlandı / ayrıldı" olaylarından hesaplanır. Her dakika tahsilatı benzersiz bir işlem kimliğiyle cüzdan hareketine yazılır; aynı istek tekrar gelse de ikinci kez ücret alınmaz.
- **Kaynak kilidi:** "Tek aktif bire bir görüşme" kilidi kullanıcı başına sunucuda tutulur. Medya tarafında oda yayın izni geri alınır (LiveKit `canPublish=false`), oda dinleme izni (`canSubscribe`) korunur.
- **Karar bekleyenler:**
  - Hemen Tanış ücretli mi olacak, fiyatlar ne olacak?
  - Görüşme süresi sınırı olsun mu?
  - Aynı kişiyle tekrar eşleşmeye ne kadar süre sonra izin verilsin?
