# Muzip hediyeler ve profil izleri

Güncelleme 7, madde 11'de 💩 Kaka ve 💧 Su ile başladı. 20 Kasım 2026'da "Muzip hediyeler" şartnamesiyle genişledi.
Sahiplerin o günkü kararları şartnameden önce gelir. Kısaca: raf adı **Muzip**, iz türleri panelden eklenir, süre
dakikayla, aynı anda tek iz, "Kimler profilime iz bırakabilir", ücretsiz kaldırma yok.

## Kısaca ne yapıyor

- **Raf:** Hediye panelindeki "Kutlama" rafının adı artık **Muzip**. Yalnız görünen ad değişti, rafın kimliği
  (`gameplay`), hediyeleri, fiyatları ve geçmişi aynı. Eski APK'lar kendi içlerindeki "Kutlama" adını göstermeye devam
  eder.
- **Pilot çiftler:**

  | İz bırakan hediye | Kalan iz | Temizleyen hediye |
  | --- | --- | --- |
  | 💩 **Kaka Şakası** (`k1`, eski adı Kaka) | Kaka İzi (`kaka`) | 💧 **Temizlik Suyu** (`k2`, eski adı Su) |
  | 🩴 **Terlik Geldi!** (`p8`, eski adı Terlik At) | Kırık Cam (`kirik-cam`) | **Cam Tamiri** (yeni, panelden eklenir) |

  Fiyatları siz panelden verirsiniz; kodda fiyat yok. Terlik Geldi!'nin iz kuralı ve Cam Tamiri de panel verisi:
  adımlar [`HEDIYE_YONETIMI.md`](HEDIYE_YONETIMI.md) › "Yeni bir şaka çifti".
- **Süre:** Hediyenin kendi süresi dakikayla verilir (5 dakika – 7 gün). Hediyede yoksa türün süresi, o da yoksa Canlı
  ayarlar › Profil izleri süresi (24 saat). Pilotların ikisi de **24 saat**.
- **Aynı anda tek iz:** Aynı tür yeniden gelirse süre baştan başlar. Başka bir tür gelirse eskisinin **yerine geçer**:
  Kaka İzi olan birine Terlik Geldi! gelirse kaka gider, kırık cam kalır. Eski iz kayıtta "yerine geçti" (`replaced`)
  diye durur.
- **Kimler iz bırakabilir** (Ayarlar › Gizlilik › "Kimler profilime iz bırakabilir?"):
  - Herkes
  - **Yalnız takip ettiklerim** (varsayılan): kişinin kendisinin takip ettiği kişiler. Bu ayarı hiç seçmemiş herkes ve
    eski APK kullananlar da bu kuraldadır.
  - Kimse
- **"Profilime iz bırakılmasın" anahtarı** artık "Kimse" ile aynı şeydir. **Yalnız yeni izi engeller, profildeki iz
  kalır.** Önceden açınca iz de hemen gidiyordu; sizin kararınızla bu değişti.
- **Ücretsiz kaldırma yok.** Kişi kendi izini kendisi kaldıramaz. İz şu yollarla gider:
  - süresi dolunca,
  - biri temizleyen hediyeyi gönderince,
  - yönetim kaldırınca,
  - izi bırakanı engelleyince (bugün de böyleydi, aynen kaldı).

  Bu karar şartnamenin güvenlik maddesine ve mağaza politikasına aykırı. Riski [`DENETIM.md`](DENETIM.md)'de sahiplerin
  kararı olarak yazılı.
- **Reddedilen gönderim jeton düşürmez.** İz kabul etmeyen birine gönderilirse hiçbir şey düşmez. Gönderen şunu
  okur:
  - "Kimse": "Ayşe, profiline iz bırakılmasını kapattı. Kaka Şakası ona gönderilemez; başka bir hediye seçebilirsin."
  - "Yalnız takip ettiklerim": "Ayşe, profiline yalnız takip ettiği kişilerin iz bırakmasına izin veriyor. …"

  Yeni uygulama bunu göndermeden önce hediye panelinde söyler. O kişi seçiliyse hediye soluk görünür.
