# Durum listesi: iki güncelleme belgesi, APK'daki gerçek hâli

Her madde, telefona kurulan APK'da (gerçek sunucuya bağlı sürüm) ne gördüğünü söyler. Her yeni APK'da güncellenir.

Durumlar:

- **Çalışıyor**: APK'da var ve sunucuya bağlı.
- **Yarım**: bir kısmı var, eksik olan yanında yazıyor.
- **Seviyeyle açılır**: var, ama yeni hesapta seviye yetmediği için görünmez.
- **Kurulum bekliyor**: kod hazır, bir hesap ya da anahtar girilince çalışır.
- **Yalnız telefonda**: sadece kullanan kişinin telefonunda çalışıyor, odadaki diğerleri görmüyor. Ya sunucuya taşınacak ya da gizlenecek.
- **Telefonda denenmeli**: kodda doğru, gerçek telefonda henüz denenmedi.

Son güncelleme: preview-96 sonrası (Küçült, çanta yağmuru, @bahset düzeltmesi).

---

## Paket 1'de düzelenler

- **Odadaki hareketli animasyonlar:**
  - Ücretli olanlar artık sunucuda ödeniyor ve odadaki herkes görüyor.
  - Daha önce sadece gönderenin telefonunda oynuyordu, jeton da sonunda geri dönüyordu.
  - Ücretsiz tepkiler de artık herkese gidiyor.
- **Mikrofondaki emoji tepkileri:** Artık herkes görüyor. Önceden sadece gönderende görünüyordu.
- **Moderasyon:** Gerçek odalardaki sahte "2 açık rapor" yazısı kaldırıldı.
- **Oda sahibinin ayarları (artık sunucuda, odadaki herkes görüyor):**
  - **Kapak:** Oda sahibi ve Süper Yönetici seçebiliyor.
  - **Oda teması:** Sadece oda sahibi.
  - **Odada hediye efektleri aç/kapa:** Sadece oda sahibi.
  - **Üst çubuktaki ayar düğmesi:** Oda sahibi ve yöneticilerde de görünüyor.

## Paket 2'de düzelenler (oda)

- **Geri tuşu:** Oda menüsünde iki adım geri doğru çalışıyor. Menüden başka ekrana gidip dönünce menü yeniden açılıyor.
- **Oda ayarları artık sunucuda, odadaki herkes için aynı:**
  - yavaş mod, yasaklı kelimeler, bot (girişte hoş geldin ve kurallar)
  - oda tipi, mikrofon izni (Lv.4), Patron koltuğu (Lv.3)
  - oda üyeleri (katıl, başvur, onayla, çıkar), kara liste
  - özel oda, kişi sınırı, odayı profilde göster, ekran görüntüsü engeli
- **Etkinlikler ve soru-cevap:** Sunucuda, odadaki herkes görüyor.
- **Başkalarının görünümü:** Çerçeve, sohbet balonu, giriş efekti ve konuşurken mikrofon efekti herkese görünüyor.

## Paket 3'te düzelenler (Aile)

- **Günlük görevler:** Sunucu, üyelerin gerçekten yaptıklarından sayıyor. Yoklama günde bir.
- **Haftalık sandıklar:** Ailenin haftası yetince açılıyor. Ödül jetonu veriyor (sadece mağazada harcanır). Kişi başı haftada bir.
- **Aile sohbetinde hediye:** Sadece aileden birine gidiyor, sohbette görünüyor. Gelir'de ayrı satır.
- **Ailem ekranı:**
  - bu hafta, sıra, aktif üye, öne çıkanlar
  - aile odası (liderin açık odası)
  - seviye ayrıcalıkları, aile kuralları
  - liderin seçtiği etiket ve tema
- **Uyum Köşesi:** Ailedeki gerçek ikililer ve Çift hediyesi.
- **Diğer:** Keşfet'teki Aile kısayolu açıldı. Oda kartında oda sahibinin ailesi görünüyor.
- **PR #87 ile eklenenler:**
  - üye davet (lider ve yardımcı; davet edilen bildirim alır, Aile ekranında Katıl/Reddet)
  - çevrim içi üyeler, odadaysa "Git"
  - aile sıralaması (kendi ailen işaretli)
  - aileyi şikâyet
  - aile sohbetinde Görevler, Uyum Köşesi ve Ailem kısayolları

## Paket 4'te gelenler (bildirimler)

