# Otomatik mesajlaşma, 5 dakika kuralı ve SimilarClub Sistem

Kaynak: *SimilarClub Birleşik Güncelleme Şartnamesi V2.0* (18 Kasım 2026). Sahiplerin kararları:

- **Cevapsız ücretli mesaj:** yayıncı 5 dakika içinde cevap vermezse erkeğin ödediği jeton **erkeğe iade edilir**.
- **Erkek adına ücretsiz sohbet başlangıcı:** **varsayılan açık**, kişi Mesajlar'dan kapatır.

Kod: `server/api/message-holds.mjs`, `auto-chat.mjs`, `auto-chat-rules.mjs`, `system-notices.mjs`, `migrations/096_auto_chat.sql`.
Uygulama: `app/src/lib/live/auto-chat.ts`, `lib/auto-chat-core.ts`, `lib/msg-reward.ts`, `app/yayinci/mesajlar.tsx`, `app/yayinci/performans.tsx`.

## Kim kullanır

- Şablonlar, otomatik mesaj, hazır cevap ve elmas göstergesi yalnız **onaylı kadın yayıncılarda** (yayıncı kuralı değişmedi: [`YAYINCI_KURALLARI.md`](YAYINCI_KURALLARI.md)).
- Yayıncı olmayan kadın normal mesajlaşır, mesajdan elmas kazanmaz.
- Erkek kullanıcı bu sistemden elmas kazanmaz. Erkek ajans ve aile sahipleri yayıncı sayıldığı için ücretli mesajdan kazanmaya devam eder (karar bekliyor, [`DENETIM.md`](DENETIM.md)).

## 5 dakika kuralı (para)

1. Erkek yayıncıya takipleşmeden yazınca mesaj ücreti (Canlı ayarlar › Mesaj ücreti, 12 jeton) **hemen alınır** ve bekletilir. Ücret hangi jeton partisinden geldiyse orada kayıtlı kalır.
2. Süre, mesaj **sunucuya ulaşınca** başlar ve sunucunun saatiyle sayılır. Telefonun saati bir şey değiştirmez.
3. Yayıncı süre içinde **geçerli cevap** verirse jeton yayıncının elması olur, bugünkü gibi: kilit süresi, kalp puanı, Gelir, ajans komisyonu.
   - Geçerli cevap: kendi yazdığı en az 2 karakterlik mesaj, fotoğraf ya da hazır cevap.
   - Otomatik mesaj cevap sayılmaz.
4. Süre dolarsa jeton **erkeğe, aynı partilere** geri döner. Sonradan gelen cevap o mesaj için ödül getirmez ama performansa "geç cevap" diye yazılır.
5. **Süre sınırı:** son saniyede yazılan cevabın ağda gecikmesi için 10 saniye pay var. Süre + pay içinde sunucuya ulaşan cevap zamanında sayılır.
6. **Tek cevap:** yayıncının bir cevabı, o kişiden gelip bekleyen bütün mesajları birlikte kazanır.
7. **Mağaza iadesi:** satın alma iade edilirse o jetonla bekleyen mesaj kapanır. İade edilen jeton satın almayla gider, kalanı erkeğe döner. Sonra gelen cevap elmas yaratmaz.
8. **Güvenlik:** her adım tekrarlanabilir: aynı mesaj iki kez kazanılmaz, iki cevap aynı anda gelse de bir kez ödenir.
   - Para denetimine yeni kontrol eklendi (`holds`): alınan = yayıncıya geçen ya da iade edilen.
   - Rastgele para testine mesajlar eklendi.
9. **Kuralı kapatmak:** Canlı ayarlar › Otomatik mesaj › "Mesaj cevap süresi" **0** yapılınca eski hâle döner (yayıncı hemen kazanır, iade yok). Gönderilmiş mesaj kendi süresini korur. Bu değişiklik ikinci onay ister.
10. **Döngü yok:** elmas yalnız erkeğin gerçekten ödediği mesajdan gelir. Otomatik mesaj ve hazır cevap kendi başına elmas üretmez, bu yüzden "otomatik mesaj + hazır cevap" döngüsüyle elmas basılamaz.

## Otomatik Mesajlarım (yayıncı)

- Yayıncı Merkezi › **Otomatik Mesajlarım**: 10 şablon.
  - Her biri ayrı kaydedilir ya da "Varsayılana dön" ile geri alınır.
  - "Kişiselleştirilmiş" ya da "Varsayılan" yazar.
