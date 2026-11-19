# Çarşı ve Çantam

Sahibin isteği (17 Kasım): Çarşı (mağaza) sattığımız her şeyin olduğu yer. Çarşı'dan alınan her şey kişinin kendi
çantasına, **Çantam**'a gider. Çantam'a ayrıca etkinliklerden ve uygulamadaki başka işlerden kazanılan çerçeve, giriş
efekti, sohbet balonu, ses dalgası gibi eşyalar da gelir. Binek giriş efektiyle birleşir (Çarşı'da da).

Sahibin kararları:

- **Binek:** ayrı sekme yok; Giriş efektleri sekmesinde durur. Bir giriş efekti ve bir binek **birlikte** takılabilir.
- **Çantam'ın yeri:** Profil › Çantam, ayrı bir ekran.
- **Çantam'a ne gelir:** Çarşı'dan alınanlar, yetkili hediyesi, etkinlik ödülü, görev ödülü, seviye ve VIP ödülü.

Yapılış sırası: 1) Çantam, Çarşı ve ortak ödül yolu, 2) seviye ve VIP ödülleri, 3) etkinlik ödülleri, 4) görev
ödülleri (hepsi yapıldı).

## Uygulamada

- **Çarşı** (önceki adı Mağaza): sekmeler Çerçeveler, Giriş efektleri, Sohbet balonları, Ses dalgaları… Binek sekmesi
  kalktı; binekler Giriş efektleri sekmesinde, "Binek" yazısıyla.
- **Çerçeve önizlemesi** (Güncelleme 7, `app/src/components/frame-preview.tsx`): Çerçeveler sekmesinde kartın
  "Önizle" düğmesi ya da çerçevenin resmi bir sayfa açar; çerçeve kişinin kendi fotoğrafıyla üç şekilde görünür:
  - **büyük**: hareketli çerçeve oynar ("Hareketi azalt" ve "Düşük veri modu" açıkken durur, odadaki gibi);
  - **odada mikrofonda**: odanın kendi ölçüleriyle (bu telefonda on mikrofonlu dolu bir odanın koltuğu, koltuğun
    hücresi; `lib/frame-preview`, `lib/seat-cell`), adı koyu kapsülde, yanında boş koltuklar. Geniş bir çerçeve
    koltukta küçülür; burada da öyle görünür, yani başkalarının mikrofonda göreceği budur;
  - **profilde**: profil başlığındaki boyda.

  Uygulamanın çerçeveleri, panelden eklenenler (`frameArtOf`), çizimle yapılanlar ve renk halkaları odadaki aynı yoldan
  (`FramedAvatar`) çizilir; VIP rozeti de görünür. Altındaki düğme Çarşı'nınki: fiyat (onay sorulur, gösterilen fiyat
  gider), Kullan / Çıkar ya da VIP kilidi. Önizleme hiçbir şey satın almaz, takmaz, sunucuya bir şey göndermez. Eski
  APK'lar kartın küçük resmini gösterir.
- **Çantam** (Profil › Çantam): sekmeler **Hediyeler**, **Çerçeveler**, **Giriş efektleri** (binekler dahil),
  **Sohbet balonları**, **Ses dalgaları**. Her eşyada:
  - ne kadar kaldığı: "Kalıcı", "12 gün kaldı", "Bugün bitiyor";
  - nereden geldiği: "Çarşı", "Yetkili hediyesi", "Seviye ödülü · VIP 5", "Etkinlik ödülü · (etkinliğin adı)",
    "Görev ödülü";
  - **Kullan** / **Çıkar**: Çarşı'dakiyle aynı yere takılır.

  Hediyeler sekmesi görev ve ödüllerden gelen ücretsiz hediyelerdir; bir odada hediye panelinin Çantam rafından
  gönderilir. Boş sekmede "Çarşı'ya git" düğmesi çıkar.
- Çantam sunucudan okunur: girişte ve Çantam her açıldığında. Önceden uygulama sahip olunan eşyaları yalnız kendi
  telefonunda tutuyordu; başka telefonda alınan ya da yetkilinin verdiği eşya görünmüyordu. Artık sunucudaki her eşya
  telefonun listesine de eklenir; Çarşı ve odalar onları tanır.
- Ödül eşyası kendiliğinden takılmaz: Çantam'a gelir, kişi "Kullan" der.

## Sunucuda: tek ödül yolu

Bütün kaynaklar aynı yoldan verir (`economy.mjs` `grantReward`):

- Ücretsizdir (fiyat 0); `entitlements` satırı olarak yazılır, kaynağı (`source`: `event`, `task`, `level`) ve
  nereden geldiğinin kısa adıyla (`origin`, en çok 60 harf: "VIP 5", etkinliğin adı).
- Her ödülün bir kimliği var (`ref`); aynı ödül bir kişiye iki kez verilmez (aynı anda iki istek gelse de).
- Süreli eşya kişide zaten varsa süresi uzar (gün eklenir; bugünden en fazla 365 gün ileri). Süresiz eşya zaten
  varsa yeniden verilmez.
- Verilebilen eşyalar: çerçeve, giriş efekti, binek, sohbet balonu, ses dalgası (ileride mikrofon efekti ve çıkartma
  paketi de olabilir). Jeton, elmas ya da para ödül olarak bu yoldan verilmez.