- **Aramalar çalacak:** Uygulama kapalıyken de çalacak, kendi zil sesiyle.
- **Bildirimler:** Mesaj, hediye ve takip bildirimleri gelecek.
- **Kurulum:** Kod hazır. Firebase dosyaları girilince açılır (aşağıda).

## Mağaza yönetimi (yeni APK)

- **Çalışıyor (yeni APK):** çerçeveler, giriş efektleri, sohbet balonları ve ses dalgaları finans panelinden yönetiliyor (Hediye ve mağaza › Mağaza).
  - Uygulamanın kendi eşyalarının adı, fiyatı, süresi, VIP seviyesi, satışta olup olmadığı ve sırası değişir.
  - Yeni çerçeve: saydam PNG yüklenir, fotoğrafın çevresine çizilir.
  - Yeni giriş efekti: video ya da SVGA yüklenir, odaya girenin adı isim plakasına yazılır.
  - Yeni sohbet balonu: iki renk ve yazı rengi, ya da köşeleri bozulmadan uzayan bir resim.
  - Yeni ses dalgası: beş stilden biri ve renkleri; Parıltı'da dönen şekil resim olabilir.
- **Eski APK'lar:** kendi mağazasını gösterir; değişen eşyayı alamaz ("uygulamayı güncelle"), yeni eşyaları görmez.
- Ayrıntı: [`MAGAZA_YONETIMI.md`](MAGAZA_YONETIMI.md).

## Çarşı ve Çantam (yeni APK)

- **Çarşı:** Mağaza'nın yeni adı. Binek sekmesi kalktı; binekler Giriş efektleri sekmesinde (bir giriş efekti ve bir binek birlikte takılır).
- **Çerçeve önizlemesi (Güncelleme 7):** Çerçeveler sekmesinde "Önizle" (ya da çerçevenin resmine dokunmak) çerçeveyi kişinin kendi fotoğrafıyla gösterir: büyük, odada mikrofonda (odanın kendi koltuk ölçüsüyle, yanında boş koltuklar) ve profilde. Panelden eklenen çerçeveler de aynı yoldan çizilir. Altındaki düğme Çarşı'nınki: fiyat (onay sorulur), Kullan / Çıkar ya da VIP kilidi. Önizleme hiçbir şey satın almaz, takmaz, sunucuya gitmez.
- **Çantam (Profil › Çantam):** kişinin bütün eşyaları sekmelerle (Hediyeler, Çerçeveler, Giriş efektleri, Sohbet balonları, Ses dalgaları); her birinde kalan gün, nereden geldiği ve Kullan.
  - Eşyalar artık sunucudan okunur: başka telefonda alınan ya da yetkilinin verdiği eşya da görünür.
- **Seviye ödülleri:** panelde bir VIP, Cömertlik ya da Yankı seviyesine eşya bağlanır (Seviye ve VIP › Seviye ve görev ödülleri); o seviyeye gelen Çantam'ında bulur.
- **Etkinlik ödülleri:** panelde bir etkinliğe eşya bağlanır (Etkinlikler › Ödül); etkinlik sürerken odaya giren herkes etkinlik bitince Çantam'ında bulur. Etkinlik sayfasında "Katılım ödülü" satırı.
- **Görev ödülleri:** panelde günlük "1 görüntülü arama yap" görevine eşya bağlanır (Seviye ve görev ödülleri › Görev); görevin ödülünü alan Çantam'ında bulur. Görevler ekranında eşyanın adı görünür.
- **Eski APK'lar:** Çantam yok, Binek sekmesi durur; seviye ödülleri güncelleyince gelir.
- Ayrıntı: [`CANTA.md`](CANTA.md).

## Seviye ve VIP ayarları (yeni APK)

- **Çalışıyor (yeni APK):** VIP, Rütbe, Cömertlik, Yankı ve Abonelik finans panelinden (Seviye ve VIP › Seviyeler ve VIP) ayarlanıyor; telefon ayarı katalogla alıyor.
  - VIP sayfası: seviye adları, puanları ve hangi hakkın hangi seviyede açıldığı.
  - Abonelik: hangi paket görünür, etiketi, uygulamada yazan fiyat.
  - Rütbe: kademe adı, fiyatı ve günü. Değişen kademe gösterilen fiyat ve günle alınır.
  - Seviye sayfası: Cömertlik ve Yankı puanları, grup adları; seviye düşmesi açıksa kuralı yazar.
