# Şeffaf video (alfa video) — kavram kanıtı (POC)

Bu belge, odanın üstünde arkası görünen (şeffaf) video oynatma denemesini anlatır. Fizibilite raporunun önerdiği
**yöntem D** uygulandı: tek bir H.264 MP4, telefonun donanım çözücüsüyle açılır ve GPU'da birleştirilir.

POC'nin amacı yalnızca **ölçmek**: hangi telefonda, hangi çözünürlük/FPS ile, aynı anda kaç video akıcı oynuyor.
Canlı oda, hediye sistemi ve oda sesi **değişmedi**; deneme yalnızca yöneticilere açık bir test panelinden yapılır.

> **Şimdiki durum:** yöntem D canlı odada kullanılıyor (videolu hediyeler ve Ejderha girişi, `app/src/components/fx/video-fx.tsx`).
> Klipler uygulamaya gömülmez: sunucudan iner ve telefonda saklanır (`server/api/fx.mjs`, `app/src/lib/fx-videos.ts`;
> ayrıntı `docs/SUNUCU.md` › `GET /api/fx/<ad>.mp4`). Böylece her yeni hediye videosu APK'yı ve OTA güncellemelerini büyütmez.

## 1. Biçim (stacked top/bottom)

| | |
|---|---|
| Kapsayıcı / kodek | MP4, H.264 (Main profil), `yuv420p`, BT.709, TV aralığı, `+faststart` |
| Kare düzeni | **Üst yarı:** renkli görüntü (düz, ön-çarpılmamış renk). **Alt yarı:** alfa maskesi, gri tonlu (beyaz = tam görünür, siyah = tam şeffaf, ara griler yarı saydam) |
| Boyut | Kodlanan yükseklik = 2 × görünen yükseklik. 720p görüntü → 1280×1440; 1080p görüntü → 1920×2160 |
| Ses | Yok (`-an`). Videolar her zaman sessiz oynatılır |
| Seviye | 720p yığın: H.264 seviye 4.0 (`-refs 3`). 1080p yığın: seviye 5.0 (kare 1920×2160, 4.x sınırını aşar) |

Uygulamada birleştirme:

- **Android** (`app/modules/similar-alpha-video/android`): `MediaPlayer` → `SurfaceTexture` (`GL_TEXTURE_EXTERNAL_OES`)
  → ayrı bir GL iş parçacığında OpenGL ES 2.0 → saydam (`setOpaque(false)`) `TextureView`. Gölgelendirici renk için
  (u, v·0,5), alfa için (u, 0,5 + v·0,5) noktasını okur (yukarıdan aşağı koordinatla), alfayı maskenin parlaklığından
  alır ve **ön-çarpılmış** renk verir. Görüntü kutuya en-boy oranı korunarak sığdırılır. Ek Gradle bağımlılığı yok.
- **iOS** (`app/modules/similar-alpha-video/ios`): `AVPlayer` + `AVPlayerLayer` (BGRA piksel arabellekleri, şeffaf
  arka plan), `AVMutableVideoComposition(asset:applyingCIFiltersWithHandler:)` ile üst yarı renk, alt yarı maske
  (`CIFilter.blendWithMask`, şeffaf görüntünün üstüne), çıktı yarı yükseklikte. **Derlenmedi, denenmedi** (aşağıya bak).
- **Web:** video yok; aynı boyutta boş, saydam bir kutu çizilir (web sürümü ve testler bozulmaz).

### Üretim hattı: `app/scripts/alpha-stack.sh`

Herhangi bir RGBA kaynaktan bu biçimi üretir (ffmpeg gerekir):

```bash
app/scripts/alpha-stack.sh kaynak.mov cikti.mp4 --height 720 --fps 30          # ProRes 4444
app/scripts/alpha-stack.sh kareler/%05d.png cikti.mp4 --fps 24 --height 1080   # PNG dizisi
app/scripts/alpha-stack.sh kaynak.webm cikti.mp4 --crf 22                      # VP8/VP9 alfa WebM
# --premultiplied: kaynağın renkleri alfayla çarpılmışsa (bazı After Effects çıktıları) önce düzeltir
```

İpucu: kaynakta tamamen şeffaf piksellerin rengi siyah yerine kenardaki renge yakın olursa (ör. parıltının rengi),
yumuşak kenarlarda koyu hale oluşmaz. Test klibi bu yüzden parıltı renginde (camgöbeği) saydam bir tuvalde üretildi.

### Cila: `app/scripts/fx-polish.py`

Hediye ve giriş videoları sunucuya konmadan önce bundan geçer (Python 3, numpy, Pillow, ffmpeg). İki şeyi düzeltir:

