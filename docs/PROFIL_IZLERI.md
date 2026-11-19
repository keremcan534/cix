# Profil izleri: 💩 Kaka ve 💧 Su

Güncelleme 7, madde 11. Müşterinin isteği: "Kutlama hediyeleri bir kişiye atıldığında profilinde efekt çıkmalı; bok
atıldığında kişinin profilinde pislik kalmalı, bunu temizlemek için su atmalı; su boktan daha pahalı olmalı."

## Ne yapıyor

- **💩 Kaka (999 jeton)**, Kutlama rafında. Alıcının profil fotoğrafına biraz pislik (kahverengi lekeler ve damlalar)
  ve küçük bir 💩 rozeti bırakır.
- **💧 Su (1.999 jeton)**, Kutlama rafında. İzi temizler: fotoğrafın üstünde su sıçrar, leke akıp gider. Su'nun elması
  temizlenen kişiye gider (normal hediye). Temiz bir profile atılan Su düz hediyedir.
- **İz 24 saat kalır** (Canlı ayarlar › Profil izleri). Biri Su gönderirse daha önce gider.
- **İz birikmez.** İkinci bir Kaka 24 saati yeniden başlatır; iz bir tane kalır.
- **Nerede görünür:** profilin üstündeki fotoğraf, odadaki kişi kartı ve kişi odadayken mikrofon koltuğu. İz fotoğrafın
  üstünde, çerçevenin altında durur: çerçeve takan kişide çerçeve izin üstünde kalır.
- **Alıcıya ne söylenir:** odadaysa sohbette "Ali sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar". Oda
  dışındaysa (profilden, sohbetten) aynı cümle bildirim olarak gelir. Kendi profilinde izin altında kimin bıraktığı,
  ne kadar kalacağı ve nasıl gideceği yazar.
- **Odadakilere:** "💩 Ayşe: profilinde 24 saat iz kalır ya da biri 💧 gönderene kadar", temizlenince "💧 Can, Ayşe
  kişisinin profilindeki izi temizledi".
- **İstemeyen kapatır:** Ayarlar › Gizlilik › **Profilime iz bırakılmasın** (başta kapalı, yani iz bırakılabilir).
  Açınca profilindeki iz hemen gider. Ona Kaka gönderilmek istenirse **jeton düşmeden** reddedilir: "Ayşe, profiline iz
  bırakılmasını kapattı. Kaka ona gönderilemez; başka bir hediye seçebilirsin." Yeni uygulama bunu göndermeden önce
  hediye panelinde söyler: o kişi seçiliyse Kaka soluk görünür; birkaç kişi seçiliyse Kaka yalnız diğerlerine gider.
- **Engelleme:** engellenen kişi zaten hediye gönderemez; engellemeden önce bıraktığı iz de engelleyince gider.
- **Yönetim:** panelden bir kişinin izleri görülür ve kaldırılır (kim bıraktı, ne zaman, nasıl gitti); her kaldırma
  denetim kaydına yazılır.

## Kurallar veri olarak

Hangi hediyenin iz bıraktığı ya da temizlediği hediyenin kendi ayarıdır (Yönetim › Hediyeler, panelin hediye formu):

- **Profil izi:** yok / **bırakır** (izin türü, isteğe bağlı süre) / **temizler** (izin türü).
- **İzin türü** kısa bir kelime: Kaka ve Su'nunki `kaka`. Panelde başka bir çift yapılabilir (ör. `camur`: Çamur ve
  Hortum). Uygulamada resmi olan tür şimdilik yalnız `kaka`; başka bir türde fotoğrafta yalnız o hediyenin küçük resmi
  görünür (yeni bir leke resmi için uygulama güncellemesi gerekir).
