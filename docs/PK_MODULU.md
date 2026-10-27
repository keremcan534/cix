# PK Modülü: Normal PK, Takım PK ve odalar arası PK

Kaynaklar: *SIMILARCLUP — PK BATTLE MODÜLÜ* ve *Gelişmiş PK Modu, Takım PK'si ve Görsel Sonuç Sistemi*.

> **Değişen ürün kararı:** Önceki sürümde "1v1 / bireysel PK yoktur" kuralı vardı. Yeni şartname **Normal PK'yi varsayılan mod** yaptı; bu kural kaldırıldı. Takım PK ve odalar arası PK aynen duruyor.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `src/lib/pk.ts` | PK sunucusunun yerine geçen katman: oturumlar, sayaç (bitiş zamanını sunucu belirler), sunucu tarafı takım dağıtımı, puanlama, iade, sonuç, taç ilişkileri, iptal, ayarlar, denetim kayıtları. Koltuk ve mikrofonu değiştirmez; kimin mikrofonda olduğunu `lib/room-presence`'tan okur. |
| `src/lib/room-presence.ts` | Odadaki kişiler ve mikrofonlar (ayrıntı: [`CANLI_ODA.md`](CANLI_ODA.md)). PK, katılımcı uygunluğunu buradan doğrular. |
| `src/components/room/pk.tsx` | Kurulum paneli, Normal PK sıralama şeridi, Takım PK arenası, odalar arası skor çubuğu, ayrıntı kartı. |
| `src/components/room/pk-result.tsx` | Sonuç ekranı ve "Taç Kazandıranlar" ekranı. |
| `src/components/room/parts.tsx` | Koltuk altında canlı PK puanı (`PkPoints`). |
| `src/app/oda/[id].tsx` | Menü › **PK** (oda sahibi ve yöneticiler); hediyeler tek işlem kimliğiyle PK'ya yazılır. |
| `src/app/pk-yonetimi.tsx` | Yönetim paneli (`pk.manage`): modlar, süreler, takım sınırları, hediye puanları, aktif PK (bitir/iptal/iade testi), geçmiş, kayıtlar. |
| `tests/pk.test.ts` | Sunucu kurallarının otomatik testleri. |

## Modlar

| Mod | Ne olur | Oda yerleşimi |
|---|---|---|
| **Normal PK** (varsayılan) | Mikrofondaki herkes kendi adına yarışır. Hediye, alan kişiye puan yazar. | Değişmez. Her avatarın altında PK puanı, üstte ilk 3 ve süre. |
| **Takım PK** | Kırmızı ve Mavi takım. Hediye, alan kişiye ve takımına puan yazar. | Mikrofon alanı ikiye ayrılır: Kırmızı solda, Mavi sağda; her yarıda takım puanı; üstte ortak skor çubuğu ve süre. PK dışındaki mikrofonlar altta tek satırda kalır (yönetim işlevleri çalışır). PK bitince standart yerleşim geri gelir. |
| **Odalar arası PK** | Her zaman takım PK'si: bir odadaki geçerli hediyeler o odanın takımına sayılır. | Değişmez; üstte iki odanın skor çubuğu. |

**Süreler:** 15, 30, 60, 120 **dakika** (mevcut sistem). Yönetici kapatabilir, yeni süre ekleyemez. Başlayan PK'nın süresi değişmez.

## Takım oluşturma

