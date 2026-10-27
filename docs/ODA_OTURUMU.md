# Küçültülebilir Canlı Oda ve Oda Oturumu

Bu belge "Küçültülebilir Canlı Oda, Arka Plan Sesli Oturum ve Uygulama İçi Gezinme" şartnamesinin uygulamasını ve teslim raporunu (şartname §12) içerir. **Önce şunu bilmek gerekir:** uygulamada gerçek bir ses altyapısı yoktur. Odadaki ses ve mikrofon baştan beri simülasyondur (konuşma halkaları, mikrofon düğmesi). Bu çalışmada oturum yönetimi, küçültme, gezinme ve tüm hata durumları gerçek olarak kuruldu; ses motoru ise değiştirilebilir bir arayüzün arkasında **simülasyon** olarak kaldı. Gerçek ses ve arka plan sesi, bir ses sağlayıcısı (LiveKit veya Agora) seçilip development build alındığında eklenecek; gerekli yapılandırma aşağıda hazır.

## 1. İncelenen mevcut mimari

- Expo SDK 58, expo-router (Stack), React Native 0.88. Ekranlar `app/src/app`, bileşenler `app/src/components`.
- Oda ekranı tek bir rota dosyasıydı (`app/src/app/oda/[id].tsx`, ~2000 satır). Oda üyeliği (`lib/room-presence`), PK (`lib/pk`), bire bir görüşme ve cihaz paylaşımı (`lib/media`) modül düzeyinde "sunucu" durumları olarak `useSyncExternalStore` ile okunuyor.
- Kök düzeyde, rota yığınının üstünde çalışan katmanlar zaten vardı (`MatchLayer`, `GamesBridge`). Oda oturumu da bu kalıba oturtuldu.
- Ses: yok. Mikrofon düğmesi yerel bir `useState` idi; ekran kapanınca oturum da kapanıyordu (`router.back()` = odadan çıkış).

## 2. Değiştirilen ve eklenen bileşenler

| Dosya | Görev |
|---|---|
| `app/src/lib/audio-engine.ts` (yeni) | Ses motoru arayüzü (`connect`, `reconnect`, `disconnect`, `setPublishing`, `setRoute`) ve simülasyon motoru. Kural: aynı anda en fazla bir oda bağlantısı; aynı odaya `connect` hiçbir şey yapmaz; mikrofon yalnızca `setPublishing(true)` iken yayınlanır. Bağlantı/yeniden bağlantı/eşzamanlılık sayaçları tutar. |
| `app/src/lib/room-session.ts` (yeni) | Ekrandan bağımsız oturum yöneticisi: aktif oda, durum (bağlanıyor / bağlı / yeniden bağlanıyor / kesildi / bitti), istenen mikrofon ile gerçekten giden ses, izin, kesinti (telefon, ses odağı), ses çıkışı, ön/arka plan, yeniden bağlanma (1-2-4-8-16 sn), çıkış penceresi, oda değiştirme onayı, bildirimler. |
| `app/src/lib/room-session-persist.ts` (yeni) | Aktif odayı cihazda saklar (yalnızca oda kimliği ve adı, 30 dk geçerli). Yeniden açılışta güvenli geri dönüş için. |
| `app/src/components/room/room-host.tsx` (yeni) | Rota yığınının üstünde tek oda örneği. Oda tam ekranda değilken aynı örnek gizli kalır ve mini kart gösterilir. Uygulama ön/arka plan olaylarını ve ağ durumunu oturuma iletir. |
| `app/src/components/room/session-ui.tsx` (yeni) | Çıkış penceresi, mini oda kartı, kenar sekmesi, oda değiştirme onayı, "odadan çıkarıldın / oda sona erdi" penceresi, kısa bildirimler, yeniden açılış kartı, oda içi bağlantı bandı, "Ses ve bağlantı testi" paneli. |
| `app/src/components/room/live-room.tsx` (taşındı) | Eski oda rotası; artık `LiveRoom({ id, via, full })`. Mikrofon oturumdan okunur, mikrofonda olma / yönetim susturması / bire bir görüşme durumu oturuma bildirilir, oda tarafından çıkarılma algılanır. Küçültülünce açık paneller kapanır, yalnızca görsel döngüler (konuşma halkaları, koltuk tepkileri, efektler) durur. |
| `app/src/app/oda/[id].tsx` (yeni içerik) | Hafif rota: odayı açar (açıksa aynı oturumu geri getirir), sistemin geri hareketi ve tüm rota kaldırma işlemlerini `usePreventRemove` ile yakalayıp çıkış penceresini açar. |
| `app/src/app/_layout.tsx` | `RoomHost` kök katmana eklendi. |
| `app/src/components/room/parts.tsx` | Mikrofon düğmesine "açık ama ses gitmiyor" durumu eklendi (nedeni kısa yazıyla ve ekran okuyucu etiketiyle). |
| `app/src/lib/room-presence.ts` | `useOnline()` kancası. |
| `app/tests/room-session.test.ts` (yeni) | 21 test (aşağıda). |

