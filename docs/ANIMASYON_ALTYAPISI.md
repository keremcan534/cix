# Hareketli Emoji, Mikrofon Efektleri ve Animasyon Mağazası

Kaynak: *Similarclup – Hareketli Emoji, Mikrofon Efektleri ve Animasyon Mağazası Entegrasyonu*. Bu belge §11'de istenen karşılaştırmalı rapordur ve prototipin durumunu da anlatır.

## 1. Mevcut altyapı (bu çalışmadan önce)

| Parça | Durum |
|---|---|
| Koltuk tepkisi | Unicode emoji avatarın üstünde zıplıyor (`room/parts.tsx` → `SeatReaction`). Ücretsiz, katalog yok. |
| Emoji paketleri | `catalog.ts` → `EMOJI_PACKS`; "Animasyonlu" paketi aslında düz emoji. |
| Hediyeler | `mock.ts` → `GIFTS` (emoji + fiyat). Gönderilince ekranın ortasında büyük emoji, alıcının koltuğuna uçan hediye (`fx/gift-flight.tsx`). |
| Giriş efektleri, çerçeveler | Kodla çizilen (`fx/entry.tsx`, `fx/frames.tsx`) ve resimli çerçeveler (`fx/frame-art.tsx`). |
| Gerçek zamanlı oda | Henüz yok (prototip). Oda olayları tek cihazda simüle ediliyor. |
| Animasyon formatı oynatıcısı | Yok (Lottie, Rive, SVGA, VAP yüklü değil). |

Çalışan sistemler yeniden yazılmadı. Yeni yapı bunların yanına eklendi; mevcut hediye paneli ve koltuk tepkileri aynen duruyor.

## 2. Bu çalışmada eklenenler

| Dosya | Görevi |
|---|---|
| `src/data/animations.ts` | **Merkezi katalog**: §4'teki tüm alanlar (animation_id, provider_id, name, category_id, preview_asset, animation_asset, format, duration_ms, display_type, audio_asset, coin_price, is_free, is_active, license_status, created_at/updated_at), ayrıca kampanya penceresi (starts_at/ends_at). 9 kategori (A–I), 21 başlangıç kaydı. |
| `src/components/fx/anim-player.tsx` | **Veriyle çalışan oynatıcı**: görsel (emoji, 3D ikon veya URL) + hareket kalıbı (koltuktan yüksel, mikrofon çevresinde dön, patla, ekrana yağ, ekranı geç, ortada büyü, neon halka, ses dalgası). Yeni kayıt kod değişikliği gerektirmez. |
| `src/components/fx/anim-layer.tsx` | **Oda katmanı**: olayları ortak başlangıç zamanında oynatır; aynı anda 1 tam ekran ve en fazla 6 küçük animasyon, en fazla 12 bekleyen (önce ücretsiz tepkiler düşer); düşük veri modunda hafif sürüm. **Mikrofon efekti** ayrı mekanizma olarak burada. |
| `src/lib/animations.ts` | Katalog durumu, **sağlayıcı katmanı**, yönetici kayıtları, oda olay kanalı ve sunucunun yerine geçen `sendAnimation`. |
| `src/components/EmojiPanel.tsx` | Odada **✨ Hareketli** sekmesi: mikrofon efektim (al/kullan/kapat), tepkiler, efekt hediyeleri, tam ekran efektler. |
| `src/app/animasyon-yonetimi.tsx` | **Yönetim paneli** (`animations.manage` yetkisi): katalog, düzenleme, test oynatma, sağlayıcılar, içe aktarma, yeni ekleme, kayıtlar. |

### Gönderim akışı (§6)

1. İstemci yalnızca `animation_id` ve bir istek kimliği (`request_id`) gönderir.
2. Sunucu kaydı katalogdan okur: aktif mi, lisansı onaylı mı, kampanya penceresi içinde mi?
3. Fiyat **katalogdan** alınır, istemciden gelen fiyat kullanılmaz.
4. Ücretsiz tepkilerde kişi başına kısa bir bekleme süresi uygulanır.
5. Ücret tek bir cüzdan hareketiyle düşülür (`AN-…` referansıyla).
6. Olay odaya yayınlanır. Herkes aynı `startAt` zamanında oynatır (sunucu saati + 250 ms).
7. Aynı `request_id` tekrar gelirse ilk sonuç döner, ikinci kez jeton düşülmez.