- Şablon 5–200 karakter, tek satır. İletişim filtresinden geçer: telefon, IBAN, sosyal medya olmaz.
- Varsayılan 10 mesaj şartnamedeki örnekler. Canlı ayarlar'dan değişir.
- **Günlük 10 otomatik mesaj hakkı**, Türkiye saatiyle 00.00'da yenilenir, devretmez. Hazır cevap hakkından ayrıdır.
- Yayıncı "Otomatik mesajlarım gönderilsin" ile kapatabilir.
- Hak bitince SimilarClub Sistem bir kez haber verir: "Otomatik mesaj hakkın kalmadı. Elmas kazanmak için gelen mesajları yanıtla."

## Eşleştirme (dakikada bir)

**Yayıncının sırası gelir:**

- Yayıncı çevrimiçi (son 15 dakika).
- Hakkı var.
- Son otomatik mesajı en az 20 dakika önce gitti (haklar güne yayılır).
- Cevap bekleyen 3'ten az ücretli mesajı var (meşgul değil).

**Sıra:** son 7 günde 5 dakikada cevap oranı, "yayıncı dağıtım katsayısı" (%50) kadar ağırlıkla; gerisi şans. Yeni yayıncı ortalama sayılır, dışlanmaz.

**Erkek aday:**

- Erkek, yayıncı değil.
- "Otomatik sohbet başlangıçlarını al" açık.
- Son 24 saatte uygulamaya girmiş.
- Son 2 saatte otomatik mesaj almamış.
- Günlük sınırının (3) altında. Otomatik mesajların beşte birinden azına cevap veriyorsa sınır %50 düşer.
- Son 10 dakikada mesaj yazmamış (aktif sohbetini bölmesin).

**Puan:**

- Yeni kullanıcı (7 gün): +40; hiç sohbet etmemişse ×1,5.
- Cevap oranı × 30 (hiç almamışsa yarı puan).
- Çevrimiçi: +20.
- Biraz şans.

**Hiç eşleşmez:**

- Daha önce birbirine yazmış ikili.
- Engelleyen ya da engellenen.
- Aynı yayıncıdan daha önce otomatik mesaj almış kişi.
- "Bana kimler mesaj gönderebilir?" izin vermeyen kişi.
- Mesaj susturması olan yayıncı.

**Şablon seçimi:** en uzun süredir kullanılmayan şablon gider; aynı sözler art arda tekrar etmez.

Otomatik mesaj karşı tarafta **"Otomatik mesaj"** etiketiyle görünür. Erkeğin cevabı normal ücretli mesajdır ve 5 dakika kuralına girer.

## Erkeğin ücretsiz sohbet başlangıcı

- Sistem, erkek adına günde en çok 2 kez havuzdan bir "Merhaba" mesajı gönderir. Havuzu şartnamedeki 5 örnek; Canlı ayarlar'dan değişir, erkek değiştiremez.
- **Önce anlatılır:** yeni APK, Mesajlar'da bir kartla ne olduğunu söyler ("Anladım, açık kalsın" / "İstemiyorum").
  - Kart görülmeden hiç mesaj gitmez.
  - Eski APK kartı gösteremediği için eski APK kullanan erkek adına hiç gitmez.
- Kime gider: "otomatik sohbet al" açık, son 24 saatte girmiş bir kadın. Çevrimiçi olanlar ve yayıncılar öne alınır, gerisi şans.
- Ücretsizdir, jeton düşmez.
- **Elmas kazandırmaz.** Şartnamenin güvenli kuralı: kadının bu mesaja cevabı ödül getirmez; erkeğin sonraki gerçek mesajı normal kurala girer.
- Gönderende "Senin adına gönderilen ücretsiz sohbet başlangıcı", alanda "Otomatik sohbet başlangıcı" yazar. Sunucuda `messages.source = auto_opener` olarak işaretli.

## Hazır cevap

- Sohbette ⚡ düğmesi. Yalnız kadın yayıncıda ve kendisine yazan kişiye.
- Dokununca havuzdaki 5 cevap açılır, üstünde "Bugünkü hazır cevap hakkın: 7/10" yazar.
- Metni sunucu havuzdan alır; telefon metin gönderemez.
- **Günlük 10 hak.** Sayılan yalnız kaydedilen mesajdır: tekrar deneme ya da hata hak yemez. Aynı anda 12 istek gelse de 10'u geçmez.
- Ödüle uygun mesaja süre içinde hazır cevap verilirse elmas kazanılır.
- Hak bitince: "Günlük 10 hazır cevap hakkını kullandın. Mesajlara kendin yanıt vererek elmas kazanmaya devam edebilirsin." Yazarak cevap ve kazanç sürer.

