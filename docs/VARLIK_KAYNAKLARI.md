# Varlık kaynakları

Uygulamada kullanılan görsellerin, yazı tipinin ve kütüphanelerin nereden geldiğini kayıt altına alır. Mağaza yayınından önce her satırın "Durum" sütunu "doğrulandı" olmalı (bkz. [YAYIN_HAZIRLIGI.md](YAYIN_HAZIRLIGI.md) madde 13).

## 1. Sahne fotoğrafları (`app/assets/bg/`)

`app/src/components/fx/scenes.ts` ve a88a234 numaralı commit, bu on fotoğrafın Unsplash'ten, ücretsiz Unsplash Lisansı ile alındığını ve 900×1600 boyutuna kırpıldığını söylüyor. Fotoğraf başına bağlantı ya da fotoğrafçı adı kaydedilmemiş, dosyaların EXIF bilgisinde de kaynak yok.

| Dosya | Kaynak | Fotoğrafçı | Durum |
| --- | --- | --- | --- |
| `sahne-aile.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-ana-sayfa.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-cuzdan.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-giris.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-kesfet.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-magaza.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-mesajlar.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-oyun-merkezi.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-seviye.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |
| `sahne-vip.jpg` | Unsplash (bağlantı yok) | bilinmiyor | kaynak doğrulanmalı |

Yapılacak: her fotoğrafı Unsplash'te bulup bağlantısını ve fotoğrafçısını tabloya yazmak. Bulunamayan fotoğraf kendi çekimimiz ya da lisansı belli bir görselle değiştirilmeli. Unsplash Lisansı atıf istemez ama kaynak kaydı ileride doğabilecek bir itirazda tek kanıtımız olur.

## 2. Yapay zekâyla üretilen görseller

Aşağıdaki görseller yapay zekâ araçlarıyla bu proje için üretildi. Yayından önce kullanılan aracın ticari kullanım koşulları okunmalı, üretim tarihi ve hesap bilgisi saklanmalı.

| Varlık | Araç | Commit (tarih) | Not |
| --- | --- | --- | --- |
| `assets/brand/logo.png` (marka işareti) | ChatGPT | d62c790 (2026-11-01) | Uygulama ikonları `scripts/app-icons.py` ile bu dosyadan üretiliyor. |
| `assets/art/` (185 ikon, 192 px) | ChatGPT | 5ec27cc (2026-10-28) | |
| `assets/icons/` | ChatGPT | 3ba3278 (2026-10-26) | Tek bir üretilmiş paftadan kesildi. |
| `assets/frames/` (profil çerçeveleri) | ChatGPT | 2858a8f (2026-10-26) | |
| Hediyeler, efektler, tepkiler | ChatGPT | 54a5e65 (2026-10-27) | [GORSEL_URETIM_LISTESI.md](GORSEL_URETIM_LISTESI.md) bölüm 1–3. |
| Mağaza görselleri | ChatGPT | e133f61 | |
| Oda görselleri | ChatGPT | 9966c82 | Planı: [ODA_GORSEL_LISTESI.md](ODA_GORSEL_LISTESI.md). |

Teslim paketleri: `SimilarClub_04_3D_20_DOGRULANMIS_TASLAK.zip` ve `SimilarClub_DUZELTME_04_TAM_05_ILK40_69_PNG_Claude.zip` (01–12 klasörleri). Bu paketler depo dışında, değişmeden saklanmalı.

Bölüm 5'in 41–55. maddeleri ile 6–12. bölümlerdeki taslaklar Font Awesome 4 (SIL OFL 1.1) siluetlerinden otomatik üretildi ve uygulamaya bağlı değil. Kullanılacaklarsa OFL koşulları (lisans metnini birlikte dağıtmak) geçerli olur; tercihen yeniden çizilmeli.

Dosya adlarındaki eski adlar (ör. `oyun-lucky-77.png`, `lucky-*.png`) teslim kaydıdır; ekranda görünen adlar değişti, yeni çizimler yeni adlarla gelecek.

## 3. Yazı tipi

Plus Jakarta Sans, `@expo-google-fonts/plus-jakarta-sans` paketiyle gelir. Lisansı SIL Open Font License 1.1, telif sahibi "The Plus Jakarta Sans Project Authors". Lisans metni uygulamada Ayarlar › Açık kaynak lisansları ekranında gösteriliyor.

## 4. Kütüphaneler

Çalışma zamanı bağımlılıkları ve lisansları aynı ekranda listeleniyor. Liste `app/src/data/licenses.ts` dosyasında; bağımlılık değişince `app/` içinden `node scripts/licenses.mjs` ile yeniden üretilmeli. Şu an paketlerin çoğu MIT, `livekit-client` Apache-2.0.

## 5. Kişi fotoğrafları

Örnek kullanıcılar için gerçek yüz fotoğrafı kullanılmıyor. Mağaza derlemesinde (`EXPO_PUBLIC_DEMO=0`) örnek veride hiç dış görsel yok; demo derlemesinde oda kapakları ve anlar picsum.photos'tan rastgele manzara görselleridir.
