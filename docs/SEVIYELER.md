# Servet ve Cazibe Seviyeleri

"Kullanıcı Seviyesi" ekranının yerini **Servet Seviyesi** ve **Cazibe Seviyesi** sekmeleri aldı (`/seviye`, cazibe için `/seviye?tab=charm`).

Ekranlar referans görsellerin kopyası değildir; SimilarClub'ın koyu temasında, kendi amblem ve metinleriyle tasarlandı.

## Ortak yapı

Her iki sekmede de aynı bölümler vardır:

- **Benim kartım:** Puan, seviye rozeti ve sonraki seviyeye kalan puan.
- **Seviye grupları:** Her grubun kendi rengi ve sembolü vardır.
- **Seviye seçimi:** Seçilen seviyenin açtıkları, kilitliyse eksik puan gösterilir.
- **Rehber (?):** Nedir, ne işe yarar, puan nasıl kazanılır, sayılmayanlar ve 0–50 seviye tablosu.

Rozetler profilde, Ben sekmesinde, Keşfet kartlarında ve seviye listelerinde görünür.

## Servet Seviyesi (`src/data/wealth.ts`)

- **Puan:** Geçerli jeton harcamasında 1 jeton = 1 puan.
  - **Sayılmaz:** Casino oyunları, zar düellosu, oda zarfı ve jeton transferi.
  - **Lucky:** Yalnızca harcanan jeton sayılır, kazanılan ödül sayılmaz.
- **Eşikler:** Lv.0–50, ürün tablosundan alındı.
  - **Lv.35 (2.520.000) ve Lv.36 (3.250.000)** ekran görüntülerinde yoktu. Ara değer olarak hesaplandı; onay bekliyor.
- **Açtıkları:**
  - **Her seviye:** Seviye rozeti ve öne çıkma.
  - **Lv.3:** Seviye hediyesi.
  - **Lv.5:** Giriş efekti.
  - **Lv.10:** Madalya, odada seviye duyurusu.
  - **Lv.20:** Profil çerçevesi.
  - **Lv.33:** Platform duyurusu.
- **Seviye atlama:** Kullanıcıya bildirim gelir.
- **Casino:** Erişim **Servet Lv.2** ile açılır (önceden VIP2).
- **Eski kayıtlar:** Puan, toplam harcamadan başlatılır.

## Cazibe Seviyesi (`src/data/charm.ts`)

Her kullanıcıda bulunur.

- **Puan:**
  - Alınan hediyelerden gelen her 1 elmas = 1 puan.
  - Ücretli aramalardan gelen elmas da sayılır.
  - Beğeni ve özel sohbet puanları sunucuya geçildiğinde günlük sınırla eklenecek.
- **Eşikler:** Lv.0–50, ürün tablosunun tamamı kullanıldı.
- **Kazanca etkisi:** Alınan hediye elmaslarına seviye bonusu eklenir.
  - **Oranlar:** Lv.6 %1, Lv.16 %2, Lv.26 %3, Lv.36 %4, Lv.46 %5.
  - Bonus, gelir geçmişinde "Cazibe Seviyesi Bonusu" olarak ayrı satırda görünür.
- **Popülerliğe etkisi:** Keşfet'te çevrimiçi kişiler arasında cazibesi yüksek olan üstte gösterilir.
- **Açtıkları:**
  - **Her seviye:** Rozet ve keşfette öne çıkma.
  - **Lv.6:** Kazanç bonusu, sohbet balonu.
  - **Lv.11:** Madalya, giriş efekti.
  - **Lv.16:** Mikrofon dalgası.
  - **Lv.21:** Profil çerçevesi.
  - **Lv.31:** Özel araç.

## Karar bekleyenler

- **Servet:** Lv.35 ve Lv.36 eşiklerinin onayı.
- **Cazibe bonusu:** Oranlar ve gelir paylaşımıyla nasıl birleşeceği.
- **Görünüm ödülleri:** Çerçeve, giriş efekti ve araç için tasarım içerikleri.
  - Şu an emoji ile temsil ediliyor; mağaza ürünlerine bağlanacak.
