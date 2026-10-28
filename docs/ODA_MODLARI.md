# Oda Katılım Modları, Mikrofon Yerleşimleri ve Ortak YouTube İzleme

Bu belge "Yayına Katılma Modu" çalışmasının uygulamasını ve teslim notlarını içerir. **Önce şunu bilmek gerekir:** uygulamada backend yoktur. Şartnamenin "sunucu tarafında doğrulama" istediği her kural (yetki, oda seviyesi, kilit, kapasite, YouTube bağlantısı, oynatma kontrolü) ekran bileşenlerinden bağımsız, saf TypeScript domain modüllerinde (`app/src/lib/room-modes.ts`, `app/src/lib/youtube.ts`) uygulanır ve testlidir. Arayüz bir düzen kimliğini doğrudan gönderse bile aynı kontrollerden geçer. Gerçek üründe bu fonksiyonlar sunucuya taşınmalıdır; istemci tarafındaki kontrol tek başına güvenlik sağlamaz.

## 1. Mimari

| Katman | Dosya | Görev |
|---|---|---|
| Katalog (veri) | `app/src/data/room-layouts.ts` | `RoomMode`, `RoomLayout`, `LayoutSchema`. Yerleşimler kısa bir gösterimle (`'h' 'mmmm'`…) yazılır ve şemaya derlenir. Yeni yerleşim = katalogda bir satır; ekran kodu değişmez. |
| Domain ("sunucu") | `app/src/lib/room-modes.ts` | Oda başına mod/yerleşim ve tek `PlaybackState`. `changeLayout`, `setClassicCapacity`, `setVideo / playVideo / pauseVideo / seekVideo / stopVideo`, `reportPlayer`, `expectedPosition`, `playerSync`, `slotStates`, `layoutAccess`, `stagePermission`. Ret kayıtları `audit` listesinde. |
| YouTube | `app/src/lib/youtube.ts` | Elle yazılmış, platformdan bağımsız bağlantı ayrıştırıcı; yalnızca 11 karakterli video kimliği dışarı çıkar. IFrame API hata kodlarının Türkçe karşılıkları. |
| Koltuklar | `app/src/lib/room-presence.ts` (değişmedi) | Koltuklar, davetler, susturma yine burada. `room-modes` yalnızca soruyor ve geçerli değişiklikten sonra `resize` / `setLocks` çağırıyor. |
| Arayüz | `components/room/layout-picker.tsx` | Sekmeler, 3 sütun kart ızgarası, mini şema, OdaLv, kilit ve açılma koşulu, PK rozeti (yalnız PK temalı odada), seçili durum, domain yanıtı. |
| | `components/room/stage-layout.tsx` | Şemayı çizer: satırlar, görüntülü yuvalar, yan sütun, kırmızı/mavi takım bölgeleri, çift yuvaları. Koltuk yine odanın `Seat` bileşeni (hediye, menü, tepki, PK puanı çalışır). Mutlak konumlandırma yok, sahne alanı kaydırılır. |
| | `components/room/room-screen.tsx` | Ortak ekran: oynatıcı, kontroller (yetkiliye), bağlantı penceresi, kişisel sessiz/duraklat, "Odayla eşitle", hata durumları. |
| | `components/room/youtube-player.web.tsx` / `youtube-player.tsx` | Web: resmi IFrame Player API. Android/iOS: aynı API bir WebView içinde. Oynatıcı bir kez oluşturulur; video/oynat/duraklat/sarma komutla iletilir. |
| Bağlantı | `live-room.tsx`, `owner.tsx`, `parts.tsx`, `store.tsx`, `data/mock.ts` | Sahne tohumlama, ayar satırları, oda menüsü girişi, yuva durumları, kendi odanın düzeninin kalıcılığı (`MyRoom.layoutId`), örnek oda (Doğruluk mu Cesaret mi → 9 mikrofon PK takım). |

