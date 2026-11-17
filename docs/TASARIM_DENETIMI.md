# Tasarım denetimi: Ana Sayfa ve Profil (17 Kasım)

Müşterinin iki isteği ele alındı:

- Ana Sayfa ekran görüntüsünün üstüne yazdığı notlar.
- "Bu görsel setlerine göre ayarlasın profil ve gerekli yerleri" (profilin dört görseli).

İş, sahibin gönderdiği "SimilarClub Master UX/UI" protokolüyle yürüdü: incele, teşhis et, önceliklendir, tasarla, uygula, test et, raporla.

**Durum:** Uygulandı. Yeni APK ile gelir; sunucu değişmedi. Eski APK'lar eskisi gibi görünür.

## İnceleme

- **Teknoloji:** Expo SDK 58, React Native, Expo Router.
  - Stiller `makeStyles` ve `src/theme.ts` tokenlarıyla yazılıyor.
  - Pembe cam görünüm #163'te Ana Sayfa'ya geldi, ama renkleri yalnız o dosyadaydı.
- **Profilin görselleri yeni bir ekran değil:** Uygulamadaki profilin (`kullanici/[id].tsx`) yeniden çizilmiş hâli.
  - Görsellerdeki her bölüm uygulamada zaten var.
  - Değişen: başlığın düzeni, bölümlerin sırası ve görünüşü.
- **Ekranlar tarayıcıda açıldı:** Expo web, demo hesabı, 412 × 915, açık ve koyu tema. Müşterinin ekranıyla birebir aynı çıktı. Önceki ve sonraki görüntüler PR'da.

## 1. Teşhis

Önem: P0 kritik, P1 yüksek, P2 orta, P3 düşük.

### Ana Sayfa

| # | Sorun | Kullanıcıya etkisi | İlke | Önem |
|---|---|---|---|---|
| A1 | Liste sekmeleri büyük yazıyla sığmıyor; "Öne çıkanlar" kupanın çizgisinde "Öne çık…" diye kesiliyor | Sekme okunmuyor, hata gibi duruyor | Estetik ve sade tasarım | P2 |
| A2 | Kişi kartlarında ilgi alanları iki satıra taşıyor: kart ~120 px, ilk ekranda 3 kişi | Asıl iş (birini bulup selam vermek) için daha çok kaydırma | Estetik ve sade tasarım | P2 |
| A3 | Alt menü: seçili sekmenin pembe hapı camın yuvarlak ucundan taşıyor (Ana Sayfa'da ve Ben'de). Yüzen camın çevresinde sayfadan ayrı renkte bir şerit kalıyor | "Oturmuyor": özensiz görünüyor | Tutarlılık ve standartlar | P2 |
| A4 | Karşılama yazısı (21 pt) ekranın en büyük yazısı | Asıl içerikle yarışıyor, hiyerarşi ters | Estetik ve sade tasarım | P3 |
| A5 | "%75 benzer" ve "Takipte" pembe yazı: beyazda 4,4:1, pembe hapta 3,2:1 (AA en az 4,5:1) | Az gören kullanıcı zor okur | Erişilebilirlik (WCAG 1.4.3) | P2 |

### Profil