## 3. Mini oda ve navigasyon mimarisi

- **Tek örnek:** Oda arayüzü `RoomHost` içinde bir kez çizilir. `/oda/<id>` rotası yalnızca "oda tam ekranda" anlamına gelir: yol `/oda/<aktif oda>` ise oda tam ekran, değilse aynı örnek gizli (`display: none`) kalır ve mini kart görünür. Ekranlar kendi mini oda örneğini oluşturmaz.
- **Çıkış penceresi:** Sistem geri tuşu, odadaki kapatma (X) düğmesi, tarayıcının geri düğmesi ve rotayı kaldıran her gezinme aynı yoldan geçer: `usePreventRemove` gezinmeyi durdurur ve "Odadan ayrılmak mı istiyorsun?" penceresini açar. "Odayı küçült" durdurulan gezinmeyi bir kez sürdürür; "Odadan çık" önce oturumu kapatır, sonra gezinir. Pencere kapatılırsa (Vazgeç, arka plana dokunma, geri tuşu, Esc) hiçbir şey değişmez. Art arda basılan geri tuşları yalnızca aynı pencereyi açar; çıkış yalnızca "Odadan çık" ile olur.
- **Odadan başka ekrana geçiş:** Odadan bir profil, mesaj veya cüzdan açılırsa oda otomatik küçülür (odadan çıkılmaz); o ekrandan geri dönülünce oda tam ekran olur.
- **Büyütme:** Mini karta dokununca, odanın rotası yığında duruyorsa ona dönülür (`router.dismissTo`), yoksa yeni rota açılır. Her iki durumda `openRoom` aynı odayı "aynı oturum" olarak döndürür: yeniden bağlanma, yeniden katılım, ikinci ses oturumu yoktur (test: bağlantı sayacı 1, yeniden bağlanma 0).
- **Mini kartı kapatma:** X düğmesi doğrudan çıkış yapmaz; "Odayı küçültülmüş görünümden kaldır" ile "Odadan çık" seçenekleri sunulur. Gizlenen kart, sağ kenarda küçük bir sekmeye dönüşür; sekmeye dokununca kart geri gelir. Kartı sağa kaydırmak da gizler, yukarı/aşağı kaydırmak üst/alt konuma taşır.
- **Konum:** Sağ alt. Sekmeli ekranlarda alt menünün üstünde, sağ altta yüzen düğmesi olan sekmelerde (Odalar, Anlar) düğmenin üstünde; diğer ekranlarda alttaki çubukların üstünde. Sohbet ekranlarında (bire bir, kabile, ajans sohbeti) en yeni mesajları ve yazma alanını örtmemek için üstte. Klavye açıkken ve görüşme/eşleşme ekranlarında yalnızca kenar sekmesi görünür.
- **Başka oda:** Bir odadayken başka bir oda açılırsa önce sorulur ("Başka bir odaya geçilsin mi?"). Onaylanırsa eski oda düzgün kapatılır, sonra yenisi açılır; aynı anda iki bağlantı olmaz. Vazgeçilirse önceki ekrana dönülür, eski oda sürer.

### Mini oda durumları (gerçek oturum durumundan)

| Durum | Kartta |
|---|---|
| Bağlı, dinliyor | "Dinliyorsun", kapakta ses rozeti |
| Mikrofon açık ve ses gidiyor | "Mikrofonun açık", turkuaz mikrofon düğmesi |
| Mikrofon açık ama ses gitmiyor | Neden: "Mikrofon izni yok", "Telefon görüşmesi sürüyor", "Oda yönetimi mikrofonunu kapattı"… (sarı) |
| Mikrofon kapalı | "Mikrofonun kapalı" |
| Bağlanıyor / yeniden bağlanıyor | "Bağlanıyor…" / "Yeniden bağlanıyor…" (sarı), ses rozeti yok |
| Bağlantı kesildi | "Bağlantı kesildi" (kırmızı) ve yeniden dene düğmesi |
| Odadan çıkarıldı / oda sona erdi | Kırmızı neden; X veya karta dokunma kartı kaldırır |
| Mikrofon daveti bekliyor | "Mikrofon daveti · aç" |