- **Uygun katılımcı:** başlatma anında mikrofonda olan kişiler (sunucu `micUsersOf` ile okur; istemcinin gönderdiği listeye güvenilmez).
- **Rastgele:** dağıtım sunucuda yapılır (`drawTeams`, Fisher–Yates). Takım büyüklükleri en fazla 1 farklıdır; tek sayıda fazladan kişi rastgele bir takıma gider. Takımlar doluysa (varsayılan 8+8, 15 mikrofonu karşılar) kalanlar "bu PK'ya katılmayacak" diye gösterilir. Dağılım başlatmadan önce gösterilir; **Yeniden karıştır** yeni bir sunucu dağıtımı ister. Başlatma o dağıtımı aynen kullanır.
- **Manuel:** oda sahibi/yönetici her kişiyi Kırmızı veya Mavi'ye atar. Fark 1'den büyükse uyarı gösterilir ve başlatma ayrıca onay ister. Takım seçilmeyen kişi PK'ya katılmaz.
- **Sunucu doğrulaması (iki yöntemde de):** aynı kişi iki takımda olamaz; herkes hâlâ mikrofonda olmalı (biri indiyse "takımları yeniden oluştur"); takım başına en az/en fazla sınırı.
- PK başladıktan sonra takımlar sabittir.

## Puanlama