**İade kuralları:**
- **Olay odaya iletilemezse:** Ücret otomatik iade edilir.
- **Olay iletildi ama bir cihaz dosyayı oynatamazsa:** İade yapılmaz; o cihazda önizleme görseli gösterilir (diğer katılımcılar animasyonu görmüştür).

### Mikrofon efekti (§5)

- Mağazadan bir kez alınır (veya ücretsizi seçilir) ve "kullanılır".
- Yalnızca koltuktayken, mikrofon açıkken ve kişi gerçekten konuşurken koltuğun çevresinde oynar.
- Mikrofon kapalıyken oynamaz; bire bir görüşmedeyken de oynamaz.
- Ses seviyesi yalnızca bu görseli etkiler, **hiçbir zaman hediye göndermez veya ücret düşmez**. Elle gönderilen animasyonlardan tamamen ayrı bir mekanizmadır.

## 3. Animasyon formatları

| Format | Ne için uygun | React Native / Expo durumu | Not |
|---|---|---|---|
| **Kodla çizilen + PNG/emoji** (şu an) | Küçük tepkiler, mikrofon efektleri, yağmur/patlama | Ek paket yok, her cihazda çalışır | En hafif seçenek. Prototipteki tüm kayıtlar bu türde. |
| **Lottie** (JSON) | Tepkiler, orta boy hediyeler, ikon animasyonları | `lottie-react-native` Expo ile kullanılabiliyor (yeni bir native paket eklemek gerekir) | Vektör olduğu için küçük dosya, her boyutta net. **İlk eklenecek oynatıcı olarak önerilir.** |
| **Rive** | Etkileşimli efektler | `rive-react-native` (yeni bir native paket eklemek gerekir) | Etkileşim gücü yüksek; Lottie'den sonra değerlendirilebilir. |
| **SVGA** | Klasik sesli sohbet hediye efektleri | Topluluk paketleri var (`svgaplayer`, `rn-newarch-svga-player`); bakım durumları doğrulanmalı | Hazır hediye içeriği çoğunlukla bu formatta. |
| **VAP** (Tencent, şeffaf MP4) | Büyük, gerçekçi tam ekran hediyeler | **React Native için hazır kütüphane bulunamadı**; Android/iOS SDK'sına köprü yazılması gerekir | Alternatif: şeffaf MP4 oynatan `@status-im/react-native-transparent-video`. |
| **PAG** | Tencent ekosistemi | Resmi RN desteği doğrulanmadı | Şimdilik önerilmez. |

Katalog `format` alanını zaten taşıyor. Oynatıcısı olmayan formatlar (lottie/rive/svga/pag/vap/video) odada **önizleme görseliyle aynı hareketle** gösteriliyor. Yönetim panelinde bu durum uyarıyla belirtiliyor. Bir oynatıcı eklendiğinde yalnızca `anim-player.tsx` içindeki format eşlemesine bir satır eklenir; katalog ve oda kodu değişmez.

## 4. Sağlayıcı seçenekleri (doğrulananlar ve doğrulanmayanlar)

| Sağlayıcı | Ne doğrulandı | Dikkat |
|---|---|---|
| **LottieFiles** | Ücretsiz animasyonlar "Lottie Simple License" ile kişisel ve ticari kullanıma ücretsiz açık; atıf zorunlu değil. Resmi GraphQL API'si var (hesapla giriş gerekiyor). | Animasyonları toplu derleyip **rakip bir hizmet kurmak**, dosyaları **tek başına yeniden dağıtmak** ve satmak yasak. Bazı yapımcılar kendi koşullarını ekleyebiliyor. **Toplu içe aktarma yerine tek tek seçilmiş içerik** öneriyoruz; her animasyonun kendi lisansı kontrol edilmeli. |
| **Rive Marketplace/Community** | Dosyalar CC BY lisansıyla paylaşılıyor; ticari kullanım serbest. | Yapımcıya atıf gerekiyor (örneğin "Hakkında" ekranında). Satış ve uygulama içi coin karşılığı sunma için ayrıca kontrol edilmeli. |
| **Hazır SVGA/VAP hediye mağazaları** (ör. daha önce konuşulan 17ae) | Bu çalışmada doğrulanmadı. | API'leri ve uygulama içi satış lisansları **yazılı olarak** teyit edilmeden otomatik entegrasyon kurulmamalı. API yoksa "manuel yükleme" yolu kullanılır. |
| **Kendi ürettiğimiz içerik** | Tam hak bizde. | Görsel üretim + kodla hareket (çerçeve ve ikonlarda yaptığımız gibi) en düşük lisans riskli yol. |