Kartta oda kapağı (yuvarlatılmış kare, durum renginde kenar) kullanılır; kişi avatarıyla karışmaz. Başlığın yanında mikrofondaki kişi sayısı gösterilir.

## 4. Oturumun ekran yaşam döngüsünden ayrılması

- Oturum (`lib/room-session`) hiçbir ekrana bağlı değildir; ekranlar yalnızca okur. Oda ekranı küçülse, gizlense veya başka ekrana geçilse oturum sürer.
- **Çıkış sırası** (`endRoom`): mikrofon isteği kapatılır → mikrofon yayını durdurulur → ses bağlantısı kapatılır → kayıt silinir → oturum kalkar → oda bileşeni kaldırılır ve oda üyeliğinden çıkılır (`exitRoom`, sunucu sayaçları ve Balkon anında güncellenir).
- **Oda tarafından bitirme:** Odadan çıkarılma (sunucu listeden düşürür) veya odanın kapanması oturumu "bitti" durumuna alır; neden kullanıcıya gösterilir, kapatılınca temizlenir. Giriş reddi (ör. çıkarılma sonrası 10 dk yasak) oturumu iz bırakmadan kapatır.
- **Mikrofon:** "İstenen" (`micWant`, kullanıcının düğmesi) ile "gerçekten giden" (`micSending`) ayrıdır. Ses yalnızca: mikrofonda oturuyorsa, yönetim susturmamışsa, bire bir görüşme yoksa, izin varsa, telefon görüşmesi/ses odağı kaybı yoksa, bağlantı varsa ve (arka plan sesini desteklemeyen motorda) uygulama ön plandaysa gider. Motor her durum değişiminde bu tek kurala göre yayını açar/kapatır. Yaşam döngüsü olayları kullanıcının ayarını değiştirmez; yalnızca telefon görüşmesi bitince güvenlik için mikrofon kapalı kalır (bire bir görüşmedeki kuralla aynı) ve bu kullanıcıya söylenir.
- **Uygulama kapanırsa:** Oda kimliği oturum başında ve arka plana geçerken diske yazılır. Yeniden açılışta aynı oturumun sürdüğü varsayılmaz: ana sayfada "“…” odasındaydın" kartı çıkar; "Yeniden bağlan" ile yeni bir katılım yapılır ve mikrofon kapalı başlar. Aynı odanın bağlantısıyla doğrudan açılırsa (bildirim, web'de yenileme) oda açılır, yine mikrofon kapalı başlar ve kullanıcıya bildirilir.

### Şartname §9 durumları

| Durum | Davranış | Nerede doğrulandı |
|---|---|---|
| Geri tuşuna art arda basma | Yalnızca çıkış penceresi açılır | Tarayıcı testi (3 hızlı basış) |
| Pencereyi kapatma | Oturum değişmez | Birim + tarayıcı (Vazgeç, Esc, tarayıcı geri) |
| Mini odayı büyütme | Aynı oturum, bağlantı sayacı 1, sohbet korunur | Birim + tarayıcı |
| Mini görünümü kaldırma | Bağlantı ve mikrofon sürer, kenar sekmesi | Birim + tarayıcı |
| Açıkça çıkma | Mikrofon → bağlantı → üyelik sırası | Birim + tarayıcı |
| Arka plana alma / ön plana gelme | Üyelik ve mikrofon ayarı korunur; bu motor arka planda ses çalamadığı için ses "duraklatıldı" gösterilir, dönüşte bildirilir | Birim + tarayıcı (sayfa görünürlüğü) |
| Mikrofon izni kaldırma | Ses gitmez, ayar korunur, uyarı ve bant | Birim + tarayıcı (test paneli) |
| Ses odağı kaybı / geri gelme | Duraklar, geri gelince kaldığı gibi sürer | Birim + tarayıcı (test paneli) |
| Telefon görüşmesi | Ses ve mikrofon durur; bitince oda sesi sürer, mikrofon kapalı kalır | Birim + tarayıcı (test paneli) |
| Bluetooth bağlanma/ayrılma | Ses çıkışı değişir, bildirilir | Birim + tarayıcı (test paneli) |
| Ağ kesilmesi | "Yeniden bağlanıyor (n. deneme)", 5 deneme sonra "Bağlantı kesildi" + yeniden dene; ağ dönünce aynı oturum (yeni katılım yok) | Birim + tarayıcı |
| Sunucunun odayı kapatması | "Oda sona erdi", kaynaklar serbest | Birim + tarayıcı (test paneli) |
| Odadan çıkarılma | "Odadan çıkarıldın", yasak süresince yeniden giriş reddedilir | Tarayıcı (test paneli) |
| Uygulamanın sonlandırılması ve yeniden açılış | Yeniden bağlan kartı / mikrofon kapalı geri dönüş | Tarayıcı (sayfa yenileme) |
| Mikrofonu açıkken arka plana geçme | Ayar korunur; bu motorda ses gitmez ve öyle gösterilir | Birim + tarayıcı |
| Başka uygulamada sesli görüşme | Ses odağı kaybı olarak ele alınır | Birim |

Oda içindeki "Menü › Ses ve bağlantı testi" paneli bu olayları (arka plan, ağ, telefon, ses odağı, Bluetooth, izin, çıkarılma, oda kapanışı, web'de yeniden açılış) tetikler ve motorun durumunu (bağlantı sayısı, eşzamanlı bağlantı, yayın) gösterir. Gerçek motorda bu olaylar işletim sisteminden gelecek; panel yalnızca prototip içindir.

## 5. Android arka plan sesi — **uygulanmadı**, plan hazır

Gerçek ses motoru olmadan Android'de ön plan hizmeti (foreground service) çalıştırmak, sessiz bir bildirimle kullanıcıyı yanıltır ve Google Play'in ön plan hizmeti türü beyanında gerekçesiz kalır. Bu yüzden eklenmedi. Motor seçildiğinde:

- Odaya katılırken (uygulama ön plandayken; Android 14 bu türü yalnızca ön planda başlatmaya izin verir) `microphone|mediaPlayback` türünde ön plan hizmeti başlatılır; "Gece Sohbeti · canlı odadasın" bildirimi "Odaya dön" ve "Odadan çık" eylemleriyle gösterilir. `endRoom` hizmeti durdurur.
- Ses odağı: `AUDIOFOCUS_GAIN` (iletişim) istenir; `LOSS_TRANSIENT` → `audioFocus(true)`, geri gelince `audioFocus(false)`; telefon durumu → `phoneCall()`. Bluetooth/kablolu kulaklık değişimleri → `setRoute()`.
- İzin kaldırılırsa (`RECORD_AUDIO`) → `setPermission(false)`.

## 6. iOS arka plan sesi — **uygulanmadı**, plan hazır

`UIBackgroundModes: audio` gerçek ses çalmayan bir uygulamada App Store incelemesinde reddedilme nedenidir (Yönerge 2.5.4); bu yüzden eklenmedi. Motor seçildiğinde:

- `AVAudioSession` kategorisi `playAndRecord`, mod `voiceChat`, seçenekler `allowBluetooth`, `defaultToSpeaker`; odaya katılırken etkinleştirilir, `endRoom` ile kapatılır.
- Kesinti bildirimi (`began` → `phoneCall(true)` veya `audioFocus(true)`; `ended` + `shouldResume`) ve rota değişimi bildirimi (`setRoute`) oturuma bağlanır.

## 7. Eklenen izinler ve platform yapılandırmaları

**Bu çalışmada hiçbir izin veya platform yapılandırması eklenmedi** (gerekçe yukarıda). Motor seçildiğinde `app.json`'a eklenecekler:

```jsonc
// iOS
"ios": { "infoPlist": {
  "NSMicrophoneUsageDescription": "Odada konuşabilmen için mikrofonuna erişmemiz gerekiyor.",
  "UIBackgroundModes": ["audio"]
} },
// Android
"android": { "permissions": [
  "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "BLUETOOTH_CONNECT",
  "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MICROPHONE", "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "POST_NOTIFICATIONS"
] }
```

Ayrıca sağlayıcının config plugin'i (LiveKit: `@livekit/react-native-expo-plugin` + `@config-plugins/react-native-webrtc`; Agora: `react-native-agora` ve plugin'i) ve bir development build (`eas build --profile development`) gerekir; Expo Go bu modülleri içermez. Motor `lib/audio-engine.ts` arayüzünü uygulayıp `setEngine()` ile takılır; oturum ve ekranlar değişmez.

## 8. Test edilen cihazlar ve işletim sistemi sürümleri

- **Gerçek cihaz: yok.** Android veya iOS cihazda test yapılmadı.
- Birim testleri: Node 22 yerleşik test koşucusu (`npm test`), 21 oda oturumu testi dahil 77 test, tümü geçiyor.
- Arayüz: web derlemesi (`expo export --platform web`), başsız Chromium (Playwright), 390×844 görünüm.

## 9. Gerçek cihaz test sonuçları

Yapılmadı. Şartname gerçek cihaz testini zorunlu tutuyor; bu madde açık. Özellikle Android geri tuşu, iOS kaydırarak geri hareketi, klavye olayları ve arka plan sesi yalnızca cihazda doğrulanabilir.

Web'de doğrulananlar: kapatma düğmesi ve tarayıcı geri düğmesi pencereyi açıyor (adres `/oda/r1`'de kalıyor), Vazgeç/Esc oturumu değiştirmiyor, 3 hızlı kapatma yalnızca pencereyi açıyor, küçültme sonrası ana sayfa / Mesajlar / bire bir sohbette mini kart görünüyor (sohbette yazma alanıyla çakışmıyor), büyütünce sohbet korunuyor ve bağlantı sayacı 1 / yeniden bağlanma 0, kartı gizleme → kenar sekmesi → geri getirme, karttan çıkış, çıkıştan sonra tarayıcı geri düğmesinin odayı geri getirmemesi, oda değiştirme onayı (vazgeç / geç; en fazla 1 eşzamanlı bağlantı), izin/telefon/ağ/arka plan olayları, sayfa yenilemede mikrofon kapalı geri dönüş, ana sayfada yeniden bağlan kartı, çıkarılma penceresi ve yasak süresince giriş reddi. Önceki oda ve PK tarayıcı testleri (sohbet okuma konumu, Balkon sayaçları, davet, PK akışları, odalar arası PK) yeni yapıda yeniden çalıştırıldı ve geçti.

