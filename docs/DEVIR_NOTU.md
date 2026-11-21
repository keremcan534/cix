# Devir notu: bulut oturumundan yerel çalışmaya (20 Kasım 2026)

Bu not, 19–20 Kasım'daki bulut oturumunun bitirdiği ve açık bıraktığı her şeyi tek yerde toplar. Kalıcı riskler ve
sahip kararları zaten [`DENETIM.md`](DENETIM.md)'de; burada yalnız kısa hali ve bağlantısı var.

## 1. Nasıl çalışılıyor

- **Dallar:**
  - Varsayılan dal `ccr-0c79d9d5-0hfb46`.
  - Bu oturumun çalışma dalı `ccr-f613f2aa-7p5tyi`; panel deposunda da aynı adla bir dal var.
  - Birleştirmeler **squash** ile yapılıyor.
  - Birleşmiş bir dal yeniden kullanılırken **force-push yapılmadı**: dal, varsayılan dalı bir birleştirme commit'iyle
    alarak senkronlandı. Yerelde de böyle devam edin.
- **Yayına çıkış:**
  - **Sunucu:** varsayılan dala birleşince `server.yml` testleri koşar ve sunucuyu kurar. Ama yalnız `server/**`
    değişince çalışır.
  - **Panel:** yalnız bu kurulum sırasında, panel deposunun `main`'inden alınır. Panel değişikliği tek başına yayına
    çıkmaz. Ya bir sunucu değişikliğiyle birlikte birleştirin, ya da Actions › **Server** › **Run workflow** ile elle
    kurun.
  - **APK:** `app/` değişince `preview.yml` yeni bir APK yapar (release `preview-N`).
- **Kontroller:** CLAUDE.md "Checks before saying done" bölümünde. Panel için Node 24 ile `npm test` ve
  `npx tsc --noEmit`.

## 2. Şu an canlıda ne var

