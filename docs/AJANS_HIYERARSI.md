# Ajans hiyerarşisi ve ajans komisyonu

## Ajans seviyeleri (24 Kasım 2026, sahiplerin tablosu): geçerli komisyon kuralı

Bu bölüm aşağıdaki "Komisyon formülü" ve "Performans motoru" bölümlerinin **yerine geçer**: havuz sınırı, kademeler,
performans puanına göre oran ve üst ajans farkı artık komisyon yazmaz (kayıtları ve ekranları geçmiş için durur).

| Seviye | Komisyon | Haftalık elmas eşiği | Uygulamada |
| --- | --- | --- | --- |
| 0 · Gönül Bağı | %35 | — (avantaj seviyesi) | görünmez |
| 1 · Başlangıç | %50 | 200.000 – 299.999 | görünmez |
| 2 · Bronz | %60 | 300.000 – 499.999 | görünür |
| 3 · Gümüş | %70 | 500.000 – 749.999 | görünür |
| 4 · Altın | %80 | 750.000 – 999.999 | görünür |
| 5 · Platin | %90 | 1.000.000 – 1.499.999 | görünür |
| 6 · Elmas | %100 | 1.500.000 ve üstü | görünür |

- **Hafta:** Pazartesi 00:00 – Pazar 23:59:59 (Türkiye). Eşik, ajansın **kendi** yayıncılarının o hafta kazandığı
  elmastır (komisyon matrahı: hediye, şans hediyesi, ücretli mesaj ve arama; iade düşer). Eşiği tamamlayamayan bir
  önceki seviyeyi alır.
- **Aktif yayıncı şartı:** seviye 1 ve üstü için o hafta bu ajansta en az 10 USD (10.000 elmas) kazanan 20 yayıncı.
  Tutmazsa ajans Gönül Bağı (%35) alır.
- **Yeni ajans:** onaydan itibaren ilk 4 hafta hiçbir şart aranmaz, komisyon sabit Başlangıç %50.
- **Üst ve alt ajans:** her ajans yalnız kendi yayıncılarıyla değerlendirilir; üst ajans alt ajanstan pay almaz.
- **Hesap:** hafta içinde her gelir %35'le yazılır (ajans bunu anında görür). Pazartesi 00:00'da hafta kapanır, ulaşılan
  seviyenin farkı tek "Haftalık seviye" satırı olarak eklenir; asistan bu farktan da payını (elmas) alır, BD kendi
  oranını. Kapanmış haftaya geç gelen gelir o haftanın oranıyla yazılır. Haftanın kararı bir kez yazılır, sonradan
  değişen tablo onu değiştirmez.
- **Ekranlar:** uygulama › Ajans ofisi › Özet "Bu hafta" kartı (elmas, aktif yayıncı, sonraki seviyeye kalan, geçen
  hafta); panel › Ajans merkezi › Haftalık seviyeler (her ajansın haftası, süren haftanın önizlemesi) ve Defter ve
  kurallar › Haftalık ajans seviyeleri (tablo). Elle oran ve kademe verilmez.
- **Ekonomi notu:** en üst seviyede 1.000 jetonluk hediye (220 TL) yayıncıya 1 USD (49 TL), ajansa 1 USD daha, BD'ye
  (matrah + ajans payı) × %5 = 0,1 USD bırakır; haftalık yayıncı bonusuyla birlikte en çok ~2,6 USD ≈ 127 TL.
- Kod: `server/api/agency-levels.mjs`, `agency-level-rules.mjs`, `agency-lib.mjs` (`calcEvent`), migration 122;
  testler `test/agency-levels.test.mjs`, `test/agency.test.mjs`.

## Eski kural (24 Kasım 2026'ya kadar)

Bu belge iki şartnameyi birlikte uygular: **"Üst Ajans, Alt Ajans ve Çok Katmanlı Ajans Yönetim Sistemi"** (Ş1) ve
**"Performansa Dayalı Dinamik Komisyon"** (Ş2). İkisi çeliştiğinde Ş2 geçerlidir (aşağıda "Çelişkiler").

