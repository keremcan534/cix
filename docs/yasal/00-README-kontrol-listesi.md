# SIMILARCLUB — LEGAL CENTER v1.0

**26 Kasım 2026 | Hukuki ve teknik inceleme taslağı — YAYIMLAMAYIN**

Bu paket 14 belgenin Türkçe ve İngilizce sürümlerini içerir. Bu bir hukukçu görüşü veya uyumluluk sertifikası değildir. Her belgenin yürürlük tarihi onaydan sonra doldurulacaktır. Köşeli parantez içindeki alanlar gerçek altyapı ve sözleşme kararlarıyla tamamlanmalıdır. Türkçe ve İngilizce metinler aynı sürümde tutulur; zorunlu yerel dil ve tüketici korumaları önceliklidir. NevaLabs bir geliştirici markasıdır; Apple'da kullanılabilirliği henüz teyit edilmemiştir.

## Belge listesi ve önerilen URL yapısı

| No | Türkçe | English | Önerilen yol | Kitle |
|---|---|---|---|---|
| 01 | Gizlilik Politikası | Privacy Policy | /tr/privacy · /en/privacy | Herkese açık / public |
| 02 | Kullanıcı Sözleşmesi | Terms of Service | /tr/terms · /en/terms | Herkese açık / public |
| 03 | Topluluk Kuralları | Community Guidelines | /tr/community-guidelines · /en/community-guidelines | Herkese açık / public |
| 04 | Çocuk Güvenliği ve CSAE Politikası | Child Safety and CSAE Policy | /tr/child-safety · /en/child-safety | Herkese açık / public |
| 05 | Hesap ve Veri Silme Politikası | Account and Data Deletion Policy | /tr/delete-account · /en/delete-account | Herkese açık / public |
| 06 | KVKK Aydınlatma Metni | Turkish KVKK Privacy Notice | /tr/kvkk · /en/kvkk | Herkese açık / public |
| 07 | Jeton, Elmas ve Sanal Hediye Politikası | Virtual Currency, Diamonds and Gifts Policy | /tr/virtual-currency · /en/virtual-currency | Herkese açık / public |
| 08 | Ödeme ve İade Politikası | Payment and Refund Policy | /tr/refund-policy · /en/refund-policy | Herkese açık / public |
| 09 | Yayıncı Sözleşmesi | Host Agreement | /tr/host-agreement · /en/host-agreement | Sözleşme tarafları / authenticated parties |
| 10 | Ajans İş Birliği Sözleşmesi | Agency Partnership Agreement | /tr/agency-agreement · /en/agency-agreement | Sözleşme tarafları / authenticated parties |
| 11 | Oyun ve Ödül Kuralları | Games and Rewards Rules | /tr/game-rules · /en/game-rules | Herkese açık / public |
| 12 | VIP ve Abonelik Şartları | VIP and Subscription Terms | /tr/vip-terms · /en/vip-terms | Herkese açık / public |
| 13 | Telif Hakkı ve Fikri Mülkiyet Politikası | Copyright and Intellectual Property Policy | /tr/copyright · /en/copyright | Herkese açık / public |
| 14 | Çerez ve Benzer Teknolojiler Politikası | Cookies and Similar Technologies Policy | /tr/cookies · /en/cookies | Herkese açık / public |

## Yayın öncesi kontrol listesi / pre-release gates (internal)

