# Yasal metinler (Legal Center v1.0, 26 Kasım 2026)

Sahiplerin gönderdiği paket (`SimilarClub_Legal_Center_v1_TR_EN.zip`; aynı metinler tek dosyada `.md` olarak da geldi,
içerik birebir aynı). 14 belge, Türkçe ve İngilizce. **Paketin kendi notu: "Hukuki ve teknik inceleme taslağı —
YAYIMLAMAYIN".** Her belgenin başında "Taslak, yayımlamayın" yazıyor ve doldurulmamış alanlar var (`[ONAY TARİHİ]`,
`[TEKNİK ENVANTER]`, `[SAĞLAYICI/ALICI LİSTESİ…]`, `[SAKLAMA SÜRELERİ…]`, `[EK A]`, `[EK B]` …).

**26 Kasım 2026, sahiplerin kararı: taslak haliyle yayınlanıyor.** Sayfalarda belgenin durumu "Sürüm 1.0 • Taslak •
Yürürlük: onay bekliyor" olarak görünür (paketin ekibe yazdığı "yayımlamayın" notu okuyucuya gösterilmez); metindeki
boş alanlar olduğu gibi durur. Avukat onaylayıp alanları doldurunca `.md` dosyaları güncellenir, sayfalar yeniden
üretilir ve durum satırı belgeden gelir.

| Dosya | Nerede görünür |
| --- | --- |
| `tr/`, `en/` 01–08, 11–14 | Sitede `/tr/<ad>` ve `/en/<ad>` (ör. `/tr/privacy`); hepsinin listesi `/yasal` (İngilizcesi `/en/legal`). Uygulamada Ayarlar › Destek › Kullanım Koşulları, Gizlilik Politikası ve altında "Diğer yasal metinler" (`app/src/lib/legal.ts`). |
| `tr/`, `en/` 09 Yayıncı Sözleşmesi, 10 Ajans İş Birliği Sözleşmesi | **Sitede yok:** taraflara ayrıca imzalatılacak sözleşmeler (Ek A ve Ek B'deki kazanç ve komisyon oranları kesinleşmeden). |
| `00-README-kontrol-listesi.md` | **Ekip içi:** yayın öncesi kontrol listesi, Ek A/B (planlanan oranlar), resmî kaynaklar. Hiçbir yerde yayınlanmaz. |

Metin değişince sayfalar yeniden üretilir (depo kökünde):

```powershell
python docs/yasal/siteye-aktar.py
```

Betik `website/tr/*.html`, `website/en/*.html`, `website/yasal.html`, `website/en/legal.html` dosyalarını yazar ve her
sayfanın alt bilgisindeki "Yasal" sütununu bu sayfalara bağlar. Sonra site paketi yeniden üretilip GoDaddy'ye yüklenir
(`docs/WEB_SITESI.md`).

## Metinlerle uygulama arasında açık kalanlar

- **Destek adresi:** metinler `support@similarclub.online` diyor; site `info@similarclub.online`, uygulama hâlâ
  `destek@similarclub.app` (bizim olmayan bir alan adı). Tek bir adres seçilmeli ve o posta kutusu açılmalı.
- **Hesap silme yolu:** metin "Ayarlar > Hesap > Hesabımı Sil" ve `https://similarclub.online/delete-account` diyor.
  Sitede `/delete-account` artık `/hesap-silme` sayfasına gidiyor; uygulamadaki gerçek yol avukata bildirilmeli.
- **Oyunlar ve jeton:** Jeton ve Oyun metinleri "onaylanmamış şans mekanizması etkinleştirilmez" diyor; uygulamada
  Şanslı hediye, Oyun Salonu, Rüzgâr Gülü ve oda roketi var (`YAYIN_HAZIRLIGI.md` §1). Metin ya da özellikler
  yayından önce birbirine uydurulmalı.
- **Çerezler:** sitede çerez yok, ama yazı tipleri Google Fonts'tan geliyor (`WEB_SITESI.md` › Gizlilik notu).
