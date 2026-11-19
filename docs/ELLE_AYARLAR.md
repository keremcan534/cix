# Panelden elle değişen kurallar

Sahiplerin isteği (19 Kasım 2026): "her şeyde elle değişiklik yapabilelim". Uygulamanın içine yazılı kalan sayılar
adım adım finans panelinin **Canlı ayarlar** sayfasına taşınıyor. Canlı ayarlar'da her değişiklik önizleme cümlesiyle
gelir, sebep ister, kimin değiştirdiği kayda geçer ve geri alınabilir. Boş bırakılan (null) ayar varsayılana döner.
Panel ayarları sunucudan okur: yeni bir ayar panel güncellemesi olmadan görünür.

## Zaten panelde olanlar

Mesaj, arama ve eşleşme fiyatları; kalp seviyeleri; hediyeler (fiyat dahil, bağ hediyeleri de), mağaza, emojiler;
Seviye ve VIP; Çevir kuru; para çekme sınırları; ödüller; Oyun Salonu; oda süslemesi; patron koltuğu; yetkilisiz oda;
etkinlikler; otomatik mesaj; Oda roketi (hedefler ve ödüller, kendi sayfasında); aile çekim sınırı ve aileden ayrılma
bekleme süresi.

## 1. adım (19 Kasım): Bağlar, Koruma, Şanslı çanta

| Grup | Ayar | Varsayılan |
| --- | --- | --- |
| Bağlar | Çift bağı: kişi başına en fazla | 1 |
| Bağlar | Aile bağları (Kardeş, Bacı, Ağabey, Abla, Yenge, Enişte): türü başına en fazla | 3 |
| Bağlar | Kanka bağı: kişi başına en fazla | 5 |
| Bağlar | Bekleyen istek: en fazla | 10 |
| Bağlar | İsteğe cevap süresi | 3 gün |
| Bağlar | Bağ bitince bekleme | 7 gün |
| Bağlar | Sohbetten günlük bağ puanı: en fazla | 10 |
| Koruma | Yüzde düşüş: bu puandan itibaren | 5.000 |
| Koruma | Yüzde düşüş | %10 |
| Koruma | Sabit düşüş | 1.000 puan |
| Koruma | Koruma listesi: en fazla kişi | 50 |
| Koruma | Eşik: Yankı seviyesi başına en fazla | 50.000 |
| Koruma | Eşik değiştirme aralığı | 7 gün |
| Şanslı çanta | Jeton seçenekleri | 1000, 5000, 10000, 50000 |
| Şanslı çanta | Jeton çantası pay seçenekleri | 5, 10, 20, 30 |
| Şanslı çanta | Hediye adet seçenekleri | 10, 30, 99 |
| Şanslı çanta | Hediye çantası pay seçenekleri | 5, 10, 15 |
| Şanslı çanta | Açılma zamanı seçenekleri (saniye) | 0, 120, 300 |
| Şanslı çanta | Çantanın açık kaldığı süre | 30 saniye |

- **Şanslı çanta listeleri** virgülle yazılır (`1000, 5000`), en çok 6 seçenek. Jeton çantası en çok **50.000 jeton**:
  çanta şansla dağıtılır, daha büyüğü sizin kararınız (`DENETIM.md`, şans özellikleri).
- **Değişiklik sonrakinden başlar:** kurulmuş bağ, bekleyen istek (cevap süresi), konmuş eşik ve atılmış çanta kendi
  değeriyle sürer.
- **Eski APK'lar:** sunucu yeni kuralı uygular. Çanta seçeneklerini eski APK da sunucudan alır, doğru gösterir.
  Bağlar ve Koruma yazılarındaki sayıları (3 gün, %10…) eski APK kendi içinden yazar; yeni APK katalogdan
  (`/api/catalog` `guard`, `bonds`) okur.

## Sıradaki adımlar

2. Aile: günlük görevlerin puanları, haftalık sandıkların hedefi ve jetonu, temaların seviyesi.
3. Oda ve profil kuralları: oda kişi sınırları, mikrofon seviyesi, profil listeleri, seviye eğrisi.
