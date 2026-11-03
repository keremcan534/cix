# Cömertlik ve Yankı Seviyeleri

"Kullanıcı Seviyesi" ekranının yerini **Cömertlik Seviyesi** ve **Yankı Seviyesi** sekmeleri aldı (`/seviye`, Yankı için `/seviye?tab=charm`).

Ekranlar SimilarClub'ın koyu temasında, kendi amblem ve metinleriyle tasarlandı.

## Ortak yapı

Her iki sekmede de aynı bölümler vardır:

- **Benim kartım:** Puan, seviye rozeti ve sonraki seviyeye kalan puan.
- **Seviye grupları:** Her grubun kendi rengi ve sembolü vardır.
- **Seviye seçimi:** Seçilen seviyenin açtıkları, kilitliyse eksik puan gösterilir.
- **Rehber (?):** Nedir, ne işe yarar, puan nasıl kazanılır, sayılmayanlar ve 0–50 seviye tablosu.

Rozetler profilde, Ben sekmesinde, Keşfet kartlarında ve seviye listelerinde görünür.

## Cömertlik Seviyesi (`src/data/wealth.ts`)

- **Puan:** Geçerli jeton harcamasında 1 jeton = 1 puan.
  - **Sayılmaz:** Oyun Salonu oyunları, zar düellosu, oda zarfı ve jeton transferi.
  - **Uğurlu hediye:** Yalnızca harcanan jeton sayılır, kazanılan ödül sayılmaz.
- **Eşikler:** Ortak eğriden gelir (aşağıda). Lv.1 = 10 puan, Lv.50 = 30 milyon puan.
- **Açtıkları:**
  - **Her seviye:** Seviye rozeti ve öne çıkma.
  - **Lv.3:** Seviye hediyesi.
  - **Lv.5:** Giriş efekti.
  - **Lv.10:** Madalya, odada seviye duyurusu.
  - **Lv.20:** Profil çerçevesi.
  - **Lv.33:** Platform duyurusu.
- **Seviye atlama:** Kullanıcıya bildirim gelir.
- **Oyun Salonu:** Erişim **Cömertlik Lv.2** ile açılır (önceden VIP2).
- **Eski kayıtlar:** Puan, toplam harcamadan başlatılır.

## Yankı Seviyesi (`src/data/charm.ts`)

Her kullanıcıda bulunur.

- **Puan:**
  - Alınan hediyelerden gelen her 1 elmas = 1 puan.
  - Ücretli aramalardan gelen elmas da sayılır.
  - Beğeni ve özel sohbet puanları sunucuya geçildiğinde günlük sınırla eklenecek.
- **Eşikler:** Ortak eğriden gelir (aşağıda). Lv.1 = 10 puan, Lv.50 = 60 milyon puan.
  - Alınan elmas birçok kişiden toplandığı için son seviyeler Cömertlik'in iki katı puan ister.
- **Kazanca etkisi:** Alınan hediye elmaslarına seviye bonusu eklenir.
  - **Oranlar:** Lv.6 %1, Lv.16 %2, Lv.26 %3, Lv.36 %4, Lv.46 %5.
  - Bonus, gelir geçmişinde "Yankı Bonusu" olarak ayrı satırda görünür.
- **Popülerliğe etkisi:** Keşfet'te çevrimiçi kişiler arasında Yankı seviyesi yüksek olan üstte gösterilir.
- **Açtıkları:**
  - **Her seviye:** Rozet ve keşfette öne çıkma.
  - **Lv.6:** Kazanç bonusu, sohbet balonu.
  - **Lv.11:** Madalya, giriş efekti.
  - **Lv.16:** Mikrofon dalgası.
  - **Lv.21:** Profil çerçevesi.
  - **Lv.31:** Özel araç.

## Seviye eğrisi (`levelCurve`, `src/data/wealth.ts`)

İki seviye sistemi de tek bir formülden gelir; elle yazılmış tablo yoktur.

- **Formül:** Lv.L eşiği ≈ A · L^1,5 · G^L.
  - A ve G iki çapadan hesaplanır: Lv.1'in puanı ve Lv.50'nin puanı.
  - **L^1,5 kısmı:** İlk seviyeler hızlı gelir. İlk küçük hediye Lv.1'i açar.
  - **G^L kısmı:** Ortadan sonra her seviye bir öncekinden yaklaşık %24–32 fazla puan ister.
- **Yuvarlama:** 100'ün altı 5'in katına, üstü iki anlamlı basamağa yuvarlanır (1.700, 30.000, 1.100.000).
- **Ayar:** Eşikleri değiştirmek için iki çapa değiştirilir, tablo düzenlenmez.
- **Testler:** `tests/levels.test.ts` şunları sabitler:
  - Çapalar tutar.
  - Her seviye bir öncekinden fazla ister.
  - Sayılar okunur kalır.
  - Ayrıcalık açan seviyelere ulaşılabilir.

| Seviye | Cömertlik | Yankı | Neyle |
| --- | ---: | ---: | --- |
| Lv.1 | 10 | 10 | Bir Gül |
| Lv.2 | 35 | 35 | Bir Kalp; Oyun Salonu açılır |
| Lv.5 | 230 | 250 | Bir Taç'tan az |
| Lv.6 | 370 | 400 | Yankı kazanç bonusu başlar |
| Lv.10 | 1.700 | 1.900 | Bir Roket civarı |
| Lv.20 | 30.000 | 39.000 | |
| Lv.33 | 700.000 | 1.100.000 | Platform duyurusu (Cömertlik) |
| Lv.50 | 30.000.000 | 60.000.000 | |

## Karar bekleyenler

- **Eşikler:** İki çapanın (Lv.1 ve Lv.50 puanları) ürün ekibince onayı. Eğrinin şekli sabit kalır.
- **Yankı bonusu:** Oranlar ve gelir paylaşımıyla nasıl birleşeceği.
- **Görünüm ödülleri:** Çerçeve, giriş efekti ve araç için tasarım içerikleri.
  - Şu an emoji ile temsil ediliyor; mağaza ürünlerine bağlanacak.