| # | Sorun | Kullanıcıya etkisi | İlke | Önem |
|---|---|---|---|---|
| P1 | "Ödül Kazan" kartı. Profili tamamlamanın uygulamada da sunucuda da hiçbir ödülü yok | Olmayan bir şeyi vaat ediyor. Google Play yanıltıcı sayabilir (#164 ile aynı ilke) | Güven; sistem ile gerçek dünya uyumu | P1 |
| P2 | Üstteki 240 px'lik kapak yalnız profil fotoğrafının büyütülmüşü | Ad, rozetler ve sekmeler ekranın altına itiliyor | Estetik ve sade tasarım | P2 |
| P3 | Koyu temada bölümler koyu kartlarda, gri şeritlerle ayrılmış | Ana Sayfa'nın pembe cam diliyle iki ayrı uygulama gibi | Tutarlılık ve standartlar | P2 |
| P4 | Kimlik bölümleri (slogan, doğrulama, temel bilgiler) albümün ve kişisel profilin altında | Önce kim olduğu değil, ikincil bilgiler görünüyor | Görsel hiyerarşi | P3 |
| P5 | Başkasının profilinde boş bölümler yer kaplıyor: "Ajansı yok", "Henüz albüm fotoğrafı yok" | Bilgi vermeyen boşluk | Estetik ve sade tasarım | P3 |

## 2. Bilgi mimarisi

### Ana Sayfa

- **Korunan:** karşılama, dört kutu, liste sekmeleri, kişi kartı. Kartta fotoğraf, isim, rozetler, yaş ve benzerlik var; Selam / Sohbet ve Takip düğmeleri duruyor.
- **Kaldırılan:** kişi kartındaki ilgi alanları. İlgi alanları profilde ("Kişisel profil") ve benzerlik kartında duruyor. Karttaki "hakkında" satırı da kalktı; her kart aynı boyda ve kısa.
- **Akış:** Ana Sayfa → kişiye bak → Selam (tek dokunuş, değişmedi). İlk ekranda 3 yerine 5 kişi.

### Profil (görseldeki sıra)

1. **Başlık:**
   - Solda çerçeveli fotoğraf, yanında fotoğrafın büyüğü (kapak, artık üstte değil).
   - Ad hapı ve @kullanıcı adı hapı (dokununca kopyalanır).
   - Rozetler, ajans ve aile hapları.
   - Çevrimiçi | şehir hapı; "hakkında" hapı (benim profilimde kalemle).
   - İstatistik kartı, sekmeler.
2. Arkadaşlık Sloganı.
3. Doğrulama.
4. Temel Bilgiler.
5. **Bölüm 5:**
   - Benim profilimde: Profilini tamamla ve Yalnızca sen görürsün.
   - Başkasının profilinde: Ortak noktalarınız ve Hayran kulübü.
6. Albüm.
7. Kişisel profil.
8. Kişilik Etiketleri.
9. Oda, Ajans, Aile (küçük etiket başlıklarla).

Ek kurallar:

- **Başkasının profilinde boş bölüm gösterilmez:** albümü, ajansı, ailesi olmayan; slogan yazmamış.
- **Benim profilimde boş ajans ya da aile:** "Henüz bir ajansa katılmadın · Katıl ›" kartı.
- **Diğer sekmeler değişmedi:** Anlar, Vitrin, Bağlar ve başkasının profilindeki Takip et / Mesaj / Ara / Hediye çubuğu.

## 3. Arayüz ve metin reçetesi

### Ortak cam tokenları (`src/theme.ts` → `glass`)

Ana Sayfa'nın yerel paleti tek yere taşındı. Ana Sayfa, alt menü ve profil aynı renkleri kullanıyor. İki temada da aynılar: açık camın üstünde koyu mürekkep.

| Token | Değer | Ne için | Kontrast (beyaz / cam / pembe hap) |
|---|---|---|---|
| `ink` | #2B0A1C | Yazı, rakam | 18,1 / 16,4 / 13,0 |
| `deep` | #8E1450 | Başlıklar, seçili ad | 8,9 / 8,1 / 6,4 |
| `plum` | #7A4A63 | İkincil yazı, seçilmemiş simge | 7,0 / 6,4 / 5,1 |
| `pink` | #E0287D | Alt çizgi, halka, seçili simge; **küçük yazıda kullanılmaz** | 4,4 / 4,0 / 3,2 |
| `fill` | #FFF0F7 | Çubuklar, dış kartlar | |
| `white` | #FFFFFF | İç kartlar, haplar | |
| `tint` | #F9D0E4 | Seçili hap, bölüm başlığı | |
| `well` | #FBE3EE | Simge kuyusu, fotoğraf yeri | |
| `line` | rgba(226,150,192,.55) | Satır çizgileri, hap kenarı | |

### Ana Sayfa

| Parça | Önce | Sonra |
|---|---|---|
| Karşılama | 60 px şerit, 21 pt yazı | 50 px şerit, 17 pt yazı, el 38 px |
| Liste sekmeleri | 54 px çubuk, 15/16 pt | 46 px çubuk, 13/14 pt. "Öne çıkanlar" tam görünüyor. Sağda başka liste varken kenarda yumuşak bir solma var (kaydırılabildiğini söyler) |
| Kişi kartı | Fotoğraf 78 px; 3 satır | Fotoğraf 64 px; 2 satır (ad + rozetler; yaş + benzerlik), iç boşluk 8 px, kartlar arası 8 px |
| "%75 benzer" | Pembe yazı | Pembe kenar, koyu pembe (`deep`) yazı |
| "Takipte" | Pembe yazı | `deep` yazı |
| Alt menü | Kenardan 8 px içeride yüzen cam | Ekranın altına oturan cam, üst köşeler 24 px yuvarlak, sistem tuşlarının altına kadar iniyor. Sekmeler 10 px içeriden başlar, seçili hap camdan taşmaz. Seçili ad `deep` |

### Profil

| Parça | Ölçü / token |
|---|---|
| Üst düğmeler (geri, kalem / ⋯) | 38 px cam daire, `ink` simge |
| Kaydırınca üst çubuk | 46 px cam hap: geri, ad, kalem; altında sekme hapı |
| Fotoğraf + kapak | Fotoğraf 96 px çerçeveli. Kapak kartı kalan genişlikte, 108 px yüksek, 20 px yuvarlak, beyaz kenar. Fotoğraf yoksa açık pembe kuyu, büyük silüet |
| Ad hapı | `fill`, 22 pt ExtraBold `ink`, bayrak |
| @kullanıcı adı, durum, hakkında hapları | `fill` / `white`, 13–14 pt, `plum` / `ink`. Çevrimiçi `deep` kalın; kalem `tint` daire |
| İstatistik kartı | `fill`, 18 px yuvarlak; rakam 17 pt ExtraBold `ink`, etiket 12 pt `plum`, `line` ayraç |
| Sekmeler | 48 px cam hap; seçili 16 pt ExtraBold `ink` + 20 × 3 px pembe çizgi, diğerleri 15 pt `plum` |
| Bölüm başlığı | Tam genişlikte `tint` bar, 34 px, 15 pt Bold `deep`; açılıyorsa sağda ›. Oda, Ajans, Aile'de kısa etiket |
| Kartlar | `white`, 18 px yuvarlak, `line` kenar, yumuşak gölge. Simge kuyusu 40 / 48 px; satırlar arası `line` çizgi |
| Profilini tamamla | Pembe → mor → mavi geçiş, beyaz "Profili Düzenle ›" hapı, ilerleme çubuğu, "%62" |
| Bölümler arası | 14 px (eski 8 px gri şerit ve 16 px boşluklar yerine) |

### Metinler

| Önce | Sonra | Neden |
|---|---|---|
| Ödül Kazan | Profilini tamamla | Ödül yok; olmayanı vaat etmiyoruz |
| Tamamlanma Oranı · 62% | Tamamlanma oranı · %62 | Türkçede yüzde işareti başta |
| Ajans · Katıl (başlıkta) | Henüz bir ajansa katılmadın · Katıl › | Ne olacağı açık |
| Aile · Katıl | Henüz bir aileye katılmadın · Katıl › | Aynı |
| Başkasında "Ajansı yok", "Henüz albüm fotoğrafı yok" | Gösterilmez | Bilgi vermeyen boşluk |

### Erişilebilirlik

- **Kontrast:** Bütün yazılar AA (4,5:1) ve üstü; pembe yalnız simge ve çizgide.
- **Ekran okuyucu:** Sekme çubuğu `tablist`. Bölüm başlıkları `header`; açılıyorsa `button`. Kartların erişilebilirlik adları var: "Oda: …", "Ajans: …, Ajans sahibi", "Henüz bir ajansa katılmadın. Ajansa katıl".
- **Dokunma alanı:** Düğmeler en az 38 px, `hitSlop` ile 44 px.

## 4. Uygulama

**Dosyalar:**
- `src/theme.ts`: `glass`.
- `src/app/(tabs)/_layout.tsx`: alt menü.
- `src/app/(tabs)/kesfet.tsx`: Ana Sayfa.
- `src/app/kullanici/[id].tsx`: profil.
- `src/components/similarity.tsx`, `src/components/profile-badges.tsx`: profil için `glassy` seçeneği. Odadaki kişi kartı ve Ben sekmesi eskisi gibi.

**Dokunulmayanlar:**
- Veri, sunucu istekleri, yetki ve gizlilik kuralları.
- Doğum günü yine yalnız sahibine görünür; diğerleri yaşını görür, sunucu tarihi göndermez.
- Anlar, Vitrin, Bağlar sekmeleri.

**Denendi:**
- `tsc` ve lint temiz; uygulama testleri 1195 geçti, 0 hata.
- Tarayıcıda, açık ve koyu temada:
  - Ana Sayfa;
  - kendi profilim (başlık, kayan üst çubuk, bütün bölümler);
  - başkasının profili (ortak noktalar, hayran kulübü, alttaki çubuk).

**Telefonda bakılacaklar (tarayıcı gösteremez):**
- Alt menünün sistem tuşlarıyla birleşmesi: üç düğmeli ve hareketle gezinme.
- Uzun isimlerde ad hapı.
- Fotoğrafı olan bir hesapta kapak kartı.

## Ölçülecekler (ölçülmedi, beklenti)

- **Ana Sayfa'da ilk ekranda görünen kişi: 3 → 5.** Düzenden sayıldı, kullanıcıdan ölçülmedi. Beklenti: Selam ve profil açma oranı artar. Ölçmek için kişi kartından selam ve profil açma sayısı, sürüm öncesi ve sonrası karşılaştırılmalı.
- **Profilde sekmelere kadar olan yükseklik ~80 px kısaldı.** İlk bölüm ilk ekranda görünüyor. Beklenti: profil tamamlama ve düzenleme dokunuşu artar.

## Sahibin kararı

- **Profil tamamlamaya gerçek bir ödül verilecek mi?** Örnek: %100'de bir kerelik jeton ya da çerçeve. Bu bir para kararı. Verilirse sunucuya görev olarak eklenir (tek sefer, `ref` ile). Kartın başlığı da o zaman yeniden "Ödül Kazan" olur.
