# Varlık kaynakları

Uygulamada kullanılan görsellerin, seslerin, yazı tipinin ve kütüphanelerin nereden geldiğini kayıt altına alır. Mağaza yayınından önce her satırın "Durum" sütunu "doğrulandı" olmalı (bkz. [YAYIN_HAZIRLIGI.md](YAYIN_HAZIRLIGI.md) madde 13).

## 1. Sahne fotoğrafları (`app/assets/bg/`)

`app/src/components/fx/scenes.ts` ve a88a234 numaralı commit, bu on fotoğrafın Unsplash'ten, ücretsiz Unsplash Lisansı ile alındığını ve 900×1600 boyutuna kırpıldığını söylüyor. Fotoğraf başına bağlantı ya da fotoğrafçı adı kaydedilmemiş, dosyaların EXIF bilgisinde de kaynak yok.

| Dosya | Kaynak | Fotoğrafçı | Durum |
| --- | --- | --- | --- |
| `sahne-aile.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-ana-sayfa.jpg` | Unsplash, [Milky way and mountains reflected in a serene lake](https://unsplash.com/photos/milky-way-and-mountains-reflected-in-a-serene-lake-HUYPJupBvwE) (26 Kasım 2026'da indirildi, 2400×1600'ün ortasından 900×1600 kesildi; Unsplash Lisansı: ticari kullanım serbest, kaynak gösterme zorunlu değil) | Pascal Debrunner | doğrulandı |
| `sahne-cuzdan.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-giris.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-kesfet.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-magaza.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-mesajlar.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-oyun-merkezi.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-seviye.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-vip.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |

Yapılacak: her fotoğrafı Unsplash'te bulup bağlantısını ve fotoğrafçısını tabloya yazmak. Bulunamayan fotoğraf kendi çekimimiz ya da lisansı belli bir görselle değiştirilmeli. Unsplash Lisansı atıf istemez ama kaynak kaydı ileride doğabilecek bir itirazda tek kanıtımız olur.

## 2. Yapay zekâyla üretilen görseller

Aşağıdaki görseller yapay zekâ araçlarıyla bu proje için üretildi. Yayından önce kullanılan aracın ticari kullanım koşulları okunmalı, üretim tarihi ve hesap bilgisi saklanmalı.

| Varlık | Araç | Commit (tarih) | Not |
| --- | --- | --- | --- |
| `assets/brand/logo.png` (marka işareti) | Sahiplerin 2026-11-19'da gönderdiği yeni logo (araç yazılmalı) | 2026-11-19 | Lacivert kareden şeffaf işaret olarak çıkarıldı (parlama yumuşak saydamlık). Uygulama ikonları `scripts/app-icons.py` ile bu dosyadan üretiliyor. Önceki logo: ChatGPT, d62c790 (2026-11-01). |
| `assets/art/` (185 ikon, 192 px) | ChatGPT | 5ec27cc (2026-10-28) | |
| `assets/icons/` | ChatGPT | 3ba3278 (2026-10-26) | Tek bir üretilmiş paftadan kesildi. |
| `assets/frames/` (profil çerçeveleri) | ChatGPT | 2858a8f (2026-10-26) | |
| Hediyeler, efektler, tepkiler | ChatGPT | 54a5e65 (2026-10-27) | [GORSEL_URETIM_LISTESI.md](GORSEL_URETIM_LISTESI.md) bölüm 1–3. |
| Mağaza görselleri | ChatGPT | e133f61 | |
| Oda görselleri | ChatGPT | 9966c82 | Planı: [ODA_GORSEL_LISTESI.md](ODA_GORSEL_LISTESI.md). |

Teslim paketleri: `SimilarClub_04_3D_20_DOGRULANMIS_TASLAK.zip` ve `SimilarClub_DUZELTME_04_TAM_05_ILK40_69_PNG_Claude.zip` (01–12 klasörleri). Bu paketler depo dışında, değişmeden saklanmalı.

Bölüm 5'in 41–55. maddeleri ile 6–12. bölümlerdeki taslaklar Font Awesome 4 (SIL OFL 1.1) siluetlerinden otomatik üretildi ve uygulamaya bağlı değil. Kullanılacaklarsa OFL koşulları (lisans metnini birlikte dağıtmak) geçerli olur; tercihen yeniden çizilmeli.

Dosya adlarındaki eski adlar (ör. `oyun-lucky-77.png`, `lucky-*.png`) teslim kaydıdır; ekranda görünen adlar değişti, yeni çizimler yeni adlarla gelecek.

## 3. Yazı tipi

Plus Jakarta Sans, `@expo-google-fonts/plus-jakarta-sans` paketiyle gelir. Lisansı SIL Open Font License 1.1, telif sahibi "The Plus Jakarta Sans Project Authors". Lisans metni uygulamada Ayarlar › Açık kaynak lisansları ekranında gösteriliyor.

## 4. Kütüphaneler

Çalışma zamanı bağımlılıkları ve lisansları aynı ekranda listeleniyor. Liste `app/src/data/licenses.ts` dosyasında; bağımlılık değişince `app/` içinden `node scripts/licenses.mjs` ile yeniden üretilmeli. Şu an paketlerin çoğu MIT, `livekit-client` Apache-2.0.

## 4b. Oyun Salonu yazı tipi ve 3D jeton

- **Cinzel ve Cinzel Decorative** (telif: The Cinzel Project Authors; Decorative: Natanael Gama, ayrılmış ad "Cinzel"; yazı tiplerini değiştirmiyoruz), `@expo-google-fonts/cinzel` ve `@expo-google-fonts/cinzel-decorative` paketleriyle gelir. Lisans SIL Open Font License 1.1 (Plus Jakarta Sans ile aynı lisans): uygulamaya gömülerek ticari kullanılabilir, yazı tipi tek başına satılamaz. Oyun Salonu'nun kazanç yazıları ve düğme etiketleri. Durum: doğrulandı (paketlerin `LICENSE_FONT` dosyası OFL 1.1, 2026-11-24).
- **Ana sayfa gökyüzünün parıltısı** (`app/assets/fx/yildiz-parilti.png`, 26 Kasım 2026): dört kollu küçük yıldız, Python ile kodla çizildi. Dış kaynak yok. Durum: doğrulandı.
- **3D altın jeton ve yıldız parıltısı** (`app/assets/fx/coin-spin.png`, `sparkle-burst.png`): bizim çizimimiz. Jeton Blender'da modellenip çizildi (taç ve elmas bizim işaretimiz, kimsenin logosu değil); parıltı kodla üretildi. Dış kaynak yok. Durum: doğrulandı.

## 4c. Yörünge görselleri (`app/assets/games/yorunge/`)

**26 Kasım 2026'dan beri 3D (Blender):** roket (kendi ekseninde dönen 24 kare), motor alevi (16 karelik döngü), patlama (ateş ve duman simülasyonu, kıvılcım, kopan parçalar), duman, rampa, paraşüt, yakıt bidonu ve alttaki tuşlar Blender 5.3'te bizim betiklerimizle sıfırdan modellenip işlendi (`app/scripts/yorunge-3d/`, nasıl yeniden üretileceği oradaki README'de). Hazır model, doku ya da internetten alınmış görsel yok; Blender'ın kendi stüdyo ışık dosyaları (yalnız yansıma için, görüntüde görünmez) Blender'la birlikte gelir. Blender ile üretilen görselin hakları üretene aittir (GPL, programı bağlar, çıktısını değil). Durum: doğrulandı.

Uzay arka planı (`uzay.jpg`), gezegen (`gezegen.webp`) ve yeşil Kaç düğmesi (`kac-*.png`) ilk setten kaldı: roket, alev, patlama, duman, uzay, gezegen, rampa, yakıt bidonu, paraşüt ve Kaç düğmesi (25 Kasım 2026) OpenAI'nin görsel üretimiyle (Codex, `gpt-6.2-sol`) sıfırdan üretildi; Kızıl Yedi paketi yalnız stil örneği olarak verildi, hiçbir marka ya da bilinen oyun kopyalanmadı. Üretim istemleri ve tam boy asıllar sahiplerin bilgisayarında `oyun-gorselleri/yorunge-v2/` klasöründe (`PROMPT.md`, `RAPOR.md`; depoda değil); uygulamadakiler küçültülmüş kopyalardır. OpenAI'nin kullanım koşullarına göre üretilen görselin hakları kullanıcıya aittir; yayından önce şirket hesabıyla bu koşullar bir kez daha okunmalı. Durum: doğrulanmalı (avukat, mağaza öncesi).

## 5. Kişi fotoğrafları

Örnek kullanıcılar için gerçek yüz fotoğrafı kullanılmıyor. Mağaza derlemesinde (`EXPO_PUBLIC_DEMO=0`) örnek veride hiç dış görsel yok; demo derlemesinde oda kapakları ve anlar picsum.photos'tan rastgele manzara görselleridir.

## 6. Oyun sesleri (`app/assets/sfx/`)

27 kısa oyun sesinin 23'ü Kenney'in ses paketlerinden gerçek kayıt: `app/scripts/kenney-sfx.py` kayıtları kesip, üst üste koyup ses düzeylerini eşitliyor. Kalan 4'ü (`tease`, `turn`, `shot`, `splash`) kodla üretildi (`app/scripts/make-sfx.py`), lisans gerekmez; bu betik kayıtların üzerine yazmaz. Kenney paketleri CC0 (kamu malı): ticari kullanım serbest, isim vermek gerekmez. Paketler OpenGameArt'tan indirildi; depoda paketlerin kendisi değil, yalnız onlardan üretilen `.wav` dosyaları var. Yeniden üretmek için paketler bir klasöre açılır ve `app/` içinden `python scripts/kenney-sfx.py <klasör>` çalıştırılır (ffmpeg gerekir).

| Paket | Kaynak | Lisans | Kullanıldığı sesler | Durum |
| --- | --- | --- | --- | --- |
| Casino Audio (Kenney) | [opengameart.org/content/54-casino-sound-effects-cards-dice-chips](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) | CC0 | `chip`, `tick`, `card`, `dice`, `move`, `capture`; `stop` (makara durması) içindeki fiş; `coins` altındaki fişler | doğrulandı (sayfa ve paketteki lisans dosyası CC0, 2026-11-24). İlk kez kenney.nl'den alınmıştı; OpenGameArt'taki paket aynı dosyaları birebir veriyor. |
| 85 Short music jingles (Kenney) | [opengameart.org/content/85-short-music-jingles](https://opengameart.org/content/85-short-music-jingles) | CC0 | `win`, `win-big`, `jackpot`, `fanfare`, `levelup`, `lose`, `cashout` | doğrulandı (sayfa ve paketteki lisans dosyası CC0, 2026-11-24) |
| Sci-Fi Sounds (Kenney) | [opengameart.org/content/sci-fi-sounds](https://opengameart.org/content/sci-fi-sounds) | CC0 | `launch`, `boom`, `impact`, `riser`; `win-big`, `jackpot`, `levelup` içindeki darbe; `stop`, `spin`, `lever` içindeki metal gövde sesi | doğrulandı (sayfa ve paketteki lisans dosyası CC0, 2026-11-24) |
| 50 RPG sound effects (Kenney) | [opengameart.org/content/50-rpg-sound-effects](https://opengameart.org/content/50-rpg-sound-effects) | CC0 | `coin`, `coins`, `cashout`; `win-big` ve `jackpot` içindeki jetonlar; `lever` (kol çekme: mandal, tık, gerilen yay) ve `spin` içindeki mandal ve tıklar | doğrulandı (sayfa ve paketteki lisans dosyası CC0, 2026-11-24) |
| Interface Sounds (Kenney) | [opengameart.org/content/interface-sounds](https://opengameart.org/content/interface-sounds) | CC0 | `tap` (düğme basışı); `coin` ve `cashout` içindeki cam çınlaması | doğrulandı (sayfa ve paketteki lisans dosyası CC0, 2026-11-24) |
| 51 UI sound effects (Kenney) | [opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks](https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks) | CC0 | `spin` ve `lever` içindeki cırcır (makara dişlisi) tıkları | doğrulandı (OpenGameArt sayfası CC0; paketteki readme ticari kullanıma izin veriyor, 2026-11-24) |