## 10. Pil ve ağ tüketimi

Gerçek cihazda pil ölçümü yapılmadı. Web derlemesinde Chrome DevTools Protocol ile 30 sn'lik pencerelerde ana iş parçacığı süresi ölçüldü (yalnızca karşılaştırma için bir gösterge; pil ölçümü değildir):

| Durum | Betik süresi | Toplam görev süresi | Ağ isteği |
|---|---|---|---|
| Oda yok (ana sayfa) | 0,0 ms/sn | 2,1 ms/sn | 0 |
| Oda tam ekran | 80,8 ms/sn | 183,1 ms/sn | 1 (görsel) |
| Oda küçültülmüş (ana sayfa + mini kart) | 7,4 ms/sn | 8,7 ms/sn | 0 |
| Oda küçültülmüş, uygulama arka planda | 5,7 ms/sn | 7,8 ms/sn | 0 |

Küçültülünce iş yükü yaklaşık 10 kat düşüyor: konuşma halkası döngüsü, koltuk tepkileri, efektler ve animasyon katmanı yalnızca oda ekrandayken çalışıyor. Kalan yük prototipteki "sunucu" simülasyonudur (sohbet, katılım, PK olayları); gerçek üründe bunlar sunucudan gelir. Yeniden bağlanma artan bekleme ile 5 kez denenir, sonra durur ve kullanıcıya bırakılır (sürekli deneme yok).

