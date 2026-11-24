# Özel albüm

Sahiplerin kararıyla 24 Kasım 2026'da yapıldı: "Yayıncılar için özel albüm, bir jeton bedeli olacaktı."

## Kim ne yapar

- **Yayıncı** (ajansa bağlı, sözleşmesi ve ajansı onaylı): kendi profilinde, Vitrin sekmesinde **Özel albüm** kartı görür. En çok 12 fotoğraf ekler, istediğini kaldırır. Kartta fiyat ve "jeton hediye gibi elmas olarak sana geçer" yazar.
- **Bakan kişi:** yayıncının profilinde kilitli albümü görür: kaç fotoğraf olduğu ve fiyatı. "X jetonla aç" der, onaylar; jeton düşer, fotoğraflar açılır. Fotoğrafa dokununca büyür.
  - Bir kez açan, albümü hep görür. Yayıncı sonradan fotoğraf eklerse onları da görür.
  - Yayıncı sonra ajanstan ayrılsa bile açmış olan görmeye devam eder; yeni kimse açamaz.
- **Personel** (panel, Kullanıcılar yetkisi): Kullanıcılar ya da Şikâyetler'de **Özel albüm** düğmesi. Bütün fotoğraflar, kaç kişinin açtığı, toplam jeton. "Kaldır" ile sebebini yazıp kaldırır; fotoğraf herkesten gizlenir, kayıt için panelde kalır.

## Kurallar (sahiplerin kararları)

| Konu | Karar |
| --- | --- |
| Fiyat | Herkese tek fiyat, panelde **Canlı ayarlar › Özel albüm** (başta 500 jeton). 0: kapalı. |
| Gelir | Hediye gibi yayıncıya: jeton elmasa döner (her parça jetonun kilidiyle: mağaza jetonu 7 gün, Jeton Noktası 1 gün), ajans komisyonu hediye gibi. |
| Onay | Yok: fotoğraf hemen görünür. Sorunlu olan şikâyetle kaldırılır. |
| Kimler | Yalnız ajanstaki onaylı yayıncılar. |

## Güvenlik ve para

- Fotoğrafın adresi albümü açmamış kimseye gönderilmez; kilitli albümde yalnız sayı gider.
- Sunucu yüklenen dosyayı okur; fotoğraf değilse (JPEG, PNG, WebP, HEIC dışı) reddeder ve siler.
- Ekran gösterdiği fiyatı gönderir; fiyat değiştiyse hiçbir şey oynamaz ve yeni fiyat söylenir.
- Aynı istek iki kez gelirse para bir kez gider. Aynı kişi aynı albümü ikinci kez açamaz.
- Para denetimi her açışta açandan düşen jetonla yayıncıya geçen elmasın eşit olduğuna bakar (`album`).
- Hesap silinince yayıncının fotoğrafları ve dosyaları silinir; açış kayıtları para kaydı olarak kalır.

## Açık risk

Fotoğraflar onaysız göründüğü için mağaza incelemesinde risk var: [`DENETIM.md`](DENETIM.md) › Özel albüm.

## Teknik

Sunucu `server/api/private-album.mjs` (migration 118), uygulama `app/src/components/private-album.tsx`,
`app/src/lib/private-album-core.ts`, panel `web/pages/app-ops.js` (`PrivateAlbum`). Uçlar: [`SUNUCU.md`](SUNUCU.md).