- **Eski APK'lar:** seviyeyi kendi içindeki eşiklerle gösterir; sunucunun denetimleri herkes için ayara uyar. Panelde değişmiş Rütbe kademesini eski APK alamaz, "uygulamayı güncelle" görür.
- Ayrıntı: [`SEVIYE_AYARLARI.md`](SEVIYE_AYARLARI.md).

## Oda roketi (yeni APK)

- **Kapalı gelir:** finans panelinde Hediye ve mağaza › Oda roketi'nden açılır (şansla dağıtılan, nakde dönebilen ödül; hukuki değerlendirme gerekir).
- **Açılınca (yeni APK):** odanın adının altında roket düğmesi; odadaki hediyeler roketi doldurur (günde 5 seviye, 00:00'da sıfırlanır), seviye dolunca roket kalkar, ödüller o seviyeye katkı verenler arasında çekilir (normal jeton ya da birkaç günlük mağaza eşyası).
- **Telefonda denenmeli:** kalkış gösterisi ve roket penceresi gerçek telefonda henüz denenmedi. Güncelleme 7 (yeni APK): düğme "Lv.2 · %12,9" yazar; kalkış ekrandaki ve sıradaki hediyeleri bekler, sonraki hediyeler kalkışı bekler. İki telefonla, videolu bir hediyeyle seviye doldurularak denenmeli.
- **Eski APK'lar:** roketi göstermez; hediyeleri roketi doldurur, kazandıkları hesaplarına geçer. Ayrıntı: [`ODA_ROKETI.md`](ODA_ROKETI.md).

## Paket 5'te gelenler

- **Ajans kazançları:** Gerçek dosya olarak (Excel'de açılır) paylaşılıyor.
- **Mesajda fotoğraf:**
  - Yayıncıyla kalp seviyesi 3'te açılıyor.
  - Diğer kişilerle karşılıklı takipte açılıyor.
  - Depo (R2) 9 Kasım'da kuruldu.
- **Alt menü:** "Benzerler" artık "Ana Sayfa". Odalar'ın simgesi mikrofon oldu.

## Kalp, arama ve Bağlar (yeni APK)

- **Sohbetteki kalp:** iki kişinin yakınlığı, Bağlar'dan ayrı.
  - Hediyeler, ücretli mesaj ve dakikalar doldurur (jeton başına 1 puan). Sohbet de yavaş doldurur: mesaj başına 2 puan, günde en çok 60.
  - Konuşmayınca yavaş düşer: puan 7 gün tam sayılır, sonra her 14 günde yarıya iner.
  - 5.000 jetonluk bir hediye görüntülü aramayı hemen açar (kalp seviyesi 3). Sesli arama seviye 2'de.
  - Sayıların hepsi Canlı ayarlar › Birebir ve eşleşme'den değişir.
- **Arama öncesi:** ücretli aramada bir kez sakin bir not: "Bu arama ücretlidir; dakika başına … jeton ücret kesilir."
- **Arama sırasında:** ödeyen taraf dakika ücretini ve harcadığını görmez; arama bitince yalnız süreyi görür (harcama cüzdan geçmişinde ve Aramalar listesinde). Kazanan taraf her dakika kazandığı elması ve büyüyen toplamı görür, 5 dakikada bir daha büyük bir teşvik notu çıkar; bitişte kazandığı elması görür.
- **Aramada hediye:** arama ekranındaki hediye düğmesiyle gönderilir; alan "🎁 … gönderdi" notunu görür. Yeni APK'da iki tarafta da hediyenin animasyonu sessiz oynar. Telefonda denenmeli.
- **Mesajda hediye animasyonu (Güncelleme 7, yeni APK):** Mesajlar'dan (odadaki Mesajlar penceresi dahil) gönderilen hediyenin animasyonu gönderenin ekranında hemen oynar; alanın ekranında sohbeti açınca bir kez oynar (açılışta en yeni oynatılmamış hediye, sohbet açıkken gelen her yeni hediye). Hediye satırı hediyenin resmi ve adıyla kart olarak görünür, karta dokununca animasyon yeniden oynar. Profilden, Anlar'dan, aramadan ve aile sohbetinden gönderilen hediyenin animasyonu da gönderenin ekranında oynar. Oda gibi Efekt ayarlarına uyar (efektler kapalıysa, "yalnız büyük hediyeler" ya da "hareketi azalt" açıksa oynamaz). Eski APK'lar hediye satırını yazı olarak görür, animasyon yok. Video bir pencere (Modal) içinde ilk kez burada oynuyor: telefonda denenmeli.
- **Sahte hediye satırı (sunucu, eski APK dahil):** "Hediye gönderdi: …" diye başlayan yazılı mesaj reddedilir ("Hediye satırını yalnızca gerçek bir hediye yazar…"); bu satırı yalnız sunucu, gerçek hediyeyle yazar. Dolandırıcının sahte hediye göstermesini önler.
- **Hediye paneli rafları (Güncelleme 7, yeni APK):** İkili rafının adı **Çift** (altındaki yanlış "%2 yakınlık" yazısı kalktı; aile görevindeki "Çift hediyesi" de bu adla); **Çantam** rafı yazı yerine 3B çanta simgesi, üstünde kaç çeşit hediye olduğunu gösteren rozet. Odalar listesindeki "İkili" sekmesi ve "En Uyumlu İkili" sıralaması aynı kaldı. Eski APK'lar eski adları gösterir.
- **Bağlar:** "Aile ve Dost" boşken Kardeş, Bacı, Ağabey, Abla, Yenge, Enişte ve Kanka resimleri ve fiyatlarıyla görünür. Başkasının profilinde birine dokununca fiyat bir kez sorulur, sonra istek gider.
- **Bağlar, Güncelleme 7 (madde 3, 3a, 3b; [`BAGLAR.md`](BAGLAR.md)):**
  - **Bağ hediyesi yeniden (yeni APK):** bağın olan kişiye aynı bağ hediyesi normal hediye olarak, istediğin adette gider ve bağ puanı getirir (odanın Aile ve Dost rafından, profilde her bağın "Bağ hediyesi gönder" düğmesinden). Eski APK'da bağı olan kişiye bağ hediyesi gitmez, "uygulamayı güncelle" denir.
  - **Puan düşüşü ve kendiliğinden bitiş (sunucu, eski APK dahil):** hediyesiz gecelerde puan %10 (en az 10) düşer; 30 gün hediyesiz bağ biter, 3 gün önce uyarı. Eski APK'nın kurallar yazısı hâlâ "Puan düşmez" der: duyuru gerekir (`DENETIM.md`).
  - **Lv20'ye kadar ve işaretler (yeni APK):** seviyeye göre büyüyen halkalı bağ işareti profilde, rozette ve odada (odada Lv1'den). Eski APK seviyeyi doğru gösterir, çizimi eskidir.
  - **Sınırsız bağ (sunucu):** Aile türleri ve Kanka kişi başına 1000, Çift 1, bekleyen istek 10.
  - **SimilarClub Sistem'de bağ bildirimleri (sunucu, eski APK'da Duyuru kartı):** her değişiklik bir kez; push'a dokununca yeni APK Bağlar sekmesini açar (eskiden boş Bildirimler).
  - **Bağı bitir (yeni APK):** her satırda görünür düğme; bekleme süresi panelden.
  - Telefonda denenmeli: odadaki işaretin büyüklüğü ve "Lv" etiketinin okunması küçük ekranlı telefonlarda.
