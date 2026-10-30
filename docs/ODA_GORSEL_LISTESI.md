# Oda görselleri: ChatGPT ile üretim listesi

Oda ekranı şu an koddan çizilen bir sahne kullanıyor (`app/src/components/room/stage-backdrop.tsx`): tema renkleri, ev sahibi koltuğuna düşen iki spot, sohbetin altında koyulaşan zemin. Rakiplerle (SUGO, Yalla) aradaki kalan fark, odanın kendine ait çizimleri. Bu liste o görsellerin üretimi içindir. Dosyalar geldiğinde `StageBackdrop` ilgili temanın görselini çizilmiş sahnenin altına koyar; spotlar ve zemin aynen kalır.

**Toplam: 6 oda arka planı + 3 koltuk görseli = 9 görsel.**

## ChatGPT ile üretim

1. Örnek olarak mevcut 3D ikonlardan 2–3 tanesini ekleyin (`app/assets/icons/crown.png`, `mic.png`, `gift.png`).
2. Aşağıdaki stil metnini bir kez gönderin, sonra tabloyu verin.
3. Her görseli **"Dosya adı" sütunundaki adla** kaydedin.

```
Stil (her görsel için aynı):
- Dikey telefon ekranı arka planı, 1080 × 1920 px, PNG.
- Gece mavisi zemin (#080F1E); ana ışık turkuaz (#13D9DF), ikinci ışık mercan (#FF6576) veya altın (#F6BD60). Mor ve mor-pembe gradyan yok.
- Üst yarıda sahne/mekân hissi; alt yarı sakin ve koyu kalsın (üstüne sohbet yazısı gelecek).
- Ortada ve üst üçte birde büyük boş alan (koltuklar ve avatarlar oraya gelecek). İnsan, yazı, logo, marka, bayrak yok.
- Yumuşak, hafif bulanık (alan derinliği), ayrıntı az; küçük ekranda sade dursun.
```

## Oda arka planları (6)

| Tema | Dosya adı | Ne çizilecek |
|---|---|---|
| Sohbet | `oda-arka-sohbet.png` | Gece şehir manzaralı, cam duvarlı sıcak bir lounge; uzakta bulanık şehir ışıkları, turkuaz ve mercan bokeh |
| Müzik | `oda-arka-muzik.png` | Küçük konser sahnesi: üstten inen spotlar, sahne dumanı, bulanık mikrofon sehpası silueti, mercan ve turkuaz ışık |
| Oyun | `oda-arka-oyun.png` | Neon çizgili oyun salonu, turkuaz ve altın ışık şeritleri, bulanık arcade ışıkları |
| Parti | `oda-arka-parti.png` | Çatı katı partisi: asılı ampul zincirleri, konfeti, mercan ve altın ışıklar, gece gökyüzü |
| PK | `oda-arka-pk.png` | İkiye bölünmüş arena: solda mercan, sağda turkuaz ışık; ortada ince parlak ayrım çizgisi |
| Arkadaşlık | `oda-arka-arkadaslik.png` | Sahil kenarında akşam ateşi (kamp ateşi), yıldızlı gökyüzü, sıcak mercan ve altın tonlar |

## Koltuk görselleri (3)

Bunlar şeffaf arka planlı, kare (512 × 512 px) PNG olmalı.

| Dosya adı | Ne çizilecek |
|---|---|
| `koltuk-bos.png` | Boş koltuk: yuvarlak, cam görünümlü, üstten hafif ışık alan küçük bir puf/koltuk; ortada küçük "+" yok (kod ekliyor) |
| `koltuk-kilitli.png` | Aynı koltuk, üstünde küçük altın kilit |
| `koltuk-ev-sahibi-cercevesi.png` | Ev sahibi avatarının çevresine geçen ince altın çerçeve, üstte küçük taç; ortası tamamen boş (avatar oraya gelecek) |

## Teslimden sonra

- Arka planlar `app/assets/room/` klasörüne konur ve `StageBackdrop` içindeki tema eşlemesine eklenir.
- Koltuk görselleri `components/room/parts.tsx` içindeki boş/kilitli koltuk çizimiyle değiştirilir.
- Telif: ChatGPT çıktısının ticari kullanım koşulları kontrol edilmeli; başka uygulamaların görsellerinden kopya istenmemeli.
