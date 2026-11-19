# Yayıncı, para çekme ve aile kuralları

Müşterinin notları ve sahibin kararları (18 Kasım 2026). Kod: `server/api/streamer-rule.mjs`, `server/api/families.mjs`.

## Kim yayıncıdır

- Ajans sahibi, cinsiyeti ne olursa olsun.
- En az 10 üyeli ailenin sahibi, cinsiyeti ne olursa olsun.
- Bir ajansa kayıtlı ve sözleşmesi onaylı kadın hesap.
- İlk 3 gün ajans seçmeyen ya da ajanstan çıkmış kadın hesap: yönetimde kalır ve yayıncı sayılır.

**Yönetim yayıncısı:** ilk 3 gün ajans seçmeyen (ya da ajanstan çıkmış) kadın hesap. Ajans kodu, bağlantı, başvuru ve ajans daveti reddedilir; bir ajansa yalnız ajansın ve merkezin onayladığı transfer talebiyle geçer. Kazancı ve para çekme hakkı sürer, üzerinden ajans komisyonu oluşmaz. Yönetim › Kullanıcılar aramasında (12 haneli ID ile de) `streamer: management` olarak görünür. Erkek hesap ve cinsiyetini seçmemiş hesap yönetim yayıncısı sayılmaz (erkekler hiç ajansa katılamaz). Süre: ajans ayarları › `streamer_policy.pick_days`.

Yayıncı olmak birebir mesaj ve aramada kimin ödeyip kimin kazandığını belirler.

**Ücretli mesajda 5 dakika kuralı (18 Kasım 2026):** yayıncı ücretli mesajın elmasını ancak 5 dakika içinde cevap verirse alır; cevap gelmezse jeton gönderene iade edilir. Otomatik mesaj, hazır cevap ve şablonlar yalnız kadın yayıncılarda. Ayrıntı: [`OTOMATIK_MESAJ.md`](OTOMATIK_MESAJ.md).

## Kim para çekebilir

| Hesap | Para Çek | Jeton Noktası'na elmas bozdurma | Çevir (elmas → jeton) |
|---|---|---|---|
| Kadın | Evet | Evet | Evet |
| Ajans sahibi (onaylı ajans) | Evet | Evet | Evet |
| En az 10 üyeli ailenin sahibi | Evet | Evet | Evet |
| Erkek | Hayır | Hayır | Evet |
| Cinsiyetini seçmemiş | Önce seçmeli | Önce seçmeli | Evet |

- Sunucu reddeder; eski APK'da düğme görünür ama işlem yapılmaz ve nedeni yazılır.
- Yeni APK bu hesaplarda Para Çek ve bozdurma düğmelerini göstermez.
- Yönetimin atadığı Jeton Noktası hesapları cinsiyetten bağımsız jeton satmaya devam eder.
- Kuraldan önce açılmış bekleyen çekim talepleri olduğu gibi kalır; panelden karara bağlanır.
- **10 üye sınırı** Canlı ayarlar › Aile › "Aile sahibinin çekim hakkı" ile değişir.

**Bilinen risk:** cinsiyet hesap sahibinin beyanıdır. Kendini kadın olarak seçen bir erkek hesap kuralı aşabilir. Ödeme öncesi kimlik kontrolü bu açığı kapatır.

## Aileden ayrılma

- Yayıncı aileden kendi isteğiyle ayrılınca **90 gün** başka bir aileye katılamaz ve aile kuramaz.
- Ayrıldığı aileye geri dönebilir.
- Aileden çıkarılan kişi beklemez.
- Yayıncı olmayan kişi beklemez.
- Süre Canlı ayarlar › Aile › "Aileden ayrılan yayıncının bekleme süresi" ile değişir.
- Ajanstan ayrılma kuralı değişmedi: transfer gerekir.
