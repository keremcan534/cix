# Pasif yayıncı kuralı (eski adıyla: aday ajans ve aktif ajans)

**24 Kasım 2026, sahiplerin kararı:** aday ajans / aktif ajans kuralı (20 yayıncı, 10 kazanan; aday ajans ödeme
alamaz) ve aylık yeni yayıncı cezası **kalktı**. Yerlerine haftalık ajans seviyeleri geldi: 20 aktif yayıncı şartı
artık seviyenin şartıdır (tutmazsa ajans %35 alır), ödeme talebi buna bağlı değildir. Ayrıntı:
[`AJANS_HIYERARSI.md`](AJANS_HIYERARSI.md) › "Ajans seviyeleri". Kod: `server/api/agency-activity.mjs`.

## Kural (sabit)

| Kural | Değer |
| --- | --- |
| Çevrimiçi olmayan yayıncı ajanstan düşer | 60 gün (oturum ya da cihaz; para çekmek saymaz). Ayarı yok. |
| Düşen yayıncı geri dönünce | 3 gün içinde kodla ya da bağlantıyla herhangi bir ajansa katılabilir |
| 3 günde katılmazsa | Yönetim yayıncısı olur: kazancı, çekimi ve haftalık bonusu sürer; ajansa yalnız transferle geçer |

- Ajans işi (10 dakikada bir) düşenleri ajanstan çıkarır ve ajansa bildirir ("… yayıncı 60 gün çevrimiçi olmadığı için
  ajanstan düştü"), dönenlerin dönüşünü yazar (`agency_streamers.returned_at`). 3 gün dönüşten başlar.
- Düşmüş ama henüz dönmemiş yayıncı yönetim yayıncısı sayılmaz (çevrimdışı; bonusu da yok).
- Transferle ya da ajans kapandığı için ajanstan çıkan eskisi gibi hemen yönetim yayıncısıdır.

## Eski APK'lar

- Ajans ofisindeki statü kartı ve "Aday ajans / Aktif ajans" etiketi görünmez (sunucu `activity: null` gönderir).
- Yayıncı Merkezi'ndeki "90 gün" yazısı eski uygulamada kalır; yeni uygulamada 60 gün ve dönüş kuralı yazar.
