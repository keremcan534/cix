# Arayüz önerileri: göz ve beyin dostu butonlar

Platform taraması (Duolingo, Material 3 Expressive, Discord Stage, Clubhouse, Spotify, Instagram/TikTok, WhatsApp) ve bilişsel UX ilkelerine dayalı öneriler. Canlı buton örnekleri ve oda alt çubuğunun önce/sonra görseli için ayrı bir sayfa da hazırlandı.

## Bugünkü durum (kod taraması)

| Bulgu | Değer | Sorun |
| --- | --- | --- |
| `LinearGradient` kullanımı | 97 yer | Gradyan "özel" anlamını yitirmiş, birincil buton öne çıkmıyor |
| Farklı renk kodu | 148 | Renkler anlam taşımıyor (altın hem jeton hem rozet hem başlık) |
| Beyaz yazı / gradyanın pembe ucu (`#EC4899`) | 3,5 : 1 | Okunabilirlik eşiği 4,5 : 1 |
| Beyaz yazı / yeşil (`#22C55E`) | 2,3 : 1 | Yeşil zeminde koyu yazı gerekir |
| Oda alt çubuğu butonları (`RoundBtn`) | 42 px | Apple 44 pt, Google 48 dp öneriyor |
| 11 px ve altı yazı | 109 yer | Küçük ekranda zor okunur |
| Haptic (titreşim) | 0 | Basışa dokunsal cevap yok |

## Altı ilke ve uygulamadaki karşılığı

- **Von Restorff (farklı olan hatırlanır):** Her ekranda yalnız bir birincil buton gradyanlı olsun, geri kalanı sade.
- **Fitts yasası (büyük ve yakın olana hızlı basılır):** Sık kullanılan butonlar alt yarıda ve en az 48 px. Mikrofon odanın en büyük butonu.
- **Hick yasası (seçenek arttıkça karar yavaşlar):** Oda alt çubuğunda en fazla 4 eylem, gerisi Menü'de.
- **Jakob yasası (alışkanlık taşınır):** Kalp = beğeni, çift dokunuş = beğen, basılı tut = ses kaydı. Yeni kalıp icat etme.
- **Doherty eşiği (<400 ms tepki):** Her basışta anında iniş animasyonu ve hafif titreşim; ağ sonucu sonra gelir.
- **Zirve-son kuralı:** Zirve an hediye gönderme; büyük animasyon + başarı titreşimi. Odadan çıkışta kısa özet ("38 dk, 3 yeni takipçi").

## Önerilen buton sistemi

Tek bir `Button` bileşeni, beş varyant:

| Varyant | Görünüm | Kural |
| --- | --- | --- |
| `hero` | Mor→pembe gradyan, altta 5 px koyu kenar, basınca iner (Duolingo tarzı 3B tuş) | Ekran başına en fazla bir |
| `money` | Altın zemin, koyu yazı, 3B kenar | Yalnız jeton harcatan/kazandıran eylemler |
| `tonal` | %18 mor zemin, açık mor yazı | Takip et, mesaj at gibi ikinci eylem |
| `ghost` | Yalnız yazı, 48 px dokunma alanı | Tümünü gör, Atla, Daha sonra |
| `danger` | Kırmızı çerçeve, dolgu yok | Geri alınamaz işlem, her zaman onay adımı |

## Renklerin anlamı

| Token | Renk | Anlam | Kontrast |
| --- | --- | --- | --- |
| `action` | `#7C3AED` | Butonlar, seçili sekme | beyaz yazı 5,7 : 1 |
| `social` | `#DB2777` | Beğeni, takip, CP, ilişki | beyaz yazı 4,6 : 1 |
| `money` | `#FBBF24` | Jeton, hediye, yükleme | `#3B2300` yazı 8,8 : 1 |
| `live` | `#22C55E` | Çevrimiçi, konuşuyor, mikrofon açık | koyu yazı (`#052E16`) |
| `danger` | `#EF4444` | Bildirim sayısı, tehlikeli eylem | yalnız rozet ve çerçeve |

