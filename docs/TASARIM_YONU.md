# SimilarClub Tasarım Yönü ve Temel UX Kararları (v1)

Bu belge SimilarClub'ın özgün tasarım dilini, her ekranda uygulanacak UX kurallarını ve ilk yeniden tasarlanan ekranı (Hediye gönder paneli) tanımlar. Referans ekranlar (Timo, BIGO, Clubhouse, Discord, TikTok LIVE, Twitch) yalnız **analiz girdisidir**; yerleşimleri, renkleri ve bileşenleri kopyalanmaz.

Durum: **Onay bekliyor.** Onaylandıktan sonra sıradaki ekranlar aynı sistemle tasarlanır (bkz. "Sonraki ekranlar").

---

## 1. Tasarım yönü: "Ortak frekans"

SimilarClub'ın vaadi: *benzer insanlarla aynı anda, sesle buluşmak.* Görsel kimlik bu fikirden çıkar:

| Karar | Gerekçe |
| --- | --- |
| **Sakin koyu zemin, tek canlı eylem rengi.** Mürdüm-lacivert yüzeyler (`bg`, `card`, `cardAlt`), eylemler mor. | Uygulama çoğunlukla akşam ve gece, uzun oturumlarda kullanılıyor. Koyu zemin gözü yormuyor; tek eylem rengi, gözün ilk bakışta doğru butonu bulmasını sağlıyor (Von Restorff). |
| **Renk = anlam.** Mor eylem, pembe sosyal, altın **yalnız para**, yeşil **canlı / ses açık**, kırmızı yalnız tehlike ve okunmamış sayısı. | Kullanıcı rengi bir kez öğrenir: altın gördüğü yerde jeton harcanır veya kazanılır. Referans uygulamalarda altın; rozet, başlık ve reklamda da kullanıldığı için anlamını yitiriyor. |
| **Gradyan nadir.** Mor→pembe gradyan yalnız ekranın tek birincil butonunda. | Bugün 97 yerde gradyan vardı; her şey özel görününce hiçbir şey öne çıkmıyor. |
| **Sesin görünür hali yeşil halka.** Konuşan kişi kalın, nabız atan yeşil halkayla; mikrofon durumu renk + ikon + yazıyla. | Sesli odanın en önemli bilgisi "kim konuşuyor, ben açık mıyım". Renk körlüğü için tek başına renk kullanılmıyor. |
| **Finans ekranları daha sade.** Animasyon, parıltı, gradyan yok; düz kartlar, tabular rakamlar, durum etiketleri. | Para ekranında güven, eğlenceden önce gelir. |
| **Sosyal ekranlar sıcak.** Avatar halkaları, hediye animasyonları, yumuşak köşeler. | Eğlence ve bağ kurma hissi sosyal alanlarda kalır. |

### Tasarım tokenları (kodda: `app/src/theme.ts`)

| Grup | Değerler |
| --- | --- |
| Yüzeyler | `bg #120B24` · `card #1E1538` · `cardAlt #2A1F4A` · `border #33285A` |
| Yazı | `text #FFFFFF` · `textDim #A79CC9` (bg üzerinde 7,5:1) · `primaryText #A78BFA` (koyu zeminde mor yazı, 7:1) |
| Anlamlı renkler (`semantic`) | `action #7C3AED` (beyaz yazı 5,7:1) · `social #DB2777` · `money #FBBF24` + `moneyInk #3B2300` · `live #22C55E` + `liveInk #052E16` · `danger #F87171` · `tonal` (%18 mor) |
| Birincil gradyan | `#7C3AED → #DB2777` (beyaz yazı iki uçta da ≥ 4,5:1) |
| Boşluk (`space`, 4 pt) | 4 · 8 · 12 · 16 · 24 · 32 |
| Köşe (`radius`) | 8 küçük · 12 kart içi · 16 kart · 24 alt panel · 999 hap/çip |
| Yazı ölçeği (`type`) | 12 açıklama (en küçük) · 14 gövde · 16 büyük gövde · 18 başlık · 22 ekran başlığı · 24 tutar. Tutarlar `tabular-nums` |

Açık tema: tokenlar merkezi olduğu için mümkün; ancak eski ekranlarda doğrudan yazılmış ~150 renk kodu var. Açık tema, ekranlar bu tokenlara taşındıkça açılacak (varsayım: lansmanda yalnız koyu tema).

### Bileşen standartları