Kod: `server/api/agency-lib.mjs` (kurallar, komisyon motoru), `agency-perf.mjs` (performans motoru),
`agency-ops.mjs` (transfer, ödeme, bağımsızlık), `agency.mjs` (ajans paneli API), `agency-admin.mjs` (merkez API),
`migrations/005_agency_network.sql` (veri yapısı), `test/agency.test.mjs` (kabul testleri).
Uygulama: `app/src/lib/agency-net.ts` (istemci ve türler), `app/src/components/agency-net*.tsx`,
`app/src/app/ajans/index.tsx` (giriş), `ajans/ofis.tsx` (ajans paneli), `ajans/merkez.tsx` (merkez paneli).

## Komisyon matrahı (doğrulandı)

Matrah, **yayıncının aldığı hediye elmaslarıdır**. Yayıncının kendi elması azalmaz: ajans komisyonu yayıncıdan
kesilmez, platform tarafından ayrıca ödenir. Mevcut %40 kuralı bu matrah üzerinden toplam ajans havuzudur.
Hangi gelir türlerinin matraha girdiği merkezin `income_types` ayarıdır (varsayılan: hediye, şans hediyesi ve iade
dahil; kampanya, bonus, görev ödülü, diğer hariç). İade negatif matrahtır ve komisyonu aynı oranlarla geri alır.

**Kur:** 5000 elmas = 1 USD (`DIAMONDS_PER_USD`). Tutarlar sunucuda tam sayı olarak 1/10.000 elmas biriminde
hesaplanır, veritabanında `numeric(20,4)` elmas olarak tutulur.

## Hiyerarşi

Merkez → Üst ajans (seviye 1) → Alt ajans (seviye 2) → Yayıncı. Bu sürümde en fazla 2 ajans katmanı
(`max_levels`, en çok 2). Bir yayıncı aynı anda tek ajansa bağlıdır; veritabanı da bunu zorlar
(`agency_streamers_one_open` tekil dizini). Üst ajans ilişkisi zamana bağlı tutulur (`agency_parents.valid_from/valid_to`),
böylece her gelir **gerçekleştiği andaki** zincire göre hesaplanır.

Ajans durumları: `draft → pending → approved`, ayrıca `rejected`, `suspended`, `closed`. Her geçiş
`agency_status_history` tablosuna yazılır. Askıya alma ve kapatma geçmişi silmez.

Yayıncı edinme yolları: davet kodu, bağlantı, başvuru ve merkez ataması. **Davet (ajans çağırır, yayıncı kabul eder) 22 Kasım 2026'dan beri kapalı** (sahiplerin kararı): "Yayıncı davet et" düğmesi kalktı, sunucu her uygulamanın davetini reddeder, bekleyen davetler iptal edildi (yayıncıya bildirim gitmedi). Yayıncı ajans koduyla ya da ajansın davet bağlantısıyla gelir. Sunucunun `.env`'inde `AGENCY_INVITES=1` daveti yeniden açar.

**Referans ajans gizliliği (22 Kasım 2026, sahiplerin kararı):** üst ajans, referans ajanslarını yalnız adıyla görür: yayıncılarını, yayıncı sayısını, hediye ve kazanç rakamlarını, puanlarını ve sıralamalarını görmez; referans ajansın panelini açamaz. Kendi kazancı (referans ajanslardan geçen fark dahil) ve bakiyesi görünür kalır, çünkü ödeme talebini o bakiyeden yapar; komisyon satırlarında referans ajansın adı yazar, yayıncının adı yazmaz. Merkez ve BD her şeyi görür. Ajans ayarı **"Üst ajans referans ajanslarının yayıncılarını ve rakamlarını görür"** (`parent_sees_subs`, panel › Ajans merkezi › ağ kuralları) açılırsa eski görünüm döner. Eski APK'larda "Referans ajans yayıncıları" sekmesi hata verir ve referans ajans kartları 0 gösterir.
Katılım onayı `join_policy.requires_approval` ile yönetilir.