- **Sis:** siyah zeminli videodan parlaklıkla kesilen kliplerde zemin tam siyah değilse (gece şehri, yer, sis), o bölge
  yarı saydam soluk bir tabaka olarak kalır; oda üstünde gri-beyaz bir blok ya da hale gibi görünür ("sönük arka plan").
  Soluk (renksiz), düzgün ve yarı saydam alanlar silinir; nesnenin kendisi, kıvılcımlar, alevler ve renkli parıltılar kalır.
- **Kesik kenarlar:** çerçevenin kenarına değen her şey (roketin alevi, sarayın merdiveni, ejderhanın kanadı) düz bir
  çizgiyle biterdi; 9:16'dan uzun telefonlarda video ekranın içinde durduğu için bu çizgi görünür (çoğu zaman altta).
  Saydamlık dört kenarda yumuşakça sıfıra iner (yanlar %7, üst %6, alt %9).

```bash
python3 app/scripts/fx-polish.py kaynak.mp4 server/api/fx/ad.mp4 --strength 1
```

`--strength`: 0 sisi bırakır (efekte ait yumuşak ışık: Kristal Saray'ın kuzey ışığı, Hazine Sandığı'nın parlaması),
1 ince tabakaları alır, 2 yoğunları da (klibe gömülü bir arka plan: Altın Süper Otomobil). Renk yarısı değişmez, ses
kopyalanır. Şu anki klipler: 2 → altin-super-otomobil, altin-gemi, efsanevi-tek-boynuz; 1 → altin-aslan, kraliyet-taci,
roket, ejderha, anka-kusu; 0 → kristal-saray, hazine-sandigi, sevimli-panda, tatli-ayicik, pirlanta-yuzuk.

Sınırı: nesneyle aynı parlaklıkta, tamamen opak bir parıltı bloğu (Kraliyet Tacı'nın, Altın Gemi'nin ve Efsanevi Tek
Boynuz'un arkasındaki ışık) maskede nesneden ayrılamaz. Bunlar için en iyisi kaynağın arka plansız (saydam ProRes 4444,
alfa WebM ya da PNG dizisi) ya da tam siyah zeminli halidir; o zaman `alpha-stack.sh` ile yığılıp bununla cilalanır.

### Test klipleri (`app/assets/video/alpha-test/`)

7 saniyelik, soldan sağa giden, hafifçe zıplayan bir araba ("TEST ARAÇ" yazılı, yuvarlak köşeli gövde, tekerlekler)
ve çevresinde yarı saydam camgöbeği bir parıltı (kısmi alfanın görünmesi için). ffmpeg ile çizildi.

| Dosya | Görünen | Kodlanan | FPS | Boyut |
|---|---|---|---|---|
| `alpha_720p24.mp4` | 1280×720 | 1280×1440 | 24 | 99 KB |
| `alpha_720p30.mp4` | 1280×720 | 1280×1440 | 30 | 117 KB |
| `alpha_1080p24.mp4` | 1920×1080 | 1920×2160 | 24 | 142 KB |
| `alpha_1080p30.mp4` | 1920×1080 | 1920×2160 | 30 | 189 KB |

Not: bu klipler sade çizimler olduğu için çok küçük. Gerçek bir hediye animasyonu (doku, parçacık) aynı sürede
birkaç MB tutar; dosya boyutunu gerçek içerikle ayrıca ölç.

## 2. Testi çalıştırma

