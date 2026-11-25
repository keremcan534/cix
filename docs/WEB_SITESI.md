# Web sitesi

Similar Club'ın tanıtım sitesi. Klasör: `website/`. Çerçeve yok, derleme yok: düz HTML, bir CSS, bir JS. Dosyalar
olduğu gibi GoDaddy'ye yüklenir. Hazır paket: depo kökündeki `similar-club-web-sitesi.zip` (git'e girmez, her
değişiklikten sonra yeniden üretilir).

Tasarım BlackBlue sitesinin dilinden geliyor (siyah zemin, bulanık hareketli arka plan, ince çerçeveli kartlar, mono
etiketler), üstüne lüks katman: serif başlıklar (Cormorant Garamond), altın çizgiler, logonun turkuaz ve mercan ışıkları.
Başka sitelerden kod ya da metin kopyalanmadı; görseller uygulamanın kendi dosyaları.

## Sayfalar

| Dosya | Ne |
| --- | --- |
| `index.html` | Ana sayfa: giriş, Deneyim, Odalar (canlı oda örneği), Hediyeler, Ayrıcalıklar, Güven, İndir |
| `hesap-silme.html` | Hesap silme: uygulamadan ve e-postayla. **Google Play bu sayfanın adresini ister.** |
| `gizlilik.html`, `kosullar.html`, `topluluk-kurallari.html` | **Boş kalıp.** "Metin hazırlanıyor" kutusu var; avukatın metni gelince kutunun yerine konur (dosyada `AVUKAT METNİ` yazan yer) |
| `404.html` | Olmayan bir adres açılınca |
| `.htaccess` | GoDaddy (Apache) ayarları: 404 sayfası, `/gizlilik` gibi uzantısız adresler, önbellek, güvenlik başlıkları |
| `robots.txt` | Arama motorlarına açık |

Üst menü ve alt bilgi her sayfada ayrı ayrı yazılı. Menüye bir şey eklenecekse altı sayfanın hepsinde değişmeli.

## Hareketli arka plan

Arka plan, uygulamanın Müzik odası görseli (`app/assets/room/oda-arka-muzik.jpg`), önceden bulanıklaştırılıp
karartılmış iki dosya: `arka-plan.jpg` (yatay ekran) ve `arka-plan-dikey.jpg` (telefon). Bilgisayarda fareyle,
Android telefonda telefonu eğince, tüm telefonlarda kaydırınca hafifçe kayar.

Telefonu yormaması için: bulanıklık dosyanın içinde (tarayıcı her karede bulanıklaştırmıyor), yalnız resmin yeri
değişiyor, hareket durunca döngü de duruyor. Telefonda üst menünün cam bulanıklığı kapalı. İki görsel toplam ~45 KB.

- iPhone'da eğme ile hareket yok: Safari bunun için "Hareket ve yön erişimi" izni sorar, tanıtım sitesinde bu soru
  rahatsız eder. iPhone'da arka plan kaydırmayla kayar.
- Eğme yalnız HTTPS'te çalışır (SSL açılınca).
- Bilgisayarda "animasyonları azalt" açıksa (Windows: Ayarlar › Erişilebilirlik › Görsel efektler › Animasyon
  efektleri kapalı) site hareketleri sadeleştirir: arka plan daha az kayar, logo ve kartlar sabit durur, odadaki sohbet
  ve hediyeler yine akar.
- Gerçek bir telefonda henüz denenmedi.

## GoDaddy'ye yükleme

GoDaddy'de **Web Hosting (cPanel)** paketi gerekir. "Website Builder / Web sitesi oluşturucu" kendi dosyamızı kabul
etmez. (Yalnız alan adı alınıp site ücretsiz başka yerde de barındırılabilir; istenirse söyleyin.)

1. GoDaddy › Ürünlerim › Web Hosting › **cPanel Yönetici** › **Dosya Yöneticisi**.
2. `public_html` klasörüne girin. İçinde GoDaddy'nin örnek dosyaları varsa (ör. `index.php`, `default.html`) silin.
3. **Yükle** ile `similar-club-web-sitesi.zip`'i yükleyin, sonra zip'e sağ tıklayıp **Ayıkla** (Extract) › `public_html`.
   Zip'i sonra silebilirsiniz.