Alt ajans açma: üst ajans `POST /api/agency/sub/create` ile taslak açar, `submit` ile gönderir. Onay politikası
`subagency_policy.approval`: `center` (merkez onaylar) veya `auto`. Onaydan önce yayıncı eklenemez ve komisyon yazılmaz.

## Komisyon formülü

Bir gelirin anında zincir `[yayıncının ajansı, üst ajansı]`, her ajansın o andaki oranı `oran(a)` olsun.

```
alt ajans payı      = matrah × oran(alt)
üst ajans payı      = matrah × (oran(üst) − oran(alt))
toplam              = matrah × oran(üst)          ≤ matrah × pool_cap
doğrudan üst ajans  = matrah × oran(üst)           (yayıncı doğrudan üst ajansa bağlıysa)
```

- `pool_cap` (varsayılan 0,40) ve `top_rate` (varsayılan 0,40) merkez ayarıdır, kodda sabit değildir.
- Üst ajansın farkı en az `parent_min_rate` (varsayılan %1) kalır: alt ajans oranı `top_rate − parent_min_rate`'i aşamaz.
  `parent_zero` açıkken en yüksek seviyede fark sıfır olabilir (varsayılan kapalı).
- Oranlar **geriye dönük değişmez**: her oranın `effective_from` tarihi vardır, yeni oran hep gelecekten başlar.
- **İdempotent:** her gelir `income_events.source_ref` ile tekildir, komisyonu `agency_commissions.income_event_id`
  ile bir kez yazılır (`ON CONFLICT DO NOTHING`). Aynı istek iki kez gelse de ikinci kayıt oluşmaz.
- Her pay `agency_ledger` tablosuna ayrı satır olarak yazılır (`direct`, `difference`, `transition`, `fee`,
  `adjustment`, `reversal`, `assistant`). Finansal ve geçmiş tabloları değiştirilemez ve silinemez (veritabanı tetikleyicisi
  `agency_no_delete` / güncelleme koruması); düzeltme ve iptal ayrı satırdır.
- Her komisyon kaydı hangi ayar ve oran sürümleriyle hesaplandığını `rule_version` alanında saklar.

**BD komisyonu** ayrı defterdedir (`bd_ledger`) ve ajans havuzundan düşmez: `bd_policy.rate × matrah`
(`basis`: `base`, `pool` veya `base_plus_pool`; varsayılan %5, `base_plus_pool`).

**Örnek** (varsayılanlar): 10.000 elmaslık hediye, alt ajans Başlangıç seviyesinde (%25):
alt ajans 2.500, üst ajans 1.500 (%40 − %25), toplam 4.000 elmas = 0,80 USD. Yayıncının 10.000 elması aynen kalır.

## Referans ajans komisyonu

Sahiplerin kararı (25 Kasım 2026): bir ajans (A) referansıyla yeni bir ajans (B) getirince, B'nin A'ya bağlandığı takvim haftası (Pazartesi 00:00 – Pazar 23:59:59, Türkiye) A komisyon almaz; sonraki 4 haftanın her birinde B'nin o haftaki toplam komisyonunun %5'i, hafta kapanınca (Pazartesi 00:00, ajans seviyeleriyle aynı anda) A'nın bakiyesine eklenir. B'nin komisyonundan bir şey kesilmez (platform öder). 5. haftadan sonra A, B'den komisyon almaz. Kural herkese bağlandığı tarihe göre uygulanır.

- Ayar: panel › Ajans merkezi › Ağ kuralları › **Referans ajans komisyonu** (`referral_policy`: `pct` 0,05, `free_weeks` 1, `weeks` 4).
- Kayıt: A'nın defterinde `difference` satırı (eski uygulamalar da referans kazancı olarak sayar), not "Referans ajans: B · n/4. hafta %5", ref `referral:<hafta>:<B>`; her hafta bir kez. A'ya ajans bildirimi gider. Tutar A'ya B'nin haftalık komisyonunu dolaylı gösterir; sahiplerin kuralının doğal sonucu.
- Kod: `agency-levels.mjs` `payReferral`; test `test/agency-referral.test.mjs`.

## Ajans asistanı

