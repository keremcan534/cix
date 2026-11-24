# Oda roketi

Müşterinin isteği (17 Kasım): odada hediyelerle dolan, seviye seviye kalkan bir roket ("Roket Oyunu" ekran görüntüleri: Lv.1–5, doluluk yüzdesi, seviye ödülleri, katkı sıralaması).

Sahibin kararları:
- Ödüller o seviyeye katkı verenler arasında rastgele dağılır.
- Ödüllerde jeton olabilir; miktarı panelden ayarlanır. Jeton **normal jeton**dur.
- Elmas ödülü yok.
- Roket her gün 5 seviye dolar, gece 00:00'da sıfırlanır.

Oyun Salonu'ndaki Yörünge ("patlamadan önce çık") ayrı bir oyundur; değişmedi.

## Nasıl çalışır

- **Ne doldurur:** odada gönderilen her ücretli hediye roketi jetonu kadar doldurur. Uğurlu hediyede gönderimin bütün jetonu sayılır. Çantadan gönderilen bedava hediye ve Şanslı çanta payları saymaz.
- **Seviyeler:** beş seviye sırayla dolar; her seviyenin hedefi panelden. Bir hediye seviyeyi aşarsa artanı sonraki seviyeye geçer. Büyük bir hediye birkaç seviyeyi birden kaldırabilir; her birinin ödülleri ayrı verilir.
- **Kalkış:** seviye dolunca roket kalkar. Odadakiler kalkışı görür, ödüller hemen dağıtılır, kazananlar odada yazılır ve telefonlarına bildirim gider.
- **Dağıtım (25 Kasım 2026, sahiplerin kararı; önceden çekilişti):** ödüller o gün odada katkı verenlere, kalkışa kadar kim ne kadar gönderdiyse o sırayla verilir. Şans yok.
  - En çok gönderen en büyük jeton ödülünü alır, ikinci en çok gönderen ikinci büyüğü, böyle gider.
  - Jeton ödülleri önce (büyükten küçüğe), eşya ödülleri sonra (paneldeki sırayla).
  - Herkes bir kalkışta en çok bir ödül alır. Eşit gönderenlerde sıra her seferinde aynıdır (hesap sırası).
  - Katkı verenden çok ödül varsa artanı kimseye verilmez.
- **Gün:** her gün 00:00'da (Türkiye saati) roket Lv.1'den başlar. Lv.5 kalktıktan sonra o gün daha fazla dolmaz.

## Ödüller

- **Jeton:** normal jeton. Cüzdanda "Şanslı ödülü" olarak görünür (Şanslı hediyenin kazancıyla aynı tür).
  - Her yerde harcanır, hediye de gönderilir; hediye alıcıda elmasa, elmas da nakde dönebilir.
  - Harcanınca Cömertlik puanına ve Rüzgâr Gülü'ne sayılmaz (Şanslı hediye kazancı gibi).
  - Finans paneline "oda_roketi" kampanyası olarak bonus gider.
- **Mağaza eşyası:** çerçeve, giriş efekti, araç, sohbet balonu ya da ses dalgası; birkaç gün (en çok 30).
  - Kişinin eşyalarına eklenir; kendisi takar.
  - Eşya kişide zaten süresizse ya da bir yıldan fazla ileri gidiyorsa verilmez; kayıtta nedeni yazar.
  - Yalnız satışta olan eşya seçilebilir.
- **Elmas ve çanta hediyesi ödülü yok.**

## Panelde: Hediye ve mağaza › Oda roketi

- **Açık / kapalı.** Roket **kapalı gelir**. Açmak için kutuyu işaretleyip kaydedin.
- **Her seviye:**
  - Hedef (jeton, 1.000–100.000.000). Sayfa, gün içinde toplam kaç jetonda kalkacağını yazar.
  - Ödüller: tür (jeton ya da mağaza eşyası), miktar ya da eşya ve gün, kaç kişiye. En çok 6 ödül, ödül başına en çok 50 kişi. Sıra okla değişir.
- **Kalkış videoları:** her seviyeye ayrı SVGA yüklenir (saydam WebM, ProRes .mov ya da hazır yığılmış MP4 de olur, en çok 15 saniye). Sunucu hediyelerdeki gibi telefon videosuna çevirir. Video yoksa ya da telefona inmediyse Roket hediyesinin resmi uçar. Yeni APK gösterir.
- **Son kalkışlar:** zaman, oda, seviye, hedef, kazanan sayısı.
- **Yetki:** `app.rocket` (finans yöneticisi; süper yönetici). Her kayıt denetim kaydına yazılır (önce ve sonra).
- Kaydedilen ayar hemen geçerli. O gün kalkmış seviyeler kalktıkları anki ödülleriyle kalır.

## Telefonda (yeni APK)

