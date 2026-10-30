# SimilarClub Tasarım Yönü ve Temel UX Kararları (v2)

Bu belge SimilarClub'ın özgün tasarım dilini, her ekranda uygulanacak UX kurallarını ve ilk yeniden tasarlanan ekranı (Hediye gönder paneli) tanımlar. Referans ekranlar (Timo, BIGO, Clubhouse, Discord, TikTok LIVE, Twitch) yalnız **analiz girdisidir**; yerleşimleri, renkleri ve bileşenleri kopyalanmaz.

Durum: **Palet v2 "Gece mavisi" uygulandı** (gece laciverti zemin, turkuaz marka rengi, mercan sosyal, altın para ve VIP; mor tamamen kaldırıldı). Sonraki ekranlar aynı sistemle tasarlanır (bkz. "Sonraki ekranlar").

---

## 1. Tasarım yönü: "Gece mavisi" (ortak frekans)

SimilarClub'ın vaadi: *benzer insanlarla aynı anda, sesle buluşmak.* Görsel kimlik bu fikirden çıkar:

| Karar | Gerekçe |
| --- | --- |
| **Gece laciverti zemin, tek marka rengi turkuaz.** Lacivert yüzeyler (`bg`, `card`, `cardAlt`), eylemler ve marka turkuaz. **Mor yok.** | Mürdüm/mor zemin ve mor→pembe gradyan kategorinin (Timo, Yalla) ortak paleti; mor olmadan SimilarClub ilk bakışta ayırt edilir. Lacivert sakin ve güven verir, gece kullanımında gözü yormaz. |
| **Renk = anlam.** Turkuaz eylem + canlı/ses (çevrimiçi, konuşuyor, mikrofon açık), mercan **yalnız sosyal** (beğeni, takip, kalp, yakınlık, mesaj), altın **para ve değer** (jeton, hediye, VIP, ödül), yeşil başarılı/onaylandı, kırmızı yalnız hata ve okunmamış sayısı (her zaman ikonla). | Kullanıcı rengi bir kez öğrenir. Mercan ile hata kırmızısı birbirine yakın olduğu için hata durumları ayrıca ikon ve metin taşır. |
| **Parlak dolgularda koyu yazı.** Turkuaz, mercan ve altın butonlarda yazı gece laciverti. Küçük dolgular (seçili çip, etiket) derin turkuaz `#087A80` + beyaz yazı. | Beyaz yazı parlak turkuaz üzerinde 1,75:1, mercanda 2,85:1, altında 1,7:1 ile okunmaz; lacivert yazı 6,7–11:1. |
| **Turkuaz: sesin ve markanın rengi.** Konuşan kişi kalın, nabız atan turkuaz halkayla; açık mikrofon turkuaz ve "AÇIK" yazılı; ana butonlar düz turkuaz. Durum her zaman renk + ikon + yazıyla. | Sesli odalarda neredeyse kimse turkuaz kullanmıyor; tek renk hem markayı hem "canlılık" hissini taşıyor. |
| **Finans ekranları daha sade.** Animasyon, parıltı, gradyan yok; düz kartlar, tabular rakamlar, durum etiketleri. | Para ekranında güven, eğlenceden önce gelir. |
| **Sosyal ekranlar sıcak.** Avatar halkaları, hediye animasyonları, yumuşak köşeler. | Eğlence ve bağ kurma hissi sosyal alanlarda kalır. |

### Tasarım tokenları (kodda: `app/src/theme.ts`)

| Grup | Değerler |
| --- | --- |
| Yüzeyler | `bg #080F1E` · `card #16253C` · `cardAlt #1F3050` · `border #2B3F63` |
| Yazı | `text #FFFFFF` · `textDim #A3B1CF` (bg 8,9:1 · card 7,2:1 · cardAlt 6,1:1) · `primaryText #13D9DF` (koyu zeminde turkuaz yazı, 10,9:1) |
| Anlamlı renkler (`semantic`) | `action`/`live #13D9DF` + `actionInk #04161D` (koyu yazı) · `primary #087A80` dolgu (beyaz yazı 5,1:1) · `social #FF6576` + `socialFill #C93C4F` (beyaz yazı 5:1) · `money #F6BD60` + `moneyInk #3B2300` · `status` (VIP) altın `#F6BD60 → #E89B2C` · `success #22C55E` + `successFill #15803D` · `red #D93A45` (beyaz yazı 4,5:1) · `tonal` (%14 turkuaz) |
| Dolgu gradyanları | `gradient #13D9DF → #0FB8BE` (ana buton, lacivert içerik) · `gradientDeep #0A8F95 → #076A70` (beyaz ikon/yazı taşıyan başlık, balon ve ikon butonları) |
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
- **Emoji ikon değildir.** Emoji yalnız içerikte (mesaj, tepki, kullanıcı metni) kullanılır. Boş, kilitli ve izin durumlarında `StateIcon` (tonlu daire içinde çizgi ikon), maskot ya da 3D görsel kullanılır. Oda sahibi tacı ve yönetici rozeti de ikondur.
- **Arka plan (`Backdrop`).** Stok fotoğraf yok: lacivert zemin, üstten ekranın anlam rengiyle (turkuaz / altın / mercan) gelen yumuşak ışık (`fx/scenes`). Odada `StageBackdrop`: oda temasının renkleri, ev sahibi koltuğuna düşen iki spot, sohbetin altında koyulaşan zemin.
- **Efekt ölçüsü.** Parlama (`Gloss`), kenar ışığı (`EdgeLight`) ve ışık süpürmesi (`Shine`) yalnız değerli öğelerde (sıralama, en iyi odalar, ana buton); sıradan kartlar düzdür.
- **Oda sohbeti.** Kullanıcı mesajı: avatar + üstte ad + ayrı balon. Oda olayları ve bot sessiz haplar; kişilerin mesajlarının önüne geçmez.
- **Hareket.** Basma geri bildirimi 90 ms; geçişler ≤ 250 ms. "Hareketi azalt" ve "efektleri kapat" ayarları hediye animasyonlarını ve titreşimi kapatır.