Ajans sahibi, ajansının yayıncılarından ya da ekibinden birini asistan yapabilir (varsayılan en fazla 1,
`assistant_policy.max`). Asistanın getirdiği yayıncıların gelirinde, ajansın kendi komisyonunun (`direct`) sahibin
belirlediği yüzdesi aynı işlemde asistanın cüzdanına elmas olarak geçer; sahibin hesabına eksi bir `assistant` satırı
yazılır. Pay haftada bir değişir ve sonraki pazartesi 00:00'dan (Türkiye) geçerlidir; iade ve ters kayıt payı da geri
alır. Ayrıntı: `docs/AJANS_ASISTANI.md`.

## Performans motoru (§Performans)

Her ajans yalnızca **kendi doğrudan yayıncılarıyla** ölçülür; alt ajansın başarısı üst ajansın puanına sayılmaz.

Kriterler (her biri 0–100):

| Kriter | Ölçüm | Normalleştirme |
|---|---|---|
| Hacim (`volume`) | Pencere içi matrah | En iyi ajansa oran × 100 |
| Aktif yayıncı (`active`) | Son `active_days` günde gelir alan yayıncı | En iyi ajansa oran × 100 |
| Ortalama (`average`) | Hacim / kazanan yayıncı | En iyi ajansa oran × 100 |
| Büyüme (`growth`) | (hacim − önceki pencere) / önceki, [−1, 1] | (g + 1) × 50 |
| Tutma (`retention`) | Pencere başındaki yayıncılardan kalanlar | oran × 100; başta yayıncı yoksa 50 |
| Yeni yayıncı (`acquisition`) | Pencerede katılan | En iyi ajansa oran × 100 |
| Operasyon (`operations`) | Merkezin verdiği puan | Olduğu gibi |
| Güvenilirlik (`reliability`) | 100 − ihlal puanı | Olduğu gibi |

```
puan = Σ (kriter_k × ağırlık_k) / Σ ağırlık_k        (ağırlıklar merkez ayarı, toplamı 100)
```

Seviyeler (varsayılan, hepsi merkezden değiştirilebilir):

| Seviye | Asgari puan | Asgari aktif yayıncı | Alt ajans oranı | Üst ajans farkı |
|---|---|---|---|---|
| Başlangıç | 0 | 0 | %25 | %15 |
| Gelişen | 40 | 3 | %30 | %10 |
| Başarılı | 60 | 5 | %35 | %5 |
| Üst ajansı geçmiş | 60 | 5 | %38 | %2 |
| Çok yüksek performans | 80 | 10 | %39 | %1 |

"Üst ajansı geçmiş" seviyeleri, alt ajansın puanı üst ajansınkinden yüksekse açılır (`overtakes`) ve her iki tarafa bildirim gider.

Seviye değişimi kuralları: yükselme için `promotion_min_periods`, düşme için `demotion_min_periods` ardışık dönem
aynı yönü göstermeli; bir seferde en fazla `max_step` seviye; ani hacim artışı işaretlenir ve kesinleşmesi beklenir;
merkez seviyeyi geçici olarak sabitleyebilir (`tier_hold_until`). Yeni oran **bir sonraki dönemden** geçerlidir
(`performance.effective = next_period`), geçmiş kazançlar değişmez. Deneme değerlendirmesi (`dryRun`) hiçbir oranı
değiştirmez ve ardışık dönem sayısına girmez.

Üst ajans, alt ajansın puanını, seviyesini veya oranını değiştiremez; denemesi reddedilir ve denetime yazılır.

## Transfer

- Yayıncı ayrılma: mevcut ajansın onayı (`needs: ['from']`).
- Yayıncı taşıma: mevcut ve yeni ajansın onayı, `transfer_policy.require_center` açıksa merkez.
- Karar süresi `decision_days`; süre dolunca otomatik işlem (zamanlanmış iş).
- Ücret: `son 30 gün matrah × fee_rate`, matrah `free_below_diamonds` altındaysa ücretsiz. Ücreti kimin ödediği
  (`fee_payer`) ve hangi hesaba gittiği (`fee_account`) ayardır; `owner_choice` açıkken mevcut ajans ücretsiz bırakabilir.