- `GET /api/economy` her eşyanın kaynağını (`source`) ve varsa `origin`'ini gönderir. Eski APK bu alanları görmez.

## Seviye ve VIP ödülleri

Panelde **Seviye ve VIP › Seviye ve görev ödülleri** (yetki: `app.levels`, Seviyeler ve VIP ile aynı).

- Bir ödül: seviye sistemi (VIP, Cömertlik ya da Yankı), seviye, eşya ve isteğe bağlı gün (boş: eşyanın Çarşı'daki
  süresi; Çarşı'da süresiz olan eşyaya gün verilmez). Bir seviyeye birden çok eşya konabilir.
- **Ne zaman verilir:** kişinin çantası okununca (uygulamayı açınca, Çantam'ı açınca). O seviyede ya da üstünde olan
  herkes alır; **ödül eklendiğinde seviyeyi çoktan geçmiş olanlar da** bir sonraki açışta alır. Örneğin "VIP 1 →
  çerçeve" eklenirse VIP'i olan herkes alır.
- Her kişi bir ödülü **bir kez** alır. Seviyesi düşüp yeniden çıkan ikinci kez almaz; seviye düşünce ödül geri
  alınmaz. Eşyayı zaten süresiz olarak elinde tutan kişiye yeniden verilmez (panelde "verilen" sayısına girmez).
- **Kaldırma:** kaldırılan ödülü bundan sonra kimse almaz; verilmiş olanlar çantalarda kalır. Gerekirse tek tek
  **Hediye ve mağaza › Mağaza eşyaları (kişiye)** sayfasından geri alınır.
- Panel her ödülün kaç kişiye verildiğini gösterir. Ekleme ve kaldırma uygulamanın denetim kaydına yazılır
  (`level_reward.create`, `level_reward.delete`; panelde `app.level-rewards`).
- **Mağaza eşyaları (kişiye)** sayfası artık her eşyanın nereden geldiğini de yazar (satın aldı, yönetim verdi,
  seviye ödülü · VIP 5, etkinlik ödülü, görev ödülü).

## Etkinlik ödülleri

Panelde **Duyuru ve etkinlik › Etkinlikler** › etkinliğin satırında **Ödül** (yetki: `app.events`). Etkinlik sürerken
odaya giren herkes, etkinlik bitince eşyayı Çantam'ında bulur ("Etkinlik ödülü · etkinliğin adı"), bir kez. Oda sahibi
ödül bağlayamaz. Ayrıntı: [`ETKINLIK_MERKEZI.md`](ETKINLIK_MERKEZI.md) › Katılım ödülü.

## Görev ödülleri

Panelde **Seviye ve VIP › Seviye ve görev ödülleri** › **Görev** sekmesi (yetki: `app.levels`).

- Sunucuda sayılan tek görev bugün günlük **"1 görüntülü arama yap"** (diğer görevler telefonda sayılıyor; onlar
  sunucuya taşınınca bu listeye eklenir).
- Görevi tamamlayıp ödülünü alan, jeton ödülü ve çanta hediyesiyle birlikte eşyayı da Çantam'ında bulur ("Görev
  ödülü · Günlük görüntülü arama"). Görevler ekranında görevin satırında eşyanın adı görünür.
- Günlük görev her gün verir: süreli eşyanın günü her seferinde eklenir. **1 gün önerilir**: görevi her gün yapan
  eşyayı hep kullanır, bırakınca biter. Süresiz eşya bir kez verilir.
- Aynı gün ikinci kez alınmaz. Kaldırılan ödül bundan sonra verilmez; verilmiş olanlar kalır.

## Eski APK'lar

- Eski uygulamada Çantam ekranı yok; Mağaza'sında Binek sekmesi durur, "Mağaza" adıyla.
- Görev ödülü eski APK'da da verilir (görevin ödülünü aldığında); eski APK eşyayı göstermez.
- Eski uygulama çantayı sunucudan okumaz, bu yüzden seviye ödüllerini güncelleyince alır. Etkinlik ödülü eski APK'da
  da verilir (etkinlik bitince sunucu verir); eski APK onu göstermez, güncelleyince Çantam'da görünür. Yetkilinin verdiği eşyayı
  da (önceden olduğu gibi) "sahip" göstermez; yeni APK gösterir.

## Veri

- `level_rewards` (ödüller; silinen satır geçmiş için kalır, `deleted_at`) ve `level_reward_claims` (kim hangi
  ödülü aldı ya da alamadı). İkisi de kişinin veri kopyasına girmez; verilen eşya zaten `entitlements` ile girer
  (`my-data.mjs`, kaynağı ve `origin`'iyle).
- Etkinlik ödülü `events` satırında (`reward_sku`, `reward_days`, kim bağladı, kaç kişiye verildi); verilen eşya
  `entitlements`'ta `event:<etkinlik>` kimliğiyle.
- `task_rewards` (görev ödülleri; silinen satır kalır). Verilen eşya `entitlements`'ta `task:<günün kimliği>:<ödül>`
  kimliğiyle.
- Göç: `085_bag_rewards.sql`, `086_event_rewards.sql`, `087_task_rewards.sql`.