- Varsayılan 1 jeton = 1 PK puanı; hediye başına puan yönetim panelinden ayarlanır, 0 puanlı hediye sayılmaz. Ayarlar PK başlarken dondurulur.
- PK puanı jeton bakiyesi ve yayıncı kazancından ayrıdır; yalnızca sunucuda, hediye işlemi başarıyla tahsil edildikten sonra yazılır. İstemci puan göndermez.
- **Kime yazılır:** hediyeyi alan kişi **o anda mikrofondaysa** (Takım PK'de ayrıca bir takımdaysa). Aksi hâlde hediye yine ulaşır ama puan yazılmaz; işlem "Reddedildi" kaydı olarak nedeniyle tutulur.
- **Takım toplamı = takım üyelerinin geçerli puanlarının toplamı** (testle doğrulanır).
- PK başlamadan (hazırlıkta) ve bittikten sonra gönderilen hediyeler sayılmaz.
- Aynı işlem kimliği ikinci kez gelirse reddedilir ve sayılır (tekrar sayacı).
- Jeton düşüldüğü hâlde PK puanı yazılamayan işlemler "düzeltme bekliyor" listesine düşer.
- **İade:** PK sürerken iade edilen hediyenin puanı kişiden ve takımdan düşülür ("İade edildi"). Sonuç kesinleştikten sonraki iade sonucu değiştirmez; mutabakat kaydına yazılır. Başarısız tahsilat hiç PK'ya ulaşmaz.

## Sonuç

- Süre dolduğunda sunucu PK'yı **bir kez** kesinleştirir (yalnızca aktif PK sonuçlanabilir; sonuç aynı adımda yazılır). Tüm izleyiciler aynı sonucu görür. Sayaç 0:00'a gelince istemci "Sonuç bekleniyor…" yazar; kazananı kendisi belirlemez.
- **Normal PK:** sıralama; en yüksek puanı tek kişi aldıysa kazanan odur ve ikinciyle fark gösterilir. Birinciler eşitse **Beraberlik** (kazanan ilan edilmez). Kimse puan almadıysa **Kazanan yok**. Eşit puanlar aynı sırayı paylaşır (1, 2, 2, 4).
- **Takım PK:** kazanan takım, iki skor, fark, iki takımın üyeleri ve bireysel katkıları; takımın en çok puan alanı ⭐ ile gösterilir. Eşitlikte iki takım da "Berabere".
- Sonuç ekranı kapatılabilir (X veya düğme); kapatılınca **Taç Kazandıranlar** ekranına geçilir. Her ekran izleyici başına bir kez açılır (`<pkId>` ve `<pkId>:crowns` görüldü kayıtları), yanlışlıkla ikinci kez açılmaz.

## Taç kuralı ("Taç Kazandıranlar")

Mevcut veri modelinde tanımlı değildi; şu kurallarla tanımlandı (`computeCrowns`):

1. **Taç kime verilir:** yalnızca açık bir kazanan varsa. Normal PK'de tek birinciye; Takım PK'de kazanan takımın **puan almış** üyelerine; odalar arası PK'de kazanan odada puan almış kişilere. **Beraberlikte veya kimse puan almadıysa taç verilmez** ve ekran bunu açıklar.
2. **Taç kazandıran:** taç alan kişiye PK süresi içinde en az bir **geçerli** (doğrulanmış, iade edilmemiş) hediye gönderen kullanıcı.
3. **Katkı değeri:** o gönderenin o kişiye gönderdiği geçerli hediyelerin **PK puanı** toplamı (jeton değil). Kartta hediye sayısı ve taç alanın toplam puanı içindeki payı da yazar.
4. **Birden fazla katkı:** her gönderen → taç alan çifti ayrı kart; katkıya göre sıralı. Her taç alanın en büyük katkıyı yapanı "👑 Taç kazandıran" olarak vurgulanır (eşitlikte hepsi).
5. İlişkiler yalnızca kayıtlardan türetilir: kayıtta olmayan ilişki üretilmez, aynı katkı iki kez sayılmaz, sonuç sunucuda bir kez hesaplanıp saklanır.

Ekran: `[gönderen avatarı] —🎁 +puan → [taç alan avatarı]`. Avatara dokununca profil açılır; profilden dönünce ekran yerinde durur. Liste kayar; küçük ekranda isimler kısaltılır, avatarlar üst üste binmez.

## Durumlar ve hata senaryoları

| Durum | Davranış |
|---|---|
| PK başlatılırken bağlantı kopması | Çevrimdışıyken başlat düğmesi kapalı. Başlatma isteği tekrar gelirse (aynı `requestId`) ikinci PK açılmaz, ilk PK döner. |
| PK sırasında odadan ayrılan / mikrofondan inen | Puanı kalır, yeni puan almaz. Takım PK'de takımda kalır, arenada soluk "mikrofonda değil" olarak görünür. |
| Moderatörün mikrofonunu kapattığı kişi | Mikrofonda olduğu için puan almaya devam eder. |
| PK sırasında mikrofona geçen kişi | Normal PK: o andan itibaren katılır. Takım PK: takımsızdır, puan almaz, "PK dışındaki mikrofonlar"da görünür. |
| Tek sayıda katılımcı | Takımlar arasında en fazla 1 kişi fark. |
| Takımlardan birinin boş kalması | Başlatılamaz (takım başına en az 1). PK sırasında bir takımın herkesi inerse PK sürer, puanları kalır. |
| Beraberlik | Yanlış kazanan ilan edilmez; taç verilmez. |
| Hediye başarısız / iade | Başarısız tahsilat PK'ya ulaşmaz; iade yukarıdaki kurala göre. |
| Aynı hediye olayı tekrar gelirse | Reddedilir, sayılır, puan değişmez. |
| Sonuç ekranı açılırken bağlantı kaybı | Çevrimdışıyken oda son alınan PK durumunu gösterir; sonuç bağlantı dönünce açılır. Açılmış sonuç verisi yerelde kalır. |
| Sonuç ekranının iki kez açılması | İzleyici başına "görüldü" kaydı; bir kez açılır. |
| Oda sahibi PK bitmeden ayrılırsa | PK sunucuda sürer ve biter; sahip geri dönünce sonucu ve taçları görür. |
| Taç ekranında veri yok | Nedenini söyleyen boş durum (beraberlik, geçerli hediye yok). |
| İptal (moderatör / oda kapanması) | Kazanan yok, puanlar geçersiz, hediyeler iade edilmez; taç ekranı açılmaz. |

## API (sunucu katmanı, `lib/pk.ts`)

| İşlev | Açıklama |
|---|---|
| `drawTeams(roomId, starterId)` | Sunucuda rastgele, dengeli takım taslağı (`TeamDraft`). |
| `startRoomPk({ roomId, starterId, durationMin, mode, draftId? / red+blue?, requestId? })` | Normal veya Takım PK başlatır; yetki, süre, uygunluk ve takım kurallarını doğrular. |
| `inviteCrossPk`, `answerInvite` | Odalar arası davet akışı (değişmedi). |
| `recordGift(roomId, txId, sender, recipient, giftId, coins)` | Tekil puan kaydı; kime yazılacağına sunucu karar verir. |
| `revokeGift(txId, reason)` | İade kuralı. |
| `computeResult(pk)`, `computeCrowns(pk, …)` | Sonuç ve taç ilişkileri (saf işlevler, testli). |
| `finishNow`, `cancelPk`, `updateConfig` | Yönetim. |

`PkSession` alanları: `mode` (`solo` / `team`), `participants`, `points` (kişi başı PK puanı), `requestId`, `records[].recipientId`, `result.{winner, winners, ranking, crowned, crowns, noCrown}`.

## Testler

`cd app && npm test` (Node yerleşik test koşucusu, ek bağımlılık yok). `tests/pk.test.ts` başlatma, rastgele dağıtımın dengesi (2–15 kişi), yeniden karıştırma, manuel kurallar, puanlama, tekrar eden işlem, geç katılım/ayrılma, takım toplamı tutarlılığı (200 hediye + iade), tek kesinleştirme, beraberlikler, Normal ve Takım tacı, iade ve sonuç sonrası iade, sahibin ayrılmasını kapsar.

Web prototipinde Playwright ile denenenler (390, 360, 320 px): Normal PK başlatma → koltuk altı canlı puanlar → kendi hediyem → yönetim panelinden bitirme → sonuç → taçlar → profil ve geri dönüş; Takım PK manuel dengesizlik uyarısı, rastgele dağıtım ön izlemesi, arena yerleşimi (yatay taşma yok), takım sonucu ve standart yerleşimin geri gelmesi; odalar arası PK (gerileme yok).

**Gerçek cihaz testleri:** farklı cihazlarda ve aynı anda gelen hediyelerle testler gerçek zamanlı altyapı (LiveKit + sunucu) kurulduğunda yapılmalı.

## Sunucuya taşınacaklar

| Tablo | Alanlar |
|---|---|
| `pk_sessions` | id, kind, mode, status, room_id, opponent_room_id, duration_min, config_version, request_id (benzersiz), start_at, end_at, result_json, cancel_reason |
| `pk_team_drafts` | id, room_id, red[], blue[], out[], created_by, created_at (başlatmada tüketilir) |
| `pk_teams` | id, pk_id, name, color, room_id, score |
| `pk_participants` | user_id, pk_id, team_id (Normal PK'de boş), joined_at, state |
| `pk_score_events` | tx_id (benzersiz), pk_id, team_id, sender_id, recipient_id, gift_id, coins, points, status (Doğrulandı / Reddedildi / İade edildi), note, at |
| `pk_crowns` | pk_id, sender_id, recipient_id, points, gifts, share, top (sonuçla aynı işlemde yazılır) |

- **Tutarlılık:** hediye işlemi ve PK puan kaydı aynı veritabanı işleminde; olmazsa telafi kuyruğu.
- **Sayaç ve kesinleştirme:** bitişi zamanlanmış iş tetikler; kesinleştirme `status = active` koşullu tek güncellemedir (iki kez çalışmaz).
- **Mikrofon kontrolü:** "hediye anında mikrofonda mı" sorusu oda katılımcı servisinden aynı işlemde okunur.

## Karar bekleyenler

- **Süre birimi:** şartname "15, 30, 60, 120 saniye" diyor; mevcut sistem ve bu sürüm **dakika** kullanıyor. Saniye isteniyorsa ayrı karar.
- **Mikrofondan inen kişinin puanı:** şu an kalır, yeni puan yazılmaz. Ürün onayı gerekli.
- **Ev sahibi Takım PK'de:** mikrofondaysa rastgele dağıtıma girer; manuelde dışarıda bırakılabilir. Hakem olarak hep dışarıda mı kalsın?
- **Takım tacı:** kazanan takımın puan alan tüm üyeleri mi, yalnızca MVP mi?
- **Beraberlikte taç:** şu an verilmiyor.
- **Taç ödülü:** taç alan veya taç kazandıran için rozet/çerçeve verilecek mi?
- **Kim başlatır:** oda sahibi ve yöneticiler (Normal ve Takım PK).
- **Hazırlık süresi:** 5 saniye.
