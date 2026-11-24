# DJ modu (mikserden canlı yayın)

Sahiplerin isteği (24 Kasım 2026): odada DJ kontrol cihazları çalışsın. Karar: **mikserden canlı yayın**, açabilenler
**odanın sahibi ve odanın DJ'leri**.

## Ne yapar

DJ, mikserini ya da DJ kontrolcüsünü telefona bağlar (USB-OTG ses kartı, USB ses çıkışı olan bir kontrolcü ya da
mikserin çıkışından telefonun mikrofon girişine kablo). Odada **Menü › DJ modu** açılır, giriş seçilir, **Mikserden
canlı yayını başlat**. O andan itibaren DJ'in mikrofonu:

- gürültü engelleme, yankı giderme, otomatik ses ayarı ve yapay zekâ gürültü temizleme **kapalı** gider (müzik bozulmaz);
- konuşmanın ~32 kbps'i yerine **müzik kalitesinde** gider (Canlı ayarlar `dj_live_kbps`, varsayılan 96 kbps);
- seçilen girişten alınır (Android: USB ses kartı / hat girişi / kablolu giriş / telefonun mikrofonu; ses kartı takılınca
  listede kendiliğinden görünür ve seçilir). Tarayıcıdan (web) bağlanan DJ'in stereo mikseri stereo gider.

Odadaki herkes üstte **🎧 Canlı DJ: ad** şeridini görür.

## Kurallar

- Açabilen: oda sahibi ve odanın DJ'leri. Yöneticiler açamaz (yöneticiler DJ yapılamıyor; isterseniz eklenebilir).
- Mikrofonda olmak gerekir. Mikrofondan inen, odadan çıkan DJ'in modu kendiliğinden kapanır.
- Oda sahibi birini DJ'likten alırsa ya da yönetici yaparsa, o kişinin DJ modu o anda kapanır.
- Bir odada aynı anda en çok `dj_live_per_room` kişi (varsayılan 1): her DJ yayını her dinleyiciye ayrı bir müzik akışıdır.
- Yönetim `dj_live_kbps`'i 0 yaparsa DJ modu kimse için açılmaz.
- Odanın çalma listesi (dosyadan müzik) ayrı bir şeydir, aynen çalışır; DJ'e "çalma listesini durdur" diye hatırlatılır.

## Bağlı sonuçlar

- **Ses sunucusunun trafiği:** 96 kbps × dinleyici sayısı. 200 kişilik odada tek DJ ≈ 19 Mbit/sn çıkış. Tek sunucu (1 çekirdek)
  bunu kaldırır ama çok sayıda DJ odası aynı anda açılırsa `dj_live_kbps` düşürülebilir (64 kbps de müzik için iyidir).
- **Telif:** odada müzik çalmak kamuya açık yayındır (MESAM/MSG ve MÜYAP/MÜYORBİR lisansları). Uygulama DJ'e "yalnızca yayın hakkın olan
  müziği çal" der; lisans sahiplerin kararıdır (`YAYIN_HAZIRLIGI.md`).
- **Kulaklık:** yankı giderme kapalı olduğu için DJ odayı hoparlörden dinlerse ses yayına karışır; ekranda yazar.
- **Eski APK:** DJ modu düğmesi yoktur; odadaki DJ'i yine duyarlar (ses normal ses akışıdır), yalnızca şeridi görmezler.
- **Telefon stereo:** telefonların ses motoru mono kayıt yapar; telefondan DJ yayını mono gider (yüksek kalitede). Telefonda
  stereo için ses motorunun uygulama açılışında stereo kurulması gerekir; bu herkesin konuşma sesini etkileyebileceği için
  gerçek cihazda denenmeden yapılmadı.
- **Bluetooth giriş:** listede görünür ama önerilmez (gecikir, sesi sıkıştırır).
- Telefonda denenmeli: USB ses kartıyla giriş seçimi (`modules/similar-dj-input`) yeni APK'da gelir.

## Teknik

- Sunucu: `server/api/dj-live.mjs` — `GET /api/rooms/dj-live?room=`, `POST /api/rooms/dj-live {room, on}`. Açınca LiveKit'te
  kişinin `dj` özniteliği `"1"` yazılır, kapanınca `""`. Bir telefon kendi özniteliğini yazabildiği için sayımda ve şeritte
  yalnızca sahip ve DJ'ler sayılır.
- Uygulama: `lib/live/dj-live.ts` (cevap okuma, durum), `lib/livekit-engine.ts` `setDjMode` (yeni mikrofon izi: ham kayıt,
  `audioPreset.maxBitrate`, DTX ve RED kapalı; web'de stereo), `components/room/dj-live.tsx` (ekran ve şerit),
  `modules/similar-dj-input` (Android giriş listesi ve tercih edilen giriş, WebRTC ses modülüne yansıma ile).
- Canlı ayarlar › Odalar: `dj_live_kbps` (0–192, 0 kapalı), `dj_live_per_room` (1–4).