## Elmas göstergesi (sohbet)

Ödüle uygun mesajın altında yalnız yayıncı görür:

| Durum | Yazı |
|---|---|
| Süre işliyor | 💎 +240 Elmas · 04:35 kaldı · 5 dakika içinde yanıtla ve kazan. |
| Cevap verildi, sunucu sonuçlandırıyor | Ödül doğrulanıyor. |
| Kazanıldı (elmas hesaba geçince) | 💎 +240 kazanıldı. |
| Süre doldu | Ödül süresi doldu. |

- Geri sayım sunucunun saatiyle akar.
- Erkek kendi mesajının altında yalnız kendi jetonunu görür: "cevap bekleniyor (gelmezse iade edilir)", "ödendi", "Cevap gelmedi · 12 jeton iade edildi". Yayıncının kazancını görmez.

## Mesaj Performansım ve ajans paneli

**Yayıncı Merkezi › Mesaj Performansım** (bugün, 7 gün, 30 gün, tarih aralığı, en çok 92 gün) şunları gösterir:

- Ortalama cevap süresi.
- 5 dakikada cevap oranı.
- Gelen, cevaplanan, süresi aşılmış ve yanıtsız mesaj.
- Hazır cevapla ve kendi yazarak cevaplanan.
- Kazanılan ve kaçırılan elmas.
- Günlük grafik ve bugünkü haklar.

Hesap kuralları:

- **Oran bütün ödüle uygun mesajlara göre:** az mesajı hızlı cevaplayıp çoğunu cevapsız bırakan yüksek görünmez.
- Ortalama süre ilk geçerli cevaplara göre.

**Ajans ofisi › Mesaj performansı:**

- Yayıncı başına aynı sayılar ve bugünkü hazır cevap kullanımı.
- Ajans geneli ve bir önceki döneme göre değişim.
- En hızlı ve oranı en düşük yayıncılar.
- Yalnız kendi ajansının yayıncıları ("yayıncıları görme" yetkisi olan ajans sahibi ve ekibi).
- **Mesaj içeriği hiçbir zaman gönderilmez.**

## Gecikme uyarısı ve günlük özet

- Her gece 00.10'dan sonra bir kez çalışır:
  - Önceki günün **mesaj kazanç özeti**, o gün ödüle uygun mesaj alan her yayıncıya.
  - **Gecikme uyarısı**: son 3 günde en az 10 ödüle uygun mesajı olup bunların yarısından azını zamanında cevaplayan yayıncıya.
- Uyarı en çok 3 günde bir gider. Son 14 günde uyarı almış yayıncıya ikinci, daha sert metin gider (şartnamedeki iki metin).
- Yönetim bir günü elle yeniden çalıştırabilir. Daha önce giden bildirim tekrar gitmez.

## SimilarClub Sistem

Mesajlar'daki **Similar Ekibi** büyütüldü. Şartnamenin "aynı işlev varsa ikinci modül yapılmasın" kuralına uyuldu: aynı sohbet, yeni APK'da **SimilarClub Sistem** adıyla, doğrulanmış rozetle ve cevap yazılamaz olarak açılır. Yönetimin duyuruları da burada kalır.