Gradyan önerisi: `#8B5CF6 → #EC4899` yerine `#7C3AED → #DB2777` (beyaz yazı iki uçta da 4,5 : 1 üstünde).

## Sesli oda alt çubuğu

Discord Stage / Clubhouse yaklaşımı: konuşanlar üstte büyük, dinleyiciler altta, konuşmak isteyene tek ve belirgin "el kaldır".

- Sıra: `Menü (•••)` · `Sohbet girişi` · `Mikrofon` · `Hediye`
- Mikrofon 56 px, en büyük buton. Durum üç yoldan: renk (yeşil/gri), ikon (`mic` / `mic-off`), etiket (AÇIK/KAPALI).
- Hediye altın ve sağ alt köşede (tek elle sağ başparmak kullanımı yaygın).
- Koltukta değilsen mikrofonun yerine aynı boyda **El kaldır**.
- Konuşan kişide kalın yeşil, ses seviyesine göre nabız atan halka.
- Çıkışta "Sessizce çık" seçeneği.

## Dokunuş hissi (`expo-haptics`)

| Eylem | His |
| --- | --- |
| Sekme, seçim | Seçim titreşimi; buton %96'ya küçülür (90 ms) |
| Birincil buton | Hafif darbe + 3B iniş |
| Koltuğa oturma, mikrofon açma | Orta darbe |
| Hediye gönderme | Başarı bildirimi titreşimi + tam ekran animasyon |
| Hata, yetersiz jeton | Hata titreşimi + sallanma, altında "Jeton yükle" |

Ayarlardaki "efektleri kapat" titreşimi de kapatmalı.

## Yol haritası

1. **Hızlı kazanç (1 gün):** `theme.ts` gradyanı, `RoundBtn` 48 px / mikrofon 56 px, 11 px altı yazıları 12 px, yeşil zeminde koyu yazı.
2. **Sistem (3–5 gün):** `Button` bileşeni ve renk tokenları, `expo-haptics`, ekran başına tek gradyan kuralı.
3. **Deneyim (1–2 hafta):** Oda alt çubuğu ve el kaldır, ses seviyeli konuşan halkası, hediye zirve anı ve çıkış özeti, Anlar'da çift dokunuşla beğeni.

## Kaynaklar

- [Google Research: Usability Hasn't Peaked (Material 3 Expressive)](https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/) — 48 katılımcı, 10 uygulama; doğru öğe %33 daha hızlı bulundu, görevler %20 hızlandı. Google'ın kendi araştırması.
- [Jakob Nielsen: M3 Expressive eleştirisi](https://www.uxtigers.com/post/ux-roundup-20260831)
- [UX Collective: Material 3 Expressive](https://uxdesign.cc/material-3-expressive-building-on-the-failures-of-flat-design-d7a9bb627298)
- [Duolingo tarzı tasarım sistemi analizi (üçüncü taraf)](https://open-design.ai/plugins/design-system-duolingo/)
- [Pressable: 3B buton sistemi](https://superdesign.dev/library/pressable-a-3d-button-system-cobalt)
- [Discord: Stage Channels SSS](https://support.discord.com/hc/hi-in/articles/1500005513722-Stage-Channels-FAQ)
- [Windows Central: Stage channels](https://windowscentral.com/stage-channels-are-discords-answer-clubhouse)
- [Smashing Magazine: The Thumb Zone](https://smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users)
- [Addy Osmani: Touch-Friendly Design](https://addyosmani.com/blog/touch-friendly-design/)
- [TetraLogical: Target size (WCAG 2.2)](https://tetralogical.com/blog/2022/12/20/foundations-target-size/)
- [UX Planet: Von Restorff etkisi](https://uxplanet.org/memorable-ui-elements-are-those-that-stand-out-from-the-rest-851841264c5)
