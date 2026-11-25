# Corporate identity of the companies behind Turkish-market agency voice/live apps (company registries and public records)

Access date for every source below: **2026-11-25** (unless stated). Public pages and free public APIs only. No account, no login, no payment, no captcha solved, no rate limit or anti-bot control bypassed. Labels: **VERIFIED** (seen in an official registry / official API / the company's own store listing or legal page), **NOT FOUND** (searched in that source, no match), **COULD NOT QUERY** (source not reachable without account, payment, captcha or anti-automation), **INTERPRETATION** (my reasoning, not a fact from a source).

Phase-1 context used: `research_notes/Rakip analizi ve yasal yayın stratejisi/` nivi.md, zili.md, timo_ve_sektor.md, tanstar.md (store listings, legal pages, white-label evidence already collected there are not repeated in full).

Summary table (details and sources in the sections below):

| App | Store seller (Apple / Google) | Privacy entity | ToS entity | Registry status | Match? |
| --- | --- | --- | --- | --- | --- |
| Nivi | Beckoning Cube HK LIMITED / BECKONING CUBE HK LIMITED (Tai Kok Tsui, HK) | Beckoning Cube HK (candycubehk.com) | Beckoning Cube HK LIMITED, Singapore law, template still says "Pocket" | HK: COULD NOT QUERY; UK, GLEIF: NOT FOUND; no "Candy Cube HK" entity found anywhere | Entities match; brand/domain "Candy Cube" ≠ entity name; HK company under Singapore law |
| Layla (Nivi group) | – / GirlPower HK Limited (Harbour City, TST, HK) | GIRLPOWER HK LIMITED (billionssocial.com) | not checked | HK: COULD NOT QUERY; UK, GLEIF: NOT FOUND | Match; domain brand "billions" |
| Zili | SOCIALTECH SOLUTIONS - FZCO / same (DSO-IFZA, Dubai) | GLOBJOY UNITED LIMITED (HK, Sheung Wan) | GLOBJOY UNITED LIMITED, HK law | UAE: COULD NOT QUERY; HK: COULD NOT QUERY; UK, GLEIF: NOT FOUND | **MISMATCH** (UAE seller, HK contracting party) |
| Zili Chat | – / SOCIALTECH SOLUTIONS - FZCO | not fetched | SOCIALTECH SOLUTIONS - FZCO, but HK law | as above | Partial mismatch (UAE entity under HK law) |
| Timo / Timo Club / Timo Lite | iOS listings gone (404) / Fastwall Information Technology Co., Limited, dev name "FAST WALL" (TST, HK) | Fastwall (h5.touchchat.me) | Fastwall, HK law | HK: COULD NOT QUERY; UK, GLEIF: NOT FOUND | Match (dev display name differs) |
| TanStar | DEEP TURING TEST TECHNOLOGY LIMITED / no Play listing | Deep Turing Test Technology Limited (no address) | none published | HK: COULD NOT QUERY; UK, GLEIF: NOT FOUND | Match, but no address, no ToS |
| Poppo Live | Vshow PTE. LTD. / VSHOW PTE. LTD. (10 Anson Rd, SG) | not extractable (JS page) | not extractable | **SG ACRA: VERIFIED** UEN 202002437N, 2020-01-17, Registered | Stores match each other |
| Bigo Live | BIGO TECHNOLOGY PTE. LTD. / same (30 Pasir Panjang Rd, SG) | not extractable (JS page) | not extractable | **SG ACRA + GLEIF + JOYY 20-F: VERIFIED** UEN 201426996D, LEI 549300HJ82V6EH3STP87 | Stores match each other |
| SUGO | MOBILE ALPHA LIMITED / Play listing gone (404) | Mobile Alpha Limited (sugo.com) | not checked | HK: COULD NOT QUERY; UK, GLEIF: NOT FOUND | Match |
| SoulChill Group | JoyVoice HK Limited / 悅聲星球香港有限公司 / Play not found | soulchill.group: "Registered by JoyVoice HK Limited" | not checked | HK: COULD NOT QUERY; GLEIF, UK: NOT FOUND | Match |
| MICO | "MICO WORLD CO., LTD." / "Mico World Limited" (HK Science Park) | site returned HTTP 567 | site returned HTTP 567 | HK: COULD NOT QUERY | **Name form differs** between stores |
| Chamet | iOS not found / dev "Chamet Team", entity Fuliao Hong Kong Limited (Mirror Tower, TST, HK) | FULIAO HONG KONG LIMITED (also spelled "FULIAO HONGKONG LIMITED") | not checked | HK: COULD NOT QUERY | Match (dev display name differs); two spellings in policy |
| LopMe (peer, blocked) | KOTIC BILISIM ANONIM SIRKETI (Turkish A.Ş.) | not checked | not checked | TR Ticaret Sicili: COULD NOT QUERY | Only Turkish seller found |

## 1. Do the entities exist in the named registries? (numbers, dates, status)

### Takeaway
Only the Singapore entities could be verified in an official registry for free: BIGO TECHNOLOGY PTE. LTD. (UEN 201426996D, Registered, UEN issued 2014-09-11, plus an LEI) and Poppo's VSHOW PTE. LTD. (UEN 202002437N, Registered, 2020-01-17). None of the Hong Kong or Dubai companies (Beckoning Cube HK, GirlPower HK, GLOBJOY UNITED, SOCIALTECH SOLUTIONS - FZCO, Fastwall, DEEP TURING TEST, Mobile Alpha, JoyVoice HK, Mico World, Fuliao HK) could be checked in their own registry automatically. None has an LEI or a UK Companies House record. No "Candy Cube HK" company was found in any source.

### Cited Findings

**Singapore (ACRA open data on data.gov.sg, official ACRA dataset, updated monthly)**
- VERIFIED: BIGO TECHNOLOGY PTE. LTD., UEN **201426996D**, status "Registered", UEN issue date **2014-09-11**, registered street "Pasir Panjang Road", postal code **117440**. — [data.gov.sg ACRA UEN dataset, query uen=201426996D](https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&filters=%7B%22uen%22:%22201426996D%22%7D)
- VERIFIED: VSHOW PTE. LTD. (Poppo Live seller), UEN **202002437N**, Local Company, "Registered", issued **2020-01-17**, "Anson Road" **079903**. — [data.gov.sg ACRA, q=VSHOW](https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&q=VSHOW)
- VERIFIED: JOYY SINGAPORE PTE. LTD., UEN **202118303W**, Registered, issued 2021-05-25, Pasir Panjang Road **117440** (same postal code as Bigo). — [data.gov.sg ACRA, q=JOYY](https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&q=JOYY)
- VERIFIED (context): OWOL TECHNOLOGY PTE. LTD. (Hawa) UEN 202316176E, Registered, 2023-04-27; NEXTNET PTE. LTD. (Tiko, a similar live app) UEN 202436381M, Registered, 2024-09-04. — [data.gov.sg ACRA, q=OWOL](https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&q=OWOL); [q=NEXTNET](https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&q=NEXTNET)
- The ACRA open dataset removes many columns (officers, shareholders) "in consideration of Section 12(2A) of the Companies Act"; it gives name, UEN, status, entity type, date, street and postal code only. — [data.gov.sg collection 2 metadata](https://api-production.data.gov.sg/v2/public/api/collections/2/metadata)

**GLEIF (LEI) — official API**
- VERIFIED: BIGO TECHNOLOGY PTE. LTD., LEI **549300HJ82V6EH3STP87**, entity status ACTIVE, legal and HQ address "30 Pasir Panjang Road, #15-31A, Mapletree Business City, Singapore 117440", registered at RA000523 (ACRA) as 201426996D, entity creation date 2014-09-11, LEI first issued 2022-06-07, last update 2026-03-26, next renewal 2027-02-13, "FULLY_CORROBORATED". — [GLEIF API record](https://api.gleif.org/api/v1/lei-records/549300HJ82V6EH3STP87)
- VERIFIED: Bigo's LEI record reports **no** direct or ultimate accounting parent, with the exception reason "NON_CONSOLIDATING". — [GLEIF direct-parent exception](https://api.gleif.org/api/v1/lei-records/549300HJ82V6EH3STP87/direct-parent-reporting-exception); [ultimate-parent exception](https://api.gleif.org/api/v1/lei-records/549300HJ82V6EH3STP87/ultimate-parent-reporting-exception)
- NOT FOUND in GLEIF (name autocomplete on legal name): Beckoning Cube, Candy Cube, GirlPower HK, GLOBJOY, SOCIALTECH SOLUTIONS, Fastwall Information, DEEP TURING, JoyVoice, Mobile Alpha. "Vshow" returned only an unrelated Czech company (VSHosting s.r.o.). — [GLEIF fuzzy completions API](https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=GLOBJOY)

**SEC filings (JOYY Inc., FY2025 Form 20-F, filed 2026)**
- VERIFIED: Exhibit 8.1 "List of Significant Subsidiaries" names Bigo Inc (Cayman Islands), **Bigo Technology Pte. Ltd. (Singapore)**, Likeme Pte. Ltd., Bigo Internet Information Pte. Ltd., Indigo Technology Pte. Ltd., Rambojoy Technology Pte. Ltd., **Hago Singapore Pte. Ltd.**, Hello Yo Pte. Ltd., Cube Technology Pte. Ltd., Cube Networks Pte. Ltd. (all Singapore), and Hong Kong entities NeoTasks Limited, Robinfly (Hong Kong) Limited, Starling Labs Limited, Shopline Solutions Limited, Mangatoon HK Limited, plus PRC subsidiaries and VIEs. **No Turkish and no UAE entity is listed.** — [JOYY 20-F Exhibit 8.1](https://www.sec.gov/Archives/edgar/data/1530238/000110465926049917/joyy-20251231xex8d1.htm)
- VERIFIED: Note 1 of the financial statements lists Bigo Inc. (Cayman, 100%, investment holding), "Bigo Technology Pte. Ltd. ('Bigo Singapore') Singapore, March 4, 2019, 100%, Investment holding, operation of live streaming platform", and "Bigo (Hong Kong) Limited ('Bigo HK') Hong Kong, March 4, 2019, 100%". The column is "Date of incorporation or acquisition", so 4 March 2019 is the acquisition date; ACRA shows the company existed since 2014. — [JOYY 20-F FY2025](https://www.sec.gov/Archives/edgar/data/1530238/000110465926049917/joyy-20251231x20f.htm)
- VERIFIED: The 20-F says the "All other" segment includes Hago, Shopline "and certain audio live streaming platforms", and lists Turkish lira among the currencies of its revenues and expenses. — [JOYY 20-F FY2025](https://www.sec.gov/Archives/edgar/data/1530238/000110465926049917/joyy-20251231x20f.htm)

**UK Companies House (public search page)**
- NOT FOUND: Beckoning Cube HK, Candy Cube HK, GirlPower HK, GLOBJOY, SOCIALTECH SOLUTIONS FZCO, Fastwall Information Technology, DEEP TURING TEST TECHNOLOGY, Vshow, JoyVoice, Mobile Alpha Limited. Only unrelated same-word UK companies were returned (e.g. "CANDY CUBE LTD 13566185, Widnes"; "MARKETING SALT LTD, previously SOCIAL TECH SOLUTIONS LTD 12142400"). — [Companies House search "CANDY CUBE"](https://find-and-update.company-information.service.gov.uk/search/companies?q=CANDY+CUBE); [search "SOCIALTECH SOLUTIONS"](https://find-and-update.company-information.service.gov.uk/search/companies?q=SOCIALTECH+SOLUTIONS)
- VERIFIED (side finding): "ROLINE TECHNOLOGY (UK) LIMITED, previous name BIGO TECHNOLOGY (UK) LIMITED, 12052541, incorporated 14 June 2019, 69 Aberdeen Avenue, Cambridge". Whether it ever belonged to JOYY was not checked; it is not in JOYY's Exhibit 8.1. — [Companies House search "BIGO TECHNOLOGY"](https://find-and-update.company-information.service.gov.uk/search/companies?q=BIGO+TECHNOLOGY)

**Hong Kong Companies Registry**
- COULD NOT QUERY: `www.icris.cr.gov.hk/csci/` now redirects to the new CR e-Services portal (`www.e-services.cr.gov.hk/ICRIS3EP/`). It is a JavaScript application that loads a `disable-devtool.min.js` anti-automation script; I did not try to script it. — [CR e-Services portal](https://www.e-services.cr.gov.hk/ICRIS3EP/system/home.do)
- COULD NOT QUERY: the free HK directory mirror ltddir.com returned HTTP 403 for all five slugs tried (beckoning-cube-hk-limited, globjoy-united-limited, fastwall-information-technology-co-limited, deep-turing-test-technology-limited, girlpower-hk-limited). OpenCorporates had returned 403 in phase 1. — (ltddir.com/companies/…; [phase-1 nivi.md](../Rakip%20analizi%20ve%20yasal%20yayın%20stratejisi/nivi.md))
- NOT FOUND on the open web: exact-name searches for "BECKONING CUBE HK LIMITED", "GLOBJOY UNITED LIMITED", "FASTWALL INFORMATION TECHNOLOGY CO., LIMITED" and "GIRLPOWER HK LIMITED" returned no registry mirror, gazette notice or news. — [web search, 2026-11-25; no matching source]
- Phase 1 found an EMIS profile for Beckoning Cube HK Limited (Rm 11, 20/F, The Cloud; incorporation year shown 2024, conflicting snippet date 13 July 2026; number and officers paywalled). — [EMIS (phase 1)](https://www.emis.com/php/company-profile/HK/Beckoning_Cube_Hk_Limited)

**UAE (SOCIALTECH SOLUTIONS - FZCO)**
- COULD NOT QUERY: I found no free public company lookup on IFZA's or DSOA's sites; search results were only consultancies describing the member-only IFZA portal. — [filings.ae IFZA portal guide (consultancy, low reliability)](https://filings.ae/ifza/ifza-portal-guide); [ifza.com setup page](https://ifza.com/en/set-up-your-business/)
- The store address "DSO-IFZA, IFZA Properties, Dubai Silicon Oasis" (phone +971 58 561 1686) is from Google Play (phase 1). — [Google Play com.vitalk.android](https://play.google.com/store/apps/details?id=com.vitalk.android)

**App store developer data used as identity anchors (VERIFIED, own listings)**
- Poppo Live: App Store seller "Vshow PTE. LTD." (id 1544908797, bundle com.baitu.poppo, sellerUrl poppolive.com), listed in the TR storefront. Google Play package com.baitu.qingshu: "VSHOW PTE. LTD., contact@poppolive.com, 10 ANSON ROAD #13-09 INTERNATIONAL PLAZA Singapore 079903, +65 8799 8119". — [iTunes lookup TR](https://itunes.apple.com/lookup?id=1544908797&country=tr); [Google Play](https://play.google.com/store/apps/details?id=com.baitu.qingshu&hl=en&gl=US)
- Bigo Live: App Store seller "BIGO TECHNOLOGY PTE. LTD." (id 1077137248, sg.bigo.live), **0 results in TR storefront**; Google Play: "BIGO TECHNOLOGY PTE. LTD., bigo-developer@bigo.sg, 30 Pasir Panjang Road #15-31A Mapletree Business City Singapore 117440, +65 6351 9330". — [iTunes lookup TR](https://itunes.apple.com/lookup?id=1077137248&country=tr); [Google Play](https://play.google.com/store/apps/details?id=sg.bigo.live&hl=en&gl=US)
- SUGO: App Store seller "MOBILE ALPHA LIMITED" (id 1574436604, com.maker.sugo, sellerUrl voicemaker.media), 0 results in TR; Play package returns 404. — [iTunes search](https://itunes.apple.com/search?term=sugo&entity=software&country=us); [iTunes lookup TR](https://itunes.apple.com/lookup?id=1574436604&country=tr)
- SoulChill Group: App Store seller "JoyVoice HK Limited", artist "JoyVoice HK Limited/悅聲星球香港有限公司" (id 6792622035, bundle live.joyvoice.app, sellerUrl soulchill.group), listed in TR. — [iTunes lookup TR](https://itunes.apple.com/lookup?id=6792622035&country=tr)
- MICO: App Store seller "MICO WORLD CO., LTD." (id 908023218, com.meets.Meets, micous.com), 0 results in TR; Google Play: "Mico World Limited, developer@micous.com, Rm 701 7/F Hong Kong Science Park Ph Three Bldg 22E, Pak Shek Kok, Sha Tin, N.T., Hong Kong, +852 6317 3194". — [iTunes lookup TR](https://itunes.apple.com/lookup?id=908023218&country=tr); [Google Play com.mico](https://play.google.com/store/apps/details?id=com.mico&hl=en&gl=US)
- Chamet: Google Play developer "Chamet Team" (com.hkfuliao.chamet, 50M+), "Fuliao Hong Kong Limited, arubawei@gmail.com, Rm 2 LG 1/F Mirror Twr, 61 Mody Rd, Tsim Sha Tsui, Kowloon, Hong Kong, +852 6681 2971"; description gives bd@hkfuliao.com (streamers/agents) and chametservice@gmail.com. No iOS app came up in a US App Store search for "chamet". — [Google Play Chamet](https://play.google.com/store/apps/details?id=com.hkfuliao.chamet&hl=en&gl=US); [iTunes search](https://itunes.apple.com/search?term=chamet&entity=software&country=us)
- Layla: Google Play "GirlPower HK Limited, billionsmatch@gmail.com, Rm 101 31/F Harbour City The Gateway Twr 5, 15 Canton Rd, Tsim Sha Tsui, Kowloon, +852 4659 8900". — [Google Play com.layla.chat](https://play.google.com/store/apps/details?id=com.layla.chat&hl=en&gl=US)

### Inferences
- INTERPRETATION: The GLEIF "NON_CONSOLIDATING" parent exception for Bigo conflicts with JOYY's 20-F, which shows Bigo Technology Pte. Ltd. as a 100% consolidated subsidiary. The LEI parent data is self-reported and looks wrong or stale; the SEC filing is the stronger source.
- INTERPRETATION: The listed groups (Bigo under JOYY, Poppo's Vshow) are the only peers with a checkable registry trail. All the smaller Turkish-market apps (Nivi, Layla, Zili, Timo, TanStar, Chamet, SUGO, SoulChill) publish through Hong Kong or Dubai free-zone companies with no LEI, Gmail contacts in several cases, and no free officer data.
- INTERPRETATION: Every Apple organisation developer must give a D-U-N-S number when enrolling, so each App Store seller above has one (TanStar's DEEP TURING TEST TECHNOLOGY LIMITED included), even though none is shown on the store pages. — [Apple Developer, D-U-N-S](https://developer.apple.com/support/D-U-N-S/)

### Gaps
- HK CR numbers, incorporation dates, status, registered office, company secretary and directors for all HK entities: COULD NOT QUERY (see section 5 for manual steps).
- SOCIALTECH SOLUTIONS - FZCO licence number and status: COULD NOT QUERY.
- D-U-N-S numbers: COULD NOT QUERY (the D&B lookup is a form, not tried).
- Chinese parent entities (Qichacha/Tianyancha): not queried (paywalled / login-gated). The Bigo PRC chain is documented in JOYY's 20-F; for the others no Chinese parent was identified from free sources.
- Trademarks (WIPO Global Brand Database, EUIPO, TÜRKPATENT): not queried in this run. WIPO and EUIPO are interactive JS apps; TÜRKPATENT's search needs an e-Devlet login.

## 2. Do the store seller, privacy-policy entity and terms-of-service entity match?

### Takeaway
One clear mismatch (Zili: UAE free-zone seller, Hong Kong contracting party; Zili Chat: UAE party under Hong Kong law) and several weaker ones: Nivi's brand domain "Candy Cube" has no matching company and its HK entity chooses Singapore law with a template still naming "Pocket"; MICO's App Store seller ("MICO WORLD CO., LTD.") and Play developer ("Mico World Limited") use different name forms; Chamet's policy spells its own company two ways. Bigo, Poppo, SUGO, SoulChill, Timo and TanStar are consistent where checkable.

### Cited Findings
- Zili: Apple and Google seller "SOCIALTECH SOLUTIONS - FZCO"; Privacy Policy and Terms at vitalk.net (9 May 2025) name "GLOBJOY UNITED LIMITED", RM B3, 19/F, Tung Lee Commercial Building, 91-97 Jervois Street, Sheung Wan, Hong Kong, HK law. — [vitalk.net/privacy.html](https://www.vitalk.net/privacy.html); [vitalk.net/terms.html](https://www.vitalk.net/terms.html); [iTunes lookup](https://itunes.apple.com/lookup?id=6746039929&country=tr)
- Zili Chat Terms (24 Aug 2026) name SOCIALTECH SOLUTIONS - FZCO but choose "the laws of HongKong, China". — [zilitalk.com/terms.html](https://www.zilitalk.com/terms.html)
- Nivi: App Store seller "Beckoning Cube HK LIMITED", developer display name typo "Beckoning Cude HK"; Play "BECKONING CUBE HK LIMITED"; Terms "We, Beckoning Cube HK LIMITED." with Singapore law and SIAC arbitration, and leftover "Pocket" brand text. — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486); [candycubehk.com Terms](https://candycubehk.com/#/termsofservice); [Google Play](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=en&gl=US)
- Layla: Play developer GirlPower HK Limited; the Play-linked privacy policy on billionssocial.com names "GIRLPOWER HK LIMITED" (4 times). — [billionssocial.com privacy](http://billionssocial.com/static/privacy.html)
- Timo: Play developer display name "FAST WALL", entity "Fastwall Information Technology Co., Limited"; ToS and Top-up Agreement name Fastwall, HK law. — [Google Play com.hwsj.club](https://play.google.com/store/apps/details?id=com.hwsj.club&hl=en&gl=US); [h5.touchchat.me agreement](https://h5.touchchat.me/social/agreement/index.html#/terms)
- TanStar: App Store seller DEEP TURING TEST TECHNOLOGY LIMITED; privacy policy names "Deep Turing Test Technology Limited" with no address, country or governing law; no ToS. — [App Store TR](https://apps.apple.com/tr/app/tanstar/id6746351641); [deepturinghk.com/privacy.html](https://deepturinghk.com/privacy.html)
- SUGO: sugo.com privacy policy names "Mobile Alpha Limited" and, in the page source near the end, "Office Address: FLAT/RM A 12/F ZJ 300, 300 Lockhart Road, Wan Chai, HK, Tel +852 6991 9839, contact@sugochat.com" (it sits next to an HTML comment marker, so it may not be shown to readers). — [sugo.com/privacy.html](https://www.sugo.com/privacy.html)
- SoulChill: the website footer says "Registered by JoyVoice HK Limited", same as the App Store seller. — [soulchill.group](https://www.soulchill.group/)
- Chamet: privacy policy names "FULIAO HONG KONG LIMITED" (twice) and "FULIAO HONGKONG LIMITED" (once); the Play developer is "Chamet Team" / Fuliao Hong Kong Limited; package com.hkfuliao.chamet; domains uchamet.com and nchamet.com. — [h5.uchamet.com privacy](https://h5.uchamet.com/appH5/pact/privacy.html); [ws-h5.nchamet.com privacy](https://ws-h5.nchamet.com/appH5/pact/privacy.html)
- MICO: App Store "MICO WORLD CO., LTD." vs Google Play "Mico World Limited"; micous.com legal pages returned HTTP 567 to my request. — [iTunes search mico](https://itunes.apple.com/search?term=mico&entity=software&country=us); [Google Play com.mico](https://play.google.com/store/apps/details?id=com.mico&hl=en&gl=US)
- Poppo and Bigo legal pages (h5.vshowapi.com/privacy, poppolive.com/privacy.html, bigo.tv/about/terms) are JavaScript-rendered; no entity name could be read from the static HTML. — [h5.vshowapi.com/privacy](https://h5.vshowapi.com/privacy); [bigo.tv terms](https://www.bigo.tv/about/terms)

### Inferences
- INTERPRETATION: In Zili's case a Turkish user (or regulator) would face a store seller in Dubai, a contracting party in Hong Kong and Hong Kong law: whom to sue or notify is unclear. This is the most important mismatch for the owners' comparison.
- INTERPRETATION: "MICO WORLD CO., LTD." vs "Mico World Limited" may be the same HK company written two ways (HK companies may use "Co., Limited"), but this cannot be confirmed without the HK registry.
- INTERPRETATION: Developer display names that differ from the legal entity ("FAST WALL", "Chamet Team", "Beckoning Cude HK") are allowed by the stores but make it harder for users to find the company.

### Gaps
- Bigo, Poppo and MICO contracting-party names on their ToS/privacy pages: not readable without running JavaScript (not done).
- Layla, SUGO, SoulChill, Chamet ToS entities: not fetched.

## 3. Shared addresses, company secretaries, domains or backends linking the apps into a few groups

### Takeaway
No two target companies share a registered address in the public data, and company secretaries cannot be seen without paid HK records. The clearest group remains Nivi + Layla + "Pocket" (phase-1 shared backend), now reinforced by domain data: candycubehk.com and laylachat.com use the same uncommon Singapore registrar (Aceville Pte. Ltd.) and AWS DNS. Bigo and JOYY Singapore share an office. Zili's three domains were all registered at GoDaddy with AWS DNS in 2025. Hong Kong addresses cluster in Tsim Sha Tsui business centres (Fastwall, GirlPower, Fuliao/Chamet), which is a typical virtual-office pattern, not proof of common ownership.

### Cited Findings
- RDAP: candycubehk.com (Nivi) registered 2024-10-15, registrar **Aceville Pte. Ltd.**, AWS Route 53 nameservers. laylachat.com (Layla image CDN) registered 2023-04-24, registrar **Aceville Pte. Ltd.**, AWS nameservers. pocketliveapp.com registered 2022-03-26, Amazon Registrar, AWS nameservers. — [RDAP candycubehk.com](https://rdap.org/domain/candycubehk.com); [RDAP laylachat.com](https://rdap.org/domain/laylachat.com); [RDAP pocketliveapp.com](https://rdap.org/domain/pocketliveapp.com)
- ACRA: ACEVILLE PTE. LTD., UEN 200510104M, Registered, 2005-07-21, Robinson Road 068897. — [data.gov.sg ACRA q=ACEVILLE](https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&q=ACEVILLE)
- RDAP: Zili's vitalk.net registered 2025-03-24, socialtech.info 2025-02-18, zilitalk.com 2025-11-17; all GoDaddy, all AWS nameservers. — [RDAP vitalk.net](https://rdap.org/domain/vitalk.net); [RDAP socialtech.info](https://rdap.org/domain/socialtech.info); [RDAP zilitalk.com](https://rdap.org/domain/zilitalk.com)
- RDAP: timo.club registered 2023-03-13 (GoDaddy, registrant redacted, state "Arizona" = privacy service), shejiaowin.com (Timo CDN) 2024-10-16, GoDaddy DNS. touchchat.me returned no RDAP data. — [RDAP timo.club](https://rdap.org/domain/timo.club); [RDAP shejiaowin.com](https://rdap.org/domain/shejiaowin.com)
- RDAP: deepturinghk.com (TanStar) registered 2025-01-06, GoDaddy, nameservers NS3/NS4.DNSV2.COM. poppolive.com registered 2020-11-23, nameservers VIP3/VIP4.ALIDNS.COM. micous.com registered 2015-02-06, AWS DNS. — [RDAP deepturinghk.com](https://rdap.org/domain/deepturinghk.com); [RDAP poppolive.com](https://rdap.org/domain/poppolive.com); [RDAP micous.com](https://rdap.org/domain/micous.com)
- Addresses (from store listings): Fastwall — Rm 1011A 10/F Harbour Crystal Ctr, 100 Granville Rd, TST; GirlPower — Rm 101 31/F Harbour City Gateway Tower 5, 15 Canton Rd, TST; Fuliao HK (Chamet) — Rm 2 LG 1/F Mirror Tower, 61 Mody Rd, TST; Beckoning Cube — Rm 11 20/F The Cloud, 111 Tung Chau St, Tai Kok Tsui; GLOBJOY — RM B3 19/F Tung Lee Commercial Bldg, Sheung Wan; Mobile Alpha — 12/F ZJ 300, 300 Lockhart Rd, Wan Chai; Mico World — HK Science Park, Sha Tin. — [Play Timo](https://play.google.com/store/apps/details?id=com.hwsj.chat&hl=en&gl=TR); [Play Layla](https://play.google.com/store/apps/details?id=com.layla.chat&hl=en&gl=US); [Play Chamet](https://play.google.com/store/apps/details?id=com.hkfuliao.chamet&hl=en&gl=US); [Play Nivi](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=en&gl=US); [vitalk.net privacy](https://www.vitalk.net/privacy.html); [sugo.com privacy](https://www.sugo.com/privacy.html); [Play MICO](https://play.google.com/store/apps/details?id=com.mico&hl=en&gl=US)
- Bigo (GLEIF/ACRA/Play) and JOYY Singapore (ACRA) share 30 Pasir Panjang Road, postal 117440. — [GLEIF](https://api.gleif.org/api/v1/lei-records/549300HJ82V6EH3STP87); [ACRA q=JOYY](https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&q=JOYY)
- Phase-1 backend evidence: Nivi's H5 bundle calls pocketliveapp.com and uses the laylachat.com image CDN; Layla's Play "More by" lists ChatA, Ohla, 4Chat, Winko. — [phase-1 nivi.md](../Rakip%20analizi%20ve%20yasal%20yayın%20stratejisi/nivi.md)
- Package names hint at origin brands: Poppo `com.baitu.poppo` / `com.baitu.qingshu`, with legal pages on h5.phxyuyin.com; Chamet `com.hkfuliao.chamet`; Zili `com.vitalk.*`; Timo `com.hwsj.*`. — [iTunes search poppo](https://itunes.apple.com/search?term=poppo+live&entity=software&country=us); [Play Poppo](https://play.google.com/store/apps/details?id=com.baitu.qingshu&hl=en&gl=US)

### Inferences
- INTERPRETATION: Aceville Pte. Ltd. is generally known as the domain registrar behind Tencent Cloud's international service, and DNSV2.COM as DNSPod (Tencent); ALIDNS.COM is Alibaba Cloud DNS. That fits Chinese-run teams (Nivi/Layla on Tencent tooling, TanStar on DNSPod, Poppo on Alibaba DNS). I did not verify the Aceville–Tencent link in a primary source in this run.
- INTERPRETATION: Nivi (Beckoning Cube HK) and Layla (GirlPower HK) are very likely one operator: same backend and H5 template (phase 1), same rare registrar, same DNS provider. Two separate HK shells under one operator is the usual white-label pattern.
- INTERPRETATION: Groups suggested by the evidence: (a) JOYY/Bigo (Singapore, listed; Hago also JOYY); (b) Nivi/Layla/Pocket (HK shells, Tencent tooling); (c) Zili / Zili Chat (Dubai FZCO + HK GLOBJOY); (d) Timo (Fastwall, touchchat/shejiaowin); (e) TanStar (Deep Turing); (f) Chamet (Fuliao HK); (g) Poppo (Vshow, "baitu"); (h) SUGO (Mobile Alpha / voicemaker); (i) SoulChill (JoyVoice HK); (j) MICO (Mico World). No link was found between these groups.
- INTERPRETATION: The Tsim Sha Tsui addresses are business-centre addresses used by many HK shells; a shared company secretary would need the paid HK annual returns (NAR1) to prove.

### Gaps
- Company secretary and director names for all HK companies: only in paid HK CR documents (Company Particulars, NAR1) — not obtained.
- Whether SOCIALTECH and GLOBJOY have common shareholders: not visible in any free source.

## 4. Which apps have a Turkish entity or Turkish representative (Law 5651)?

### Takeaway
None of the target apps (Nivi, Layla, Zili, Timo, TanStar) or the peers Bigo, Poppo, SUGO, SoulChill, MICO, Chamet showed a Turkish company or Turkish representative on any page I could read. The only Turkish seller found among peers is LopMe's "KOTIC BILISIM ANONIM SIRKETI", and LopMe was in the 14 Feb 2026 BTK block anyway. JOYY's list of significant subsidiaries has no Turkish company, though JOYY reports Turkish lira revenue and Bigo held a creator gala in Türkiye in 2025.

### Cited Findings
- LopMe – Canlı Yayın & Sohbet: App Store seller "KOTIC BILISIM ANONIM SIRKETI" (id 1579829103, lopme.tv). — [iTunes search lopme](https://itunes.apple.com/search?term=lopme&entity=software&country=us)
- JOYY Exhibit 8.1 lists no Turkish entity. — [JOYY 20-F Exhibit 8.1](https://www.sec.gov/Archives/edgar/data/1530238/000110465926049917/joyy-20251231xex8d1.htm)
- JOYY lists "Turkish lira" among the currencies of its revenues and expenses. — [JOYY 20-F FY2025](https://www.sec.gov/Archives/edgar/data/1530238/000110465926049917/joyy-20251231x20f.htm)
- Bigo Live held a "Turkey Mid-Year Gala" for its creator community (press release, Aug 2025). — [Malay Mail / Media OutReach, 25 Aug 2025](https://www.malaymail.com/news/money/mediaoutreach/2025/08/25/bigo-live-brings-global-creator-community-together-at-turkey-mid-year-gala/401214)
- The BTK list of representatives of foreign social network providers, as reported in Sept 2022, named only Facebook/Instagram (Madoka Turkey Bilişim Hizmetleri Ltd. Şti.), LinkedIn, TikTok, Twitter, YouTube, Dailymotion, Pinterest and VK; no live-streaming or voice-chat app. — [Habertürk, 14.09.2022](https://www.haberturk.com/turkiye-deki-sosyal-aglarin-temsilcileri-kimler-3520094-teknoloji)
- Under the rule, foreign social network providers with more than 1 million daily accesses from Türkiye must appoint a representative; a legal-person representative must be a Turkish-established company. — [NTV](https://www.ntv.com.tr/teknoloji/sosyal-ag-saglayicilari-icin-btkdan-duzenleme,YSUPWeU_AkWE_gpLEszNGw); [Habertürk](https://www.haberturk.com/btk-dan-sosyal-ag-saglayicilarina-yonelik-duzenleme-3579108-teknoloji)
- TR storefront presence (iTunes lookup, 2026-11-25): Poppo (Vshow) and SoulChill (JoyVoice HK) listed; Bigo, SUGO, MICO return 0 results. — [Poppo](https://itunes.apple.com/lookup?id=1544908797&country=tr); [SoulChill](https://itunes.apple.com/lookup?id=6792622035&country=tr); [Bigo](https://itunes.apple.com/lookup?id=1077137248&country=tr); [SUGO](https://itunes.apple.com/lookup?id=1574436604&country=tr); [MICO](https://itunes.apple.com/lookup?id=908023218&country=tr)

### Inferences
- INTERPRETATION: The 5651 representative duty applies above 1 million daily accesses from Türkiye; most of these apps are probably below that line, so the absence of a representative is not by itself a breach. But none of them gives the BTK or a Turkish user a local party to serve, which fits the pattern of administrative blocks seen in Aug 2025 and Feb 2026 (phase-1 timo_ve_sektor.md).
- INTERPRETATION: For Similar Club, having a Turkish company (and a named representative on the legal pages) would be a real difference from every competitor checked here.

### Gaps
- The current BTK representative list page could not be found at guessed URLs (404); the 2022 snapshot is the latest seen. **Need from owners:** open btk.gov.tr, search "Yurt Dışı Kaynaklı Sosyal Ağ Sağlayıcı Temsilcileri", and check for Bigo, Poppo, Yalla, Tango, MICO, Chamet.
- Turkish Ticaret Sicili Gazetesi (TOBB) searches for "BIGO", "VSHOW", "JOYY", "KOTIC BİLİŞİM": COULD NOT QUERY (site uses a captcha / login). KOTIC BİLİŞİM A.Ş.'s MERSIS number, date and address are unverified.

## 5. Manual steps for the owners where registries could not be queried

### Takeaway
Hong Kong, UAE, Turkish and trademark registries need a person at a browser. Each step below uses only free public pages and stops at the paywall.

### Cited Findings
- HK registry portal (new e-Services, replaces the old ICRIS Cyber Search Centre address). — [CR e-Services portal](https://www.e-services.cr.gov.hk/ICRIS3EP/system/home.do)
- ACRA open data (already used above) for any further Singapore check. — [data.gov.sg ACRA collection](https://api-production.data.gov.sg/v2/public/api/collections/2/metadata)
- GLEIF lookup (free, no account). — [GLEIF API](https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=BIGO)
- Apple D-U-N-S support page (D&B lookup for Apple developers). — [Apple Developer D-U-N-S](https://developer.apple.com/support/D-U-N-S/)

### Inferences (step-by-step, INTERPRETATION of how the free tiers work; owners should note what each screen actually shows)
1. **Hong Kong (Beckoning Cube HK LIMITED, GirlPower HK Limited, GLOBJOY UNITED LIMITED, Fastwall Information Technology Co., Limited, DEEP TURING TEST TECHNOLOGY LIMITED, Mobile Alpha Limited, JoyVoice HK Limited, Mico World Limited, Fuliao Hong Kong Limited):** open https://www.e-services.cr.gov.hk → choose the search service as an unregistered user (no account) → "Company Search" / "Search by company name" → type the exact name → write down the CR number, company type, date of incorporation, status (Live/Dissolved) and name history if shown for free. Stop when it asks for payment (Company Particulars, annual return NAR1 images, directors, company secretary). If a CR number turns up, the paid NAR1 would show the company secretary (the HK service provider) and whether two companies share one; that is the owners' decision to buy.
2. **UAE (SOCIALTECH SOLUTIONS - FZCO):** check whether IFZA or DSOA offers a public "verify company/licence" page; if not, email IFZA's client service asking only whether licence holder "SOCIALTECH SOLUTIONS - FZCO" is active (no personal data). Also try the UAE National Economic Register (economy.ae) free search with the name. Note: the "DSO-IFZA, IFZA Properties" address is IFZA's general address used by many licensees, so it says nothing about the company's real office.
3. **Türkiye:** (a) ticaretsicil.gov.tr / Ticaret Sicili Gazetesi search (needs captcha, by a person) for "KOTIC BİLİŞİM", "BIGO", "VSHOW", "FULIAO", "BECKONING"; (b) BTK site, "Yurt Dışı Kaynaklı Sosyal Ağ Sağlayıcı Temsilcileri" list; (c) TÜRKPATENT marka araştırma (e-Devlet login) for "NIVI", "ZILI", "TIMO", "TANSTAR", "POPPO", "BIGO", "CHAMET", "SUGO".
4. **Trademarks abroad:** WIPO Global Brand Database (branddb.wipo.int) and EUIPO eSearch, searching the brand names and the holder names above; the holder's name and address on a mark often reveal the parent company.
5. **D-U-N-S:** D&B's free "D-U-N-S lookup" form (Apple developer variant) with the exact seller names; it shows the D-U-N-S name and address D&B holds, which can be compared with the store address.
6. **Chinese parents:** Qichacha and Tianyancha require login for details. A free web search for package-name stems ("baitu", "hkfuliao", "hwsj", "vitalk") plus 科技有限公司 may surface the mainland company; treat such results as leads only.

### Gaps
- The exact free fields of the new HK e-Services name search, IFZA's verification process and NER coverage of free zones were not confirmed in this run (could not load the interactive pages).