- Odanın adının altında roket düğmesi: dolan seviye ve yüzdesi, araya nokta konarak ve yüzde işareti önde (ör. "Lv.2 · %57,5"; Güncelleme 7, madde 5a: eski "Lv.2 57,5%" yazısı "Lv.257,5%" gibi okunuyordu). Beşi de kalkınca "Lv.5 ✓".
- Dokununca roket penceresi açılır:
  - Lv.1–5 sekmeleri, roket ve doluluk çubuğu.
  - Ödüller ve kaç kişiye.
  - O seviyenin katkı sıralaması (ilk 3) ve senin katkın.
  - Son kalkışın kazananları.
  - "Hediye göndererek roketi doldur" düğmesi hediye panelini açar.
- Kalkışta roket ekranda yükselir, sonra kazananlar yazılır ("Tebrikler! … kazandın").
  - Gösteri, hediye efektleriyle aynı sıraya girer (Güncelleme 7, madde 5b; `src/lib/rocket-stage.ts`, `tests/rocket-stage.test.ts`): ekrandaki hediye ve sırada bekleyen hediyeler (roketi dolduran hediye de) bitince roket kalkar; roketten sonra gönderilen hediyeler roketi bekler. İki büyük efekt hiçbir zaman aynı anda oynamaz, iki ses üst üste binmez.
  - Sunucunun kalkış haberi gösteriye 1,5 saniye geç girer: roketi dolduran hediye (gönderenin kendi telefonunda gönderim cevabıyla sıraya giren hediye de) önce sıraya girsin diye.
  - Kazananlar, kalkış beklerken ya da oynarken gelirse hemen roketin ardından yazılır; araya başka hediye girmez.
  - Roket uzun bir hediye kuyruğunda düşmez (sıra kısaltılırken atılan hep hediyelerdir); ama en çok yaklaşık 24 saniye bekleyebilir. Bu sırada düğme bir sonraki seviyeyi göstermeye başlayabilir; kazananın bildirimi ve SimilarClub Sistem notu da gösteriden önce gelebilir. Ödüller sunucuda kalkış anında dağıtılır, yalnız gösteri bekler.
  - Oda küçültülmüşken gelen kalkışın gösterisi oynamaz (hediyelerinki gibi).
  - Efektler kapalıysa gösteri olmaz.
  - "Hareketi azalt" açıksa yalnız yazı çıkar.
- Roketin resmi şimdilik Roket hediyesinin resmi; her seviyenin rengi farklı. Beş seviyenin kendi resmi çizilecek ([`GORSEL_URETIM_LISTESI.md`](GORSEL_URETIM_LISTESI.md) §20).

## Eski APK'lar

- Roketi göstermez.
- Odada gönderdikleri hediyeler roketi doldurur; kazandıkları ödül hesaplarına geçer.
- Roketi gösteren ama Güncelleme 7'den önceki APK'lar: düğmede eski yazı ("Lv.2 57,5%") kalır, kalkış gösterisi o an oynayan hediye efektinin üstüne biner. Yeni APK ile düzelir.

## Hukuk

- 25 Kasım 2026'dan beri ödüller şansla değil katkı sırasıyla veriliyor: çekiliş değil, en çok harcayana ödül (bir sıralama ödülü). Jeton ödülü yine hediyeyle elmasa, elmas da nakde dönebiliyor; bu yüzden avukata sormak yine iyi olur ([`DENETIM.md`](DENETIM.md), Kritik 1).
- Karar avukatla sizin. Bu yüzden roket kapalı gelir. Kapatınca hiçbir oda dolmaz; kazanılan ödüller kişilerde kalır.
- Riski azaltmak istenirse jeton ödülü yerine yalnız süreli mağaza eşyası verilebilir (eşya nakde dönmez).

## Teknik

- **Tablolar:** `080_room_rocket` (ayar, odanın günü, kişinin seviye katkısı, kalkışlar, kazananlar; eşya ödülü için `entitlements.source = 'rocket'`).
- **Sunucu:**
  - `room-rocket.mjs`: yakıt, kalkış, ödeme ve uçlar. `room-rocket-rules.mjs`: hedefler, bölme ve dağıtım sırası (`rankWinners`, `prizeSlots`).
  - `gifts.mjs` ve `lucky.mjs`: roket hediyenin işlemi içinde dolar (hediyeyi hiç düşürmez).
  - Ödeme hediyeden sonra kendi işleminde. Kazananlar kimlik sırasıyla kilitlenir; bir kalkış bir kez ödenir. Kaçan ödemeyi 30 saniyede bir çalışan süpürge öder.
  - Oda paketleri: `{type: 'rocket', event: 'launch' | 'paid'}`.
- **Uygulama:** `lib/room-rocket-core.ts`, `lib/live/room-rocket.ts`, `components/room/room-rocket.tsx`.
- **Panel:** `web/pages/app-rocket.js`; yetki `app.rocket` (`010_app_rocket_permissions`).
- **Yük:** her oda hediyesine iki küçük yazma eklenir; oda hediyede zaten kilitli (Patron koltuğu). Roketi odadaki herkes okur: oda başına 2 saniyelik önbellek; telefon dakikada bir ve hediyeden sonra en çok 10 saniyede bir okur.
- **Testler:** sunucu `test/room-rocket.test.mjs`; uygulama `tests/room-rocket.test.ts`; panel `tests/app-admin.test.ts`.
