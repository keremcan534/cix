# Çarşı ve Çantam

Sahibin isteği (17 Kasım): Çarşı (mağaza) sattığımız her şeyin olduğu yer. Çarşı'dan alınan her şey kişinin kendi
çantasına, **Çantam**'a gider. Çantam'a ayrıca etkinliklerden ve uygulamadaki başka işlerden kazanılan çerçeve, giriş
efekti, sohbet balonu, ses dalgası gibi eşyalar da gelir. Binek giriş efektiyle birleşir (Çarşı'da da).

Sahibin kararları:

- **Binek:** ayrı sekme yok; Giriş efektleri sekmesinde durur. Bir giriş efekti ve bir binek **birlikte** takılabilir.
- **Çantam'ın yeri:** Profil › Çantam, ayrı bir ekran.
- **Çantam'a ne gelir:** Çarşı'dan alınanlar, yetkili hediyesi, etkinlik ödülü, görev ödülü, seviye ve VIP ödülü.

Yapılış sırası: 1) Çantam, Çarşı ve ortak ödül yolu, 2) seviye ve VIP ödülleri (bu belge, yapıldı), 3) etkinlik
ödülleri, 4) görev ödülleri.

## Uygulamada

- **Çarşı** (önceki adı Mağaza): sekmeler Çerçeveler, Giriş efektleri, Sohbet balonları, Ses dalgaları… Binek sekmesi
  kalktı; binekler Giriş efektleri sekmesinde, "Binek" yazısıyla.
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

Panelde **Seviye ve VIP › Seviye ödülleri** (yetki: `app.levels`, Seviyeler ve VIP ile aynı).

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

## Eski APK'lar

- Eski uygulamada Çantam ekranı yok; Mağaza'sında Binek sekmesi durur, "Mağaza" adıyla.
- Eski uygulama çantayı sunucudan okumaz, bu yüzden seviye ödüllerini güncelleyince alır. Yetkilinin verdiği eşyayı
  da (önceden olduğu gibi) "sahip" göstermez; yeni APK gösterir.

## Veri

- `level_rewards` (ödüller; silinen satır geçmiş için kalır, `deleted_at`) ve `level_reward_claims` (kim hangi
  ödülü aldı ya da alamadı). İkisi de kişinin veri kopyasına girmez; verilen eşya zaten `entitlements` ile girer
  (`my-data.mjs`, kaynağı ve `origin`'iyle).
- Göç: `085_bag_rewards.sql`.
