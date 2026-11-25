# Uyumlu alternatif mimarilerin ticari etkisi (Similar Club, Kasım 2026)

Kapsam ve yöntem: kod salt okunur incelendi (`/home/user/cix`, 25.11.2026); bu dosya dışında hiçbir şey değiştirilmedi.
Etiketler: **[DOĞRULANDI-KOD]** dosya:satır; **[DOĞRULANDI-WEB]** URL; **[İKİNCİL]** haber/üçüncü taraf; **[TAHMİN]**
varsayımı yazılı aritmetik ya da yön tahmini; **[BENCHMARK]** başka şirketin verisi, Similar Club için tahmin değildir.
Similar Club'da **gerçek kullanıcı harcama verisi yok** (canlı sunucu `TEST_MODE=1`), bu yüzden tüm hacim/harcama
etkileri TAHMİN'dir; sıralama içindir, bütçe için değil. Tüm TL hesapları kodun varsayılanlarıyla yapıldı; Canlı ayarlar
panelden değişebilir. Aritmetik betiği: `/tmp/claude-0/-home-user-cix/3674e41d-2ede-5506-a320-c57eee3a691b/scratchpad/sens.py`.

---

## S1. Koddaki gerçek ekonomik parametreler (her biri dosya:satır ile)

### Takeaway
Normal hediyede 1 jeton = 1 elmas ve 1.000 elmas = 1 USD = 49 TL ödeniyor; 1.000 jetonun liste fiyatı 220 TL. Yani yayıncı
tek başına brüt fiyatın %22,3'ünü alıyor; ajans (%35–100), BD (%5) ve haftalık bonus (%50'ye kadar) **platform cebinden ve
üstüne** ödeniyor. Şanslı hediye ise jeton başına yalnız 0,10 elmas yazıyor ve 0,65 jetonu (hediye edilebilir) geri veriyor.

### Cited Findings
- [DOĞRULANDI-KOD] 1.000 jeton = 220 TL (`COIN_VALUE_TL`), canlı anahtar `coin_value_tl` (1–5.000 TL, kayıt başına en çok %50 değişim; "Kullanıcının ödediği fiyatı Google Play belirler") — `server/api/catalog.mjs:149`, `server/api/live-registry.mjs:105, 1027-1034`.
- [DOĞRULANDI-KOD] Paketler 1.000–50.000 jeton; ilk alım hediyesi p1 (1.000 jeton) için +1.000, p2 (5.000) için +2.500 — `server/api/catalog.mjs:160-170`. 24.11.2026 öncesi 1.000 jeton 29,99 TL idi (`PACK_TL_BEFORE`, `catalog.mjs:187-197`), yani fiyat ~7,3 kat artırılmış.
- [DOĞRULANDI-KOD] VIP 7/30/90 gün = 145/285/599 TL — `server/api/catalog.mjs:218-222`.
- [DOĞRULANDI-KOD] `EXCHANGE = { diamondsPerUsd: 1_000, usdTry: 50.62, minDiamonds: 100, bankFee: 0.03 }`; canlı anahtar `diamonds_per_usd` (100–100.000) — `server/api/catalog.mjs:233`, `server/api/live-registry.mjs:108, 1091-1097`.
- [DOĞRULANDI-KOD] Ödeme kuru `PAYOUT_USD_TRY = 49` (canlı `payout_usd_try`) — `server/api/catalog.mjs:243`, `server/api/live-registry.mjs:107`.
- [DOĞRULANDI-KOD] Çevir (elmas → jeton): `floor(elmas × (1/1000) × 50,62 × (1000/220))` → 1.000 💎 = **230 jeton** (≈50,6 TL liste değeri), ücretsiz — `server/api/catalog.mjs:236-237`, rota `server/api/index.mjs:293`.
- [DOĞRULANDI-KOD] Jeton Noktası bozdurma: banka hostun elmasını 49 TL/USD'den öder, karşılığında değer +%3 jeton alır (1.000 💎 → ~229 jeton) — `server/api/catalog.mjs:252-253`. Toptan satış (`WHOLESALE_TL`) 220 TL / 1.000 jeton, canlı `jeton_wholesale_tl` — `server/api/catalog.mjs:258`, `server/api/live-registry.mjs:106, 1046`.
- [DOĞRULANDI-KOD] Para çekme: istek başına 10.000–1.000.000 💎, haftada 10.000.000 💎 (10–1.000 USD / istek, 10.000 USD/hafta) — `server/api/catalog.mjs:266`.
- [DOĞRULANDI-KOD] Çekim hakkı: ajans sahibi, ≥10 üyeli aile sahibi veya beyanı `Kadın` olan herkes — `server/api/streamer-rule.mjs:65`.
- [DOĞRULANDI-KOD] Normal hediye: gönderenin jetonu alıcıya 1:1 elmas (`giftCoins` → `giftDiamonds`), elmasın kilidi jetonun kanalına göre (mağaza 7 gün, Jeton Noktası 1 gün) — `server/api/wallet.mjs:168-196, 20-24`. Ücretli mesaj 12, sesli arama 100/dk, görüntülü 190/dk jeton; "1 jeton = 1 elmas" — `server/api/live-registry.mjs:168-170`.
- [DOĞRULANDI-KOD] Şanslı hediye: alıcı payı `SHARE_PCT = 10` (panel 1–50) elmas; geri kalan platform harcaması; her hediye bir çekiliş; kazanç `price × kat` olarak **gönderene `ugurlu` jeton** — `server/api/lucky-rules.mjs:13-18`, `server/api/lucky.mjs:211-250`. `ugurlu` "spent like any coin" (hediye edilebilir) — `server/api/wallet.mjs:42-44`.
- [DOĞRULANDI-KOD] Varsayılan oran tablosu (100.000 üzerinden): 2×15.000, 5×3.000, 10×800, 20×250, 50×60, 100×20, 500×2, 1000×1 — `server/api/lucky-rules.mjs:30`. Beklenen dönüş = 0,30+0,15+0,08+0,05+0,03+0,02+0,01+0,01 = **0,65×** (kod yorumu "about 0.65×"). lk4 tablosu: 0,28+0,16+0,09+0,04+0,035+0,025+0,01 = **0,64×** — `server/api/lucky-rules.mjs:36`. Günlük ödül tavanı 20.000.000 jeton — `lucky-rules.mjs:39`. (Aritmetik bu çalışmada yapıldı.)
- [DOĞRULANDI-KOD] Şanslı payı ajans komisyon matrahına girer (`recordIncome(c, rid, 'lucky_gift', …)`) — `server/api/lucky.mjs:238`.
- [DOĞRULANDI-KOD] Oyun Salonu kasa payı `HOUSE_SHARE = 0.6` (oyuncuya %40 döner, kazanç yalnız oyun jetonu) — `server/api/casino-rules.mjs:16`. Canlı Yörünge `rocket_house_pct` varsayılan 60, sınır 3–90 — `server/api/rocket-live-rules.mjs:24`, `server/api/live-registry.mjs:1274-1288`. Oyunlar varsayılan olarak yalnız admine açık (`casino_open`) — `live-registry.mjs:124`.
- [DOĞRULANDI-KOD] Ajans haftalık seviyeleri: Gönül Bağı %35 (0), Başlangıç %50 (200.000 💎/hafta), Bronz %60 (300.000), Gümüş %70 (500.000), Altın %80 (750.000), Platin %90 (1.000.000), Elmas %100 (1.500.000); seviye ≥1 için haftada ≥10 USD kazanan 20 aktif yayıncı; yeni ajans ilk 4 hafta %50 — `server/api/agency-level-rules.mjs:9-21`. Komisyon yayıncıdan kesilmez, platform öder — `docs/AJANS_HIYERARSI.md:3-33`.
- [DOĞRULANDI-KOD] BD: `bd_policy: { rate: 0.05, basis: 'base_plus_pool' }` (matrah = yayıncı elması + ajans komisyonu) — `server/api/agency-lib.mjs:91, 634-638`. Referans ajans: alt ajansın komisyonunun %5'i, 1 bedava haftadan sonra 4 hafta — `agency-lib.mjs:101`. Ajans asistanı payı ajans komisyonundan çıkar (ek maliyet değil) — `server/api/wallet.mjs:49-50`.
- [DOĞRULANDI-KOD] Yayıncı haftalık bonusu (varsayılan **açık**): 10.000 💎 → 5.000; 20.000 → 10.000; … 5.000.000 → 2.500.000 (her baremin başında tam %50, barem arasında daha az; ör. 15.000 💎 kazanan 5.000 alır = %33); ajans komisyonu doğurmaz — `server/api/host-bonus-rules.mjs:10-26`, `server/api/host-bonus.mjs:1-16, 120`.
- [DOĞRULANDI-KOD/DOC] Belgede en üst seviye örneği: 1.000 jetonluk hediye (220 TL) → yayıncı 1 USD (49 TL) + ajans 1 USD + BD 0,1 USD + bonus → "en çok ~2,6 USD ≈ 127 TL" — `docs/AJANS_HIYERARSI.md:31-33`.
- [DOĞRULANDI-KOD/DOC, eski] `docs/maliyet-hesabi.html:184,187` farklı varsayımlar kullanıyor ("ajans komisyonu %40, oda sahibi bonusu %20, diğer ~%5"; "Mağaza KDV hariç tutarın %15'ini alır, 1 M USD'yi geçince %30; KDV %20"; "Jeton Noktası ortalama %2,5 alır"). Sunucuda "oda sahibi bonusu" kodu bulunamadı (grep boş) → bu sayfa güncel kurallarla uyumsuz.

