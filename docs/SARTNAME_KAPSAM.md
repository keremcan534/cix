# Şartname kapsamı (v1.2) — prototip durumu

Kaynak: *Timo Club Tam Özellik Envanteri ve Teknik Ürün Şartnamesi v1.2 (8zuu kıyaslaması dahil)*.

Bu bir **tıklanabilir prototip**: backend yok, veriler sahte. "Sunucu tarafında doğrulama", idempotency, denetim kaydı gibi maddeler arayüzde **gösteriliyor/simüle ediliyor**, gerçek güvenlik ancak backend ile sağlanır.

İşaretler: ✅ prototipte var · 🟡 arayüz var, mantık simüle · ⛔ backend / yönetim paneli gerektirir (prototip dışı)

## Kullanıcı tarafı

| Şartname | Durum | Nerede |
| --- | --- | --- |
| M01 Kayıt, giriş, oturum | ✅ | `giris/*`, çıkış: Profil/Ayarlar |
| M02 Profil ve gerçek kişi doğrulama | 🟡 | `giris/profil`, `giris/dogrulama` (selfie, sahte doğrulama) |
| M03 Keşif / eşleştirme, şehir bazlı keşif opt-in (PRIV-01) | ✅ | `(tabs)/kesfet`, `eslesme` |
| M04 Takip, karşılıklı takip | ✅ | profil, sohbet (karşılıklı takip = ücretsiz mesaj) |
| M05 Sosyal akış | ✅ | `(tabs)/anlar` |
| M06 Mesajlaşma, teslim/okundu, ücretli mesaj kuralı, emoji | ✅ | `sohbet/[id]` |
| M07/M09 Sesli/görüntülü arama, dakika ücreti önceden gösterilir | 🟡 | `arama/[id]` (gerçek ses/görüntü yok) |
| M08 Sesli odalar (6.2–6.3) | ✅ | `oda/[id]` — aşağıya bak |
| M10 Mini oyun | ✅ | Odada 🎲 Zar Düellosu (18+, günlük limit) |
| M11 Hediyeler, fiyat onayı, adet | ✅ | Oda hediye paneli |
| M12 Coin cüzdanı, hareket geçmişi, bekleyen satın alma | ✅ | `cuzdan` |
| M13 Elmas, yayıncı kazancı, para çekme | ✅ | `yayinci/*` |
| M14–M15 Ajans (AG-01…AG-08) | ✅ | `ajans/*` — aşağıya bak |
| M16 VIP 1–15, Wealth/Charm ayrı | ✅ | `vip`, profil rozetleri |
| M17 Topluluk/aile | ✅ | `aile` |
| M18 Bildirim merkezi (sosyal / finans-güvenlik ayrımı) | ✅ | `bildirimler` |
| M19 Engelleme, şikâyet (talep numaralı) | ✅ | kullanıcı profili, oda menüsü |
| M20 Destek merkezi: SSS, kategori, talep no, yanıt, yeniden açma | ✅ | `destek` |
| M22 Görevler, günlük giriş serisi, davet | ✅ | `gorevler` |
| M23 Gizlilik, efektleri kapatma (VIP-01), hesap silme | ✅ | `ayarlar` |
| 31.2 Hediye duvarı | ✅ | kullanıcı profili |
| 31.2 Şans çarkı (açık olasılıklar) | ✅ | `cark` |
| 31.9 Kozmetik mağaza: çerçeve, giriş efekti, binek, sohbet balonu, özel ID | ✅ | `magaza` |
| Emoji marketi (ücretsiz temel, ücretli paket, VIP paketi, son kullanılanlar, kilitli önizleme) | ✅ | `magaza` › Emoji, oda & sohbet emoji paneli |

## Sesli oda (6.2, 31.1, 31.7, ek §2–3, §8)