---

## 2. Her ekranda uygulanan UX kuralları

1. **Tek birincil eylem.** Ekranda yalnız bir `hero` veya `money` buton.
2. **Önce maliyet, sonra eylem.** Jeton harcatan her ekranda toplam (adet × fiyat × kişi) ve kalan bakiye butondan önce görünür.
3. **Hediye tek dokunuşla gider (ürün kararı).** Gönderen dikkat etmekten sorumlu; varsayılan olarak ek onay yok. Toplam tutar butonun üstünde ve butonun içinde zaten yazıyor. İsteyen kullanıcı Ayarlar'dan "Büyük harcamada ek onay" eşiği (500 / 1.000 / 5.000) açabilir; o zaman buton "Onayla ve gönder" olur.
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
   - Gönder tek dokunuşla gönderir. Kullanıcı Ayarlar'dan ek onay açtıysa eşik üstünde ilk dokunuş onay durumuna geçer; seçim değişince onay düşer.
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
- [ ] Varsayılan ayarda hediye tek dokunuşla gönderilir, onay penceresi açılmaz.
- [ ] Kullanıcı ek onayı açtıysa eşik üstünde tutar yazan tek bir onay adımı olur, ikinci pencere açılmaz.
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
| Yüksek tutar onayı | Varsayılan kapalı (ürün kararı); kullanıcı Ayarlar'dan açabilir |
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

## 7. Kodla çizilen efektler (çerçeve, giriş, koltuk emojisi)

Görsel dosya satın almadan, lisans riski olmadan ve uygulama boyutunu büyütmeden, tamamen SimilarClub'a özgü efektler. Hepsi telefonun yerel animasyon motorunda (yalnız transform ve opacity) çalışıyor. "Hareketi azalt" açıkken hareketsiz gösteriliyor, "Efektleri kapat" açıkken başkalarının efektleri gelmiyor.

**Avatar çerçeveleri** (`components/fx/frames.tsx`). Katmanlar: nefes alan ışık halesi, efekt katmanı, dönen renk halkası, avatar ve en önde süsler.

| Çerçeve | Efekt |
| --- | --- |
| Ses Dalgası | Turkuaz-mor halka, avatardan yayılan ses dalgaları (imza) |
| Yörünge | Mavi-mor halka, etrafında dönen üç ışık |
| Aurora | Çok renkli dönen halka, köşelerde yanıp sönen kıvılcımlar |
| Ateş | Sıcak renkli hızlı halka, yükselen korlar |
| Altın Taç (VIP 4) | Altın halka, kıvılcımlar, sallanan taç |

**Giriş efektleri** (`components/fx/entry.tsx`). Tek zaman çizelgesi (~3,2 sn):
1. Bant kayarak gelir ve avatardan parçacıklar saçılır.
2. Bant üzerinden ışık süpürmesi geçer.
3. Binek veya yaratık bandın arkasından geçer.
4. Bant sağa çıkar.

| Efekt | Özellik |
| --- | --- |
| Işıltı | Derin turkuaz bant, turkuaz ve altın parçacıklar |
| Şimşek | Mavi bant, çift şimşek parlaması |
| Kuyruklu Yıldız | Gece bandı, geçen kuyruklu yıldız |
| Ejderha (VIP 7) | Kızıl bant, geçen ejderha |
| VIP | Altın bant |

Binek (scooter, araba, jet) varsa ekrandan geçer. Mağazada her giriş efekti ve binek "Önizle" ile tam boyutta oynatılabilir. Odaya katılan diğer kişilerin de zaman zaman giriş efekti olur.

**Koltuk emojisi.** Koltuktaki kişinin seçtiği emoji avatarının üzerinde yaklaşık 2,6 saniye oynar.