- **Birden çok alıcı olur.** Her alıcıya ayrı iz bırakılır, her biri ayrı ödenir. İz kabul etmeyen yalnız kendisi
  reddedilir, öteki alıcılara gider. Yeni uygulama şunu yazar: "2 kişiye gitti. 1 kişi senden iz kabul etmiyor; onlara
  gitmedi, jeton düşmedi."
- **İz yokken temizleme hediyesi:** düz hediye olarak gider. Jeton düşer, elmas alıcıya gider, bir şey temizlenmez.
  Temizleme hediyesi kimseye reddedilmez.
- **Sıklık sınırı yok.** Aynı kişiye art arda iz bırakılabilir.
- **Nerede görünür:**
  - profil fotoğrafı,
  - odadaki kişi kartı,
  - mikrofon koltuğu.

  Çizim sırası: fotoğraf → iz → VIP / mağaza çerçevesi → isim, mikrofon ve rozetler. Fotoğrafın kendisi hiç değişmez,
  iz ayrı bir katmandır.
- **Düşüş ve temizlenme:**
  - İz düşerken kısa bir "çarpma" oynar.
  - Kaka İzi temizlenirken su sıçrar. Öteki türler soluyarak ve parıltıyla gider.
  - "Hareketi azalt" açıksa hiçbiri oynamaz.
- **Ne yazar:**
  - Alıcıya: "Ali sana 🩴 attı; 24 saat kalır ya da biri 🪟 gönderene kadar". Odadaysa sohbette, değilse bildirimde.
  - Odaya: "🩴 Ayşe: profilinde 24 saat iz kalır…", temizlenince "Can, Ayşe kişisinin profilindeki izi temizledi".
  - Kendi profilimde: izin altında kimin bıraktığı, ne kadar kalacağı ve neyin temizleyeceği. Hiçbir yerde
    "temizlemek için harca" yazmaz.
- **Muzip rafının notu:** rafta iz bırakan hediyeler varsa hepsi bir cümlede sayılır: ne kadar kalır, ne temizler,
  "Kimlerin iz bırakabileceğini herkes Ayarlar › Gizlilik'ten seçer".

## İz türleri (panelden, kod değişmeden)

Bir tür, iz bırakan hediyeyle onu temizleyen hediyelerin paylaştığı kısa bir anahtardır (`kaka`, `kirik-cam`,
`camur`…). Türler bir tabloda durur (`mark_kinds`, migration 105). Yeni bir tür, uygulama güncellemesi olmadan
panelden eklenir. Her türün alanları:

| Alan | Ne |
| --- | --- |
| Anahtar | Küçük harf, rakam ve tire; boşluk ve alt çizgi yok (`kirik-cam` olur, `broken_glass` olmaz: G7 APK alt çizgili türü sessizce atar). Sonradan değişmez |
| Ad | 1–24 harf: "Kırık Cam", "Kaka İzi" |
| İz resmi | Fotoğrafın üstüne çizilen saydam resim (aşağıda). Boşsa uygulamanın kendi resmi (Kaka İzi ve Kırık Cam için var), o da yoksa hediyenin küçük resmi rozet olarak |
| Süre | Hediyede süre yoksa bu (dakika, 5–10.080). Boşsa Canlı ayarlardaki süre |
| Aynı iz yeniden gelince | **Süre yeniden başlar** (varsayılan) ya da **eskisi kalkar, yenisi konur**. İki seçenekte de profilde tek iz olur. Fark kayıtta ("süresi bitti" / "yerine geçti") ve odadaki "yeniden" sözünde |
| Açık / kapalı | Kapalı türün hediyeleri düz hediye olur, izleri görünmez. Bir türü anında durdurmanın yolu bu. Açınca süresi dolmamış izler geri gelir |

**Silme:** Yalnız hiçbir hediyenin kullanmadığı tür silinebilir. Kullanan varsa hangi hediyeler olduğu yazar. Satır
silinmez, gizlenir; eski izler ve kayıtlar adını korur.