| Madde | Durum |
| --- | --- |
| Standart oda 10, ajans odası 15 mikrofon; oda seviyesiyle +2 / max 15 | ✅ |
| Oda XP ve 1–15 seviye, seviye ödülleri listesi, seviye atlama tek sefer | ✅ (kendi odanda) |
| Konuşma isteği → kabul/ret | ✅ |
| Oda sahibi / oda yöneticisi rolleri; yönetici üst rolü susturamaz, indiremez | ✅ (Yeni Arkadaşlar odasında yöneticisin) |
| Sustur, mikrofondan indir, odadan çıkar, yönetici ata (kontenjan seviyeye bağlı) | ✅ |
| Oda ayarları: ad, duyuru, arka plan (seviye kilitli), şifre, katılımcı limiti, mikrofon kuralı | ✅ |
| Şifreli oda, yanlış şifrede 3 deneme sonrası bekleme (ROOM-01) | ✅ (Futbol Muhabbeti · şifre 1234) |
| Gizli giriş (VIP 9+), moderasyondan gizlenmez | ✅ |
| Etiketli sistem botu, sahibi kapatabilir (BOT-01) | ✅ |
| PK: davet → kabul → geri sayım → tur → sonuç, MVP destekçi, kazanana oda XP | ✅ |
| Oda katkı sıralaması (Lv.3 ile açılır) | ✅ |
| Oda zarfı: dağıtma ve kapma, cüzdan defterine yazılır | ✅ |
| Ortak müzik: lisanslı katalog, sıra, oynat/duraklat/sonraki, yetki; Spotify/YouTube yalnız kendi oynatıcısında açılır | ✅ |
| Giriş efekti / binek, efekt kapatma | ✅ |

## Ajans (4–5, 13, ek §19–29)

| Madde | Durum |
| --- | --- |
| Kodla katılım: şartlar + açık onay, geçersiz/kapalı ajans, mevcut üyelik, bekleyen başvuru kontrolleri (QA-01/02/03) | ✅ (kapalı ajans kodu: `OLD999`) |
| Ajans kurma başvurusu → inceleme → onay → benzersiz kod | ✅ |
| Yayıncının ajans ekranı: performans, hak ediş durumları, etkinlikler, itiraz, platform desteğine doğrudan erişim | ✅ |
| Ajans değiştirme / ayrılma talebi: koşul, bekleme süresi, gerekçe, durum (QA-04) | ✅ |
| Ajans sahibi paneli: genel bakış, performans, üyeler (arama/filtre, başvuru kabul/ret), davetler, kazançlar, görevler, etkinlikler, ekip, destek, ayarlar | ✅ |
| Baş asistan ajans gelirlerini göremez (izin matrisi) | ✅ (panelde "Görünüm: Baş asistan") — gerçek koruma API'de olmalı ⛔ |
| Davet ağı: sınırsız derinlik, kademeli yükleme, filtreler, gizlilik | ✅ |
| Komisyon defteri: iki kaynak türü, yaşam döngüsü durumları, ters kayıt, kural sürümü, itiraz | 🟡 (örnek veri, simülasyon oranları) |

## Prototip dışı (backend / yönetim paneli gerektirir) ⛔

- Gerçek ses/görüntü altyapısı (LiveKit/Agora), yayın telemetrisi, tekrar oynatma ve zaman eşlemeli sohbet
- Gerçek ödeme, mağaza satın alma doğrulaması, iade, para çekme sağlayıcısı
- Sunucu tarafı yetkilendirme, idempotency anahtarları, değiştirilemez hareket defteri, denetim kayıtları
- Platform yönetim paneli (ADM-01…ADM-18), komisyon programı yönetimi ve simülasyonu
- Kısa video (yükleme/transcode/akış), canlı alışveriş, harici oyun/dijital ürün sağlayıcıları
- Otomatik moderasyon ve risk analizi
- Komisyon programı canlıya alınmadan önce hukuk/uyum incelemesi (şartname §25)
