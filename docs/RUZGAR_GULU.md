# Rüzgâr Gülü

Oyun Salonu'nun özgün çark oyunu. Adı, dilimleri, alanları ve ekranı bize ait; başka bir uygulamanın ekranından ya da adından alınmadı.

## Nasıl oynanır

- **3 alan** var; her alanın tur ücreti farklı:

  | Alan | Kimlik | Tur ücreti |
  |---|---|---|
  | Klasik | `kiyi` | 250 jeton |
  | Yüksek | `acik` | 2.500 jeton |
  | Zirve | `okyanus` | 10.000 jeton |

  Kimlikler alanların ilk adlarından (Kıyı, Açık Deniz, Derin Okyanus) kalmadır; JACKPOT fonları, tur geçmişi ve sunucu bunlara bağlı olduğu için değişmez. Eski cüzdan satırlarında "Rüzgâr Gülü · tur (Kıyı ×10)" gibi eski adlar görünebilir; yalnızca yazıdır, hesaplamayı etkilemez.

- Bir seferde **×1, ×10 ya da ×50** tur çevrilir.
- Ücret önce **oyun jetonundan**, yetmezse **jetondan** düşer.
- Kazanç her zaman **oyun jetonudur**. Oyun jetonu yalnızca oyunlarda kullanılır; hediye edilemez, elmasa ya da paraya çevrilemez.
- **Cömertlik Lv.2'nin altında** oyun hiç görünmez (Oyun Salonu ile aynı kural). Sunucu da seviyeyi her istekte yeniden kontrol eder.
- **Günlük sınır:** kişi başı günde en fazla 1.000.000 jetonluk tur (İstanbul saatiyle gün). Sunucuda `WHEEL_DAILY` ile değişir.

## Dilimler ve şanslar

Çarkta 12 dilim var ve her dilim bir şey öder. Dilimler aynı boyda çizilir ama şansları farklıdır; kurallar bölümündeki tablo bunu açıkça yazar.

| Dilim | Kazanç (tur ücretinin katı) | Şans |
|---|---|---|
| ×0,1 | 0,1 | %37,34 |
| ×0,2 | 0,2 | %25 |
| ×0,3 | 0,3 | %15 |
| ×0,5 | 0,5 | %10 |
| ×0,8 | 0,8 | %5 |
| ×1 | 1 | %5,46 |
| ×2 | 2 | %1,4 |
| ×5 | 5 | %0,5 |
| ×10 | 10 | %0,2 |
| ×25 | 25 | %0,06 |
| ×100 | 100 | %0,015 |
| JACKPOT | Alanın fonunun tamamı | %0,025 |

- **JACKPOT fonu:** Her turun %1,5'i o alanın fonuna eklenir. JACKPOT'a gelen fonun tamamını alır. Fon kazanılınca 20 turluk ücretle yeniden başlar.
- **Geri dönüş:** Oynanan her 100 jetonun ortalama 40'ı kazanç olarak döner (sabit dilimlerden %38, fondan yaklaşık %2). Bu oran diğer jeton oyunlarıyla aynı ev kuralıdır. Hesaplarda küsurat evin lehine aşağı yuvarlanır.

## Sonuç sunucuda belirlenir

- Canlı modda uygulama sadece `POST /api/wheel/spin` gönderir: alan, tur sayısı ve tekrar kimliği (`ref`).
- Sunucu sırayla şunları yapar: seviyeyi kontrol eder, günlük sınırı kontrol eder, ücreti düşer, sonucu kendi rastgele sayısıyla çeker, kazancı yatırır.
- Aynı `ref` ile tekrar gelen istek aynı sonucu döndürür; ikinci kez ücret düşülmez.
- Çark animasyonu yalnızca sunucunun söylediği dilimi gösterir: bir JACKPOT varsa onda, yoksa en iyi dilimde durur.
- `GET /api/wheel` şunları verir: fonlar, günlük sınır ve bugün oynanan, son kazananlar, bugünün sıralaması ve kişinin kendi geçmişi.
- Demo modda (sunucu yokken) aynı kurallar uygulamada çalışır. Kazananlar ve sıralama sabit örnek kişilerdir.