- **Maske (görüntülü arama ve eşleşme, kadınlar, Android):** kendi küçük görüntüsünün altındaki **Maske** düğmesi sırayla Kapalı → Göz maskesi → Mozaik yüz → Emoji yüz yapar. Güzellik düğmesi de oraya taşındı. Seçim telefonda kalır, bir sonraki aramada da açık başlar.
  - Yüzü telefon bulur (saniyede 5 kez). Yüz bulunamazsa (yüz çevrik, karanlık, ekrandan çıkmış) görüntünün tamamı iri karelere bölünür; bir hata olursa siyah gider. Yüz hiçbir zaman maskesiz gitmez.
  - Durum: Telefonda denenmeli. Kodu bu bilgisayarda derlenemedi; ilk derleme GitHub'daki APK yapımında. Denerken iki telefonla görüntülü ara, karşı telefonda maskenin yüzde durduğuna, kafa hızlı dönünce ve kamera çevrilince yüzün bir an bile görünmediğine bak. Eski Android yüz bulucusu yandan ve uzaktan yüzü zor bulur, o zaman görüntü kareli gider.
  - iPhone'da ve eski APK'larda maske düğmesi görünmez.

## Otomatik mesaj, 5 dakika kuralı ve SimilarClub Sistem (yeni APK)

Ayrıntı: [`OTOMATIK_MESAJ.md`](OTOMATIK_MESAJ.md).