- [ ] P0 — Yaş ve UGC: 18+ hedefi ürün sahibi tarafından onaylansın. Etkili yaş güvence, gerekiyorsa Play Console küçükleri engelleme, filtreleme, raporlama, engelleme, moderasyon, itiraz ve çocuk güvenliği iletişim kişisi canlı sistemde test edilsin. UK bağlantısı açısından Ofcom kapsamı, illegal harms risk assessment ve children’s access assessment yükümlülükleri değerlendirilip gerekiyorsa tamamlanmalı. Apple rastgele/anonim sohbetin baskın kullanımına, cinsel sömürüye ve uygunsuz UGC'ye ilişkin kısıtlamalar nedeniyle özellikler fiilen incelenmeli. / Confirm adult-only target, implement and test age assurance, blocking, reporting, moderation, appeals and child safety contact; assess UK Online Safety Act duties and Apple random/anonymous chat restrictions.
- [ ] P0 — Ücretli sohbet: ücret tetikleyicisi, yanıt ödülü, kullanıcıya ücretin ve otomasyonun gösterilmesi, rıza/opt-out, hız sınırlaması, engelleme ve hile denetimi. Planlanan yalnız kadın aktif yayıncı uygunluğu için ayrımcılık, çalışma hukuku ve mağaza politikası incelemesi; ödeme karşılığı romantik/cinsel buluşma algısı yaratılmamalı. / Verify paid-chat disclosure, automation labels, opt-out and eligibility; review proposed gender restriction and compensated dating risks.
- [ ] P0 — Oyun: her oyunun giriş, olasılık, ödül, jeton-hediye-elmas-nakit akışı; gerçek değerli ödüllerin doğrudan veya dolaylı nakit bağlantısı; bölge/lisans/mağaza incelemesi. Onaysız akışlar kapalı kalmalı ve incelemeye bütün işlevler açıkça beyan edilmeli. / Map all stakes, odds and value flows, obtain jurisdiction/store approval; disable unapproved flows and fully disclose functionality to reviewers.
- [ ] P0 — Ödemeler: Apple/Google dijital satın alma kuralları, jeton bankası ve dış satış kanallarının uygunluğu, mağaza iade süreci, fiyat/vergiler, tüketici cayma koşulları, ödeme sağlayıcı sözleşmeleri. Airwallex başvurusunun onayı teyit edilmeden sağlayıcı olarak ilan edilmesin. / Verify billing, coin-bank/external sales, refunds, consumer rights and provider approval before publication.
- [ ] P0 — Veri haritası: auth, DB, CDN, RTC, mesaj, kamera/mikrofon, ödeme, KYC, SDK, analiz ve reklam sağlayıcıları; veri alanı, amaç, hukuki dayanak, alıcı, ülke, saklama, silme ve güvenlik. Ses/video kaydı, inceleme, şifreleme ve otomatik kararlar gerçekte nasıl çalışıyor belgelenmeli. / Inventory actual data fields, purposes, bases, providers, countries, recording, access, retention, deletion and automated decisions.
- [ ] P0 — Hukuk: UK GDPR/PECR, KVKK ve uygulanabilir AB/diğer ülkeler; DPO/temsilci/VERBİS ve ICO kayıt/ücret durumu, DPIA ve aktarım mekanizmaları. KVKK açık rıza ile aydınlatma ayrı olmalı. / Assess jurisdictional scope, representatives, registrations, DPIA and transfer mechanisms; separate notices from consent.
- [ ] P0 — Silme: web formu ve uygulama içi kalıcı hesap silme, veri/sağlayıcı/yedek imhası, abonelik iptali, durum bildirimi. / Implement and test in-app and web deletion, provider/backup deletion and subscription guidance.
- [ ] P0 — Ek A/B: aşağıdaki ekonomik koşulları imzalanabilir hale getir, örnek net hesaplarla mali sürdürülebilirliği ve yasal statüyü doğrula. / Finalise earnings schedules and legal status with worked examples.
- [ ] P1 — Çerez taraması, rıza yönetimi, reklam izinleri; telif lisans envanteri; gerçek VIP SKU/fiyat/avantaj listesi. / Audit cookies, consent, tracking, IP licences and VIP products.
- [ ] P0 — Web ve mağaza: açık HTML gizlilik/çocuk güvenliği/hesap silme sayfaları, gerçek bağlantılar, kayıt öncesi sözleşme ve topluluk kuralları kabulü; gizlilik bildirimi ve pazarlama rızası ayrı; Google Data safety ve Apple App Privacy beyanları teknik gerçekle eşleşmeli. App Review için erişilebilir demo ve özellik açıklamaları. / Publish accessible pages, record terms acceptance separately from optional consent, align store disclosures, provide full review access.
- [ ] P0 — Hukukçu ve ürün/teknik/finans sorumlularından onay; çeviri tutarlılığı; yürürlük tarihi, sürüm arşivi ve değişiklik bildirimi. / Legal, product, technical and finance sign-off; translation consistency, effective dates and version history.

## EK A — Yayıncı kazanç eki / Schedule A (internal; not an offer)

| Alan / Field | Plan / durum |
|---|---|
| Nominal dönüşüm / nominal conversion | 1,000 elmas / diamonds = 1 USD (planlanan; çekilebilirlik ayrı) |
| Haftalık bonus / weekly bonus | %50 planlandı; hesaplama tabanı, üst sınır, uygunluk, nakde dönüşüm ve ek ödeme henüz teyitsiz |
| Otomatik mesaj / automated message | 10/gün; Europe/Istanbul 00:00 reset; uygun yanıt ve gerçek ücret/kazanç tetikleyicisi kesinleşmedi |
| Uygunluk / eligibility | Kadın aktif yayıncı modeli planlandı; hukuk ve mağaza incelemesi gerekli |
| Minimum çekim, ödeme günü, vergi, kur, ücretler / payout threshold, date, taxes, FX, fees | [KARAR / DECISION] |
| İade, ters ibraz, hata, ayrılma ve bakiye / refunds, chargebacks, errors, departure | [KARAR / DECISION] |
| Net ödeme örnekleri ve imza / net worked examples and signature | [KARAR / DECISION] |

