# Similar Club (prototip)

Timo Club benzeri sesli sohbet / sosyal tanışma uygulamasının tıklanabilir mobil prototipi.
Expo (React Native) + Expo Router ile yazıldı; iOS ve Android'de çalışır.

> Prototip: Backend yok, tüm veriler sahte (`app/src/data/mock.ts`). Ses, ödeme ve doğrulama simüle edilir.

## Telefonda deneme

| Yol | Nasıl | Not |
| --- | --- | --- |
| **Web (iPhone + Android)** | Telefonda aç: https://keremcan534.github.io/cix/ | Kurulum yok. Tarayıcıda "Ana ekrana ekle" ile uygulama gibi açılır. |
| **Android APK** | https://github.com/keremcan534/cix/releases/latest → `similar-club.apk` indir, aç, kur | "Bilinmeyen kaynaklara izin ver" gerekebilir. |
| **Expo Go (geliştirici)** | Aşağıdaki "Çalıştırma" adımları + QR kodu okut | Kod değişince anında yenilenir. |

Web ve APK her push'ta `.github/workflows/preview.yml` ile otomatik güncellenir.
İlk sefer için bir kere: GitHub → **Settings → Pages → Source: GitHub Actions** seçilmeli.

Kayıt adımlarını atlamak için hoş geldin ekranında **⚡ Demo hesabıyla hızlı giriş** var.

## Çalıştırma

```bash
cd app
npm install
npx expo start
```

Telefona **Expo Go** uygulamasını kur, terminaldeki QR kodu okut.

## Ekranlar

| Ekran | Dosya | Neler var |
| --- | --- | --- |
| Giriş / Kayıt | `src/app/giris/` | Hoş geldin, telefon ile giriş (+90), 6 haneli SMS kodu (demo: herhangi bir kod), profil oluşturma (foto, ad, cinsiyet, doğum yılı, şehir, ilgi alanları, 18+ kontrolü), selfie ile gerçek kişi doğrulama, 100 jeton hoş geldin hediyesi |
| Odalar | `src/app/(tabs)/index.tsx` | Çevrimiçi kişiler, kategori sekmeleri, canlı oda kartları, oda aç (+) |
| Sesli oda | `src/app/oda/[id].tsx` | 9 koltuk (oda sahibi + 8), konuşan animasyonu, koltuğa geç/in, mikrofon, oda sohbeti, hediye paneli + animasyon |
| Keşfet | `src/app/(tabs)/kesfet.tsx` | Yakındakiler / Tüm Türkiye / Yeni, doğrulandı ve VIP rozetleri, takip et, selam ver |
| Anlar | `src/app/(tabs)/anlar.tsx` | Gönderi akışı, beğeni, yeni an paylaşma |
| Mesajlar | `src/app/(tabs)/mesajlar.tsx`, `src/app/sohbet/[id].tsx` | Sohbet listesi, okunmamış rozetleri, birebir sohbet (otomatik sahte cevap) |
| Profil | `src/app/(tabs)/profil.tsx` | Seviye, istatistikler, VIP kartı, menü |
| Cüzdan | `src/app/cuzdan.tsx` | Jeton bakiyesi ve paketler (ödeme simüle) |
| Yayıncı Merkezi | `src/app/yayinci/` | Yayıncı başvurusu, elmas bakiyesi, haftalık grafik, yayıncı seviyesi, son kazançlar, para çekme (IBAN), elmas → jeton |
| Görüntülü / sesli arama | `src/app/arama/[id].tsx` | Dakika başı jeton, süre sayacı, kamera/mikrofon, arama içi hediye |
| Rastgele eşleş | `src/app/eslesme.tsx` | Görüntülü/sesli, cinsiyet filtresi, radar animasyonu |
| Görevler | `src/app/gorevler.tsx` | 7 günlük giriş ödülü, günlük görevler (gerçek ilerleme), davet kodu |
| Sıralama | `src/app/siralama.tsx` | Zenginler / Yayıncılar / Odalar, günlük-haftalık, podyum |
| Soyluluk / VIP | `src/app/vip.tsx` | 5 seviye; rozet, çerçeve, odaya giriş efekti |
| Şans çarkı | `src/app/cark.tsx` | 20 jetonla çevir, ağırlıklı ödüller |
| Kullanıcı profili | `src/app/kullanici/[id].tsx` | Hediye duvarı, takip, mesaj, arama, şikayet, engelle |

Sesli odada ayrıca: oda sahibi yönetimi (sustur, koltuktan indir, odadan at), dinleyici listesi ve koltuğa davet, PK yarışı, gelen hediyelerden elmas kazanma (kendi odanda), VIP giriş efekti.

Şartname v1.2 ile eklenenler (ayrıntı: [`docs/SARTNAME_KAPSAM.md`](docs/SARTNAME_KAPSAM.md)):

