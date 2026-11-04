# Bağlar

İki kişinin karşılıklı kabul ettiği bağ: Çift, Kardeş, Bacı, Ağabey, Abla, Yenge, Enişte, Kanka. Profilin **Bağlar** sekmesinde görünür.

## Kurallar

| Tür | Bağ hediyesi | Fiyat | Bir kişide en fazla |
|---|---|---|---|
| Çift | Bağ Yüzüğü | 5.000 jeton | 1 |
| Kardeş | Kardeş Bilekliği | 1.000 jeton | 3 |
| Bacı | Bacı Kolyesi | 1.000 jeton | 3 |
| Ağabey | Ağabey Saati | 1.000 jeton | 3 |
| Abla | Abla Broşu | 1.000 jeton | 3 |
| Yenge | Yenge Çiçeği | 1.000 jeton | 3 |
| Enişte | Enişte Kravatı | 1.000 jeton | 3 |
| Kanka | Kanka Rozeti | 500 jeton | 5 |

- **İstek:** birinin profilinde Bağlar → "Bağ kur" → tür seçilir. Bağ hediyesinin jetonu hemen düşer ve bekletilir. Onay sorulmaz (hediye kuralı).
- **Kabul:** jetonlar karşı tarafa elmas olarak geçer, normal bir hediye gibi (Gelir kilidi, ajans geliri, finans panelinde hediye olayı `bag-<tür>`).
- **Ret, geri çekme, 3 gün yanıtsız kalma:** jetonlar gönderenin aynı jeton kaynağına geri döner. Finans paneline olay gitmez.
- Aynı iki kişi arasında aynı anda tek bağ (ya da tek bekleyen istek) olur. Bir kişinin aynı anda en fazla 10 bekleyen isteği olur.
- **Puan:** bağ sürerken birbirinize gönderdiğiniz her 100 jeton 1 puan (bağ hediyesi dahil); karşılıklı mesajlaşmada karşı tarafın mesajına verilen her yanıt 1 puan, günde en fazla 10 (İstanbul günü). Puan düşmez.
- **Seviye:** Lv1 0 · Lv2 10 · Lv3 30 · Lv4 60 · Lv5 100 · Lv6 200 · Lv7 400 · Lv8 700 · Lv9 1.200 · Lv10 2.000 puan.
- **Ödüller:** Lv2 profilde bağ rozeti · Lv4 mikrofonda yan yana oturunca bağ çizgisi · Lv6 profil çerçevesi · Lv8 odaya birlikte giriş efekti · Lv10 özel sohbet balonu.
- **Bitirme:** iki taraf da istediği zaman bitirebilir. Seviye ve ödüller sıfırlanır, jeton iadesi yok. Aynı kişiyle 7 gün yeniden bağ kurulamaz.
- **Gizlilik:** kendi Bağlar sekmendeki göz simgesi bağlarını başkalarından gizler (rozet ve çerçeve de görünmez). Sen her zaman görürsün.
- Engellenen biriyle bağ kurulamaz; silinen hesabın bağları kendiliğinden biter, bekleyen isteklerin jetonu iade edilir.

## Nerede

- Sunucu: `server/api/bonds.mjs` (uçlar), `server/api/bond-rules.mjs` (türler, fiyatlar, seviyeler), tablo `migrations/012_bonds.sql`, testler `test/bonds.test.mjs`.
- Uygulama: `src/components/bonds.tsx` (sekme, rozet, çerçeve), `src/data/bonds.ts` (aynı kurallar ve çevrimdışı örnek), `src/lib/live/bonds.ts` (sunucu çağrıları). `tests/bonds.test.ts` iki tarafın fiyat ve seviyelerinin aynı kaldığını denetler.
- Çevrimdışı demoda örnek bağlar gösterilir; gönderilen istekler telefonda tutulur ve geri çekilebilir.

## Görsel listesi (ChatGPT)

`docs/GORSEL_URETIM_LISTESI.md` içindeki "ChatGPT ile üretim" stil metnini kullanın. Her satır bir görsel; 1024 × 1024 px şeffaf PNG, uygulamaya 512 px olarak konur. Dosyayı "Dosya adı" ile kaydedin. Görseller gelene kadar uygulama bağ türünü simge ve renkle gösterir.

| # | Dosya adı | Ad | Ne çizilecek | Öncelik |
|---|---|---|---|---|
| 1 | `bag-cift.png` | Bağ Yüzüğü | iç içe geçmiş iki altın yüzük, birinde küçük mercan taş, etrafında ışıltı | P1 |
| 2 | `bag-kardes.png` | Kardeş Bilekliği | iki örgü bileklik birbirine dolanmış, turkuaz ve altın boncuklu | P1 |
| 3 | `bag-baci.png` | Bacı Kolyesi | ince altın zincirde iki küçük birbirine değen kalp madalyon | P1 |
| 4 | `bag-agabey.png` | Ağabey Saati | klasik altın kol saati, lacivert kadran, kalkan biçimli küçük süs | P1 |
| 5 | `bag-abla.png` | Abla Broşu | çiçek biçimli altın broş, ortada turkuaz taş | P1 |
| 6 | `bag-yenge.png` | Yenge Çiçeği | kurdeleyle bağlı küçük buket, mercan ve beyaz çiçekler | P1 |
| 7 | `bag-enishte.png` | Enişte Kravatı | lacivert ipek kravat, altın kravat iğnesi | P1 |
| 8 | `bag-kanka.png` | Kanka Rozeti | yuvarlak altın rozet üzerinde iki çarpışan yumruk silueti (insan yüzü yok) | P1 |
