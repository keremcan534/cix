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

## Ek güncelleme + yeni güncelleme belgeleri

| Madde | Durum |
| --- | --- |
| Oda LV1–15 tablosu (oda / üye / yönetici sınırları + seviye ödülleri), katılımcı sınırı seviyeye göre | ✅ Oda ayarları > seviye tablosu |
| Oda türleri: serbest, sahne, soru-cevap, müzik, etkinlik, özel | ✅ |
| Konuşmacı kuyruğu (sıra numarası, sıradan çıkma, boş koltuğa otomatik geçiş), koltuk kilitleme | ✅ |
| Anket, topluluk hedefi, etkinlik takvimi, soru-cevap, şarkı isteği kuyruğu | ✅ |
| Kişisel ses ayarları (oda sesi, müzik/ses seviyesi, hediye sesleri, büyük hediyeler) | ✅ |
| Moderasyon: geçici yasak, yavaş mod, kelime filtresi, şikayetler, moderasyon kaydı | ✅ |
| Toplu hediye "Hepsini seç", alıcı bazlı sonuç, büyük harcama onayı, günlük harcama limiti | ✅ |
| Arkadaş daveti; davet ödülü = davet edilenin her başarılı jeton alımında 1 birim | ✅ Görevler > Davet ödüllerim |
| Kişisel oda önerileri ("Senin için", gerekçeli) | ✅ |
| Hayran kulübü (seviye, puan geçmişi, ücretsiz kazanım yolları) | ✅ |
| Oyun merkezi VIP2'de açılır; katalog önceden görünür; sonuç sağlayıcı doğrulamalı | ✅ (sağlayıcı simülasyon ⛔) |
| Günlük / haftalık / aylık sıralamalar + ölçüt açıklaması, ajans ve oda XP sıralaması | ✅ |
| Yayıncı analizi; 5.000 💎 = 1 USD; ajans %40 komisyonu ayrıca ödenir, yayıncıdan kesilmez | ✅ |
| Oda sahibi bonusu %20 (kendi odasındaki uygun hediyeler) | ✅ |
| Ajans menüleri yalnızca ajans üyelerine görünür; ajans sohbet grubu (çevrimiçi/çevrimdışı, sabit duyuru) | ✅ |
| Tek ajans kuralı; ajanslar arası transfer: talep → ajans sahibi onayı (ücretli/ücretsiz) → tamamlanma, adım zaman çizelgesi, itiraz | ✅ Ajans > Transfer / Panel > Transferler |
| Aile sistemi: sahip/yardımcı/üye rolleri, başvuru onayı, aile sohbeti + sessize alma, LV1–15, kapasite, aktif üye tanımı, haftalık bonus %1–5 katkıya göre dağıtım | ✅ |
| Bildirim türleri ayrı ayrı + erteleme (1/8/24 sa), düşük veri modu, hareketi azalt, davet izinleri | ✅ Ayarlar |
| Oturumlar ve oturum sonlandırma, şüpheli giriş / yeniden doğrulama, çoklu hesap/IBAN risk notları | ✅ (gerçek kontrol sunucuda ⛔) |
| İtiraz kategorileri: moderasyon kararı, hesap kısıtlaması, ajans transferi, oyun sonucu | ✅ Destek |
| İşlem geçmişi referans numarası, günlük özet | ✅ Cüzdan |
| Merkezi kazanç & bonus yönetim paneli (USD kuru, ajans %, oda sahibi %, aile oranları, arama bonusları, üst sınır, min. çekim, davet birimi, örnek hesaplayıcı, sürüm geçmişi) | ✅ Profil > Kazanç & bonus yönetimi (demo, kaydedilmez) |
| Oda kartı (başlığa dokun): kapak seç, ad düzenle, tema, oda ID, seviye kartı, kabile (aile/ajans), oda üyeleri (sayı/limit, başvuru rozeti), Oda Sahibi Merkezi (%20 pay, trafik paneli, bu oturumun hediye/zirve/süre istatistikleri), oda süslemesi, hediye kaydı, bülten, Paylaş / Davet et | ✅ Timo ekran görüntülerine göre |
| Tam ekran "Oda Ayarları": oda tipi, tema, kilit (Lv4 veya VIP), oda günlüğü, yayına katılma modu (mikrofon sayısı), mikrofon kontrolü, mikrofon izni (Lv4, oda üyeleri), patron koltuğu (Lv3), üyelik başvurusu (gerekmiyor/başvuru/kapalı), üyeleri/işlevleri kim yönetir, otomatik eleme (7/14/30 gün, her gün 00:00 UTC+3), kara liste, profilde oda görünürlüğü, video gizlilik koruması | ✅ |
| Patron koltuğu: oturumun en çok hediye gönderen kişisi (en az 1.000 jeton) oturur, geçilince el değiştirir, sahip indirebilir | ✅ (`Yeni Arkadaşlar`, `Karaoke Akşamı` odalarında açık) |
| Oda menüsü ızgara panel: Etkileşimli Oyunlar, Jetonlu Oyunlar (VIP2, sağlayıcı akışı), Oda Araçları, Oda Ayarları (Paylaş, Efektler, Süsler, Ses, mikrofon gürültü giderme, Mesaj ayarları) | ✅ |

## Prototip dışı (backend / yönetim paneli gerektirir) ⛔

- Gerçek ses/görüntü altyapısı (LiveKit/Agora), yayın telemetrisi, tekrar oynatma ve zaman eşlemeli sohbet
- Gerçek ödeme, mağaza satın alma doğrulaması, iade, para çekme sağlayıcısı
- Sunucu tarafı yetkilendirme, idempotency anahtarları, değiştirilemez hareket defteri, denetim kayıtları
- Platform yönetim paneli (ADM-01…ADM-18), komisyon programı yönetimi ve simülasyonu
- Kısa video (yükleme/transcode/akış), canlı alışveriş, harici oyun/dijital ürün sağlayıcıları
- Otomatik moderasyon ve risk analizi
- Komisyon programı canlıya alınmadan önce hukuk/uyum incelemesi (şartname §25)