| Ekran | Dosya | Neler var |
| --- | --- | --- |
| Oda (genişletildi) | `src/app/oda/[id].tsx`, `src/components/room/` | 10/15 mikrofon, oda XP ve 1–15 seviye, konuşma isteği, oda yöneticisi + rol hiyerarşisi, oda ayarları, şifreli oda, gizli giriş, etiketli bot, katkı sıralaması, oda zarfı, ortak müzik, zar oyunu, PK daveti/geri sayım/MVP, emoji paneli |
| VIP 1–15 | `src/app/vip.tsx` | 15 seviye (Üye → İmparator), birikimli ayrıcalıklar, Wealth ve Charm ayrı seviyeler |
| Mağaza | `src/app/magaza.tsx` | Çerçeve, giriş efekti, binek, sohbet balonu, özel ID, emoji paketleri; satın al / kullan |
| Ajans | `src/app/ajans/` | Kodla katılım (şartlar + onay), ajans kurma başvurusu, yayıncı ajans ekranı, geçiş/ayrılma talebi, sahip paneli (10 bölüm), baş asistan izin kısıtı, davet ağı ağacı, komisyon defteri |
| Bildirimler | `src/app/bildirimler.tsx` | Sosyal ve finans/güvenlik ayrımı |
| Destek | `src/app/destek.tsx` | SSS, kategorili talep, talep numarası, yanıt, yeniden açma/itiraz |
| Ayarlar | `src/app/ayarlar.tsx` | Gizlilik, şehir keşfi (opt-in), efektleri kapatma, bildirim tercihleri, hesap silme |

Ek ve yeni güncelleme belgeleriyle eklenenler:

| Ekran | Dosya | Neler var |
| --- | --- | --- |
| Oda (topluluk) | `src/components/room/community.tsx` | Oda türleri, konuşmacı kuyruğu, anket, hedef, etkinlik takvimi, soru-cevap, kişisel ses ayarları, moderasyon (yasak, yavaş mod, filtre, kayıt), arkadaş daveti, toplu hediye "Hepsini seç", oda sahibi bonusu %20 |
| Aile | `src/app/aile.tsx` | Sahip/yardımcı/üye rolleri, başvuru onayı, aile sohbeti, LV1–15, aktif üye, haftalık bonus %1–5 |
| Ajans sohbeti | `src/app/ajans/sohbet.tsx` | Yalnız üyeler; çevrimiçi/çevrimdışı listesi; ajanslar arası transfer akışı (panelde onay) |
| Oyun merkezi | `src/app/oyunlar.tsx` | VIP2'de açılır, sağlayıcı doğrulamalı sonuç |
| Yönetim (demo) | `src/app/yonetim.tsx` | USD kuru, ajans %40, oda sahibi %20, aile oranları, arama bonusları, sınırlar, örnek hesaplayıcı, değişiklik geçmişi |
| Ayarlar | `src/app/ayarlar.tsx` | Bildirim türleri + erteleme, düşük veri, oturumlar, harcama limiti, davet izinleri, itiraz |

Timo ekran görüntüleriyle eklenenler: Ben sayfası, SVIP 1–10 / VIP abonelik / Asil (Şövalye–Dük) merkezi (`src/app/vip.tsx`, `src/data/status.ts`), Yükleme (TRY paketleri, ilk alım bonusu), Görev Merkezi, Gelir ve Kazanç Detayları (`src/app/gelir/`), Ödüllü Davet (`src/app/davet.tsx`), Müşteri hizmetleri, Kullanıcı Seviyesi, Timo tarzı kullanıcı profili (Profil / dinamik / Onur / İlişki), oda kartı + Oda Ayarları + patron koltuğu (`src/components/room/owner.tsx`), ızgara oda menüsü ve Hot / Gameplay / Çift / Ayrıcalık hediye paneli.

Demo ipuçları: şifreli oda **Futbol Muhabbeti** (şifre `1234`), yönetici olduğun oda **Yeni Arkadaşlar**, ajans kodları `STAR01` / `MOON22` / `SIMI77` (kapalı: `OLD999`).

Ekonomi kuralları `src/data/rules.ts` içinde: 1 jetonluk hediye = 1 elmas, 5.000 elmas = 1 USD, ajans komisyonu %40 (yayıncıdan kesilmez, ayrıca ödenir), oda sahibi bonusu %20, en az 50.000 elmas çekilebilir. Değerler Profil > Kazanç & bonus yönetimi ekranından (demo) değiştirilebilir.

Ortak durum (giriş, profil, jeton, takip, mesajlar) `src/store.tsx` içinde. Giriş yapılmadan uygulama ekranları açılmaz (`Stack.Protected`); Profil > Çıkış yap ile başa dönülür.

## Sonraki adımlar

- Gerçek sesli oda: LiveKit veya Agora (development build gerekir)
- Backend + giriş: Supabase / Firebase (telefon ile giriş, profil, mesajlar)
- Uygulama içi satın alma: RevenueCat
- Moderasyon, raporlama, gerçek kişi doğrulama
