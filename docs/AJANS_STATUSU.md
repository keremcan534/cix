# Aday ajans ve aktif ajans

Sahiplerin kuralı (19 Kasım 2026). Daha önce yalnız uygulamanın örnek (demo) ekranında vardı ("Ajans sahibi paneli");
gerçek sunucuya hiç yazılmamıştı. Uygulama sunucuya geçince ekran da görünmez olmuştu. Artık sunucuda çalışıyor.
Kod: `server/api/agency-activity.mjs`, tablo `migrations/097_agency_activity.sql`.

## Kural

| Kural | Varsayılan | Canlı ayarlar › Ajans statüsü |
| --- | --- | --- |
| Onaylanan her ajans önce **aday ajans**tır | — | — |
| **Aktif ajans** olmak için yayıncı | 20 | Aktif ajans için yayıncı (0: kural kapalı, her ajans aktif) |
| …bunlardan bu ajanstayken en az şu kadar kazanan | 10 yayıncı × 10 USD | Kazanan yayıncı, en az kazanç (USD) |
| Aktif ajans yayıncısı bunun altına inerse **yeniden aday** olur | 20 | Aday ajansa düşme |
| Aktif ajansın her ay getirmesi gereken yeni yayıncı | 5 | Aylık yeni yayıncı şartı |
| Şart tutmazsa ertesi ay kendi komisyonundan düşen | 5 puan (%40 → %35) | Aylık şart tutmazsa komisyon düşüşü |
| Uygulamaya girmeyen ve para çekmeyen yayıncı ajanstan düşer | 90 gün | Pasif yayıncı ajanstan düşer (0: kimse düşmez) |

- **Aday ajansın parası (sahiplerin kararı: a):** komisyon her hediyede hesaplanır ve birikir; aday ajans ödeme
  talep edemez ("Aday ajans ödeme alamaz…", 409 `agency_candidate`). Aktif olunca birikmiş komisyonun hepsi ödenebilir.
- **Kazanan yayıncı:** yayıncının **bu ajansa katıldığından beri** kazandığı elmas (5.000 elmas = 1 USD).
- **Aktif kalmak:** aktif olduktan sonra kazanç şartı aranmaz; yalnız yayıncı sayısı 20'nin altına inerse adaya düşer.
- **Aylık şart:** her ayın ilk ajans işinde (10 dakikada bir çalışır) o an aktif olan ve bir önceki ayın başından
  önce onaylanmış her ajans için, geçen ay getirdiği yeni yayıncı sayılır (daha önce bu ajansta olmamış kişiler).
  Şart tutmazsa o ay ajansın kendi payı düşer; üst ajansın farkı değişmez, düşen kısım platformda kalır. Karar ayda
  bir kez yazılır (`agency_month_rules`), sonradan ayar değişse de o ayın kararı değişmez.
- **90 gün kuralı:** son giriş (oturum ya da cihaz) ve son para çekme talebi 90 günden eskiyse ve ajansa 90 günden
  önce katılmışsa yayıncı ajanstan düşer, **yönetim yayıncısı** olur (kazancı ve çekimi sürer; bir ajansa yalnız
  transferle geçer). Ajansa bildirim gider.
- **Bildirimler:** ajans aktif olunca, adaya düşünce, yayıncıları pasiflikten düşünce ve ay cezası alınca ajansın
  bildirimlerine yazılır.

## Ekranlar

- **Uygulama › Ajans ofisi:** başlıkta "Aday ajans" / "Aktif ajans" etiketi ve statü kartı: getirilen yayıncı
  12/20, kazanan yayıncı 3/10, aktifken "bu ay yeni yayıncı 2/5", ay cezası varsa uyarı ve kuralın cümlesi.
- **Uygulama › Ajans Merkezi (yönetim):** ajans kartlarında statü etiketi.
- **Sunucu:** `GET /api/agency/overview` → `activity { status, hosts, earners, newThisMonth, penalty, need }`;
  ajans kartları ve merkez listeleri `activity` alanını verir.

## Eski APK'lar ve dağıtım

- Eski APK statü kartını göstermez; aday ajansın ödeme talebinde sunucunun cümlesini görür.
- **Dağıtım anında** bütün ajanslar aday başlar; ajans işi ilk çalışmada (en geç 10 dakika) şartı tutanları aktif
  yapar. Şartı tutmayan mevcut ajansların ödemesi aktif olana kadar bekler. Bugün sunucu test sunucusu (test
  jetonlu sunucuda ajans ödemesi zaten kapalı), canlıya geçmeden önce bilinmesi gerekir.
- Finans paneli listelerinde `activity` alanı gelir; panelde göstermek panel deposunda ayrı bir iş.