- **Buton (`Button`).** Varyantlar `hero` (ekran başına bir; basınca aşağı inen tuş), `money` (jeton harcatan / kazandıran eylem), `tonal` (ikincil), `ghost` (üçüncül), `danger` (geri alınamaz). En az 48 px yükseklik. Durumlar: normal, basılı, odak, devre dışı (%50), yükleniyor (sonraki adım).
- **Çip.** 36–40 px yükseklik, seçilince dolgu + beyaz yazı + (çoklu seçimde) onay işareti.
- **Kart.** `card` zemin, 16 px köşe, 16 px iç boşluk, gölge yok.
- **Alt panel (bottom sheet).** Tutamak, başlık, sağ üstte görünür **kapat** düğmesi; dışarı dokununca kapanır.
- **Bildirim satırı (notice).** Tek satır ikon + metin; `info` gri, `warn` altın zemin, `lock` kilit ikonu. Renk tek başına anlam taşımaz, her zaman ikon da vardır.
- **Durum etiketi.** Kısa metin + ton (bilgi / uyarı / başarılı / hata / nötr).
- **İkonlar.** Ionicons; pasif durumda çizgi (`outline`), aktif durumda dolu.
- **Hareket.** Basma geri bildirimi 90 ms; geçişler ≤ 250 ms. "Hareketi azalt" ve "efektleri kapat" ayarları hediye animasyonlarını ve titreşimi kapatır.

---

## 2. Her ekranda uygulanan UX kuralları

1. **Tek birincil eylem.** Ekranda yalnız bir `hero` veya `money` buton.
2. **Önce maliyet, sonra eylem.** Jeton harcatan her ekranda toplam (adet × fiyat × kişi) ve kalan bakiye butondan önce görünür.
3. **Yüksek tutar için ikinci dokunuş.** `bigSpendConfirm` eşiği (varsayılan 1.000 jeton) üstünde buton "Onayla ve gönder" olur. Yanında "Vazgeç" çıkar. Seçim değişirse onay düşer.
4. **Yetersiz bakiye işlemi bozmaz.** Eksik miktar yazılır, buton "Jeton yükle" olur, kullanıcı satın almadan odaya dönebilir.
5. **Yetkisiz işlem eylem gibi görünmez.** Kilitli öğe soluk + kilit + gereken seviye; seçilince ne gerektiği ve nasıl açılacağı yazılır.
6. **Durum görünür.** Yükleniyor / bekliyor / başarılı / başarısız / izin yok durumlarının her biri ayrı metin ve ikonla gösterilir.
7. **Modal'dan çıkış açık.** Her panelde kapat düğmesi; geri hareketi bir önceki bağlama döner.
8. **Baskı yok.** Geri sayım, sahte aciliyet, "X jeton daha harca" çağrısı ve sahte popülerlik göstergesi kullanılmaz. Seviye ilerlemesi bilgi olarak, sessizce gösterilir.
9. **Dokunma alanı ≥ 44–48 px, en küçük yazı 12 px, metin kontrastı ≥ 4,5:1.**
10. **Ekran okuyucu.** Her etkileşimli öğenin anlamlı etiketi ve durumu (seçili, işaretli, devre dışı) vardır.
11. **Rakam biçimi tek.** Türkçe ayırıcı (`4.950`), jeton 🪙 ve elmas 💎 ayrı birimler; asla tek bir "bakiye" olarak karıştırılmaz.

---

## 3. Referans analizi: Hediye paneli (Timo ekranları)

**İşlev.** Odadaki bir veya birden fazla kişiye ücretli sanal hediye göndermek; kataloğu gezmek, adet seçmek, bakiye görmek.

**Kullanıcı amacı.** "Bu kişiye bu hediyeyi, bilerek ve doğru kişiye göndereyim." İkincil: ucuz/pahalı hediyeyi bulmak, ücretsiz hediyelerimi kullanmak.

**Deneyim analizi.**