Prototipteki **"Örnek mağaza (API simülasyonu)"** gerçek bir sağlayıcı değildir. Gerçek sağlayıcı bağlanınca nasıl çalışacağını gösterir: kataloğu getir → içe aktar (pasif, kendi `animation_id`'siyle, `provider_id` eşlemesi saklanır) → lisans onayı → fiyat → yayın. **API'si olmayan sağlayıcı** için katalog getirme düğmesi açıkça "API sunmuyor; içerik elle eklenir" der; olmayan bir entegrasyon varmış gibi davranılmaz.

## 5. Tahmini maliyet ve veri etkisi

Kesin fiyatlar sağlayıcılardan teklif alınarak netleşmeli. Aşağıdakiler **tahmini** büyüklüklerdir:

- **Dosya boyutu:**
  - Lottie: tipik olarak onlarca KB ile birkaç yüz KB arası.
  - SVGA: birkaç yüz KB ile birkaç MB arası.
  - VAP/MP4: tam ekran hediyede genellikle 1–5 MB.
- **Veri trafiği:** Asıl yük dosya indirmesi. Dosyalar CDN'den bir kez indirilip cihazda önbelleğe alınmalı (sürüm numarasıyla). Oda olayları birkaç yüz baytlık mesajlardır; sesi etkilemez.
- **Geliştirme:**
  - Lottie oynatıcı entegrasyonu ve önbellek: kısa iş (birkaç gün).
  - VAP için native köprü: daha uzun (Android + iOS ayrı ayrı).
- **İçerik:** Ücretsiz lisanslı (LottieFiles/Rive) seçilmiş içerik + kendi ürettiğimiz görseller ile başlanabilir. Büyük tam ekran hediyeler için tasarımcı veya lisanslı paket maliyeti ayrıca bütçelenmeli.
- **Ayrı tutulması gerekenler:** Sağlayıcıya ödenen lisans bedeli ile kullanıcıya uygulanan coin fiyatı birbirinden bağımsızdır; katalogda yalnızca coin fiyatı tutulur.

## 6. Önerilen entegrasyon yolu ve sıra

1. **Hemen (yapıldı):** Merkezi katalog, veriyle çalışan oynatıcı, oda katmanı, sağlayıcı katmanı, yönetim paneli, sunucu kuralları (prototip).
2. **Sunucu:**
   - Tablolar: `animations`, `animation_providers`, `animation_licenses`, `animation_sends` (benzersiz `request_id`), `wallet_transactions` bağlantısı, `admin_audit`.
   - Katalog uygulamaya bir API ucundan sürüm numarasıyla iner, böylece değişiklikler uygulama güncellemesi gerektirmez.
   - Dosyalar CDN'de içerik özetiyle (hash) adlandırılır.
3. **Gerçek zamanlı:** Oda olayları LiveKit veri kanalı (veya WebSocket) üzerinden gider; sunucu `startAt` damgasını basar. Ses akışı bu olaylardan etkilenmez.
4. **Lottie oynatıcı:** `lottie-react-native` eklenir; ilk lisanslı içerikler LottieFiles'tan tek tek seçilir.
5. **Büyük hediyeler:** Şeffaf MP4 oynatıcı veya VAP köprüsü (yük testinden sonra seçilir).
6. **Güvenlik:**
   - Yüklenen dosyalar sunucuda biçim, boyut ve süre kontrolünden geçer; kod çalıştıran içerik kabul edilmez.
   - Sağlayıcı anahtarları yalnızca sunucuda tutulur, uygulamaya gömülmez.

## 7. Prototip kriterleri (§10)

| Kriter | Prototipte |
|---|---|
| Mikrofon çıkış animasyonu | ✅ Dönen Yıldızlar / Neon Halka / Ses Dalgası / Müzik Notaları (konuşurken) |
| Küçük hareketli tepki | ✅ Uçan Kalpler, Alkış, Kahkaha (ücretsiz, koltuktan yükselir) |
| Büyük animasyonlu hediye | ✅ Kraliyet Tacı (koltuktan ortaya büyür), Altın Yağmuru, Ejderha (tam ekran) |
| Ücretsiz animasyon | ✅ |
| Coin ile gönderilen animasyon | ✅ (fiyat katalogdan, tek cüzdan hareketi) |
| Katalog ekleme ve güncelleme | ✅ Yönetim paneli › Yeni ekle / fiyat, tür, hareket, lisans düzenleme |

## 8. Kabul testleri (web prototipi, Playwright)

| # | Test | Sonuç |
|---|---|---|
| 1 | Kod değişmeden yeni animasyon | ✅ "Konfeti Patlaması" panelden eklendi, odada hemen göründü ve oynadı |
| 2 | Doğru koltuktan başlar | ✅ Kendi koltuğundan; diğer katılımcıların tepkileri de kendi koltuklarından |
| 3 | Senkron görme | ✅ Tasarım olarak: herkes olayı sunucunun koyduğu `startAt` zamanında başlatır. ⏳ Çok cihazlı test gerçek zamanlı altyapıyla yapılmalı |
| 4 | Coin yalnızca sunucuda doğrulanır | ✅ İstemci yalnızca kimlik gönderir; Kraliyet Tacı = 500 jeton (katalog fiyatı) |
| 5 | Sağlayıcı kesilince mevcut içerik çalışır | ✅ Sağlayıcı bağlantısı kapalıyken içe aktarılmış ve yerleşik içerikler odada oynadı |
| 6 | Lisansı uygun olmayan içerik yayına alınamaz | ✅ "Galaksi Tüneli" (uygun değil) yayına alınmak istenince reddedildi; odada görünmüyor |
| 7 | Yoğunluk sınırı | ✅ Aynı anda 1 tam ekran + 6 küçük, kuyruk 12, ücretsiz tepkilere bekleme süresi, düşük veri modunda hafif sürüm |
| 8 | Katalog ve fiyat panelden güncellenir | ✅ Kalp Yağmuru 999 → 500; odada yeni fiyat göründü |

## 9. Karar bekleyenler

- **İlk lisanslı içerik kaynağı:** LottieFiles'tan seçilmiş ücretsiz içerik + kendi üretim mi, yoksa ücretli bir hediye paketi mi?
- **Büyük tam ekran hediyeler:** VAP köprüsü mü, şeffaf MP4 mü? (Yük ve cihaz testinden sonra karar verilmesi önerilir.)
- **Fiyatlar:** Mikrofon efektleri süreli (30 gün) mi, kalıcı mı olacak? Şu an kalıcı.

Kaynaklar:
- [LottieFiles – ticari kullanım](https://help.lottiefiles.com/hc/en-us/articles/900002438343-Can-I-use-a-free-animation-on-Lottiefiles-for-commercial-business-use)
- [LottieFiles – lisans temelleri](https://help.lottiefiles.com/animation-licensing-basics-)
- [LottieFiles MCP / GraphQL](https://docs.lottiefiles.com/en/platform/mcp)
- [Rive Marketplace lisansı](https://www.rive.app/docs/community/marketplace-overview)
- [svgaplayer (npm)](https://www.npmjs.org/package/svgaplayer)
- [rn-newarch-svga-player](https://unpkg.com/rn-newarch-svga-player@1.1.16/README.md)
- [VAP](https://best-of-web.builder.io/library/Tencent/vap)
- [react-native-transparent-video](https://github.com/status-im/react-native-transparent-video)