- **5 dakika kuralı (sunucu, eski APK dahil):** yayıncıya giden ücretli mesajın elması ancak yayıncı 5 dakika içinde cevap verirse geçer. Cevap gelmezse jeton erkeğe geri döner. Eski APK'daki yayıncı geri sayımı görmez ama kural onu da kapsar.
- **Elmas göstergesi (yeni APK):** yayıncı, gelen ücretli mesajın altında "💎 +240 Elmas · 04:35 kaldı" görür; cevap verince "kazanıldı", süre geçince "Ödül süresi doldu". Erkek kendi mesajının altında yalnız kendi jetonunu görür (bekliyor, ödendi, iade edildi).
- **Otomatik Mesajlarım (yeni APK, Yayıncı Merkezi):** onaylı kadın yayıncı 10 mesajını kendi yazar ya da varsayılan kalır; günde 10 otomatik mesaj, çevrimiçiyken yeni erkek kullanıcılara gider. Karşı tarafta "Otomatik mesaj" yazar.
- **Hazır cevap (yeni APK):** sohbette ⚡ düğmesi, günde 10 hak. Bitince yazarak cevap verip kazanmaya devam eder.
- **Erkeğin ücretsiz sohbet başlangıcı (yeni APK):** varsayılan açık; ilk seferde Mesajlar'da ne olduğu anlatılır, "İstemiyorum" ile kapanır. Anlatılmadan (eski APK) hiç gitmez. Ücretsizdir, elmas kazandırmaz.
- **Mesaj Performansım (yeni APK):** ortalama cevap süresi, 5 dakikada cevap oranı, kazanılan ve kaçırılan elmas; bugün, 7 gün, 30 gün, tarih aralığı.
- **Ajans ofisi › Mesaj performansı (yeni APK):** ajansın yayıncıları tek tek, yalnız sayılar.
- **SimilarClub Sistem:** Mesajlar'daki "Similar Ekibi" yeni APK'da bu adla açılır, cevap yazılamaz. Arama kazancı, görüşme bilgisi, günlük mesaj özeti, PK sonucu, roket, etkinlik, çanta hediyesi, bonus ve uyarılar buraya düşer. Eski APK'da aynı bildirimler Similar Ekibi'nde ödül/duyuru kartı olarak görünür.
- **Telefonda denenmeli:** geri sayım, hazır cevap penceresi, iki telefonla 5 dakika içinde ve sonra cevap.
- **Panel:** bütün sayılar ve metinler finans paneli › Canlı ayarlar › Otomatik mesaj ve SimilarClub Sistem'de kendiliğinden görünür. Rapor sayfası (yayıncı, ajans, şüpheli ikililer) için sunucu hazır, panel sayfası henüz yok.

## Güncelleme 7: fotoğraflar ve "Şu an odada" (yeni APK)

- **Başkalarının fotoğrafı (madde 1):**
  - Şanslı kazanç bandındaki fotoğraf artık sunucunun adresiyle gidiyor; bazı internet sağlayıcılarında yüz boş görünüyordu. Sunucu tarafı, eski APK'da da düzelir.
  - Oda ayarlarındaki yönetici, DJ, atılan ve susturulan listeleri, oda davetleri, Gelir ve jeton geçmişi, davet kodunu veren kişi artık fotoğrafla geliyor.
  - Yeni APK: görünüm okuması başarısız olursa kendiliğinden yeniden deneniyor (5 ve 15 saniye), hâlâ yüzü gelmeyen kişi 30 saniyede bir yeniden soruluyor; açılamayan fotoğraf 3 ve 20 saniye sonra bir daha deneniyor. Oda oyunlarının oyuncu yüzleri de güncel.
  - Hâlâ görünmeyen biri olursa: o kişinin ID'si ve hangi ekranda olduğu (mikrofon, Balkon, sohbet, Mesajlar). Fotoğrafını eski bir APK'da seçip hiç yeni APK açmamış biri, profilini bir kez açınca fotoğrafı sunucuya gider.
- **"Şu an odada" (madde 15):** Birinin profilinde bulunduğu oda yine görünüyor: "Şu an odada: <oda> · Git". Şifreli odada "Şifreli oda · girişte şifre sorulur". Kişinin "Bulunduğum odayı göster" ayarına uyar (başta açık); engellenen kişiye, giremeyeceği odada ve bire bir görüşmede görünmez. "Git" ile (profil, ajans sohbeti, aile) gelen için odadaki herkes "Kaan, Artemis'i takip ederek geldi" görür, Artemis hâlâ odadaysa. Eski APK'lar profilde odayı göstermez ve girişte yine "X odaya girdi" yazar. **Telefonda denenmeli:** satır, ses sunucusunun (LiveKit 1.9.1) giriş anahtarındaki katılımcı özelliğine dayanıyor; bilgisayarda değil, gerçek iki telefonla denenmeli.