### Inferences
- Bir normal hediyede platformun gerçek maliyet çarpanı (yayıncı elmasının katı): yönetim yayıncısı, bonus altı = **1,00**; Gönül Bağı ajansı + BD = 1 + 0,35 + 0,05×1,35 = **1,4175**; Başlangıç + BD = **1,575**; Bronz + BD + ~%40 bonus = **2,08** [TAHMİN: bonus oranı]; Elmas + BD + %50 bonus = **2,60** (belgedeki 2,6 USD ile aynı).
- Şanslı hediyede satın alınan jeton başına alıcıya giden elmas, kazancın ne yapıldığına bağlı: kazanç hep yeniden Şanslı'ya oynanırsa 0,10/(1−0,65) = **0,286**; kazanç normal hediyeye giderse 0,10+0,65 = **0,75**; %70'i yeniden oynanırsa **0,54** [TAHMİN: q=0,7 temel varsayım].

### Gaps
- Play Console'daki gerçek TL fiyatları görülmedi; 220 TL "liste değeri". Elmasların ne kadarının gerçekten nakde çekildiği (ve ne kadarının Çevir'le jetona döndüğü) bilinmiyor; hesaplarda en kötü durum olarak tamamı çekilmiş sayıldı.

---

## S2. Bugün 1.000 TL'lik yüklemede platformun brüt marjı (mağaza ücreti, KDV, DST, yayıncı, ajans, şans dönüşü)