4. Dosya Yöneticisi'nde **Ayarlar › Gizli dosyaları göster** açık değilse `.htaccess` görünmez; yüklendiğini oradan
   kontrol edin.
5. **SSL:** cPanel › **SSL/TLS Status** › alan adını seçip **Run AutoSSL** (çoğu pakette ücretsiz). Sertifika
   geldikten sonra `.htaccess` içindeki HTTPS satırlarının başındaki `#` işaretlerini kaldırın ya da cPanel ›
   **Alan Adları** › **Force HTTPS Redirect**'i açın. Sertifika gelmeden açılırsa site açılmaz.
6. Tarayıcıda alan adını açın; `/hesap-silme` ve olmayan bir adres (`/deneme`) de denenmeli.

Güncelleme: değişen dosyayı aynı yere yeniden yükleyin. CSS ya da JS değiştiyse HTML'lerdeki `site.css?v=2` ve
`site.js?v=2` sayısı bir artırılmalı, yoksa ziyaretçinin tarayıcısı bir gün eski dosyayı kullanabilir.

## Yayından önce yapılacaklar

| Ne | Nerede | Not |
| --- | --- | --- |
| **Destek e-postası gerçekten çalışmalı** | Her sayfada `destek@similarclub.app` | Uygulamadaki adresle aynı (`app/src/lib/support-mail.ts`). Alınan alan adı farklıysa iki yerde birden değişmeli ve bu adrese gelen postayı biri okumalı. |
| **Avukat metinleri** | `gizlilik.html`, `kosullar.html`, `topluluk-kurallari.html` | Google Play ve App Store gizlilik politikası adresi ister; boş kalıpla inceleme geçmez. Metin sıfırdan yazılmalı (`YAYIN_HAZIRLIGI.md` 7 ve 11). Gizlilik metni sitedeki Google yazı tiplerini de anmalı (aşağıda). |
| **Hesap silme sözleri** | `hesap-silme.html` | Sayfa "e-postayla gelen talebi en geç 30 gün içinde sileriz" diyor ve neyin silinip neyin saklandığını sunucunun yaptığına göre anlatıyor (`SUNUCU.md` › `DELETE /api/me`). 30 gün sözünü tutacak biri olmalı; avukat süreyi değiştirirse sayfa da değişmeli. |
| **18+ sözü** | Ana sayfa › Güven | "18 yaşından küçük olduğu anlaşılan hesaplar kapatılır" diyor; şikâyet gelince bunu yapacak biri olmalı. |
| **Mağaza düğmeleri** | `assets/js/site.js` en üstte `STORE_LINKS` | Uygulama yayınlanınca `play: 'https://play.google.com/store/apps/details?id=com.similarclub.app'` ve App Store adresi yazılır; "Çok yakında" düğmeleri kendiliğinden gerçek bağlantıya döner. O zaman Google ve Apple'ın resmî rozetlerine geçmek gerekebilir (ikisinin de marka kuralları var). |
| **Paylaşım görseli** | `index.html` › `og:image` | WhatsApp ve sosyal medya önizlemesi tam adres ister: alan adı belli olunca `https://<alan adı>/assets/img/paylasim.jpg` yapılmalı. |
| **Şirket bilgisi** | Alt bilgi | Şirket unvanı ve adresi yok. Avukat isterse (ör. UK şirketi bilgisi) alt bilgiye eklenir. |

## Bilerek yazılmayanlar

- **Şans oyunları ve para kazanma** (Şanslı hediye, Oyun Salonu, Rüzgâr Gülü, oda roketi, para çekme, ajans/yayıncı
  kazancı) sitede yok. Hukuki soru kapanmadan (`YAYIN_HAZIRLIGI.md` §1, `DENETIM.md`) herkese açık bir sayfada
  bunların reklamı yapılmamalı; mağaza incelemesi de siteye bakar.
- **Sahte sayılar** ("1 milyon kullanıcı" gibi) yok.
- **Fiyatlar** yok: hediye ve jeton fiyatları değişebiliyor.

## Gizlilik notu

Yazı tipleri Google Fonts'tan yükleniyor; bu, ziyaretçinin IP adresinin Google'a gitmesi demek. Avukat isterse yazı
tipleri sitenin içine gömülür (birkaç dosya daha, aynı görünüm). Sitede çerez, analiz ya da takip kodu yok.