## Depo (R2): kuruldu, az yer kaplıyor

- **Kurulum:** Anahtarlar 9 Kasım'da girildi, sunucuya yazıldı. Fotoğraf ve şarkı yükleme açık.
- **Fotoğraflar küçülüyor:** Telefon fotoğrafı yüklenmeden önce küçülüyor.
  - Profil: 640 piksel. Anlar ve sohbet: 1280 piksel. Duyuru: 1600 piksel.
  - Bir fotoğraf 3–8 MB yerine yaklaşık 150–300 KB tutuyor.
  - Fotoğrafın içindeki gizli bilgiler (çekildiği yer, telefon) da siliniyor.
- **Kullanılmayan dosyalar siliniyor:**
  - değişen profil fotoğrafı
  - sahibinin sildiği An (şikâyeti açıksa kanıt olarak kalır)
  - kütüphaneden çıkan şarkı
  - kaldırılan duyuru
  - silinen hesabın bütün dosyaları (UK GDPR)
- **Sınırlar:** Anlar sadece fotoğraf alıyor (video yok), Anlar ve sohbet fotoğrafı en fazla 8 MB.

---

## Belge 1: Güncellemeler

| No | Madde | Durum | Not |
|---|---|---|---|
| 1 | Her yer simetrik ve okunur | Telefonda denenmeli | 38 ekranın ilk görünümüne telefon boyunda (360 genişlik) bakıldı, bulunan çakışmalar düzeltildi (PR #87). Kaydırınca görünen kısımlara ve sadece canlı sürümde açılan ekranlara telefonda bakılmalı |
| 2 | Para Çek'te Jeton Noktası | Çalışıyor | Aktif Jeton Noktası yoksa "Şu an aktif Jeton Noktası yok" yazar |
| 3 | "Yayıncı ata" kalksın | Çalışıyor | |
| 4 | Ajans koduyla katılma, 3 gün kuralı | Çalışıyor | 3 günü geçen kişi ajanssız kalır, sadece transferle bir ajansa girer |
| 5 | Transfersiz ayrılamaz, ikinci hesap ilk ajansa | Çalışıyor | İkinci hesap kuralı aynı telefonda geçerli |
| 6 | Erkek yayıncı olamaz, erkekten komisyon yok | Çalışıyor | |
| 7 | Gelir'de tüm kazanç ayrıntısı | Çalışıyor | |
| 8–11 | Balkon, Aile, yeni rütbe adları | Çalışıyor | |
| 12 | Anlar'da paylaşım ve hediye | Seviyeyle açılır | Paylaşım Yankı Lv.5'te açılır. Fotoğraf yükleme açık (R2 kuruldu). Hediye çalışıyor |
| 13 | Oda menüsünde geri tuşu | Telefonda denenmeli | İki adım geri ve menüye dönüş Paket 2'de geldi |
| 14 | Oda kartında tüm ayrıntılar | Çalışıyor | Kapak, oda üyeleri ve oda sahibinin ailesi var |
| 15 | Oda ayarlarında her şey | Çalışıyor | Hepsi sunucuda. Mikrofon izni Lv.4, Patron koltuğu Lv.3 odada açılır |
| 16 | "Odayı şikâyet et" gizlensin | Çalışıyor | |
| 17 | Efekt ayarları | Çalışıyor | Başkalarının giriş efekti, çerçevesi ve sohbet balonu da görünüyor |
| 18 | Emoji: ücretsiz/ücretli | Çalışıyor | Konuşurken çıkan mikrofon efekti de herkese görünüyor |
| 19–22 | Yönetici sıralaması (sahip, Süper Yönetici, Yönetici) | Çalışıyor | Etkinlikler de sunucuda |
| 23 | Çarpı penceresi üstten açılsın | Çalışıyor | |
| 24 | Mikrofon kuyruğu (el kaldırma) | Çalışıyor | Başta kapalı, Oda ayarlarından açılıyor |
| 25 | Mikrofon değişikliği herkeste aynı | Telefonda denenmeli | |
| 26 | Küçük mikrofon, büyüyen sohbet | Çalışıyor | |
| 27 | Rüzgâr Gülü odada | Seviyeyle açılır | Cömertlik Lv.2'de açılır. Düğmesi örnekteki gibi sağ altta |
| 28 | Uğurlu hediyeler ve yönetimi | Seviyeyle açılır | Cömertlik Lv.2 ve 18 yaş gerekir. Yeni APK'da rafta kazanç tutarı ve kasa ayrıntısı yazmaz, yalnız nasıl oynanır ve olasılık tablosu (Güncelleme 7). Yönetimi: Yönetim sitesinde Uygulama › Şanslı hediye ayarı; yeni APK'da Ayarlar › Yönetim siteyi açar (eski APK'larda Ayarlar › Yönetim › Uğurlu hediyeler, sadece yönetici hesaplar). Güncelleme 7 madde 10 (sahip kararı, hukuk sorusu açık): panelden yeni paket eklenebilir, her pakete ikon ve video verilebilir (sunucu hazır; panel sayfası ayrıca yapılacak). Yeni APK ikonu gösterir, kendi gönderiminde önce videoyu sonra sonucu oynatır, gösterdiği fiyat ya da olasılık değiştiyse gönderim reddedilir ve jeton düşmez; eski APK yeni paketi varsayılan resimle gösterir, videoyu oynatmaz. Videolu Şanslı gönderimi telefonda denenmeli |

## Belge 2: Güncelleme 2

| No | Madde | Durum | Not |
|---|---|---|---|
| 1 | Yayına katılma modu herkeste aynı | Telefonda denenmeli | |
| 2 | Mikrofon gürültü engelleme | Telefonda denenmeli | preview-94'ten beri APK'da |
| 3 | Aile | Yarım | Hepsi sunucuda (Paket 3). PR #87: üye davet, çevrim içi üyeler, sıralama, şikâyet, sohbet kısayolları. İki eksik: haftalık aile bonusu sadece tahmin olarak görünüyor, ödemesi senin kararın. Sandıktaki çerçeve ve sohbet balonu henüz verilmiyor, sadece jeton |
| 4 | Yayıncı profilinde ajans ve aile | Çalışıyor | |
| 5 | Profilde kırmızı/mavi cinsiyet simgesi | Çalışıyor | |
| 6 | Ajans sahibinin ana ekranı | Çalışıyor | |
| 7 | Haftalık/aylık kazanç ve dışa aktarma | Telefonda denenmeli | Artık gerçek dosya (.csv, Excel'de açılır) |
| 8 | Referans ajanslar | Çalışıyor | |
| 9–12 | Eşleşme (3 hak, 58 saniye, ücretler) | Çalışıyor. Kimsenin ödemediği eşleşme (iki yayıncı) de süresi dolunca kesilir | İki karşı cinsten hesap aynı anda aramada olmalı |
| 13 | Birebir: mesaj, sesli/görüntülü arama | Kurulum bekliyor | Uygulama kapalıyken arama çalması Firebase dosyaları girilince açılır |
| 14, 16–18 | Ücretler, karşılıklı takipte mesaj ücretsiz | Çalışıyor | Ücretler sadece onaylı ajans yayıncısıyla konuşunca görünür. Yönetim panelinden değişir |
| 15 | Kalp seviyesiyle arama açılması | Telefonda denenmeli | Arama kilitleri çalışıyor. Mesajda fotoğraf (yayıncıyla kalp Lv.3) depo kurulunca açıldı |
| 19 | Mesajda hediye | Çalışıyor | Yeni APK'da animasyonu iki tarafta da oynar (Güncelleme 7); telefonda denenmeli |
| 20 | Ayarlar'da sürüm ve güncelleme | Çalışıyor | |
| 21 | Oda sesi kapat düğmesi | Çalışıyor | |
| 22–33 | ⋯ menüsü düzenlemesi | Çalışıyor | Çıkanlar odanın adına/resmine dokununca açılan oda kartında |
| 34 | Şanslı çanta | Telefonda denenmeli | preview-96: atılınca üstte kart iner, ekran kararır, yukarıdan çanta yağar |
| 35 | Emoji paneli geri tuşuyla kapansın | Çalışıyor | |
| 36 | Küçült/Büyüt | Telefonda denenmeli | preview-96: Küçült'te mikrofonlar numaralı küçük bir şerit, sohbet kalan yeri alır |
| 37 | Mesajda büyük emoji | Çalışıyor | |
| 38 | Mikrofon sayısına göre boyut | Çalışıyor | |
| 39 | Yazarken mikrofonlar kapanmasın | Telefonda denenmeli | |
| 40 | @bahset | Yarım | Bahsetmeli mesaj iletişim filtresine takılıyordu. Düzeltmesi PR #87'de, sonraki APK'da gelir. Güncelleme 7 (yeni APK): görülmeden geçen bahsetme için sohbetin üstünde "Senden bahsedildi" düğmesi, dokununca o mesaja gider; telefonda denenmeli |
| 41–42 | Kişi kartı | Çalışıyor | Güncelleme 7 (yeni APK): tasarımdaki gibi; profil ID'si (dokununca kopyalanır) ve ülkesi, Cömertlik ve Yankı seviyesi (VIP'nin gizlediği gizli kalır), VIP seviyesi, madalyaları (dokununca profilin Onur sekmesi). Eski APK eski kartı gösterir |
| 43–44 | DJ yetkisi | Çalışıyor | |
| 45 | Telefondan müzik çalma | Telefonda denenmeli | Depo (R2) kuruldu, şarkı yükleme açık |
| 46 | "Benzer" yerine "Ana Sayfa" | Çalışıyor | Alt menüde de "Ana Sayfa" |
| 47 | Cinsiyet filtresi kalksın | Çalışıyor | |
| 48 | Öne çıkanlar | Çalışıyor | Onaylı yayıncı ya da harcama yapan biri olunca dolar |
| 49–50 | Çevrim içi ve Yeni kullanıcı sekmeleri | Çalışıyor | |
| 51 | Dünya simgesiyle filtre | Çalışıyor | |
| 52 | Anlar'da Yankı Lv.5 | Çalışıyor | |
| 53 | Anlar'da spam ve görüntü filtresi | Yarım | Yazı filtreleniyor. Resimleri otomatik denetlemek için bir hizmet seçilmeli |
| 54 | Anlar'da yorum, silme, beğeni | Çalışıyor | |
| 55 | Odalar bannerları | Çalışıyor | Sadece "Sana yakın" sekmesinde |
| 56 | Yönetimin etkinlik bannerı | Çalışıyor | Resim yükleme açık (R2 kuruldu) |
| 57–58 | Mesajlar üst bölümleri | Çalışıyor | |
| 59 | Similar Ekibi duyuruları | Çalışıyor | Telefona bildirimi Firebase girilince gelir |
| 60 | Çevrim içi hizmet | Çalışıyor | Sık sorulanlar ve e-posta var, canlı destek yok |

---

## Kalanlar: tam liste

**Yarım kalan işler (benim):**
- PR #87 birleştirme bekliyor: @bahset düzeltmesi, Aile eksikleri, simetri düzeltmeleri.
- Aile sandığındaki çerçeve ve sohbet balonu: mağazaya eklenince sandıktan verilir.
- Gezinme sadeleştirme planı: sana gösterilecek.

**Kurulum bekleyenler (senin):**
- **Bildirimler (Firebase):** Arama çalması, mesaj, hediye ve duyuru bildirimleri için. GitHub Secrets'a iki dosya:
  - `GOOGLE_SERVICES_JSON`: Firebase'in Android dosyası (paket adı com.similarclub.app).
  - `FCM_SERVICE_ACCOUNT`: Firebase hizmet hesabı anahtarı.
- **Haftalık aile bonusu:** Şu an sadece tahmin gösteriliyor. Ödenecekse kuralını sen belirle.
- **Resim denetimi:** Anlar'daki resimleri otomatik denetlemek için bir hizmet seçilmeli.

**Telefonda denenecekler:** Bu listede "Telefonda denenmeli" yazan maddeler.

**Güvenlik ve yayın öncesi:**
- Finans paneli şifresini değiştir, iki adımlı doğrulamayı aç, WhatsApp'ta sabitlenmiş giriş mesajını sil. Sonra eski giriş bilgisi panelden silinir.
- Yayından önce test modu kapatılmalı: test jeton yükleme ve deneme girişi kapanır.
- Odada müzik için müzik lisansı (PRS/PPL).
- Play Store için mağaza paketi (AAB).

**Çalışıyor ama sınırlı:**
- Çevrim içi hizmette canlı destek yok, sık sorulanlar ve e-posta var.
- Odalar bannerları sadece "Sana yakın" sekmesinde.
- Kulüp (PR #36) senin isteğinle bekletiliyor.
