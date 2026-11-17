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
- **Seviyeler:** beş seviye sırayla dolar; her seviyenin hedefi panelden. Bir hediye seviyeyi aşarsa artanı sonraki seviyeye geçer. Büyük bir hediye birkaç seviyeyi birden kaldırabilir; her biri ayrı çekilir.
- **Kalkış:** seviye dolunca roket kalkar. Odadakiler kalkışı görür, ödüller hemen çekilir ve dağıtılır, kazananlar odada yazılır ve telefonlarına bildirim gider.
- **Çekiliş:** ödüller o seviyeye hediye gönderenler arasında çekilir.
  - Kim ne kadar gönderdiyse şansı o kadar. Örneğin seviyenin %90'ını dolduranın ilk ödülü alma şansı %90.
  - Herkes bir kalkışta en çok bir ödül alır.
  - Ödüller panelde yazılan sırayla çekilir: ilk ödül önce. Değerli ödülü başa yazın.
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
- **Son kalkışlar:** zaman, oda, seviye, hedef, kazanan sayısı.
- **Yetki:** `app.rocket` (finans yöneticisi; süper yönetici). Her kayıt denetim kaydına yazılır (önce ve sonra).
- Kaydedilen ayar hemen geçerli. O gün kalkmış seviyeler kalktıkları anki ödülleriyle kalır.

## Telefonda (yeni APK)

- Odanın adının altında roket düğmesi: dolan seviye ve yüzdesi (ör. "Lv.2 57,5%").
- Dokununca roket penceresi açılır:
  - Lv.1–5 sekmeleri, roket ve doluluk çubuğu.
  - Ödüller ve kaç kişiye.
  - O seviyenin katkı sıralaması (ilk 3) ve senin katkın.
  - Son kalkışın kazananları.
  - "Hediye göndererek roketi doldur" düğmesi hediye panelini açar.
- Kalkışta roket ekranda yükselir, sonra kazananlar yazılır ("Tebrikler! … kazandın").
  - Efektler kapalıysa gösteri olmaz.
  - "Hareketi azalt" açıksa yalnız yazı çıkar.
- Roketin resmi şimdilik Roket hediyesinin resmi; her seviyenin rengi farklı. Beş seviyenin kendi resmi çizilecek ([`GORSEL_URETIM_LISTESI.md`](GORSEL_URETIM_LISTESI.md) §20).

## Eski APK'lar

- Roketi göstermez.
- Odada gönderdikleri hediyeler roketi doldurur; kazandıkları ödül hesaplarına geçer.

## Hukuk

- Ödüller şansla dağıtılıyor ve jeton ödülü hediyeyle elmasa, elmas da nakde dönebiliyor. Bu, Şanslı hediye ile aynı durum ([`DENETIM.md`](DENETIM.md), Kritik 1): satın alınan jetonla katılınan, kazancı nakde dönebilen bir çekiliş.
- Karar avukatla sizin. Bu yüzden roket kapalı gelir. Kapatınca hiçbir oda dolmaz; kazanılan ödüller kişilerde kalır.
- Riski azaltmak istenirse jeton ödülü yerine yalnız süreli mağaza eşyası verilebilir (eşya nakde dönmez).

## Teknik

- **Tablolar:** `080_room_rocket` (ayar, odanın günü, kişinin seviye katkısı, kalkışlar, kazananlar; eşya ödülü için `entitlements.source = 'rocket'`).
- **Sunucu:**
  - `room-rocket.mjs`: yakıt, kalkış, ödeme ve uçlar. `room-rocket-rules.mjs`: hedefler, bölme ve çekiliş kuralları.
  - `gifts.mjs` ve `lucky.mjs`: roket hediyenin işlemi içinde dolar (hediyeyi hiç düşürmez).
  - Ödeme hediyeden sonra kendi işleminde. Kazananlar kimlik sırasıyla kilitlenir; bir kalkış bir kez ödenir. Kaçan ödemeyi 30 saniyede bir çalışan süpürge öder.
  - Oda paketleri: `{type: 'rocket', event: 'launch' | 'paid'}`.
- **Uygulama:** `lib/room-rocket-core.ts`, `lib/live/room-rocket.ts`, `components/room/room-rocket.tsx`.
- **Panel:** `web/pages/app-rocket.js`; yetki `app.rocket` (`010_app_rocket_permissions`).
- **Yük:** her oda hediyesine iki küçük yazma eklenir; oda hediyede zaten kilitli (Patron koltuğu). Roketi odadaki herkes okur: oda başına 2 saniyelik önbellek; telefon dakikada bir ve hediyeden sonra en çok 10 saniyede bir okur.
- **Testler:** sunucu `test/room-rocket.test.mjs`; uygulama `tests/room-rocket.test.ts`; panel `tests/app-admin.test.ts`.
