# Yönetim sitesi: uygulamadaki Yönetim ekranı siteye taşındı

Uygulamada Ayarlar › Yönetim'de ne yapılabiliyorsa, artık hepsi finans panelinin sitesinde (**Finance Control**)
yapılabiliyor. Menü konulara göre gruplu; üstteki arama kutusu (Ctrl+K) her sayfayı bulur. Uygulamada yalnız odanın içinden yapılanlar kalıyor: odadan atma ve oda içi susturma
gibi.

## Ne nerede

| Uygulamadaki sekme | Sitedeki sayfa | Gereken yetki |
| --- | --- | --- |
| Özet | Ana panel, Uyarılar | — |
| Kullanıcılar | Kullanıcılar ve güvenlik › Kullanıcılar | app.users |
| Canlı ayarlar | Ayarlar › Canlı ayarlar | app.settings |
| Hediyeler, Emojiler | Hediye ve mağaza › Hediyeler, Emojiler | app.gifts, app.emojis |
| Şanslı hediyeler (paketler, olasılıklar, yeni paket; paketin ikonu ve videosu: `lucky/art`, `lucky/art/remove`, `lucky/fetch`, panel sayfası yapılacak) | Hediye ve mağaza › Şanslı hediye ayarı | app.lucky |
| Oyun Salonu | Rapor ve maliyet › Oyun Salonu ve durum | app.reports |
| Etkinlikler, Duyurular | Duyuru ve etkinlik › Etkinlikler, Duyurular | app.events, app.notices |
| Para çekme | Para › Para çekme | app.withdrawals |
| Ajans ödemeleri | Ajanslar › Ajans ödemeleri | app.payouts |
| Şikâyetler, Destek | Kullanıcılar ve güvenlik › Şikâyetler, Destek | app.complaints, app.support |
| İadeler | Para › İadeler ve cüzdan | app.refunds |
| **Yaptırımlar** (yeni) | Kullanıcılar ve güvenlik › Yaptırımlar | app.sanctions ya da app.sanctions_full |
| **Ajans merkezi personeli** (yeni) | Ajanslar › Ajans personeli | app.agency_staff |
| **Kişinin mağaza eşyaları** (yeni) | Hediye ve mağaza › Mağaza eşyaları | app.economy |
| **Jeton Noktası** (yeni) | Para › Jeton Noktası | app.jeton |

## Roller

Sitede herkes kendi hesabıyla girer. Kim neyi yaparsa, işlem uygulamada o kişinin adıyla kaydedilir.

- **İki kişi gerektiren işler sitede de iki kişi ister:**
  - Ömür boyu ban ve cihaz banını öneren değil, başka bir yetkili onaylar.
  - İki kişili ajans ödemesinde onaylayan kişi "ödendi" diyemez.
  - Kimse kendi talebine karar veremez.
- **Moderatör yetkisi:** Moderatörler uygulamadaki moderatör yetkisiyle çalışır: susturma, süreli ban, kaldırma ve
  itirazı inceleme. Ömür boyu ban isterlerse bu yalnız öneri olur; tam yetkili biri onaylar.

| Rol | Gördüğü |
| --- | --- |
| Süper yönetici | Hepsi |
| Finans yöneticisi | Para çekme, ajans ödemeleri, iadeler, Şanslı hediye, Canlı ayarlar, raporlar, Ajans merkezi, Jeton Noktası, hediyeler, emojiler |
| Operasyon yöneticisi | Kullanıcılar, **Yaptırımlar (tam yetki)**, şikâyetler, destek, duyurular, etkinlikler, **Ajans personeli**, **Mağaza eşyaları**, hediyeler, emojiler, raporlar |
| **Moderatör** (yeni) | Yaptırımlar (moderatör yetkisiyle), Destek |
| Salt okunur | Ana panel ve raporlar |

Rolleri ve yetkileri sitede Ayarlar › Panel kullanıcıları ve rolleri'nden değiştirebilirsiniz. Menünün üstündeki arama kutusu (Ctrl+K) her sayfayı bulur: ör. "ban" yazınca Yaptırımlar.

## Geçiş adımları

1. **İki PR'ı sırayla birleştirin.**
   - Önce panelinkini: [similarclup-finance-control PR #7](https://github.com/keremcan534/similarclup-finance-control/pull/7).
   - Sonra uygulamanınkini: [cix PR #152](https://github.com/keremcan534/cix/pull/152).
   - Sunucu kurulurken panelin son hali de kurulur.
   - Ters sırada birleştirirseniz bir şey bozulmaz. Panel, sunucu bir sonraki kurulana kadar eski haliyle kalır; uygulamadaki
     Yönetim ekranı da açık kalır. Hemen kurmak için: GitHub › Actions › Server › Run workflow.
2. **Gerisi kendiliğinden olur.**
   - Kurulum, panelde Yönetim sayfalarını görünce Canlı ayarlar › Yönetim › **Yönetim sitesi**'ne panelin adresini yazar:
     `https://panel.<alan adı>`, bugün `https://panel.130-61-230-94.sslip.io`.
   - Yeni APK'da Ayarlar › Yönetim bu siteyi açar. Siteye panelin giriş adınız ve parolanızla girersiniz.
   - Eski APK'larda ekran açık kalır. Sunucu, işlemi kim yaparsa yapsın aynı kurallarla denetler.
3. **Başka çalışanınız varsa sitede hesap açın.**
   - Ayarlar › Panel kullanıcıları ve rolleri'nden her çalışana kendi hesabını ve doğru rolü verin. Moderatörlere Moderatör
     rolünü verin.
   - Herkes iki adımlı doğrulamayı açsın.

**Geri almak için:** Canlı ayarlar › Yönetim sitesi alanını boş kaydedin; Yönetim ekranı uygulamaya döner. Siteye
yeniden çevirmek için aynı yerde "Varsayılana dön" deyin (ikinci bir onay ister).

## Notlar

- **Cihaz banı:** Sitede, kişinin bilinen bütün cihazlarına uygulanır.
- **Oda içi susturma:** Yalnız odanın içinden verilir.
- **Adres değişirse:** Gerçek alan adına geçince (`DOMAIN`) kurulum yeni adresi kendisi yazar. Canlı ayarlar'a elle bir
  adres yazdıysanız o geçerli kalır.
- **Doğrulama:** Bütün sayfalar, gerçek uygulama sunucusuna karşı tarayıcıyla baştan sona denendi:
  - susturma
  - ömür boyu ban önerisi ve ikinci kişinin onayı
  - eşya verme
  - Jeton Noktası açma ve toptan satış
  - ajans rolleri ve arka plan işleri
  - moderatörün yalnız kendi sayfalarını görmesi
  - Canlı ayarlar › Yönetim sitesi: kurulumun yazdığı adres, boş kayıt, varsayılana dönüş