| İşe yarayan | Sorun yaratan |
| --- | --- |
| Alt panel olarak açılması; oda arkada görünür kalıyor | **Toplam maliyet görünmüyor.** Adet × fiyat × kişi hiçbir yerde yazmıyor; "Gönder" her tutarda tek dokunuş |
| Kategoriler (popüler, etkileşimli, çift, ayrıcalık) | Alıcılar yalnız koltuk numarasıyla; iki ayrı "All" (ev ve mikrofon ikonlu) ne seçtiği belirsiz |
| Favoriler ve çanta (ücretsiz hediyeler) | Seviye çubuğu "270.68k jeton göndererek Lv19'a yüksel" + "+155": harcamaya yönlendiren baskı |
| Adet ön ayarları | Panel açıkken JACKPOT, SVIP, "%20 yakınlık" bantları odanın üstünü kaplıyor (reklam kalabalığı) |
| Kilitli (SVIP) hediyelerin görünmesi | Kartlarda 2–3 küçük rozet (S5, 🎵, 3D, CP, taç, ????) açıklamasız; kilitli hediye seçilebilir gibi duruyor |
| | Karışık dil (Hot, Gameplay, All), İngilizce sayı biçimi (4,950), düşük kontrastlı bakiye ("84 şarj") |
| | "Gameplay" sekmesinde atış hediyeleriyle şans/jackpot hediyeleri aynı yerde (hukuki risk; SimilarClub'da şans hediyesi yok) |
| | Sıralama gizli: "Hot" sekmesine tekrar dokununca sıralama değişiyor |

**SimilarClub çözümü.** Panel üç soruya göre yukarıdan aşağı akar: **Kime → Ne → Ne kadar**, en altta tek eylem.

---

## 4. Ekran: Hediye gönder paneli

Kod: `app/src/components/room/gift-sheet.tsx` (oda ekranından açılır; eski `GiftSheet` kaldırıldı).

1. **Amaç.** Seçilen kişiye/kişilere seçilen hediyeyi, toplam maliyeti görerek göndermek.
2. **Hedef kullanıcı ve bağlam.** Sesli odadaki dinleyici veya konuşmacı; tek elle, oda akışını kaçırmadan.
3. **Birincil eylem.** `Gönder · {toplam}` (altın `money` buton). Duruma göre `Onayla ve gönder`, `Jeton yükle`, `Ücretsiz gönder`, `SVIP ayrıcalıklarını gör`, `Önce alıcı seç` (devre dışı) olur. Aynı anda tek eylem.
4. **Bilgi hiyerarşisi.**
   - Başlık satırı: "Hediye gönder", sessiz hediye seviyesi, bakiye çipi (cüzdana gider), kapat.
   - **Kime:** "Herkes (n)" çipi + isimli avatar çipleri (çoklu seçim, seçilende onay işareti).
   - **Raflar:** Popüler · Eğlenceli · İkili · Özel · ★ Favoriler · Çantam (adet). Altında rafı açıklayan tek nötr satır ve görünür **Fiyat** sıralama düğmesi (varsayılan → ucuzdan → pahalıdan).
   - **Izgara:** 4 sütun; görsel, ad, fiyat. En fazla bir köşe rozeti (3D / ♪). Kilitli hediyede fiyat yerine "🔒 SVIP n".
   - **Özet:** hediye, `fiyat × adet × kişi`, yakınlık (ikili hediyelerde), sağda **Toplam**.
   - **Bildirim satırı:** kalan bakiye / eksik tutar / onay uyarısı / kilit nedeni / çanta kaynağı.
   - **Eylem satırı:** adet düğmesi (×1 ▾, ön ayarlar) + birincil buton.
5. **Bileşenler.** Alt panel, çip, raf çipi, hediye karosu, durum satırı, `Button` (`money`, `hero`, `tonal`, `ghost`).
6. **Etkileşimler.**
   - Karoya dokun: seç.
   - Uzun bas: favoriye ekle/çıkar.
   - Kilitli karo: seçilir, ama eylem "SVIP ayrıcalıklarını gör" olur.
   - Yüksek tutar: ilk dokunuş onay durumuna geçer; seçim değişince onay düşer.
   - Gönderimden sonra panel kapanır, odada animasyon ve sistem mesajı çıkar.
   - Bakiye çipi ve "Jeton yükle" cüzdana gider; geri tuşu odaya döner.
7. **Durumlar.**

   | Durum | Ne görünür |
   | --- | --- |
   | Koltukta kimse yok | Açıklama ve devre dışı buton |
   | Alıcı seçilmedi | "Önce alıcı seç" |
   | Yeterli bakiye | Kalan bakiye |
   | Yetersiz bakiye | Eksik tutar ve "Jeton yükle" |
   | Eşik üstü tutar | Onay uyarısı, "Vazgeç" ve "Onayla ve gönder" |
   | Kilitli hediye | Gereken seviye ve senin seviyen |
   | Çanta | Kaynak ve adet; adet yetmezse "Adedi azalt" |
   | Boş raf (favori, çanta) | Rafa nasıl hediye ekleneceği |

   Ağ hatası ve "gönderiliyor" durumu backend gelince eklenecek (açık konu).
8. **Küçük ekran.**
   - Panel en fazla ekranın %82'si.
   - Izgara kayar; özet ve eylem satırı sabit kalır.
   - Uzun hediye adı tek satırda kısaltılır.
   - Alıcılar ve raflar yatay kayar.
9. **Erişilebilirlik.**
   - Alıcı çipleri `checkbox`, raflar `tab`, karolar `button`; hepsinin durumu (seçili, işaretli) okunur.
   - Karo etiketi ad, fiyat, kilit ve favori bilgisini içerir.
   - Toplam ayrıca okunur.
   - Dokunma alanları ≥ 36–52 px; en küçük yazı 12 px.
   - Renk tek başına anlam taşımaz (ikon + metin).
10. **Bağlantılar.**
    - Oda alt çubuğundaki altın hediye butonu açar.
    - Koltuktaki kişiye "Hediye gönder" o kişi seçili açar.
    - Cüzdan / jeton yükleme ve SVIP merkezi buradan açılır.
    - Gönderim, odadaki hediye animasyonuna ve sistem mesajına bağlanır.

**Korunan işlevler.** Çoklu alıcı ve herkesi seçme, dört kategori, fiyat sıralama, favoriler (uzun basma), ücretsiz çanta ve stok düşümü, SVIP kilidi, adet ön ayarları ve etiketleri, ikili hediye yakınlığı, hediye seviyesi, cüzdan geçişi, oda tarafındaki bakiye düşümü, defter kaydı, PK puanı, katkı sıralaması ve efekt ayarları.

**Kabul kriterleri.**
- [ ] Gönder düğmesine basmadan önce toplam ve kalan bakiye görünür.
- [ ] Toplam ≥ eşik ise tek dokunuşla gönderim olmaz; onay ekranında tutar yazar.
- [ ] Onaylı gönderimde ikinci bir sistem penceresi açılmaz.
- [ ] Bakiye yetmiyorsa eksik tutar yazar ve eylem "Jeton yükle" olur.
- [ ] Kilitli hediye gönderilemez; neden ve çözüm yazar.
- [ ] Çantadan gönderimde jeton düşmez, stok düşer.
- [ ] Kapat düğmesi ve dışarı dokunma paneli kapatır.

---

## 5. Açık konular ve geçici varsayımlar

| Konu | Geçici varsayım |
| --- | --- |
| Alt navigasyon: A (5 eşit) mı B (4 + ortada oda aç) mı | Bugünkü yapı B'ye yakın; iki seçenek prototiplenip görev süresi ve hata oranıyla test edilecek |
| Açık tema | Lansmanda yalnız koyu tema; tokenlar hazır |
| Marka yazı tipi | Sistem yazı tipi (performans, Türkçe karakter). Özel yazı tipi ayrı karar |
| Hediye animasyon formatı | Küçükler Lottie, büyükler şeffaf video; ayrı iş |
| Yüksek tutar eşiği | 1.000 jeton (Ayarlar'dan değişir); kullanıcı testiyle doğrulanacak |
| Şans / jackpot hediyeleri | Yok. Hukuki görüş olmadan eklenmeyecek |
| Kulüp logosu, dini ve milli sembollü hediyeler | Lisans ve hassasiyet incelemesi olmadan yok |

## 6. Sonraki ekranlar (onaydan sonra, bu sırayla)

1. **Canlı oda:**
   - Konuşmacı / dinleyici ayrımı
   - Konuşma isteği ve iptali
   - Ayrılırken mikrofonun kapanması
   - Boş ve hata durumları
2. **Ana Sayfa ve Keşfet:**
   - Takip edilenlerin canlıları
   - "Bunu gösterme" seçeneği
   - Aramanın yükleniyor, boş ve hata durumları
3. **Coin satın alma ve cüzdan:**
   - Paket koşulları
   - Ödeme bekliyor, başarılı ve başarısız ekranları
4. **Mesajlar:**
   - Mesaj istekleri
   - Gönderildi, iletildi ve hata durumları
   - Engelleme, raporlama ve sessize alma
5. **Profil** ve **İlk kullanım:**
   - İlgi alanı seçimi atlanabilir olur.
   - Mikrofon izni ancak konuşmacı olunca istenir.
6. **Yayıncı, ajans, BD ve Admin panelleri:** aynı sistemle sadeleştirilir.

Her ekran bu belgedeki 10 başlıkla (amaç → bağlantılar) ve kabul kriterleriyle teslim edilir.