## Kod nerede

| Dosya | Görevi |
|---|---|
| `server/api/wheel-rules.mjs` | Kurallar: alanlar, dilimler, şanslar, fon. Saf veri ve hesap. |
| `server/api/wheel.mjs` | `GET /api/wheel` ve `POST /api/wheel/spin`. |
| `server/api/migrations/013_wheel.sql` | `wheel_funds` (alan başına fon), `wheel_spins` (istek başına bir satır). |
| `server/api/test/wheel.test.mjs` | Sunucu testleri (seviye kapısı, sınır, tekrar, ödeme, fon). |
| `app/src/data/wheel.ts` | Uygulamadaki kuralların kopyası. `app/tests/wheel.test.ts` iki tarafın aynı olduğunu kontrol eder. |
| `app/src/lib/wheel.ts` | Canlı/demo yükleme ve çevirme. |
| `app/src/components/games/wheel.tsx` | Ekran: alan sekmeleri, JACKPOT şeridi, çark, ×1/×10/×50 düğmeleri, sonuç kartı, kurallar, listeler. |

Erişim:
- **Profil:** Oyun Merkezi'nin en üstündeki Rüzgâr Gülü kartı, ya da `/oyunlar?oyun=ruzgar`.
- **Oda:** Menü › Oyun Salonu › Rüzgâr Gülü. Oyun panelde açılır; sesli sohbet kesilmez.

Kurallar değişirse **iki dosya birlikte** değişir (`wheel-rules.mjs` ve `data/wheel.ts`). Yoksa uygulama testi kırılır.

## ChatGPT görsel listesi

Şu an çarkın ortasında ve kartlarda Ionicons pusula simgesi duruyor; görseller gelince bunlar değişecek.

`docs/GORSEL_URETIM_LISTESI.md` içindeki **stil metnini** bir kez gönderin, sonra bu tabloyu verin. Kurallar:
- Her görsel 1024 × 1024 px, şeffaf arka planlı PNG olacak.
- Üzerinde yazı ya da rakam olmayacak.
- Dosyalar `app/assets/games/` klasörüne, "Dosya adı" sütunundaki adla konacak.

| # | Dosya adı | Ne çizilecek | Öncelik |
|---|---|---|---|
| 1 | `oyun-ruzgar-gulu.png` | Oyun kapağı: altın çerçeveli, turkuaz ve pembe-kırmızı dilimli parlak bir çark; ortasında altın bir pusula gülü, üstünde küçük pembe-kırmızı bir ok. Hafif önden, üçte bir açıdan. | P1 |
| 2 | `ruzgar-merkez.png` | Çarkın ortası: yuvarlak, cam yüzeyli, altın kenarlı bir pusula gülü (8 uçlu yıldız). Tam karşıdan, düz. | P1 |
| 3 | `ruzgar-jackpot.png` | JACKPOT: taşan altın jetonlarla dolu, kapağı açık küçük bir hazine sandığı; arkasında altın ışık halkası. | P1 |
| 4 | `ruzgar-alan-kiyi.png` | Klasik alanı: küçük turkuaz bir kadife yastık üstünde tek bir altın jeton. | P2 |
| 5 | `ruzgar-alan-acik.png` | Yüksek alanı: üst üste dizilmiş üç altın jeton kulesi, çevresinde küçük ışıltılar; turkuaz ve altın. | P2 |
| 6 | `ruzgar-alan-okyanus.png` | Zirve alanı: altın jeton yığınının tepesinde duran parlak altın bir taç; arkasında altın ışık halkası, koyu lacivert zemin. | P2 |
| 7 | `ruzgar-ok.png` | Çarkın üstündeki ok: aşağıyı gösteren, pembe-kırmızı (#FF6576) renkli, cam yüzeyli bir damla ok. Tam karşıdan. | P3 |

Tasarım notları:
- Mor ya da mor-pembe kullanılmayacak.
- Gerçek bir uygulamanın ya da markanın çarkına benzemeyecek.
- Rakam ve yazıyı uygulama kendisi çiziyor.
