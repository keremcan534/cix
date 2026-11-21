# Profil ekranı: yeni tasarım (20 Kasım 2026)

Müşterinin profil paketi (`SimilarClub_Profil_Claude_Entegrasyon_Paketi.zip`, 4 tasarım: Ana, Detay, Vitrin, Bağlar)
uygulamadaki profil ekranına (`app/src/app/kullanici/[id].tsx`) işlendi. Paketteki resimler örnekti: kartlar,
düğmeler ve sayaçlar uygulamada yeniden çizildi. Resim olarak yalnız uygulamanın kendi dosyaları kullanılıyor
(çerçeveler, hediye resimleri, kişi kartının kalp / kalkan / hediye resimleri, kişinin kendi fotoğrafları). Paketteki
"KaaN", "ARTEMİS", "13 gün", "52/91" gibi değerler hiçbir yere yazılmadı; her sayı kişinin kendi verisi (canlıda
sunucudan, demoda örnek kişilerden).

## Ne nerede

- **Üst kısım (her sekmede aynı):** kişinin fotoğrafı geniş kapak olarak, üstünde çerçeveli profil fotoğrafı, ad,
  @kullanıcı adı (kopyalanır), çevrimiçi ve şehir, rozetler (yaş / cinsiyet, Cömertlik ve Yankı
  seviyesi, VIP, Yönetici / Moderatör, mavi tik, **Çift Lv.N** bağ rozeti), "Şu an odada". Sekmeler hemen altında;
  aşağı kaydırınca en üstte kalır. Üst çubukta SimilarClub logosu.
- **Profil:** Takipçi · Takip · Arkadaş · Hediye; kendi profilinde **Profili Düzenle** ve **Paylaş**; Profilini
  tamamla; İlişki Duvarı, Koruma ve Hediye Duvarı; Hakkımda (biyografi ve altında ilk dört ilgi alanı; 21 Kasım'dan beri adın altında değil), Arkadaşlık Sloganı, Doğrulama, Temel Bilgiler; kendi
  profilinde "Yalnızca sen görürsün" kartı (jeton, elmas, VIP bitişi, puanlar); başkasının profilinde ortak noktalar ve
  hayran kulübü.
- **Anlar:** eskisi gibi kişinin paylaşımları (paket bu sekme için tasarım vermedi), yeni kartlarla.
- **Vitrin:** Profilini tamamla (kendi), Albüm, Kişisel Profil (ilgi alanları, boy, iş, dil, burç, kişilik
  etiketleri), Oda, Vitrin Öğeleri (en çok alınan üç hediye), sonra madalyalar, unvanlar, binekler, giriş efektleri ve
  hediye koleksiyonu.
- **Bağlar:** Koruma, İlişki Duvarı (dokununca aşağıdaki bağ listesine iner), Ajans, Aile, Bağlantılar (Arkadaş,
  Takipçi, Takip), sonra bütün bağlar (Çift / Aile ve Dost, istekler, Bağ kur) eskisi gibi.

## Gizlilik (değişmedi)

Tam doğum tarihi, jeton, elmas, VIP bitişi ve puanlar yalnız kendi profilinde görünür. Doğum gününün altındaki yazı
eskisi gibi "Yalnızca Sen Görebilirsin · diğerleri sadece yaşını görür" (paketteki "seçtiğin kişiler" yazısının
sunucuda karşılığı yok). Takipçi / Takip listeleri yalnız kendi profilinde açılır.

## Paketten farklı yapılanlar ve dışarıda kalanlar

- **Kapak resmi:** sunucuda ayrı bir kapak alanı yok; kapakta kişinin profil fotoğrafı duruyor (eskisi gibi).
- **Birden çok koruyucu:** sunucu başkasının profiline yalnız en yüksek puanlı koruyucuyu ve kişinin en çok koruduğu
  kişiyi gönderiyor; kart ikisini de gösteriyor, başkasının profilinde "Sen de koruyorsun" satırı var. Bütün
  koruyucular Benim Koruma sayfasında.
- **Vitrin Öğeleri:** kişinin kendi seçtiği vitrin eşyaları diye bir veri yok; en çok aldığı üç hediye gösteriliyor.
- **Albüm "0/6":** albüm artık yalnız albüm fotoğraflarını gösteriyor, sayı ile resimler tutuyor. Anlar'da paylaşılan
  fotoğraflar Anlar sekmesinde.
- **Başkasının çerçevesi:** canlıda başkasının profilinde de taktığı çerçeve ve VIP seviyesi görünüyor (odada ve
  Anlar'da görünen aynı bilgi).
- **Koyu tema:** sayfa zemini temaya uyuyor, kartlar her iki temada açık pembe.

## Eski APK'lar

Sunucuda değişiklik yok; eski APK'lar profillerini eskisi gibi görür. Yeni görünüm yeni APK ile gelir.
