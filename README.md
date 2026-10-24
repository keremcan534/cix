# Vibe Club (prototip)

Timo Club benzeri sesli sohbet / sosyal tanışma uygulamasının tıklanabilir mobil prototipi.
Expo (React Native) + Expo Router ile yazıldı; iOS ve Android'de çalışır.

> Prototip: Backend yok, tüm veriler sahte (`app/src/data/mock.ts`). Ses, ödeme ve doğrulama simüle edilir.

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

Ortak durum (giriş, profil, jeton, takip, mesajlar) `src/store.tsx` içinde. Giriş yapılmadan uygulama ekranları açılmaz (`Stack.Protected`); Profil > Çıkış yap ile başa dönülür.

## Sonraki adımlar

- Gerçek sesli oda: LiveKit veya Agora (development build gerekir)
- Backend + giriş: Supabase / Firebase (telefon ile giriş, profil, mesajlar)
- Uygulama içi satın alma: RevenueCat
- Moderasyon, raporlama, gerçek kişi doğrulama