## 11. Başarısız testler ve bilinen sınırlamalar

- Başarısız otomatik test yok.
- Gerçek ses, gerçek mikrofon, arka plan sesi, Android ön plan hizmeti, iOS ses oturumu yok (simülasyon motoru).
- Telefon görüşmesi, ses odağı, Bluetooth ve izin olayları işletim sisteminden değil test panelinden geliyor.
- Web'de yazılım klavyesi olayı olmadığı için "klavye açıkken kenar sekmesi" davranışı yalnızca kodda; cihazda doğrulanmadı.
- Mini kart sürüklenerek serbestçe konumlanmaz; yalnızca üst/alt konum ve sağa kaydırarak gizleme var.
- Oda küçükken gelen mikrofon daveti kartta görünür; davet penceresi oda açılınca çıkar (30 sn süre devam eder).
- Uygulama kapanınca kayıt 30 dk geçerli; daha eski kayıt için yeniden bağlanma önerilmez.

## 12. Tamamlanmamış özellikler

1. Gerçek ses motoru (LiveKit veya Agora) ve development build — sağlayıcı seçimi gerekiyor.
2. Android ön plan hizmeti, bildirim eylemleri ve ses odağı entegrasyonu.
3. iOS `AVAudioSession` yapılandırması, kesinti ve rota bildirimleri.
4. İzinlerin `app.json`'a eklenmesi (motorla birlikte).
5. Gerçek cihazlarda (en az bir Android 14+, bir iOS 17+) arka plan sesi, telefon görüşmesi, Bluetooth ve pil testleri.