| Tür | Kime | Ne zaman |
|---|---|---|
| 📞 Sesli arama kazancı / 📹 Görüntülü arama kazancı | Kazanan | Ücretli arama bitince. Süre, saat, ücretlendirilen dakika, elmas (cüzdan kaydıyla aynı), işlem no |
| Görüşme tamamlandı | Ödeyen | Aynı anda. Yalnız süre ve kendi ödediği jeton |
| 💎 Mesaj kazanç özeti | Yayıncı | Her gece, önceki gün için |
| 💎 Anlık mesaj kazancı | Yayıncı | Bir cevap eşiği aşan elmas getirince (varsayılan kapalı: 0) |
| 🏆 PK sonucu | PK'ya katılanlar | PK süresi bitince. Sıra ya da takım sonucu ve puan. Sunucuda PK ödülü yok, ödül ya da elmas yazılmaz |
| 🚀 Roket ödülü | Kazananlar | Ödül gerçekten verilince |
| 🎁 Etkinlik ödülü | Katılanlar | Ödül çantaya girince. Tür ve süre |
| 🎁 Çanta hediyesi | Alan | Yönetimin verdiği çerçeve, giriş efekti, emoji paketi; seviye ödülleri |
| 🎁 Bonus | Alan | Hoş geldin jetonu, davet ödülü, ilk alım ve kampanya hediyesi, görev ödülü, aile sandığı |
| ⚠️ Performans uyarısı | Yayıncı | Yukarıdaki kurala göre |
| 🔔 Hak bitti | Yayıncı | Otomatik mesaj ya da hazır cevap hakkı bitince, günde bir kez |
| 🔗 Bağlar | Bağın tarafları | İstek (alana), kabul (ikisine), ret, süre dolması ve satın alma iadesiyle iptal (isteyene, iade edilen jetonla), geri çekme (alana), bitirme (diğer tarafa), seviye yükselme ya da düşme (ikisine), hediyesiz bağın bitiş uyarısı ve kendiliğinden bitişi (ikisine). Gece düşen puan için ayrı bildirim yok. Dokununca kendi Bağlar sekmesi açılır. Push yalnız istek, kabul, ret ve bitirmede, eskisi gibi ([`BAGLAR.md`](BAGLAR.md)) |

Kurallar:

- Bildirim **para hareketi kaydolduktan sonra** yazılır, her biri bir kez. Başarısız bildirim ödülü tekrarlatmaz; panelde "başarısız gönderimler" listesine düşer.
- Her tür Canlı ayarlar › SimilarClub Sistem › Kapalı bildirimler ile ayrı kapanır.
- Önemli olanlar telefona da bildirim olarak gelir. Hak bitti ve görüşme bilgisi gelmez.
- Eski APK aynı bildirimleri Similar Ekibi'nde ödül ya da duyuru kartı olarak gösterir.

## Yönetim

**Canlı ayarlar › Otomatik mesaj** (finans panelinde kendiliğinden görünür):

- Kapalı bölümler: yayıncı otomatik mesajları, erkeklerin başlangıcı, hazır cevap.
- Günlük haklar.
- Aralar ve sınırlar.
- Yeni kullanıcı süresi ve önceliği, cevap oranı ağırlığı, çevrimiçi önceliği, yayıncı dağıtım katsayısı, cevapsızlara azaltma.
- Meşgul sınırı.
- Şablon uzunluğu.
- Cevap süresi ve payı, geçerli cevap uzunluğu.
- Uyarı eşikleri.
- Varsayılan şablonlar, başlangıç havuzu ve hazır cevap havuzu (her satır bir mesaj).

**Canlı ayarlar › SimilarClub Sistem:** kapalı bildirim türleri.

**Raporlar** (sunucu hazır, panel sayfası henüz yok):

- `GET /api/admin/auto-chat/report`: platform ve yayıncı başına sayılar, ajans başına sayılar, otomatik mesaj ve başlangıçların cevap oranı, hazır cevap kullanımı, en çok kazanan ödeyen–yayıncı ikilileri (şüpheli döngü incelemesi).
- `GET /api/admin/system-notices`: tür başına gönderilen ve başarısız sayıları, son hatalar.

**Kontrollü canlıya alma:**

- `AUTO_CHAT_SWEEP_MS=0` ile otomatik tur kapatılır.
- Yönetim `POST /api/admin/auto-chat/round` ile tek tur çalıştırıp sonucu izler.

## Eski APK'lar

- Mesaj listesi ve yanıtları bozulmadı, yalnız yeni alanlar eklendi (`source`, `reward`, `fee`, `serverNow`, `category`, `data`).
- **5 dakika kuralı eski APK'daki yayıncıyı da kapsar** ama geri sayımı göstermez. Yeni APK çıkınca Zorunlu sürüm yükseltilmeli ([`DENETIM.md`](DENETIM.md)).
- Eski APK'daki erkek adına başlangıç gitmez; otomatik mesajları ise alır (etiketsiz görür).
- Eski APK hazır cevap ve şablon göstermez.

## Veri ve silme

- Kişisel veri kopyasında (`my-data.mjs` › `autoChat`): şablonlar, kullanılan haklar, gönderilen ve alınan otomatik mesajlar, cevap bekleyen ücretli mesajlar.
- Hesap silinince şablonlar silinir. Haklar ve gönderimler kayıt olarak kalır.
- Silinen hesabın bekleyen ücretli mesajı süresi dolunca ödeyene iade edilir.