- Geçmiş gelirler eski ajansta kalır; yeni ajans yalnızca transferden sonraki gelirden komisyon alır.
- **Bağımsızlık** (alt ajansın üst ajans olması) yalnızca merkez onayıyla olur. Merkez isterse eski üst ajansa süreli
  bir **geçiş komisyonu** tanımlar (oran, süre, kapsam: mevcut yayıncılar veya tümü). Geçiş komisyonu bağımsız
  ajansın payından düşer, toplam havuz aşılmaz.

## Ödeme

Ödenebilir tutar: kapanmış dönemlerin ödenmemiş komisyonları. Dönem kapanışı `period_close_days` sonra veya merkezce.
Talep: `payouts/request` (asgari `payout_policy.min_diamonds`, para birimi USD/TRY). **İki kişi kuralı**
(`two_person`): onaylayan ve ödendi işaretleyen farklı merkez yetkilileri olmalı. Her adım `agency_payout_history`'de.

## Yetkiler (RBAC)

Ajans içi roller `staff_roles` (Ajans sahibi, Yayıncı asistanı, BD yöneticisi, Finans sorumlusu …) ve izinleri:
`streamers.view`, `streamers.invite`, `subagencies.view`, `subagencies.create`, `reports.performance`,
`reports.commission`, `reports.export`, `payouts.request`, `staff.manage` vb. Merkez izinleri platform rolüne bağlıdır
(`agencies.manage`, `agencies.ledger`, `agencies.payouts`, `agencies.settings` …). Tüm denetimler sunucudadır;
uygulama yalnızca sunucunun döndürdüğü izinlere göre sekmeleri gösterir. Yetkisiz denemeler de `agency_audit`'e yazılır.

## Veri yapısı (migration 005)

`agency_settings` (sürümlü ayarlar, gerekçeli), `agencies`, `agency_status_history`, `agency_parents`,
`agency_streamers`, `agency_requests`, `agency_rates`, `agency_transitions`, `income_events`, `agency_periods`,
`agency_commissions`, `agency_ledger`, `agency_payouts`, `agency_payout_history`, `agency_transfers`, `staff_roles`,
`staff_assignments`, `bd_assignments`, `bd_ledger`, `agency_violations`, `agency_perf_runs`, `agency_perf_scores`,
`agency_tier_history`, `agency_appeals`, `agency_notices`, `agency_audit`, `presence_log`.

## API

Ajans tarafı (`agency.mjs`):

| Uç nokta | İş |
|---|---|
| `GET /api/agency/me` | Üyelik, ajanslarım, davetler, isteklerim, platform izinleri |
| `GET /api/agency/lookup?code=` | Kodla ajans bul |
| `POST /api/agency/join` | Kod/bağlantı/başvuru ile katılım isteği |
| `POST /api/agency/requests/respond` · `requests/cancel` | Daveti kabul/ret, isteği geri çek |
| `POST /api/agency/transfer` | Ayrılma veya başka ajansa geçiş talebi |
| `GET /api/agency/overview?id=` | Panel özeti: kazanç, oran, performans, bildirim |
| `GET /api/agency/streamers?id=&scope=direct\|sub` | Doğrudan ve alt ajans yayıncıları (ayrı) |
| `GET /api/agency/subagencies?id=` | Alt ajanslar, oranları ve üst ajans farkı |
| `GET /api/agency/commissions?id=&kind=&format=csv` | Komisyon defteri, toplamlar, CSV |
| `GET /api/agency/performance?id=` · `report?id=&group=` | Puan, kriterler, geçmiş; dönemsel rapor |
| `GET /api/agency/requests?id=` · `POST invite` · `POST requests/decide` | Katılım istekleri |
| `POST /api/agency/sub/create` · `sub/submit` · `sub/decide` · `sub/close` | Alt ajans yaşam döngüsü |
| `POST /api/agency/apply` | Ajans başvurusu |
| `GET /api/agency/roles` · `staff` · `POST staff/set` · `staff/remove` | Ekip ve roller |
| `GET /api/agency/payouts` · `POST payouts/request` · `payouts/cancel` | Ödeme talepleri |
| `GET /api/agency/transfers` · `POST transfers/approve` | Transfer kararları |
| `POST /api/agency/independence` · `change-parent` · `appeal` | Bağımsızlık, üst ajans değişikliği, itiraz |
| `GET /api/agency/notices` | Bildirimler |
| `GET /api/agency/assistants` · `assistants/candidates` · `POST assistants/add` · `assistants/share` · `assistants/remove` | Ajans asistanı (`docs/AJANS_ASISTANI.md`) |