- **Kural:** bir izi temizleyen hediye, o izi bırakan her hediyeden **pahalı olmalı** (sizin kuralınız: "su boktan
  daha pahalı olmalı"). Bozan kayıt reddedilir, iki yönde de: "Su izi temizlediği için onu bırakan hediyelerden pahalı
  olmalı: Kaka 999 jeton, bu 999 jeton." / "Kaka iz bıraktığı için onu temizleyen hediyelerden ucuz olmalı: Su 1.999
  jeton, bu 2.500 jeton."
- Kaka ve Su uygulamanın kendi hediyeleridir (`k1`, `k2`): adı, fiyatı, rafı ve kuralı panelden değiştirilir,
  "Orijinale dön" ile geri alınır. Kaka'nın kuralı kaldırılırsa düz hediye olur.

## Canlı ayar

Canlı ayarlar › **Profil izleri** › **Profil izi süresi (saat)**: varsayılan 24, en çok 168 (7 gün). Hediyenin kendi
süresi varsa o geçer. Konmuş izlerin bitişi değişmez. **0: profil izleri kapalı** (acil durdurma): Kaka ve Su düz
hediye olur, hiçbir iz görünmez, kapatma tercihi de bir şey reddetmez. Yeniden açılınca süresi dolmamış izler geri gelir.

## Eski uygulamalar (f9671d9)

- Eski APK'nın içinde Kaka ve Su yok (adı, resmi, fiyatı). Bu yüzden sunucu onları eski uygulamanın kataloğuna hiç
  koymaz (yeni uygulama `marks=1` ister). Eski APK'da Kutlama rafı bugünkü gibi boş kalır.
- Eski APK izleri çizmez, ama gönderdiği her hediye kurala uyar: eski APK'dan bir yönetici hediyesi iz bırakırsa iz
  kalır, kapatan kişiye gönderilemez (Türkçe hata cümlesiyle).
- Odada yeni APK'nın gönderdiği Kaka'yı eski APK göstermez (tanımadığı hediye); izin olduğu koltuk eski APK'da temiz
  görünür.
- Eski APK'da Gizlilik'te bu seçenek yok; eski APK kullanan kişi kapatamaz. Yeni APK dağıtılınca Canlı ayarlar ›
  Zorunlu sürüm yükseltilebilir.
- Panel Kaka'nın fiyatını değiştirirse fiyat göndermeyen (eski) uygulamalar güncellemeye yönlendirilir; Kaka zaten
  eski uygulamada görünmediği için bu yalnız kuramsal.

## Neler iz bırakmaz

Yalnız jetonla gönderilen hediye (Hediye gönder, profil ve sohbetten hediye) iz bırakır ve temizler. **Çantam**'dan
(ödül hediyesi) ve **Şanslı çanta**'dan gelen Kaka düz hediyedir.

## Riskler (ayrıntı: [`DENETIM.md`](DENETIM.md))

- **Taciz:** herkese görünen bir "pislik" birini aşağılamak için kullanılabilir (Google Play "Zorbalık ve taciz"
  politikası), özellikle kadın yayıncılara. Azaltanlar: kişi kapatabilir (bir dokunuşla, izi de gider), iz 24 saatte
  kendiliğinden gider, engelleme izi kaldırır, yönetim izi kaldırır, Canlı ayarla bütün özellik kapatılır.
- **"Utancını parayla temizlet" görüntüsü:** temizlemek için başkasının para harcaması mağaza incelemesinde manipülatif
  bir ödeme düzeni gibi görülebilir. Panelde ve uygulamada "temizlemek için harca" diyen bir yönlendirme yok; kişi
  kendisi kapatabilir; iz zaten süreyle gider.
- Para açısından yeni bir akış yok: ikisi de normal hediye (bire bir elmas, ajans komisyonu).

## Teknik

- Sunucu: `server/api/profile-marks.mjs` (iz yazma, okuma, yönetim uçları), kurallar `profile-mark-rules.mjs`, tablo
  `migrations/101_profile_marks.sql` (`profile_marks`; `custom_gifts` `mark_role`, `mark_kind`, `mark_hours`;
  `privacy_settings.profile_marks`).
- İz hediyenin kendi işleminde yazılır: iki kişinin satırı kilitlendikten sonra, jeton oynamadan önce; aynı istek
  tekrarlanırsa iz yeniden yazılmaz. Aynı anda iki Su gelirse biri temizler, öteki düz hediye olur.
- Okuma: `GET /api/user` `marks` (kendi profilimde kim bıraktığı da), odadaki herkesin görünümü (`/api/looks`
  `marks` ve izi kapatanlarda `noMarks`), odadaki hediye paketi `mark`. Oda okuması (`/api/room`) değişmedi.
- Uygulama: `app/src/lib/profile-marks.ts` (kurallar, cümleler), `lib/mark-store.ts`, `lib/live/marks-live.ts`,
  `components/profile-mark.tsx`; resimler `app/scripts/mark-art.py` ile çizildi (`assets/gifts/*/hediye-kaka.png`,
  `hediye-su.png`, `assets/marks/kaka-iz.png`, `su-sicrama.png`).
- Testler: `server/api/test/profile-marks.test.mjs`, `app/tests/profile-marks.test.ts`, `server-catalog.test.ts`.
- Veri kopyası (`GET /api/me/export`) `profileMarks`: üstüme bırakılan ve benim bıraktığım izler. Hesap silinince
  üstündeki izler silinir, başkasına bıraktıkları adsız kalır.
