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
- **Eşikler:** Lv.0–50 başlangıç değerleridir; ürün kararıyla kesinleşecek.
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
- **Eşikler:** Lv.0–50 başlangıç değerleridir; ürün kararıyla kesinleşecek.
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

## Karar bekleyenler

- **Eşikler:** Cömertlik ve Yankı için Lv.0–50 eşiklerinin onayı.
- **Yankı bonusu:** Oranlar ve gelir paylaşımıyla nasıl birleşeceği.
- **Görünüm ödülleri:** Çerçeve, giriş efekti ve araç için tasarım içerikleri.
  - Şu an emoji ile temsil ediliyor; mağaza ürünlerine bağlanacak.