Merkez tarafı (`agency-admin.mjs`): `tree`, `overview`, `list`, `create`, `decide`, `status`, `rate`, `tier`,
`parent`, `assign`, `settings` (GET/POST), `performance/run`, `performance`, `commissions/run`, `income`,
`commissions/reverse`, `adjust`, `periods/close`, `payouts` (GET), `payouts/decide`, `transfers` (GET),
`transfers/decide`, `transition`, `audit`, `roles`, `staff`, `bd`, `ops-score`, `violation`, `appeals`,
`appeals/decide`, `simulate`, `report`, `bd-report`, `jobs/run` — hepsi `/api/admin/agency/…` altında.

## Uygulama ekranları

- **Ajans** (`/ajans`): sunucu adresi varsa sunucunun ajans ağı; ajanslarım, üyelik, davetler, katıl/başvur.
  Sunucu adresi olmayan derlemelerde eski yerel prototip görünür.
- **Ajans paneli** (`/ajans/ofis?id=`): Özet, Yayıncılar, Alt ajanslar, Performans, Kazanç, Talepler, Ekip, Asistanlar
  (yalnız sahip). Sekmeler sunucunun verdiği izinlere göre açılır.
- **Ajans Merkezi** (`/ajans/merkez`): Genel (KPI ve organizasyon ağacı), Onaylar, Performans, Kurallar
  (ayarlar ve komisyon simülatörü), Denetim.
- Sunucuya ulaşılamazsa paneller "Örnek veri — sunucu bağlantısı yok" etiketiyle örnek veri gösterir ve işlem
  düğmeleri çalışmaz. Komisyon istemcide hesaplanmaz; simülatör de sunucuya sorar.

## Çelişkiler ve kararlar

- **Alt ajans oranını kim belirler?** Ş1 üst ajansın belirlemesine izin verir, Ş2 yasaklar. Ş2 geçerli: oranı
  yalnızca performans motoru veya merkez belirler.
- Ş1'deki örnek oranlar iş kuralı olarak sabitlenmedi; hepsi `agency_settings` üzerinden değiştirilebilir ve her
  değişiklik gerekçesiyle saklanır.

## Bilinen sınırlamalar

- Komisyon iptali (`commissions/reverse`) BD defterindeki satırı geri almıyor.
- Askıdaki ajans komisyon kazanmaya devam ediyor (yeni yayıncı ve alt ajans alamıyor).
- Geçiş komisyonu bağımsız ajansın payından düşüyor; ayrı bir platform bütçesi yok.
- Kapanmış döneme düşen geç gelir, içinde bulunulan döneme yazılıyor.
- Paneldeki haftalık ve "bu ay" kazanç toplamları gelirin tarihine değil, defter satırının yazıldığı ana göre
  gruplanıyor (dönem ve ödeme hesabı gelir tarihine göre doğru).
- Ekibe yalnızca ajansın kendi yayıncılarından biri eklenebiliyor (arayüz; API kullanıcı kimliği istiyor).
- Merkezin bağımsızlık onayında geçiş komisyonu süresi ve kapsamı arayüzde sabit (180 gün, mevcut yayıncılar);
  API ikisini de parametre olarak alıyor.
- Canlı sunucuya bu uç noktalar `DEPLOY_SSH_KEY` tanımlanıp dağıtım yapılana kadar gitmez.
- Ajans komisyonu ve nakde çevirme için hukuk görüşü gerekir (`docs/YAYIN_HAZIRLIGI.md` madde 1).