1. CI'nin ürettiği APK'yı kur (bu değişiklik `app/modules/**` içerdiği için PR'da Android derleme kontrolü çalışır).
2. Yönetici hesabıyla gir → **Ayarlar** → Hesap bölümünde **Yönetim**'in altındaki **"Şeffaf video testi (POC)"**.
   - Canlı sürümde satır yalnızca sunucunun `admin` rolü verdiği hesaplarda görünür (moderatörlerde görünmez).
   - Sunucusuz demo sürümde, diğer demo yönetim araçları gibi görünür.
3. Panelde:
   - Üstte sahte bir oda: koyu sahne, 8 koltuk (baş harfler, mikrofon simgesi; koltuğa dokununca mikrofon değişir) ve
     kaydırılıp dokunulabilen bir sohbet listesi. Videolar bunların üstünde, tam genişlikte ve dokunmaları geçirir
     (`pointerEvents="none"`): video oynarken sohbeti kaydırabilmeli, mesajlara dokunabilmelisin.
   - **Başlat / Durdur / Tekrar oynat / Temizle** (Temizle videoları kaldırır; oynatıcı, dokular ve EGL serbest kalır).
   - **Çözünürlük · FPS:** 4 klip. **Aynı anda:** 1 / 3 / 5 video (her biri biraz kaydırılmış).
   - **Kaynak:** *Paketten* (APK'daki dosya) ya da *Önbellekten oynat* (dosya önce önbellek klasörüne kopyalanır,
     sonra `file://` adresinden oynatılır; internet gerekmez).
   - **Döngü açık / Bir kez.**
   - Sağ altta ölçümler: JS FPS (requestAnimationFrame ile), montaj → hazır (onReady) süresi, oynayan/biten/hata
     sayısı, bellek (Android'de Java ve native heap; Hermes'te JS heap), sohbete dokunma sayısı.
4. **Sesli oda açıkken:** panel LiveKit başlatmaz. Bir sesli odada konuşurken paneli açıp videoyu oynat; yalnızca
   bizim videomuzun sessiz kaldığını ve odadaki sesin kesilmediğini/değişmediğini kontrol et.

## 3. Cihaz test listesi (sahibi dolduracak)

Her satır bir deneme. "Akıcı": takılma, kare atlama, yırtılma yok. FPS: paneldeki JS FPS (video oynarken).

| Cihaz ve model | Android / iOS sürümü | Varyant | Aynı anda | Akıcı (evet/hayır) | FPS | Çökme | Ses etkileşimi | Notlar |
|---|---|---|---|---|---|---|---|---|
| | | 720p · 24 | 1 | | | | | |
| | | 720p · 30 | 1 | | | | | |
| | | 1080p · 24 | 1 | | | | | |
| | | 1080p · 30 | 1 | | | | | |
| | | 720p · 30 | 3 | | | | | |
| | | 720p · 30 | 5 | | | | | |
| | | 1080p · 30 | 3 | | | | | |
| | | 1080p · 30 | 5 | | | | | |
| | | 720p · 30 (önbellekten) | 1 | | | | | |
| | | 720p · 30 (sesli odadayken) | 1 | | | | | |

Ayrıca bak: kenarlar yumuşak mı (koyu hale yok), parıltının arkasında oda görünüyor mu, Temizle'den sonra bellek
geri iniyor mu (birkaç kez Başlat → Temizle), uygulama arka plana alınıp dönünce çökme var mı.

## 4. Bilinen sınırlamalar

- **iOS hiç derlenmedi ve denenmedi.** iOS uygulaması daha önce hiç derlenmedi; Mac ve Apple hesabı yok. Swift kodu
  dikkatle yazıldı ama derleme hatası, alfa eğrisi (Core Image doğrusal renk uzayında çalışır; maske bu yüzden
  `CILinearToSRGBToneCurve` ile düzeltiliyor) ve `AVPlayerLayer`'ın saydamlığı cihazda doğrulanmalı.
- **Android de bu ortamda derlenmedi**; ilk doğrulama CI'nin Android derleme kontrolü ve gerçek cihaz testidir.
- **1080p yığın (1920×2160) H.264 seviye 5.0 ister.** Bazı düşük/orta segment telefonların donanım çözücüsü en çok
  1920×1088 kare açar; bu cihazlarda 1080p varyantı hata verebilir (onError). Gerekirse üretimde 720p ya da daha
  küçük bir görüntü (ör. dikey 540×960 → kodlanan 540×1920) kullanılmalı.
- Aynı anda birden fazla video = aynı anda birden fazla donanım çözücü. Telefonların çözücü sayısı sınırlıdır
  (çoğunda 2–8 arası); 5 video bazı cihazlarda hata verebilir — testin ölçtüğü şeylerden biri bu.
- 4:2:0 renk alt örneklemesi ve doğrusal süzme, keskin kenarlarda 1 piksellik hafif renk karışmasına yol açabilir.
  Renk ve maske yarısı arasındaki dikiş, gölgelendiricide yarım piksel içeriden okunarak önlendi.
- Ses: videolar sessiz (`muted` varsayılan true, klipte ses izi yok). `MediaPlayer` ses odağı istemez; yine de sesli
  oda açıkken test edilmeli.
- Web'de video oynatılmaz (yalnızca düzen ve kontroller).
- JS FPS, JS iş parçacığının akıcılığını ölçer; videonun kendi kare hızını değil (video GL iş parçacığında çizilir).
- Görünüm ekrandan ayrılıp geri gelirse (yüzey yeniden oluşursa) video baştan başlar.
- Paket boyutu: 4 test klibi toplam ~0,6 MB ekler. Üretimde klipler sunucudan indirilip önbellekte tutulmalı.