### Takeaway
Google Play'den 1.000 TL (KDV dahil) yüklemede platforma KDV ve %15 ücret sonrası **708 TL** kalır. Bu jetonlar normal
hediyeye giderse yayıncı + ajans maliyeti 223–579 TL tutar ve marj **129–486 TL** (brütün %13–49'u) olur; Şanslı hediyeye
giderse marj **471–645 TL** (%47–64) olur. Google ücreti %30'a çıktığında (yıllık 1 M USD üstü) en üst ajans seviyesindeki
normal hediye marjı **~0'a** iner (4 TL).

### Cited Findings
- [DOĞRULANDI-WEB] Google, Türkiye'de "merchant of record"; "Google is responsible for determining, charging, and remitting VAT or GST" listesinde "VAT: Albania, Georgia, Kazakhstan, Morocco, Senegal and Türkiye"; geliştiricinin KDV'yi ayrıca beyan etmesi gerekmez. Sayfada DST'den söz edilmiyor — [Google Play Console Help 138000](https://support.google.com/googleplay/android-developer/answer/138000?hl=en).
- [DOĞRULANDI-WEB] Google Play hizmet ücreti, AU/AEA/JP/UK/US dışındaki pazarlarda: "15% for the first $1M (USD) revenue earned by the developer each year" ve "30% for earnings in excess of $1M"; abonelikler %15. AU/AEA/UK/US/JP için 2026'dan itibaren yeni yapı (abonelik %10+%5 faturalama; diğer %20/%25+%5) — [Google Play Console Help 112622](https://support.google.com/googleplay/android-developer/answer/112622?hl=en).
- [DOĞRULANDI-WEB, faz-1 notundan] Türkiye KDV genel oranı %20 (yabancı elektronik hizmet sağlayıcılar için 3 No.lu beyan) — `research_notes/Rakip analizi ve yasal yayın stratejisi/turkiye_hukuku.md:151,158`; [Avalara VATlive](https://www.avalara.com/vatlive/en/country-guides/asia/turkey/turkish-vat-electronic-services.html).
- [DOĞRULANDI-WEB, faz-1] DST 1.1.2026'dan %5, 1.1.2027'den %2,5 (10767 sayılı CBK); eşikler: Türkiye hasılatı > 20 M TL **ve** dünya hasılatı > 750 M € — [EY Global Tax News](https://globaltaxnews.ey.com/news/2026-0117); `ingiltere_hukuku.md:159,164`. [İKİNCİL] Apple Türkiye DST'sini geliştirici gelirine yansıtıyor (%7,5 → %5) — [CNBC-e](https://www.cnbce.com/teknoloji/apple-app-store-gelirlerinde-turkiye-icin-vergi-guncellemesine-gitti-h24067) (`turkiye_hukuku.md:156`).
- [DOĞRULANDI-KOD] Uygulamada satın alma yalnız Android'de (`Platform.OS === 'android'`) — `app/src/lib/live/billing.ts:50-60` (audit notu §5). Yani bugün Apple DST yansıması fiilen etkili değil.
- [DOĞRULANDI-KOD] Maliyet parametreleri S1'deki gibi.

### Inferences (aritmetik, [TAHMİN] varsayımlar yazılı)
Varsayımlar: tüketici 1.000 TL öder (KDV dahil, liste fiyatı 220 TL/1.000 jeton, ilk alım hediyesi yok) → **4.545 jeton**;
Google KDV'yi (%20) kendisi öder → KDV hariç 833,3 TL; ücret %15 → **net 708,3 TL** (%30'da 583,3 TL); DST şirkete
uygulanmaz (eşik altında) ve Google'ın DST yansıttığına dair kaynak yok; her elmas nakde çekilir (en kötü durum,
0,049 TL/elmas). Tüm jeton normal hediyeye gitse yayıncı elması = 4.545 💎 = 4,545 USD = **222,7 TL**.

| 1.000 TL nereye harcandı | Maliyet çarpanı | Yayıncı+ajans+BD+bonus maliyeti | Platform marjı (%15 ücret) | Brütün %'si | %30 ücretle marj |
|---|---|---|---|---|---|
| Normal hediye, yönetim yayıncısı, bonus yok | 1,00 | 222,7 TL | **485,6 TL** | %48,6 | 360,6 TL |
| Normal hediye, Gönül Bağı (%35) + BD | 1,4175 | 315,7 TL | **392,6 TL** | %39,3 | 267,6 TL |
| Normal hediye, Başlangıç/yeni ajans (%50) + BD | 1,575 | 350,8 TL | **357,5 TL** | %35,8 | 232,5 TL |
| Normal hediye, Bronz (%60) + BD + ~%40 bonus | 2,08 | 463,2 TL | **245,1 TL** | %24,5 | 120,1 TL |
| Normal hediye, Elmas (%100) + BD + %50 bonus | 2,60 | 579,1 TL | **129,2 TL** | %12,9 | **4,2 TL** |
| Şanslı hediye, kazanç hep yeniden Şanslı'ya (0,286 💎/jeton), Gönül Bağı | 1,4175 | 90,2 TL | **618,1 TL** | %61,8 | 493,1 TL |
| Şanslı, %70 yeniden oynanır (0,54 💎/jeton), Gönül Bağı | 1,4175 | 170,9 TL | **537,4 TL** | %53,7 | ~412 TL |
| Şanslı, kazanç normal hediyeye (0,75 💎/jeton), Gönül Bağı | 1,4175 | 236,8 TL | **471,5 TL** | %47,2 | 346,5 TL |
| Şanslı, %70 yeniden oynanır, Bronz+bonus | 2,08 | 250,7 TL | **457,6 TL** | %45,8 | ~333 TL |
| Oyun Salonu (bahis satın alınmış jetonla, kazanç oyun jetonu) | — | 0 | **708,3 TL** | %70,8 | 583,3 TL |

- Bu marj **brüt katkı payıdır**: sunucu, personel, moderasyon, iade/dolandırıcılık, ilk alım hediyesi (p1'de %100 ek jeton → ilk 220 TL'lik alımda maliyet iki katı), kampanya jetonları ve ödeme kuruluşu ücretleri düşülmemiştir.
- Yayıncı payı (yalnız yayıncı) brütün %22,3'ü, KDV hariç netin %26,7'si, mağaza sonrası netin %31,4'ü. Ajans ve bonusla mağaza sonrası netin %44,6'sı (Gönül Bağı) ile %81,8'i (Elmas+bonus, %15 ücret) / %99,3'ü (%30 ücret) arasında.
- **Kritik bulgu:** Google'da yıllık 1 M USD (≈49 M TL net) aşıldığında, en üst ajans seviyesi + haftalık bonusla yapılan her normal hediye platforma neredeyse sıfır bırakıyor; bu, kendi kendine hediye halkaları ve çalıntı kart/iade dolandırıcılığı için de en kârlı nokta (bkz. S3 dolandırıcılık).
- Şanslı hediye "jeton başına" daha kârlı çünkü kazanç (0,65×) jeton olarak geri dönüyor ve tekrar oynanınca elmasa daha az dönüşüyor; asıl ticari değeri ise **hacim** (aynı kullanıcının tekrar tekrar oynaması). Hacim verisi yok.
- Jeton Noktası kanalı: yönetim 1.000 jetonu bankaya 220 TL'ye satıyor (`catalog.mjs:258`); mağaza ücreti yok. KDV beyan edilmiyorsa 1.000 TL'lik satıştan 1.000 TL kalır (IAP'te 708) — ama bu KDV'siz hali kendisi uyumsuzluk; KDV'li uyumlu hali ≈ 833 TL − ödeme ücreti [TAHMİN].

### Gaps
- Google Play'in Türkiye'de DST'yi geliştiriciye yansıtıp yansıtmadığı bulunamadı (Help 138000'de DST yok).
- Gerçek kanal karışımı (IAP / Jeton Noktası), çekim oranı, ajans seviyesi dağılımı, Şanslı/normal hediye oranı: veri yok (test sunucusu).

---

## S3. Her model neyi değiştirir: marj, harcama, yayıncı/ajans geliri, dolandırıcılık, uyum maliyeti, mühendislik

### Takeaway
Uyumlu modellerin hepsi **jeton başına marjı artırıyor** (çünkü şans kazancı artık elmasa dönmüyor), ama **hacmi ve
yayıncı gelirini düşürüyor**. Ticari soru tamamen hacim: Şanslı hediye hacmi ~%20–35'ten fazla düşmezse M1/M2 bugünkü
TL marjını korur. Yayıncı geliri ise Şanslı kazançlarının yeniden hediye edilmesi kaybolduğu için %17–51 düşer; bu ajans
arzını etkiler. Uyum maliyetleri (KYC 0,80–1,85 USD/kişi, ödeme %1–4) marja göre küçük; büyük maliyet hacim kaybı ve
Jeton Noktası'nın kapanması.

### Cited Findings (maliyet girdileri)
- [DOĞRULANDI-WEB] Sumsub: Basic **1,35 USD/doğrulama** (kimlik, canlılık, yüz eşleme), Compliance **1,85 USD** (AML taraması ve adres dahil); 14 gün 50 kontrol deneme; Enterprise 1.000+/ay özel fiyat — [Sumsub Pricing](https://sumsub.com/pricing/). [İKİNCİL] asgari aylık 149 USD (Basic) / 299 USD (Compliance) — [costbench](https://www.costbench.com/software/kyc-aml/sumsub/), [Sumsub eski sayfa 2024](https://sumsub.com/pricing-old/1nov2024/).
- [DOĞRULANDI-WEB/İKİNCİL] Veriff self-serve Essential **0,80 USD/doğrulama**, 49 USD asgari aylık; PEP/yaptırım taraması +0,64 USD (Didit karşılaştırması); TrustRadius eski bir fiyat olarak 1,49 USD veriyor (çelişki) — [Veriff Plans](https://www.veriff.com/pricing), [Didit vs Veriff](https://didit.me/blog/didit-vs-veriff-differences/), [TrustRadius](https://www.trustradius.com/products/veriff/pricing).
- [İKİNCİL] Yoti bileşen fiyatları (veri çıkarma £0,30, canlılık £0,15, yüz eşleme £0,25); iş yaşı doğrulama fiyatı yayımlanmıyor — [Yoti](https://www.yoti.com/?p=20961), [Didit Yoti alternative](https://didit.me/switch/yoti-alternative/).
- [DOĞRULANDI-WEB] Payoneer bakiyeden alıcının banka hesabına ödeme "1-4% of transaction amount"; Türkiye/TRY'ye özel toplu ödeme ücreti bulunamadı — [Payoneer fees](https://www.payoneer.com/th/about/fees/). Wise TRY transferlerini EFT ile gönderiyor (ücret bu turda alınmadı) — [Wise TRY](https://www.wise.com/help/articles/2932348/try-transfers).
- [DOĞRULANDI-WEB] Xsolla (merchant of record, vergi ve PCI üstlenir) işlem başına **%5** ücret, ayrıca ödeme sistemi ücreti olabilir — [Xsolla multi-platform](https://xsolla.com/de/multi-platform-publishing), [Xsolla pricing](https://xsolla.com/pricing). Yalla web mağazasını Coda "authorized reseller" olarak işletiyor — `yalla.md` / [Codashop](https://yallaludo.codashop.com/en-kw/yalla-ludo).
- [DOĞRULANDI-WEB] TCMB yurt içi kart azami üye işyeri komisyonu (Eylül–Kasım 2026): temel %3,11, kart tipi tavanı %3,56 — [TCMB tablo](https://tcmb.gov.tr/wps/wcm/connect/ebe32165-bf61-4bde-b7c8-45ca1ad4775b/%C3%9Cye+%C4%B0%C5%9Fyerlerine+Uygulanacak+Azami+Komisyon+Oranlar%C4%B1+May%C4%B1s+2026.pdf?MOD=AJPERES) (arama özeti). [İKİNCİL, çelişkili] iyzico %4,29 + 0,25 TL ya da "%2,49'dan başlayan" — [karekod.org](https://www.karekod.org/blog/sanal-pos-komisyon-oranlari/), [ticimax](https://www.ticimax.com/blog/iyzico-komisyon-oranlari).
- [DOĞRULANDI-WEB, faz-1] GVK 20/B: 2026 sınırı 5.300.000 TL; özel banka hesabı ve istisna belgesi; stopaj %15 (bir kaynak %17) — `turkiye_hukuku.md:152,159`.
- [DOĞRULANDI-WEB] MGA (Malta) B2C uzaktan oyun lisansı: başvuru 5.000 € (tek sefer), sabit yıllık lisans ücreti 25.000 € (yalnız Type 4: 10.000 €), ayrıca hasılata bağlı uyum katkısı (asgari/azami kaynaklar arasında çelişkili: Type 1 15.000–375.000 €, Type 4 5.000–500.000 €) — [MGA Guidance Note](https://mga.org.mt/app/uploads/Guidance-Note-Licence-Fees-and-Taxation.pdf), [RSM Malta](https://www.rsm.global/malta/node/291).
- [DOĞRULANDI-KOD] Altyapı zaten var: oyun jetonu ayrı para birimi (yalnız casino/çark/roket yazar) — audit §1 madde 7; elmas kilitleri jetonun kanalını (`ugurlu` dahil) satır satır tutuyor (`diamond_locks.channel`) — `server/api/wallet.mjs:183-196`; ödül yolu `grantReward` yalnız mağaza ürünü verir — audit §2G; `sharePct` panelden 1–50 — `lucky-rules.mjs:13-18`.

### Inferences — model bazında ([TAHMİN] etiketli; marjlar %15 ücret, Gönül Bağı+BD çarpanı 1,4175 / Bronz+bonus 2,08)

**Bugün (Baseline):** Şanslı kazancı hediye edilebilir jeton; çekim açık, cinsiyet beyanıyla. Şanslı'ya giden 1.000 TL'nin
marjı 537 TL (aralık 471–618) / 458 TL; normal hediye 393 / 245 TL. Dolandırıcılık: en üst seviyede bir "halka" (ajans
sahibi + kendi yayıncıları) 220 TL'lik jetondan ~127 TL'yi (%58) nakde çevirebilir (`docs/AJANS_HIYERARSI.md:31-33`);
çalıntı kartla yükleme + 7 gün sonra gelen iade = kilit kalkmış elmas geri alınamaz (`wallet.mjs:1-14`, audit §7).
Yalnız yayıncıyla aklama maliyeti %78 (49/220 geri döner). Hukuki risk: çok yüksek (aşağıda tablo).

**M1 Kapalı devre şans (bahis satın alınmış jetonla, ödül yalnız devredilemez oyun puanı):** Şanslı'nın `ugurlu` kazancı
oyun jetonuna yazılır. Alıcı payı tamamen kalkarsa jeton başına marj **708 TL** (Oyun Salonu ile aynı); %10 pay kalırsa M2'ye
eşit. Harcama: şans hacmi **−%40…−%80** [TAHMİN; sürücü: kazancı sevilen yayıncıya hediye etme ve nakde dönüş ihtimali
kayboluyor]; kapalı devre şansın yine de para kazandırdığına dair benchmark: Yalla oyun hizmetleri 124,0 M $ (FY2025),
Playtika 2,76 milyar $ (FY2025) — bunlar farklı kitleler. Yayıncı geliri: Şanslı'dan gelen pay sıfıra iner (S6'da %17–51 toplam
düşüş). Dolandırıcılık/aklama: şans yolundan nakde çıkış kapanır. Uyum: mağazada "Simulated Gambling" beyanı, oran
gösterimi, yaş kapısı; ödeme yok. Mühendislik: **M** (kanal değişikliği, eski APK'nın gördüğü, para testleri ve fuzz karışımı).

**M2 Deterministik yayıncı payı (gönderen sabit fiyat öder, yayıncı sabit % alır; gönderenin rastgele dönüşü yalnız puan/kozmetik):**
Pay %10'da jeton başına marj **677 TL** / 662 TL; pay %20'de 645 / ~616; pay %30'da 614 / 569 TL. Yani pay %29'a çıkarılsa bile
marj bugünkü "tam yeniden oynama" Şanslı'sıyla aynı (618 TL) kalır ve yayıncı jeton başına aynı elması alır. Harcama:
**−%30…−%70** [TAHMİN; sürücü: hediye-yayıncıya motivasyonu ve heyecan korunur, kazancın değeri kaybolur]. Yayıncı geliri:
pay %10'da **−%17…−%51** (L'ye göre, S6); pay %25–30 ile Şanslı kısmının yayıncı gelirinin bir bölümü korunur. Mühendislik: **M**
(`sharePct` zaten var; kazanç yolunu oyun puanına/kozmetiğe çevirmek; eski APK).

**M3 Ödülsüz / kozmetik rastgelelik (olasılığı açık kutu; ödül süreli çerçeve, giriş efekti, rozet):** Jeton başına marj **~708 TL**
(kozmetik marjinal maliyeti ~0; yayıncı payı yok, verilirse sabit %). Harcama: şans hacmi **−%50…−%85** [TAHMİN; sürücü: ödül
değeri yalnız statü]. Yayıncı geliri: Şanslı'dan gelen kısım tamamen kaybolur. Faz-1 seçenek C ile aynı (endeks 75–95).
Mühendislik: **M** (`grantReward` ve mağaza ürünleri var).

**M4 Yalnız ücretsiz girişli şans (günlük/görev puanıyla, satın alınamaz, ödül kapalı devre):** Doğrudan şans geliri **0**;
1.000 TL'lik yüklemenin tamamı normal hediye/VIP/mağazaya gider (393 / 245 TL marj). Harcama: şans geliri **−%100**, dolaylı
elde tutma etkisi bilinmiyor. Faz-1 seçenek B (endeks 65–90). Puanı harcamaya bağlamak Google'ın sadakat/şans kuralına
yaklaşır (faz-1 rapor). Mühendislik: **S–M** (Oyun Salonu'ndan satın alınmış jeton bahsini kaldırmak, `casino.mjs` bahis
sırası).

**M5 Giriş ücretli, jeton ödüllü beceri oyunları (Okey/Ludo turnuvası, kesinti):** Ödül hediye edilebilir jetonsa ödül → hediye
→ elmas → nakit yolu yeniden açılır: %10 kesinti varsayımıyla 1.000 TL'lik girişten marj ≈ 708 − 0,9×222,7×1,4175 ≈ **424 TL**
[TAHMİN: kesinti %10, ödül tamamen hediye edilir]. Ödül kapalı devreyse M1 ile aynı. Hukuki risk yüksek: Okey/Ludo'da talih
unsuru var; TCK 228 kumar tanımı "kazanç amacı + sonucun talihe bağlı olması" ve Yargıtay "çay parası" kararı (düşük değerli
kazanç da yeter) — `turkiye_hukuku.md:12-16`; Apple uygulamada beceri oyunlarını "real money skill-based gaming" sayıyor —
`oyun_saglayicilari.md:234`. Mühendislik: **L** (eşleştirme, hile/işbirliği tespiti, turnuva muhasebesi).

**M6 Türkiye dışında ayrı lisanslı gerçek para ürünü:** Türk kullanıcıya sunulamaz (7258 m.5(1)(b): yurt dışı şans oyunlarına
Türkiye'den imkân sağlama, 4–6 yıl — `turkiye_hukuku.md:17-24, 32`); Similar Club'ın Türkiye gelirine katkısı **0**. Sabit maliyet:
MGA 5.000 € başvuru + 25.000 €/yıl + uyum katkısı (asgari 5.000–15.000 €) + oyun sertifikasyonu, AML ekibi, ayrı şirket ve
mağaza RMG koşulları (Apple 5.3.4 lisans, coğrafi kısıt, uygulama ücretsiz) — `magaza_politikalari.md`, audit §9. Süre
[TAHMİN] 9–18 ay; mühendislik **L+**. Ticari açıdan bu proje için anlamsız (ayrı iş).

**M7 Ajans/ödeme yeniden tasarımı (yalnız kaynağı deterministik elmas çekilebilir; lisanslı PSP; KYC; cinsiyet kuralı yok; Jeton Noktası kapalı ya da uyumlu web mağazası):**
- Marj: normal hediye marjı değişmez; PSP %1–4 → 1.000 TL'lik yüklemede yayıncı+ajans ödemesi ~316 TL (Gönül Bağı) ise **3–13 TL** ek maliyet [TAHMİN aritmetik]. KYC yayıncı başına tek sefer 0,80–1,85 USD (≈39–91 TL @49) + yaptırım taraması 0,64 USD; asgari aylık 49–299 USD. 20/B stopajı (%15) yayıncının brütünden kesilir → yayıncı neti %15 düşer; platform telafi ederse maliyet artar.
- Jeton Noktası kapanırsa: o kanaldaki hacim IAP'e geçerse 1.000 TL başına 1.000 → 708 TL (KDV'siz bugünkü haliyle −%29) ya da 833 → 708 (KDV'li uyumlu karşılaştırmada −%15); bir kısmı kart sahibi olmayan nakit alıcı olduğu için tamamen kaybolabilir [TAHMİN].
- Uyumlu web mağazası (MoR, %5): 833,3 × 0,95 ≈ **792 TL** / 1.000 TL; IAP'e göre **+84 TL** (+%12) yalnız web'e geçen hacimde. Uygulama içinden yönlendirme yasak (Apple 3.1.1/3.1.3, ABD hariç; faz-1 rapor §"Jeton Noktası için üç yol"), bu yüzden web payı düşük kalır: benchmark Yalla'nın "çeşitlendirilmiş kanallar" tasarrufu 4,9 M $ / 341,9 M $ gelir (%1,4) — `yalla.md:132`; Playtika DTC Q4 2025'te 250,1 M $ / 678,8 M $ (%37) ama ABD link-out serbestliğiyle — [Playtika Q4 2025](https://investors.playtika.com/news-releases/news-release-details/playtika-holding-corp-reports-q4-and-2025-financial-results).
- Kaynak (provenance) kuralı: `ugurlu`/`canta` kanalından doğan elmas çekim havuzuna girmez; altyapı `diamond_locks.channel` ile zaten var. Bu, şanstan doğan yayıncı gelirinin nakit değerini sıfırlar → yayıncılar için M1/M2 ile aynı etki.
- Cinsiyet kuralı kalkıp "sözleşmeli + KYC'li yayıncı" kuralı gelirse: erkek yayıncılar çekebilir (çekilen elmas artar, Çevir'e giden azalır), kadın beyanlı ama yayıncı olmayan hesaplar çekemez (halka/aklama kapanır). Net maliyet yönü belirsiz [TAHMİN]. Not: Çevir'e giden 1.000 💎 sadece 230 jeton (≈11 TL ileride yayıncı maliyeti) doğurur; çekilen 1.000 💎 ise 49 TL nakit.
- Harcama: toplam yükleme **−%5…−%20** [TAHMİN; sürücü: Jeton Noktası alıcıları, KYC'den kaçan hostlar/ajanslar, halka ve aklama hacminin (zaten "kötü gelir") kaybı].
- Dolandırıcılık/aklama: en büyük kazanım. Bugün en üst seviyede halka ~%58 geri alıyor; KYC + ad eşleşmeli TR IBAN + kaynak kuralı + kilit sonrası izleme bunu kapatır. Benchmark: 10.11.2026'da TikTok hediyeleri üzerinden aklama iddiasıyla 8 ilde operasyon (MASAK ~1,93 milyar TL) — faz-1 rapor yönetici özeti [İKİNCİL].
- Mühendislik: **L** (KYC entegrasyonu, PSP, sözleşme/vergi alanları ve migration, `my-data`, panel `PANEL_ROUTES`/`APP_ROUTES`); cinsiyet kuralının kaldırılması **S**; Jeton Noktası'nın mağaza derlemelerinden kaldırılması **S**; MoR web mağazası **M**.

### Gaps
- Avukat görüşü ücretleri (UK solicitor, Türk avukat, mali müşavir) için kamuya açık fiyat bulunamadı; tahmin verilmedi.
- Payoneer/Wise'ın Türkiye'ye toplu ödeme (TRY) ücreti ve Türk PSP'lerinin bu iş modelini kabul edip etmeyeceği doğrulanamadı.
- Harcama etkisi aralıkları için Türkiye'de ya da sesli sohbette "şanslı hediye kapatıldı, gelir şu kadar düştü" türü yayımlanmış veri bulunamadı.

---

## S4. Benchmark'lar (tahmin değil, karşılaştırma)

### Takeaway
Uyumlu, halka açık sesli-sosyal şirketlerde içerik üreticisine giden pay ya çok düşük (Yalla: maliyet gelirin %33'ü, yayıncı
maaşı yok) ya da yüksek (Hello Group: gelir maliyeti %62, çoğu yayıncı paylaşımı). Similar Club'ın normal hediyedeki yayıncı+
ajans maliyeti (mağaza sonrası netin %45–82'si) Hello Group ile YouTube arasında başlıyor, en üst seviyede hepsinin üstüne çıkıyor.

### Cited Findings
- [BENCHMARK, DOĞRULANDI-WEB] **Yalla** FY2025: gelir 341,9 M $; gelir maliyeti 111,9 M $ (%32,7; 2024 %35,5), çoğunlukla ödeme platformu komisyonu ve personel; "we do not incur significant content acquisition cost, such as incentive fees to key users"; sanal hediye/para "under any circumstance" nakde çevrilemez; ARPPU çeyrekte 6,9–7,9 $ (2025); ödeyen 10,4–11,8 M/çeyrek; Q3 2026 net marj %36,2 — [Yalla 20-F FY2025](https://www.sec.gov/Archives/edgar/data/1794350/000119312526168267/yala-20251231.htm), [6-K Q3 2026](https://www.sec.gov/Archives/edgar/data/1794350/000119312526464687/yala-ex99_1.htm) (`yalla.md:20-24, 129-137`).
- [BENCHMARK, DOĞRULANDI-WEB] **Hello Group (Momo)** FY2025: net gelir 10.367,1 M RMB, gelir maliyeti 6.446,6 M RMB → **%62,2** (türetilmiş); Q4 2025 gelir maliyeti 1.611,5 M RMB / 2.575,8 M RMB = %62,6; bülten maliyet düşüşünü "a decrease in revenue sharing with broadcasters on Momo apps" ile açıklıyor; Momo ödeyen kullanıcı Q4 2025 3,9 M (Q4 2024: 5,7 M) — [Hello Group Q4/FY2025 bülteni](https://seekingalpha.com/pr/20441935). [İKİNCİL] CFO: 2025 2. yarıdaki ajans ve yayıncı vergi denetimleri VAS gelirini "materially" etkiledi; Ağustos'ta yayıncı/ajanslara sübvansiyonlu yeni gelir paylaşımı — [Hello Group arama özeti / transkript](https://www.fool.com/earnings/call-transcripts/2026/06/02/hello-group-momo-q4-2025-earnings-transcript/). Yayıncı paylaşımının ayrı satır tutarı 20-F'ten alınamadı.
- [BENCHMARK, DOĞRULANDI-WEB] **JOYY/BIGO** FY2025: toplam gelir 2,12 milyar $, canlı yayın 1,53 milyar $; Q4 2025 canlı yayın 394,4 M $ (BIGO 371,8 M $); Q2 2025 BIGO gelir maliyeti 285,6 M $, "36.5 million decrease in revenue-sharing fees and content costs" — [JOYY Q4/FY2025 (Barchart)](https://www.barchart.com/story/news/678865/joyy-reports-fourth-quarter-and-fy2025-financial-results-q4-revenue-returns-to-yoy-growth-bigo-ads-momentum-continues-delivering-strong-shareholder-returns), [JOYY Q2 2025 (GlobeNewswire)](https://www.globenewswire.com/news-release/2025/08/26/3139675/23553/en/JOYY-Reports-Second-Quarter-2025-Unaudited-Financial-Results.html) (arama özeti; sayfalar açılamadı). Gelir paylaşımının gelire oranı bulunamadı.
- [BENCHMARK, DOĞRULANDI-WEB, faz-1] **YouTube** Super Chat/Stickers/Thanks: yayıncı, satış vergisi ve iOS mağaza ücreti sonrası **%70** — [YouTube Help](https://support.google.com/youtube/answer/7288782?hl=en%2F). **Twitch** abonelik standart 50/50, Plus 60/40–70/30; Bits'te Bit başına 1 sent — `alternatif_is_modelleri.md:21-25, 52`. **TikTok LIVE**: nominal %50 (Diamond); ödenen fiyata göre ~%20–24 (ikincil, çelişkili) — `alternatif_is_modelleri.md:27-31`.
- [BENCHMARK, DOĞRULANDI-WEB] **Playtika** (sosyal casino ağırlıklı) FY2025: gelir 2.755,4 M $; ARPDAU 0,89 $; günlük ödeyen dönüşümü %4,4; Q4 2025 günlük ödeyen 357 bin; Q4 DTC (web) geliri 250,1 M $ (+%43,2) — [Playtika Q4/FY2025](https://investors.playtika.com/news-releases/news-release-details/playtika-holding-corp-reports-q4-and-2025-financial-results). Q3 2026 ARPDAU 1,03 $ — [Morningstar/GlobeNewswire](https://www.morningstar.com/news/globe-newswire/9871117/playtika-holding-corp-reports-q3-2026-financial-results).

### Inferences
- Similar Club yayıncı+ajans maliyeti / mağaza sonrası net gelir: %31 (yalnız yayıncı) → %45 (Gönül Bağı) → %65 (Bronz+bonus) → %82 (Elmas+bonus); %30 ücrette %99. Hello Group'un toplam gelir maliyeti %62 (personel, bant genişliği dahil) olduğundan, Similar Club'ın orta seviyeleri bile Hello Group'un yayıncı payından yüksek olabilir [TAHMİN].
- Hello Group örneği, yayıncı/ajans vergi uyumunun (Türkiye'de 20/B) ödeyen kullanıcıyı ve geliri doğrudan düşürebileceğini gösteriyor (M7'nin gizli maliyeti).
- Yalla, nakit çıkışı olmadan %36–43 net marj ve çeyrekte ~7–8 $ ARPPU ile çalışıyor; ama Similar Club'ın ajans modeli farklı bir iş — Yalla'ya geçmek ajans arzını bitirir.

### Gaps
- Türkiye'ye özgü sesli sohbet/mobil oyun ARPPU'su için güvenilir kamu kaynağı bulunamadı (faz-1 de bulamadı).
- Hello Group ve JOYY 20-F'lerindeki "revenue sharing" satırının gelire oranı doğrudan alınamadı (SEC sayfaları bu turda açılmadı).

---

## S5. Karşılaştırma tablosu

### Takeaway
Ticari olarak en verimli uyumlu yol **M2 (deterministik yayıncı payı) + M3 (kozmetik kutu) + M7 (KYC'li ödeme, kaynak kuralı)**;
en düşük hukuki risk **M4 + M7** (faz-1 seçenek A/B). M5 ve M6 bu ürün için ticari olarak cazip değil.

### Cited Findings
- Hukuki risk dayanakları: Türkiye TCK 228 / 7258 m.5 — `turkiye_hukuku.md:6-32`; UK s.6 "money's worth", s.6(4) ücretsiz giriş yetmez, kapalı devre/kozmetik yolları — `ingiltere_hukuku.md:16-35`; mağazalar: oran gösterimi (Apple 3.1.1, Google loot box), RMG yasağı, sosyal casino reklam kısıtı — `magaza_politikalari.md:34, 109, 129, 254`; beceri oyunu sınıflaması — `oyun_saglayicilari.md:234`; MASAK/6493 ve cinsiyet kuralı — audit §4, §7 (`similar_club_kod_denetimi.md`).

### Inferences

Marj: 1.000 TL'lik yüklemenin **o özelliğe** harcanması, Google %15, Gönül Bağı+BD (1,4175) / Bronz+bonus (2,08). Harcama etkisi:
o özelliğin hacmine, [TAHMİN].

| Model | Korunan özellikler | Marj / 1.000 TL | Harcama etkisi (tahmin, sürücü) | Yayıncı/ajans geliri | Uyum maliyeti | Hukuki risk (not) | Süre |
|---|---|---|---|---|---|---|---|
| Bugün | Şanslı (hediye edilebilir kazanç), çekim, Jeton Noktası | Şanslı 537 (471–618) / 458; normal 393 / 245 | Endeks 100 (mağaza/BTK olayında → 0) | Taban | Bugün ~0; risk maliyeti sınırsız | **Çok yüksek** (turkiye_hukuku §1; ingiltere_hukuku s.6; magaza RMG) | — |
| M1 Kapalı devre şans | Şans oyunları, satın alınmış bahis; ödül oyun puanı | 708 (pay yok) | Şans hacmi −%40…−%80 (kazancı hediye edememe) | Şanslı kaynaklı gelir → 0 | Simüle kumar beyanı, oran sayfası, yaş kapısı (Veriff 0,80 $/kişi) | **Orta** (UK düşük–orta; TR düşük–orta, satın alınmış bahis tartışmalı; mağaza "Simulated Gambling") | M, 2–4 hafta |
| M2 Deterministik pay | Şanslı'nın görünümü + sabit yayıncı payı; dönüş puan/kozmetik | 677 (%10) / 614 (%30); Bronz: 662 / 569 | Şans hacmi −%30…−%70 | Pay %10'da toplam −%17…−%51; %25–30 pay kısmen korur | M1 ile aynı | **Orta** (M1 + "pay sabit ve önceden belli" koşulu; faz-1 C) | M, 2–4 hafta |
| M3 Kozmetik kutu | Rastgele kozmetik, oranlar açık | ~708 | Şans hacmi −%50…−%85 | Şans kaynaklı → 0 (sabit pay verilirse M2 gibi) | Oran gösterimi (Apple 3.1.1, Google) | **Düşük–orta** (ganimet kutusu düzenleme eğilimi; UK DCMS 2022 doğrulanmadı) | M |
| M4 Ücretsiz giriş | Puanla oyun, ödül kapalı devre | Şans 0; normal 393 / 245 | Şans geliri −%100; dolaylı elde tutma | Şans kaynaklı → 0 | Düşük | **Düşük** (UK s.6(4): ödül de kapalı olmalı) | S–M |
| M5 Beceri + jeton ödülü | Turnuva, kesinti | ~424 (%10 kesinti, ödül hediye edilir); kapalı devrede 708 | Belirsiz, muhtemelen küçük (sesli oda kitlesi) | Ödül hediye edilirse artar | Yüksek (hile/işbirliği tespiti, lisans soruları) | **Yüksek** ödül nakde dönerse (TCK 228 talih; Apple RMG skill) / M1 kadar kapalıysa | L, 2–3 ay |
| M6 Lisanslı RMG (TR dışı) | Gerçek para kumar, ayrı ürün | TR'de 0 (ayrı P&L) | TR'ye katkı 0 | — | MGA 5k € + 25k €/yıl + uyum katkısı + ekip | Lisanslı pazarda düşük; TR'ye sızarsa **çok yüksek** (7258 m.5(1)(b)) | L+, 9–18 ay |
| M7 Ödeme yeniden tasarımı | Çekim (KYC'li yayıncı), PSP, MoR web mağazası | Normal hediye −3…−13 TL (PSP); web'e geçen hacimde +84 TL; Jeton Noktası kapanırsa o hacimde −%15…−%29 | Toplam −%5…−%20 | Uyumsuz/halka gelir kaybolur; 20/B stopajı neti −%15 | KYC 0,80–1,85 $/kişi (+0,64 $ yaptırım), asgari 49–299 $/ay; PSP %1–4; avukat ücreti bilinmiyor | Riski **düşürür** (MASAK/6493, 6701 eşitlik; turkiye_hukuku, audit §4/§7) | L, 1–3 ay (parçalar S/M) |

### Gaps
- Tablo yalnız brüt katkıyı karşılaştırır; sabit giderler (sunucu, moderasyon, personel) modelden bağımsız sayıldı.

---

## S6. Duyarlılık: Şanslı hediye hacmi %30/%50/%70 düşerse; başabaş koşulları

### Takeaway
M2 (%10 pay) ya da M1'e geçişte, Şanslı hacmi **%21–35'ten az** düşerse platformun TL brüt marjı bugünkü kadar kalır; %50
düşüşte marj **%72–88**'e, %70 düşüşte **%53–75**'e iner. Gelir (ciro) daha sert düşer (%70 düşüş, Şanslı payı %70 ise ciro
51). Yayıncı geliri her senaryoda düşer; ajans arzı en hassas nokta.

### Cited Findings
- Girdi parametreleri S1–S2'deki koddan (`lucky-rules.mjs:13-18,30`, `catalog.mjs:149,233,243`, `agency-level-rules.mjs:15-21`, `agency-lib.mjs:91`, `host-bonus-rules.mjs:10-23`) ve Google ücret/KDV kaynaklarından.

### Inferences ([TAHMİN]; model: bugünkü yüklemenin L kadarı Şanslı'ya (q=0,7 yeniden oynama → 0,54 💎/jeton), gerisi normal hediyeye gider; yeni modelde Şanslı hacmi v kadar düşer; kaybın s kadarı normal hediyeye kayar, gerisi hiç yüklenmez; M2 payı %10)

Sonuç = bugüne göre endeks (ciro / brüt marj TL). Gönül Bağı+BD (1,4175):

| Şanslı payı L | Bugünkü marj (1.000 TL'de) | v=%30, s=0 | v=%30, s=0,3 | v=%50, s=0 | v=%50, s=0,3 | v=%70, s=0 | v=%70, s=0,3 |
|---|---|---|---|---|---|---|---|
| %30 | 436 TL (%43,6) | 91 / 96 | 94 / 98 | 85 / 86 | 90 / 90 | 79 / 77 | 85 / 83 |
| %50 | 465 TL (%46,5) | 85 / 93 | 90 / 97 | 75 / 79 | 82 / 85 | 65 / 64 | 76 / 73 |
| %70 | 494 TL (%49,4) | 79 / 91 | 85 / 96 | 65 / 72 | 76 / 80 | 51 / 53 | 66 / 64 |

Bronz+bonus (2,08) ile: L=%50 → v30: 85/101, v50: 75/82, v70: 65/63 (s=0); L=%70 → v30: 79/101, v50: 65/78, v70: 51/54.

- **Başabaş (marj TL):** v* = (m_M2 − m_bugün) / (m_M2 − s·m_normal). Gönül Bağı: s=0 → **%21**, s=0,3 → **%25**; Bronz+bonus: %31 / %35. M1 (pay yok, 708 TL): s=0 → %24 (Gönül Bağı), %35 (Bronz+bonus). Bugünkü Şanslı kazancı hep yeniden oynanıyorsa (q=1, 618 TL) başabaş ~%9'a düşer; kazanç çoğunlukla hediye ediliyorsa (q=0, 471 TL) ~%30'a çıkar. Yani **ne kadar çok kullanıcı kazancı hediye ediyorsa, uyumlu modele geçişin marj kaybı o kadar az** (çünkü bugün o kazanç yayıncı+ajans maliyeti doğuruyor).
- **Yayıncı geliri (M2 %10 pay, s=0):** L=%30 → −%17; L=%50 → −%31 (v=%30) … −%33 (v=%70); L=%70 → −%51 (v=%50). Sürücü: bugün Şanslı'dan yayıncıya giden elmasın çoğu, kazanılan `ugurlu` jetonun yeniden hediye edilmesinden geliyor. M2'de yayıncıyı bütünüyle korumak için gereken pay (L=%50, v=%50) %100'ün üstünde çıkıyor → **mümkün değil**; kısmi telafi için pay %25–30 ve/veya normal hediye bonusu.
- **Ajans arzı:** ajans komisyonu yayıncı elmasıyla orantılı ve seviye eşikleri haftalık elmasa bağlı (200.000–1.500.000 💎), bu yüzden yayıncı gelirindeki %17–51 düşüş bazı ajansları bir alt seviyeye iter (komisyon %10 puan düşer) [TAHMİN]. Bu, platform marjını kısmen artırır ama ajans ayrılma riskini büyütür.
- **Faz-1 ile tutarlılık:** faz-1 gelir endeksleri A 60–85, B 65–90, C 75–95. Buradaki ciro endeksleri (L=%50, v=%50–70 → 65–82) bu aralıklarla uyumlu; ek bulgu, **marj endeksinin ciro endeksinden daha az düştüğü** (bazı senaryolarda >100) — faz-1'deki "brüt marj gelirden daha çok düşer" (A için) yalnız şans tamamen kapatılıp yükleme normal hediyeye kayarsa doğru; M1/M2'de tersi.
- **Uyum maliyeti başabaşı (M7):** KYC 1,35 $ × 49 = 66 TL/yayıncı tek sefer; aylık ≥10 USD (490 TL) kazanan bir yayıncıda ilk ay ödemenin %13'ü, 12 ayda <%1,2 [TAHMİN aritmetik]. Uyum maliyetleri marja göre küçük; asıl maliyet hacim.

### Gaps
- L (Şanslı'nın harcama payı), q (yeniden oynama oranı), v ve s için hiçbir gerçek veri yok; canlı ölçüm ancak test modu kapatıldıktan sonra mümkün. Önerilen ölçüm (salt okunur sorgu): `lucky_sends.cost/payout` ile `gift_events` ve `ledger` kanal kırılımı, `diamond_locks.channel` bazında çekilen/çevrilen elmas.
- Elmasın çekilme oranı (k) <1 ise tüm modellerde marjlar daha yüksek; Çevir'e giden elmas ~%23 maliyetle döner (230 jeton / 1.000 💎).