**İz resmi kuralları:** Sunucu resmi yükleme anında piksel piksel denetler (`server/api/tools/mark-art-check.py`).
Uymayan resim kaydedilmez, nedeni Türkçe yazılır.

- PNG ya da WebP; dosyanın ilk baytlarına bakılır, uzantıya ya da beyana değil. En çok 2 MB.
- Kare, 256–2048 piksel (512 × 512 önerilir). Telefonlar en çok 512 piksel ve 300 KB alır; büyüğü sunucu küçültür.
- Hareketsiz: hareketli PNG ya da WebP olmaz.
- **Gerçek saydamlık:** pikselin en az %30'u tam saydam olmalı (alfa 0). "Saydam" yazan ama her yeri dolu kare
  reddedilir.
- **Yüz açık kalmalı:** ortadaki dairenin (kenardan merkeze yolun %60'ı) en çok %20'si dolu olabilir. Uygulamanın
  Kaka İzi'nde bu %14, Kırık Cam'ın geçici resminde %0.
- Arka plan silme yapılmaz. Resim hazır saydam gelmeli.

Resim değişince eski dosya silinir. Telefonlar yeni adresi katalogla alır. Bir telefonda resim açılamazsa uygulama
bir alttakini çizer: kendi resmi, o da yoksa rozet.

**Geçici resimler:** `app/scripts/kirik-cam-art.py` kodla çizer:

- `app/assets/marks/kirik-cam.png`: uygulamanın içinde, 512 px.
- `docs/gorseller/muzip/kirik-cam-512.png`: panelden yüklemek için aynısı.
- `docs/gorseller/muzip/cam-tamiri-512.png`: Cam Tamiri'nin ikonu.

Gerçek sanatı ekip panelden yükler.

## Hediyenin iz kuralı

Panelin hediye formunda "Profil izi":

- **yok**,
- **bırakır**: tür listeden seçilir, süre dakika ya da saat, boşsa türün ya da Canlı ayarın süresi,
- **temizler**: tür.

Kurallar (değişmedi):

- Bir türü temizleyen hediye, o türü bırakan her hediyeden **pahalı olmalı**. Örnek: "Cam Tamiri izi temizlediği için
  onu bırakan hediyelerden pahalı olmalı: Terlik Geldi! 1.299 jeton, bu 1.299 jeton."
- İz kurallı hediye **Global** olamaz.
- Bağ hediyeleri ve Koruma Kartı iz bırakamaz, temizleyemez.

Olmayan bir tür yazılırsa kayıt reddedilir: '"camur" diye bir iz türü yok: önce Hediyeler › İz türleri'nden bu türü
ekleyin'.

Uygulamanın Yönetim › Hediyeler sayfasında **"İz türlerini önizle"** düğmesi var. Her türü o telefonun kendi
çizimiyle, gerçek boylarda gösterir:

- koltuk 30, 52, 96 ve 112 px; çerçevesiz, VIP halkalı ve mağaza çerçeveli,
- kişi kartı 78 px, profil 96 px,
- açık ve koyu zeminde, düşüş ve temizlenme oynatılarak.

## Hangi uygulama ne görür

| | Eski APK (f9671d9 ve öncesi) | G7 APK (preview-191/192) | Yeni APK (1.1.0) |
| --- | --- | --- | --- |
| Raf adı | Kutlama | Kutlama | Muzip |
| İz kurallı hediyeler | **Hiçbiri rafta yok** (Kaka Şakası, Temizlik Suyu, Terlik Geldi!, Kar Topu, Domates At, panelin bütün iz hediyeleri) | Var (`marks=1`) | Var (`marks=2`) |
| Süre | – | Saat; dakikalı süre yukarı yuvarlanmış yazılır (90 dk: "2 saat") | Dakika ("1 saat 30 dakika") |
| İz resmi | Çizmez | Yalnız Kaka İzi kendi resmiyle; öteki türler hediyenin rozeti | Yüklenen resim, yoksa kendi resmi (Kaka İzi, Kırık Cam), yoksa rozet |
| Tek iz kuralı | – | Sunucu uygular; oda görünüm paketiyle eski izi siler | Uygular |
| Gizlilik | Seçenek yok, varsayılan geçer (yalnız takip ettikleri) | "Profilime iz bırakılmasın" anahtarı: kapalı = "Kimse", açınca varsayılan | Anahtar ve "Kimler profilime iz bırakabilir" |
| Reddedilen gönderim | Türkçe hata cümlesi | Türkçe hata cümlesi; çoğu zaman göndermeden önce soluk | Göndermeden önce söyler; birden çok alıcıda ötekilere gider |

- Eski APK'nın önbelleğindeki bir iz hediyesi gönderilirse sunucu yine kurala uyar: iz bırakır ya da reddeder.
- Yeni APK eski bir sunucuyla da çalışır. Kataloğu `marks=1&marks=2` diye ister, eski sunucu ilkini okur. Uygulama
  o zaman G7 gibi davranır: tür yok, kendi resimleri ve rozet.
- Zorunlu güncelleme: Canlı ayarlar › Zorunlu sürüm `1.1.0` yapılırsa eski APK'lar "Güncelleme gerekli" ekranında
  kalır. Bu sizin kararınız; açılmadıkça eski APK'lar çalışmaya devam eder.

## Canlı ayar

Canlı ayarlar › **Profil izleri** › **Profil izi süresi (saat)**: varsayılan 24, en çok 168. Hediyenin ya da türün
kendi süresi varsa o geçer. **0: bütün profil izleri kapalı** (acil durdurma): iz hediyeleri düz hediye olur, hiçbir iz
görünmez. Bir türü tek başına durdurmak için tür "kapalı" yapılır.

## Neler iz bırakmaz

Yalnız jetonla gönderilen hediye (hediye paneli, profil, sohbet) iz bırakır ve temizler. **Çantam**'dan ve **Şanslı
çanta**'dan gelen iz hediyesi düz hediyedir.

## Riskler (ayrıntı: [`DENETIM.md`](DENETIM.md))

- **Taciz ve mağaza:** Herkese görünen bir "pislik" ya da "kırık cam" birini aşağılamak için kullanılabilir. Bu Google
  Play "Zorbalık ve taciz" politikasına ve App Store 1.1'e takılabilir, özellikle kadın yayıncılara karşı.
  - Ücretsiz kaldırma olmaması bu riski artırır. Sizin kararınız.
  - Azaltanlar:
    - varsayılan "Yalnız takip ettiklerim": tanımadığı biri iz bırakamaz;
    - "Kimse" seçeneği;
    - engelleme izi kaldırır;
    - yönetim izi kaldırır;
    - iz süreyle gider;
    - Canlı ayarla tür ya da bütün özellik kapanır.
- **"Utancını parayla temizlet" görüntüsü:** Temizlemenin tek hızlı yolu başkasının para harcaması. Mağaza incelemesi
  bunu manipülatif bir ödeme düzeni gibi görebilir. Hiçbir ekranda "temizlemek için harca" yok, öyle kalmalı.
- **Para:** Yeni bir akış yok. İki hediye de normal hediye: bire bir elmas, ajans komisyonu. Reddedilen gönderimde
  hiçbir şey hareket etmez.

## Geri alma planı

1. **Hemen, kod olmadan:**
   - Bir tür: panelde tür "kapalı". Hediyeleri düz olur, izleri görünmez.
   - Bir hediye: panelde "rafta değil" ya da Canlı ayarlardan gizle.
   - Hepsi: Canlı ayarlar › Profil izleri › süre 0.
   - Bir kişinin izleri: panel › Kullanıcılar › Profil izleri › kaldır.
   - Kötü bir iz resmi: türün resmini kaldır. Uygulama kendi resmine ya da rozete döner.
2. **Sunucu kodu:** PR geri alınır, `server.yml` yeniden kurar.
   - Migration 105 yalnız ekleme yapar: yeni tablo, boş olabilen sütunlar, genişletilmiş kontrol. Eski kod bunları yok
     sayar, veri kaybı yok, geri migration gerekmez.
   - Dakikalı hediyede `mark_hours` da yukarı yuvarlanmış yazılı. Eski kod izi en az o kadar saat bırakır.
   - `replaced` değerli satırları eski kod "kaldırılmış" diye okur.
   - Eski kod `marks_from`'u bilmez: "Kimse" seçenler (`profile_marks` false) yine korunur, "Yalnız takip
     ettiklerim"dekiler herkese açık olur.
   - Eski kod gizlilik anahtarı kapatılınca izleri yine siler.
3. **Uygulama:** Yeni APK geri çekilmez.
   - Eski APK'lar bozulmadan çalışır: her şey ek alan ve yeni bayrak.
   - Yeni APK eski sunucuyla da çalışır, G7 gibi davranır. Yalnız "Kimler profilime iz bırakabilir" seçimi eski
     sunucuda kaydedilemez ("Ayar kaydedilemedi").
4. **Panel:** Panel PR'ı geri alınır. Uygulamanın uçları kalır, zararsız.
5. **Veri:** `profile_marks` ve `mark_kinds` satırları kalır (geçmiş ve veri kopyası için). Silinecek bir şey yok.

## Teknik

- **Sunucu:**
  - `profile-marks.mjs`: iz yazma (`markGift`), okuma, katalog, yönetim uçları.
  - `mark-kinds.mjs`: türler, iz resmi denetimi.
  - `profile-mark-rules.mjs`: saf kurallar, süre cümlesi, resim kuralları.
  - `privacy.mjs`: `marksFrom`.
  - Migration `101_profile_marks.sql` ve `105_mark_kinds.sql`.
- **Gönderimdeki sıra:** iki kişinin satırı kilitlenir → ref alınır → hediye satırı yazılır → "kimler iz bırakabilir"
  denetlenir (ret: 403, işlem geri alınır, hiçbir şey hareket etmez) → gösterilen iz kapatılır ya da süresi bitirilir →
  yeni iz yazılır → jeton ve elmas. Aynı istek tekrarlanırsa iz yeniden yazılmaz. Tekrarın cevabı izi yine söyler.
  Aynı anda gelen temizlik ve yeni iz sırayla işlenir, sonuç tutarlıdır (test edildi).
- **Okuma:**
  - `GET /api/user` `marks`.
  - `GET /api/looks` `marks`, `marksFrom` ve okuyana göre `noMarks`. Odanın görünüm paketi herkese gittiği için
    `noMarks`'ı yalnız "Kimse"de taşır.
  - Odanın hediye paketi `mark` (`minutes`, `replaced`).
  - Katalog `marks=2`: `marks.kinds`, `minutes`, `serverNow`.
- **Saat:** Telefon izin bitişini sunucunun saatiyle sayar (`lib/sanction-time` `serverNow`). Saati yanlış telefonda
  da kısa bir iz doğru anda gider. Sunucu biten izi okumalarda göstermez.
- **Uygulama:**
  - `lib/profile-marks.ts`: ayrıştırma, cümleler, hangi resim (`markLayerOf`), raf notu.
  - `lib/mark-store.ts`, `lib/live/marks-live.ts`, `lib/live/looks.ts`.
  - `components/profile-mark.tsx`: çizim, düşüş, su ve parıltı.
  - `app/iz-onizleme.tsx`: önizleme ekranı.
- **Testler:**
  - Sunucu: `server/api/test/muzip.test.mjs` (türler, resim denetimi, katalog bayrakları, dakika, tek iz, kimler iz
    bırakabilir, birden çok alıcı, tekrar, yarış, kodsuz üçüncü çift, pilot), `profile-marks.test.mjs`,
    `money-fuzz.test.mjs` (iki tür, takip ve gizlilik yarışları).
  - Uygulama: `app/tests/profile-marks.test.ts`, `server-catalog.test.ts`.
- **Veri kopyası** (`GET /api/me/export`):
  - `profileMarks`: üstüme bırakılan ve benim bıraktığım izler, nasıl kalktıkları.
  - `privacy.settings.marks_from`: seçimim.
  - Türler yönetimin kataloğudur, kişinin verisi değil (`my-data-tables.mjs`).
  - Hesap silinince üstündeki izler silinir, başkasına bıraktıkları adsız kalır.