Şartnamedeki `RoomSession.modeId / layoutId` alanları `RoomStage` (oda kimliğine göre modül durumu) olarak tutulur. Ses oturumu (`lib/room-session`) gibi ekrandan bağımsızdır; bu yüzden oda küçültülünce, Balkon açılınca veya mini karttan büyütülünce düzen ve oynatıcı korunur (web'de doğrulandı: aynı iframe).

## 2. Modlar ve yerleşimler (başlangıç verisi)

| Sekme | Yerleşimler (mikrofon · OdaLv) |
|---|---|
| Ses | 2·1, 5 PK·1, 6·1, 6 (ızgara)·1, 6 PK takım·1, 9 PK·1, 9 PK takım·1, 11·1, 12 PK takım·1, 13 PK·4, 15 PK takım·1, 15·5, 16 PK·6, 20·7, 24·8, 30·9 |
| Video | 5·5, 6 (büyük video + yan mikrofonlar)·5, 6 (2 video)·6, 7·7, 8·5, 8 (4 video)·7, 10 (büyük video + yan)·5, 10 (6 video)·8, 11·6, 12·7, 13·8, 15·9 |
| Sinema Salonu | 2·2, 3·2, 4·2, 7·5 (üstte ortak ekran, altta mikrofonlar) |
| Çift Odası | Randevu 5·1 (sunucu + iki ana katılımcı + 2), Düğün 10·3 (iki büyük ana yuva + 8) |

- Kapasite her zaman şemadaki yuva sayısıdır (test). Aynı kapasitede birden çok yerleşim vardır (Ses 6 ×3, Video 6 ×2, 8 ×2, 10 ×2).
- Video modundaki turkuaz kutular **görüntülü yuvalardır** (kamerası açılabilen mikrofon yuvaları) ve kapasiteye dahildir. Ortak YouTube ekranı Video'da isteğe bağlıdır (video açılınca görünür), Sinema Salonu'nda her zaman vardır.
- "Kilitli" saklanmaz: oda seviyesi `minimumRoomLevel`'ın altındaysa veya gereken özellik (`youtube`, `camera`) yoksa hesaplanır. Kartta da domain'de de aynı `layoutAccess` kullanılır.
- **Varsayımlar:** 30 mikrofonun seviyesi görsellerde görünmüyordu, Lv.9 kabul edildi. 11 mikrofonun seviyesi okunamıyordu, Lv.1 kabul edildi. PK takım yerleşimlerinin yuva dağılımı (ör. 9 = sunucu + 4 kırmızı + 4 mavi) görsellerden birebir alınmadı; kapasiteyle tutarlı olacak şekilde seçildi.
- **Mevcut seviye kuralıyla ilişki:** Eski kural "standart oda 10, ajans 15, Lv.8'de +2, en fazla 15" idi. Bu kural **Klasik düzen** için aynen korunur (Oda Ayarları › Klasik düzen mikrofon sayısı). Katalog yerleşimleri kendi kapasitesini ve seviye şartını getirir (20/24/30 mikrofon Lv.7/8/9). Bu, oda seviyesi ödüllerindeki "özel mikrofon düzenleri (Lv.7)" ile uyumludur; ancak 15 üstü mikrofon için ürün kararı gerekir.

## 3. Mikrofon kuralları

- Bir kullanıcı tek yuvada oturur; dolu yuvaya ikinci kişi oturamaz (`room-presence.takeSeat`, testli).
- Katılma / davet / kabul / ayrılma mevcut presence akışıyla aynen çalışır; yerleşim yalnızca yuvaların nerede çizileceğini belirler.
- **Kapasite küçültme:** Yeni sınırın dışında oturan konuşmacı varsa işlem reddedilir ve kim olduğu yazılır ("1 konuşmacı yeni 6 mikrofonluk düzenin dışında kalıyor (8. mikrofonda Elif)…"). Kimse sessizce Balkon'a taşınmaz. Aynı kural Klasik düzene dönüşte ve klasik mikrofon sayısını azaltırken de geçerlidir (eski davranış "fazlası dinleyiciye geçer" idi; şartnameye göre değiştirildi). Sınır dışındaki koltuk kilitleri düşer.
- **Yuva durumları:** boş (kesikli çerçeve, +), kilitli (kilit), davet bekliyor (altın çerçeve, kum saati, "Davet"), mikrofon açık, mikrofon kapalı (gri rozet), yönetim tarafından susturuldu (kırmızı rozet). Her durumun ekran okuyucu metni vardır ("4. mikrofon, Selin için davet bekliyor").

## 4. Yetki ve kilit (domain katmanında)

`changeLayout(roomId, actorId, layoutId)` sırasıyla şunları kontrol eder: bağlantı → yerleşim var ve açık → yetki → oda seviyesi / özellik → kapasite kuralı. Reddedilen her deneme `audit` listesine yazılır; arayüz yalnızca `ok: true` dönünce kartı seçili gösterir, ret nedenini pencerede kırmızı yazar.

- Yetki: oda sahibi her zaman; yönetici, oda ayarı "Oda işlevlerini yönet = Oda sahibi ve yöneticiler" ise. Roller istemciden değil presence sunucusundan okunur. Üye hiçbir zaman değiştiremez.
- Aynı kural ortak oynatıcının kontrolü için de geçerlidir.
- Bağlantı yokken değişiklik gönderilmez ve başarılı gösterilmez.

## 5. YouTube: doğrulama ve oynatma

**Kabul edilenler:** `youtube.com/watch?v=ID`, `www.` / `m.` / `music.youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`, `youtube-nocookie.com/embed/ID`, `youtube.com/shorts/ID`, `youtube.com/live/ID`; şema yazılmamış hali (`youtube.com/watch?v=…`); `t=` / `start=` başlangıç zamanı.

**Reddedilenler:** başka alan adları, benzer alan adları (`youtube.com.evil.com`, `evil-youtube.com`, `youtu.be.example.org`, `youtube.co`), `kullanıcı@alan` ve port içeren adresler, `javascript:` / `data:` / `file:` / `ftp:`, şemasız `//`, başka sitenin parametresinde veya `#` sonrasında geçen YouTube adresi, 11 karakter olmayan veya izin dışı karakter içeren kimlikler, boşluk/kontrol karakteri. Ayrıştırıcı RN'nin `URL` uygulamasına dayanmaz (bazı platformlarda `hostname` desteklenmiyor).

**Oynatma:**
- Web: resmi IFrame Player API (`https://www.youtube.com/iframe_api`), `origin` parametresiyle. Web önizlemesinde gerçek video oynatıldı, süre oynatıcıdan alındı, düzen değişimi ve odayı küçültme/büyütme boyunca aynı iframe korundu.
- Android / iOS: aynı API, `react-native-webview` içinde. **Yeni paket:** `react-native-webview@14.0.1` (`npx expo install` ile; Expo Go'da hazır gelir, development build gerektirmez). Gerekçe: mevcut bağımlılıklarla native'de gömülü oynatıcı yok; YouTube'un resmi yolu IFrame API'dir. Sayfa uygulamanın kendi kaynağından (`EMBED_ORIGIN`) yüklenir ki YouTube yönlendiren bilgisini alsın; YouTube oynatıcısından dışarı çıkan bağlantılar (logo, başlık) uygulama dışında açılır, WebView başka sayfaya gitmez.
- Gömülemeyen (101/150), silinmiş/özel (100), geçersiz (2) video odanın tamamında "oynatılamıyor" olarak işaretlenir; cihaz hataları (5, 152/153, betik yüklenemedi) yalnızca o cihazda gösterilir.
- Reklam, yaş, bölge veya gömme kısıtı atlatılmaz. Arama yok: YouTube Data API anahtarı olmadığı için sahte sonuç gösterilmez; video yalnızca bağlantıyla açılır.

## 6. Ortak izleme

- Odada tek `PlaybackState { provider: 'youtube', videoId, playbackStatus, position, updatedAt, updatedBy, duration?, error? }`.
- Yetkili kullanıcı aç / oynat / duraklat / ±10 sn / kapat yapar; yetkisiz isteklerin hepsi domain'de reddedilir ve durumu değiştirmez (test).
- Diğerleri yalnızca kendileri için sessize alabilir veya oynatıcının kendi düğmesiyle duraklatabilir ("senin için duraklatıldı"); bu odayı etkilemez. "Odayla eşitle" ile geri dönülür.
- Konum: `position + (şimdi − updatedAt)`. Oynatıcı her oda değişikliğinde, yeniden bağlanınca ve 5 sn'de bir karşılaştırır; 2 sn'den fazla fark varsa atlar.
- **Dürüstçe:** Tam senkron garanti edilemez. Reklamlar, ara belleğe alma, ağ gecikmesi ve cihaz saatleri arasındaki fark izleyiciler arasında birkaç saniyelik kayma yaratabilir; tarayıcılar sesli otomatik oynatmayı engelleyebilir (bu durumda "videoya dokun" uyarısı çıkar). Bağlantı koparsa video o cihazda sürer, bağlantı gelince oda konumuna eşitlenir. Backend olmadığı için "diğer izleyiciler" aynı cihazdaki modül durumunu okur; çok cihazlı gerçek eşitleme sunucu gerektirir.
- Ekranı olmayan bir düzene (Ses, Çift Odası) geçilince video o anki konumda duraklatılır; ekranlı düzene dönünce kaldığı yerden sürer.

## 7. PK uyumu

- PK takım yerleşimlerinde yuvalar kırmızı/mavi bölgelere ayrılır. Takım PK başladığında mevcut `TeamArena` (takım üyeliği PK sunucusundan) gösterilir; puanlama, hediye ve takım kuralları değiştirilmedi.
- PK rozeti ve renkli bölgeler yalnızca oda teması PK olan odalarda görünür; diğer odalarda aynı yerleşim nötr gösterilir.

## 8. Testler

`app/tests/room-modes.test.ts`: 30 test (katalog 7, yetki/kilit 5, mikrofon kuralları 7, YouTube bağlantıları 4, ortak izleme 7). Toplam `npm test`: 107 test, tümü geçiyor. `npm run typecheck` ve `npm run lint` temiz.

## 9. Bilinen kısıtlar ve gerçek cihazda test edilmesi gerekenler

- Backend yok: tüm doğrulamalar istemci içindeki domain modüllerinde; çok kullanıcılı gerçek eşitleme ve gerçek yetki koruması sunucu gerektirir.
- Native YouTube oynatıcısı **cihazda denenmedi**. Özellikle: Android ve iOS'ta WebView içinde IFrame API'nin açılması, `EMBED_ORIGIN` ile yönlendiren bilgisi (hata 152/153 olmamalı), satır içi oynatma, sesli otomatik oynatma, tam ekran, arka plana geçince davranış, düşük bellekli cihazda performans. `EMBED_ORIGIN` (`https://similarclub.app`) uygulamanın gerçek alan adıyla değiştirilmelidir.
- Görüntülü yuvalarda gerçek kamera görüntüsü yok (oda kamerası daha önce de simülasyondu); yuva, oturan kişinin avatarını ve kamera durumunu gösterir.
- Oda küçültülünce web'de ortak video sesi sürer (oda sesi gibi). Native'de WebView'in arka plan davranışı cihazda doğrulanmalı.
- Küçük ekranlarda (≤ 360 pt) uzun yerleşimler sahne alanında kaydırılarak görülür; sohbet her zaman görünür kalır. Bu web'de 375×812'de doğrulandı, gerçek cihazda bakılmalı.