## EK B — Ajans komisyon eki / Schedule B (internal; not an offer)

| Alan / Field | Plan / durum |
|---|---|
| En düşük / lowest tier | %35 planlandı / planned |
| Normal / standard tier | %50 planlandı / planned |
| Üst statü / upper tier | Teyitsiz; %100 ifadesi SimilarClub için doğrulanmadı / unconfirmed |
| Komisyon tabanı, bonus dahil/hariç ve yayıncıya ek ödeme / base, bonus inclusion, additional to host earnings | [KARAR / DECISION] |
| Hedef, dönem, statü değişimi, itiraz / targets, periods, tier changes, appeals | [KARAR / DECISION] |
| Minimum, ödeme takvimi, vergi, ücret, ters ibraz / threshold, payout schedule, tax, fees, chargebacks | [KARAR / DECISION] |
| Fesih bildirimi, son ödeme, yargı yeri, imzalar / notice, final settlement, jurisdiction, signatures | [KARAR / DECISION] |

**Ek A ve B kesinleşmeden nakit ödeme yükümlülüğü hesaplanmamalı veya kazanç garantisi verilmemelidir.** / Do not calculate binding payout obligations or promise earnings before schedules are finalised.

## Önerilen teknik kayıt şemaları / suggested technical inventories

- Veri / data: alan, kaynak, özellik, amaç, hukuki dayanak, alıcı/sağlayıcı, ülke, güvence, saklama, imha, erişim, zorunluluk.
- Çerez / cookie: ad, sağlayıcı, amaç, 1./3. taraf, süre, cihaz, rıza/istisna, aktarım.
- Oyun / game: ülke, giriş bedeli, sonuç yöntemi, olasılık, ödül, transfer/çekim yolu, lisans, yaş ve onay durumu.
- Ürün / product: SKU, mağaza, fiyat, para birimi, vergi, süre, yenileme, avantaj, iade, satın alma geri yükleme.
- Politika kabulü / acceptance: account ID, document ID, version, timestamp, locale, acceptance event; consent records independently, only where appropriate.

## Resmî kaynaklar / official references

26 Kasım 2026 tarihinde ilgili kaynaklar gözden geçirildi; bu liste hukuki görüş yerine geçmez.

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/ (1.2 UGC, 3.1 payments, 5.1 privacy, 5.3 gaming)
- Apple account deletion: https://developer.apple.com/go/?id=ar-ad-support
- Google Play User Data: https://support.google.com/googleplay/android-developer/answer/10144311?hl=en
- Google Play account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play Child Safety Standards: https://support.google.com/googleplay/android-developer/answer/14747720
- Google Play age-restricted functionality: https://support.google.com/googleplay/android-developer/answer/16302250
- Google Play Payments: https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play Developer Program Policy: https://support.google.com/googleplay/android-developer/answer/18265346
- ICO right to be informed: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed/
- ICO storage/access guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/about-this-guidance/
- KVKK aydınlatma: https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-
- KVKK 2026 aydınlatma/rıza ayrımı: https://www.kvkk.gov.tr/Icerik/8710/veri-sorumlulari-tarafindan-acik-riza-ve-aydinlatma-metinlerinin-ayri-ayri-duzenlenmesi-gerektigi-hakkinda-kisisel-verileri-koruma-kurulunun-18-02-2026-tarihli-ve-2026-347-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu
- KVKK yurt dışı aktarım: https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim
- Ofcom children duties: https://www.ofcom.org.uk/online-safety/protecting-children/protection-of-children-duties-under-the-online-safety-act

**Kapsam sınırı / limitation:** Tüketici, çalışma, vergi, ödeme hizmetleri, şans oyunları, ülke lisansları ve veri transferleri için ayrıntılı ülke bazlı hukuk görüşü alınmamıştır. Rakip metinleri kopyalanmamıştır. Uygulama kodu, altyapı, gerçek SDK'lar ve ödeme akışları incelenmemiştir. Bu metinler ilk kapsamlı taslaktır; canlı uyumluluk kanıtı değildir.