- **Test sunucusu:** `https://130-61-230-94.sslip.io`, commit `6862b21` (#180).
- **APK:** 1.1.0, release `preview-194`.
- **Son birleşenler:**
  - #178: yönetim yayıncısı, bağ fiyatı, panelden kurallar, aday/aktif ajans, yeni logo ve açılış animasyonu,
    VIP/Abonelik, Güncelleme 7.
  - #179: kişi kartında giriş efekti kutusu.
  - #180: Muzip hediyeler ve profil izleri, uygulama 1.1.0.
  - Panelde #16 ve #17.

## 3. Bekleyen birleştirmeler (yerelde yapılacak)

1. **Panel PR #18** (`similarclup-finance-control`): hediye formuna "+ Yeni iz türü", "Resim yükle" ve "İz türlerini
   yönet" geliyor. Sahipler hediye formunda iz türü tanımlama ve şeffaf resim yükleme yerini bulamadı; o, Hediyeler
   sayfasının üstündeki İz türleri sekmesindeydi. Testleri 67/67 geçti.
2. **cix PR #181:** yönetici rehberi ([`HEDIYE_YONETIMI.md`](HEDIYE_YONETIMI.md)) ve bu not. Yalnız belge; sunucuyu
   yeniden kurmaz.
3. İkisi birleşince Actions › **Server** › **Run workflow** (dal `ccr-0c79d9d5-0hfb46`) çalıştırın. Bu, yeni paneli
   yayına çıkarır.
4. Doğrulayın: `curl -s https://panel.130-61-230-94.sslip.io/pages/app-gifts.js | grep -c "Yeni iz türü"` sıfırdan
   büyük olmalı.

## 4. Sahiplerin panelde yapacakları (Muzip pilotları)

Adım adım: [`HEDIYE_YONETIMI.md`](HEDIYE_YONETIMI.md) "Yeni bir şaka çifti" ve "Pilot".

- **İz türleri:** `kartopu` ve `domates` türlerine Türkçe ad verin. Kurulum sırasında anahtar adlarıyla açıldılar.
- **Cam Tamiri:**
  - Yeni hediye olarak oluşturun: raf Muzip, Profil izi: **Temizler**, tür **Kırık Cam**.
  - Fiyatı **Terlik Geldi!'den yüksek** olmalı.
- **Terlik Geldi! (`p8`):**
  - Rafa koyun (bugün rafta değil).
  - Profil izi: **Bırakır**, tür Kırık Cam, süre 24 saat.
- **Kırık Cam resmi:** gerçeğini yükleyin. Geçici resim (`docs/gorseller/muzip/kirik-cam-512.png`) küçük koltukta
  soluk görünüyor.
- **Kar Topu ve Domates At:** sizin kararınızla iz bırakmaya devam ediyorlar ama temizleyen hediyeleri yok. Birer
  temizleyen hediye ve isterseniz daha kısa süre verin.
- **Zorunlu sürüm 1.1.0:** herkes 1.1.0'a geçince açın. Panelden açılmaz; **1.1.0 APK'nın Yönetim › Canlı ayarlar**
  ekranından açılır. Eski Güncelleme 7 APK'ları (preview-191/192), sunucunun artık yapmadığı şeyleri yazıyor
  ("kapatınca iz hemen gider" gibi).

## 5. Kararınızı bekleyenler (önerilerle)

| Konu | Durum | Öneri |
| --- | --- | --- |
| **Global hediye ve eski APK** | Eski APK kullananlar global duyuruda adlarını gizleyemiyor. Şu an hiçbir hediye Global işaretli değil. | Herkes yeni sürüme geçene kadar hiçbir hediyeyi Global işaretlemeyin. |
| **Engelle-kaldır ve bağ** | Engel aradaki bağı bitiriyor. Hemen engeli kaldıran, elle bitirilen bağdaki 7 günlük beklemeyi atlıyor. | İsterseniz engelle biten bağa da 7 gün bekleme konur. |
| **Yenilenen izin sahibi** | Aynı türden ucuz bir iz gelince süre uzar ve iz son gönderenin adına geçer. İlk bırakanı engellemek o izi artık kaldırmaz; son göndereni engellemek kaldırır. | Karar sizin. İz ilk bırakanın adında kalabilir. |
| **İz almayan ve izi olan kişi** | "Kimse" ya da "yalnız takip ettiklerim" diyen birine, profilinde başka türden iz varken gönderilen iz hediyesi düz hediyeye dönmez; reddedilir (jeton düşmez). | Böyle kalabilir. |
| **Eski APK'lara bağ duyurusu** | Eski APK'nın bağ kuralları yazısı hâlâ "Puan düşmez" diyor. | Canlı ayarlar › Duyuru ile kısa bir metin. Metin [`DENETIM.md`](DENETIM.md) "Bağlar"da. |

**Kalıcı riskler, sahiplerin kararı olarak yazıldı** ([`DENETIM.md`](DENETIM.md)):

- Muzip izlerinde **ücretsiz kaldırma yok**. Şartnamenin güvenlik kuralına ve mağaza taciz politikasına aykırı.
  Hafifletenler:
  - varsayılan "yalnız takip ettiklerim";
  - izin 24 saatte bitmesi;
  - engelin izi kaldırması;
  - yönetimin izi kaldırabilmesi.
- **Şanslı paketler:** satın alınan jetonla oynanan şans özelliği büyüdü. Hukuki soru (Kritik 1) hâlâ açık.

## 6. Müşteriden beklenen

- **Güncelleme 7 madde 18:** panelde seviye başına VIP özellikleri. Müşterinin VIP sistem dosyaları gelince
  yapılacak.

## 7. Telefonda denenecekler (bulutta yalnız web kaydıyla bakılabildi)

- **Açılış animasyonu:** telefonun açılış ekranından geçiş, akıcılık, dokununca atlama, "Animasyonları azalt".
- **Kişi kartındaki giriş efekti kutusu:**
  - video kartın içinde oynuyor ve sığıyor mu;
  - her turda başa dönerken duraklama var mı;
  - ad ve ID küçük telefonda okunuyor mu.
- **Muzip, iki telefonla:**
  - Kaka Şakası → Temizlik Suyu;
  - takip etmeyen birinin gönderiminin reddedilmesi (jeton düşmemeli);
  - iz varken başka tür iz gönderilince düz hediye ve uyarı;
  - 30–96 dp koltuklarda VIP çerçeveyle görünüm.
- **Karışık sürümler:** aynı odada 1.1.0 ile Güncelleme 7 APK'sı olan iki telefon.

## 8. Bilinen küçük eksikler (acil değil)

- İz önizleme ekranında yönetici kontrolü geç gelir; yöneticiye bir an "yönetim içindir" yazısı görünebilir.
- Düz hediyeye dönen bir gönderimin tekrarı uyarı cümlesini taşımaz.
- Kapatılıp yeniden açılan bir iz türü, bir kişide kısa süre iki iz gösterebilir.
- Odadaki eski bir görünüm paketi, yeni iz haberini bir an ezebilir. Bu önceden de vardı; paketlerde sürüm numarası
  yok.
- Eski APK'larda kişi kartının eski hali duruyor (Android'de oval düğme hatası).

## 9. Bulut oturumundan kalanlar

Yok. Bütün işler GitHub'da. Bulut makinesindeki ara klasörler (g7-*, w2-* çalışma kopyaları) birleşmiş işlerin
kopyalarıdır; yerelde gerekmez.
