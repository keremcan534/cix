# Gambling licence registers: do the companies behind Turkish-market agency voice/live apps hold a licence?

Access date for every lookup below: **2026-11-25** (unless a register's own "last updated" date is given).
Labels: **VERIFIED** (register page/file seen), **NOT FOUND** (exact search done, no match), **COULD NOT QUERY** (with reason), **INTERPRETATION** (my reading, not a register fact).

Method: where a register publishes a full list (CSV, PDF, HTML table), I downloaded the whole list and matched all name variants against it locally with a script (case-insensitive; whole-word match, plus substring match for short stems). This is more complete than a single search-box query, but it only matches **names as written in the list**. It cannot find a licence held through a subsidiary with an unrelated name (e.g. a Curaçao "X N.V." owned by a Hong Kong group). So "NOT FOUND" means only "no entry under these names on this list on this date", never "proven unlicensed".

## Q1. Does any of these companies appear on any gambling register? Under what name, licence type, status, dates?

### Takeaway
None of the companies or brands appears on any register that could be read (UKGC, Curaçao CGA, Gibraltar, Kahnawà:ke, Anjouan). Four registers could not be queried from this session (MGA, Isle of Man, UAE GCGRA, PAGCOR offshore), so the owners need to check those by hand. The only matches were unrelated companies with a similar word in the name ("Alpha", "cube").

### Name variants searched (all registers that could be read)
Nivi: `beckoning`, `cude` (store typo "Beckoning Cude HK"), `candy cube`, `candycube`, `girlpower`, `girl power`, `pocket live`, `pocketlive`, `nivi`, `layla`. (The bare word "pocket" was not used: too generic.)
Zili: `socialtech`, `social tech`, `globjoy`, `vitalk`, `zili`.
Timo: `fastwall`, `fast wall`, `touchchat`, `timo`.
TanStar: `deep turing`, `tanstar`, plus substring `turing`.
Peers: `bigo`, `vshow` (Poppo Live publisher), `poppo`, `mobile alpha` (SUGO publisher), `sugo`, `joyvoice` (SoulChill publisher), `soulchill`, `mico world` (MICO publisher), `chamet`, `yalla`, `joyy`, plus substrings `cube`, `alpha`, `mico`.

Peer publisher names were taken from the Apple App Store search API (sellerName), accessed 2026-11-25:
- Poppo Live → **Vshow PTE. LTD.** — [iTunes search "poppo"](https://itunes.apple.com/search?term=poppo&entity=software&country=us&limit=3)
- BIGO LIVE → **BIGO TECHNOLOGY PTE. LTD.** — same result set
- SUGO → **MOBILE ALPHA LIMITED** — [iTunes search "sugo"](https://itunes.apple.com/search?term=sugo&entity=software&country=us&limit=3)
- MICO → **MICO WORLD CO., LTD.** — [iTunes search "mico"](https://itunes.apple.com/search?term=mico&entity=software&country=us&limit=3)
- SoulChill Group → **JoyVoice HK Limited** — [iTunes search "soulchill" (TR)](https://itunes.apple.com/search?term=soulchill&entity=software&country=tr&limit=3)
- Yalla / YallaChat / Yalla Ludo → **Yalla Technology FZ-LLC** (listed parent: Yalla Group Limited) — [iTunes search "yalla chat" (TR)](https://itunes.apple.com/search?term=yalla+chat&entity=software&country=tr&limit=3)
- Chamet → publisher **not identified** (the search returned nothing; Chamet was among the apps blocked in Turkey in Aug 2025, per phase-1 notes). Searched as brand `chamet` only.

### Result table, register by register

| # | Register | URL used | What was searched | Register date | Result |
|---|---|---|---|---|---|
| 1 | UK Gambling Commission – public register of businesses | [Search page](https://www.gamblingcommission.gov.uk/public-register/businesses); full list [business-licence-register-businesses.csv](https://www.gamblingcommission.gov.uk/downloads/business-licence-register-businesses.csv) | All variants above against all 2,626 licence account names in the CSV | File undated; downloaded 2026-11-25 | **NOT FOUND** (0 matches for any variant) |
| 2 | Malta Gaming Authority – licensee register | [mga.org.mt licensee register](https://www.mga.org.mt/licensee-hub/licensee-register/) → search runs on `register.mga.org.mt` | — | — | **COULD NOT QUERY**: the MGA page is only a shell; the search app at register.mga.org.mt was unreachable from this session's network (proxy: "connect_unreachable"). |
| 3a | Curaçao Gaming Authority – Online Gaming Licence registry (LOK) | [License register page](https://www.cga.cw/en/133i348441001) → [OGL registry PDF](https://gamingcontrol.spin-cdn.com/media/license_registry/20261120_20261120_ogl_registry.pdf) | All variants against the full 20-page PDF (≈630+ licence rows, CGA/… and OGL/… numbers, B2B/B2C) | "Last updated November 20, 2026" | **NOT FOUND**. Only unrelated "Alphabet Gaming N.V." and "Alpha Games N.V." matched the stem "alpha"; nothing links them to Mobile Alpha Limited (INTERPRETATION: unrelated). |
| 3b | CGA – Enforcement register | [PDF](https://gamingcontrol.spin-cdn.com/media/license_registry/20261112_20261112_enforcement_register.pdf) | Same | "Last updated November 12, 2026" | **NOT FOUND** |
| 3c | CGA – Certificate holders (art. 5.17 LOK) | [PDF](https://gamingcontrol.spin-cdn.com/media/license_registry/20260831_20260831_list_of_certificates_holder_acc_art_517_lok.pdf) | Same | "Last updated August 31, 2026" | **NOT FOUND** (list is test labs etc.) |
| 4 | Isle of Man Gambling Supervision Commission – licence holders | [gov.im licence holders](https://www.gov.im/categories/business-and-industries/gambling-and-e-gaming/licence-holders/) | — | — | **COULD NOT QUERY**: HTTP 403 to both curl and the fetch tool (bot protection). |
| 5 | Gibraltar Gambling Division – register of licence holders | [gamblingdivision.gov.gi/licence-holders](https://gamblingdivision.gov.gi/licence-holders) (linked from [gibraltar.gov.gi remote gambling](https://www.gibraltar.gov.gi/finance-gaming-and-regulations/remote-gambling)) | All variants against the full HTML list (≈70 B2C/B2B licensees, e.g. Entain, bet365, Playtech, Pragmatic) | A search snippet says "as at 12th September 2025"; the date was not shown in the page text I parsed | **NOT FOUND** |
| 6 | Kahnawà:ke Gaming Commission – interactive permit holders | [gamingcommission.ca permit holders](https://gamingcommission.ca/interactive-gaming/permit-holders/) | All variants + substrings against the full operator/URL table | "Updated September 28, 2023" (the list itself is old) | **NOT FOUND** |
| 7 | Anjouan Offshore Finance Authority – register of IBCs and international licences | [AOFA register](https://anjouanoffshorefinanceauthority.org/anjouan-register/); gaming admin site [anjouangaming.com](https://anjouangaming.com/) | All variants + substrings against the full page (≈2,200 lines) and the gaming site | Not dated | **NOT FOUND**. Only "Smartcube FX Limited" (brokerage) and "AlphaBitX Limited" matched stems; unrelated. Caveat: since June 2023 internet gaming licences are administered by "Anjouan Licensing Services Inc", so the AOFA page may not list every gaming licensee. |
| 8 | Philippines PAGCOR – offshore (POGO/IGL) licensees | [pagcor.ph regulatory page](https://www.pagcor.ph/regulatory/index.php) | Looked for a licensee list | — | **COULD NOT QUERY as a list**: the regulatory page carries manuals and statistics, no offshore licensee list; `/regulatory/offshore-gaming.php` returned 404. Context: Executive Order 74 (Nov 2024) banned all POGO/IGL offshore gaming, so no new offshore licence is possible. |
| 9 | UAE GCGRA – "Our Licensees" | [gcgra.gov.ae/en/licensing/our-licensees](https://gcgra.gov.ae/en/licensing/our-licensees) | — | — | **COULD NOT QUERY**: www.gcgra.gov.ae returned 403; gcgra.gov.ae is not allowed by this session's network. Secondary sources (below) name only a handful of licensees: The Game LLC (lottery), Wynn Al Marjan (casino), Coin Technology Projects LLC / Play971 (internet gaming, sports wagering), plus vendor licences. None of them is one of our companies. |
| 10 | Singapore GRA | [gra.gov.sg licences/class licences](https://www.gra.gov.sg/licenses-approvals) | — | — | **NOT APPLICABLE as a name search**: class licences need no application, so there is no list of class licensees. Gambling operator licences are few (Singapore Pools, casinos); I found no public searchable list on the site. |
| 11 | Hong Kong | — | — | — | **No register exists for private online gambling**: see Q3. |
| 12 | Turkey | — | — | — | **No private online casino licence exists**: see Q3. |

### Cited findings
- UKGC CSV header is "Account Number,Licence Account Name" and has 2,626 rows (e.g. "1st Class Bet Ltd", "32Red Limited", "888 UK Limited") — [UKGC CSV](https://www.gamblingcommission.gov.uk/downloads/business-licence-register-businesses.csv) [VERIFIED]
- CGA register page: "Presented below are overviews of the entities licensed by the Curaçao Gaming Authority… these overviews do not guarantee the current validity of the licenses… no rights can be derived from these overviews." It links the land-based, online (OGL), certificate and enforcement registers — [CGA license register](https://www.cga.cw/en/133i348441001) [VERIFIED]
- CGA OGL registry header: "Licenses Granted under the New Online Gaming Policy (Effective November 15, 2023)", columns licence number / licensee / B2B-B2C / company registration number / issued / expires / status — [OGL registry PDF](https://gamingcontrol.spin-cdn.com/media/license_registry/20261120_20261120_ogl_registry.pdf) [VERIFIED]
- In Sept 2025 the CGA removed revoked operators' names from its public register; non-payers are moved to the Enforcement Register — [Curaçao Chronicle](https://www.curacaochronicle.com/post/local/curacao-gaming-authority-removes-revoked-operators-from-public-register-amid-bcgame-controversy) [news]
- Kahnawà:ke issues CPA, KPL, CSPA and LDSA permits; "Mohawk Internet Technologies has held the sole IGL"; list "Updated September 28, 2023" — [KGC permit holders](https://gamingcommission.ca/interactive-gaming/permit-holders/) [VERIFIED]
- AOFA page: "as of June 2023, for Internet Gaming licences specifically, Anjouan Licensing Services Inc. is the responsible party for all administration…" — [AOFA register](https://anjouanoffshorefinanceauthority.org/anjouan-register/) [VERIFIED]
- Gibraltar licence holders list headed "Register of Licence Holders", "B2C Remote Gambling Operators" (Bookmaker / Gaming Operator / Betting Intermediary) and B2B — [Gibraltar Gambling Division](https://gamblingdivision.gov.gi/licence-holders) [VERIFIED]
- EO 74 (Nov 2024): no new POGO/IGL licences; covers all offshore gaming including PAGCOR-licensed — [Philstar](https://www.philstar.com/headlines/2024/11/09/2398739/palace-issues-eo-pogo-ban); [ASGAM](https://asgam.com/2024/11/08/philippines-president-marcos-signs-executive-order-officially-banning-pogos/) [news]
- Phase-1 notes: none of Nivi's, Zili's, Timo's or TanStar's own documents claims any gambling licence; Nivi's and Zili's terms ban gambling content — `research_notes/Rakip analizi ve yasal yayın stratejisi/nivi.md`, `zili.md`, `timo_ve_sektor.md`, `tanstar.md` (internal).

### Inferences
- INTERPRETATION: With no match in five readable registers and no licence claim in the apps' own documents, there is **no evidence** that any of these companies holds a gambling licence anywhere. That is different from proof that none exists: a licence could sit in a differently named subsidiary, or on the four registers that could not be queried.
- INTERPRETATION: Even a Curaçao/Anjouan/Malta licence would not make these apps lawful in Turkey (Turkey recognises no foreign licence; see Q3), and the stores require a licence for each territory where real-money gaming is offered.

### Gaps
- MGA, Isle of Man, GCGRA and PAGCOR could not be queried (network/bot protection). Manual steps in Q2.
- UKGC trading names and domain names were not searched (the CSV holds licence account names only). The UKGC search page also has trading-name and domain search; see Q2.
- Chamet's publisher name was not identified; TanStar's legal entity (DEEP TURING TEST TECHNOLOGY LIMITED) is itself only partly confirmed (phase-1 note).
- No corporate-registry check (HK Companies Registry, IFZA, ACRA) was made here, so subsidiaries with other names are unknown.

## Q2. Registers that could not be queried: exact manual steps for the owners

### Takeaway
Four checks need a person with a normal browser (about 15 minutes in total). Search each name variant one by one and screenshot the result page with the date. Do not use any tool to get past a captcha.

### Manual steps
1. **Malta (MGA)**: open https://www.mga.org.mt/licensee-hub/licensee-register/ → the search loads from register.mga.org.mt. Type each of: `Beckoning`, `Candy Cube`, `GirlPower`, `Socialtech`, `Globjoy`, `Fastwall`, `Deep Turing`, `Bigo`, `Vshow`, `Mobile Alpha`, `JoyVoice`, `MICO`, `Yalla`. Also search the domains/brands (`nivi`, `zili`, `vitalk`, `touchchat`, `pocketlive`). Record "no results" or the licence number, type (B2C/B2B, Type 1–4 / gaming service / critical supply), status and dates.
2. **Isle of Man (GSC)**: open https://www.gov.im/categories/business-and-industries/gambling-and-e-gaming/licence-holders/ (Online Gambling Licence holders list, HTML). Press Ctrl+F for each name above.
3. **UAE (GCGRA)**: open https://gcgra.gov.ae/en/licensing/our-licensees. Read the full list (expected to be short). Ctrl+F the names, especially `Socialtech` (Zili's Dubai company) and `Yalla Technology` (Dubai).
4. **Philippines (PAGCOR)**: there is no current offshore list because offshore gaming is banned (EO 74). Optional: look at https://www.pagcor.ph for "licensed online gaming" / "e-games" pages and Ctrl+F the names.
5. **UKGC extra check**: on https://www.gamblingcommission.gov.uk/public-register/businesses use the search box with "trading name" and "domain name" options for `nivi`, `zili`, `timo`, `tanstar`, `bigo`, `poppo`, `sugo`, `yalla`.
6. **Curaçao (optional re-check)**: the OGL registry PDF on https://www.cga.cw/en/133i348441001 is updated every few weeks; open the newest PDF and Ctrl+F.
7. Write down the date, the exact text typed, and the result for each search. If a site shows a captcha, solve it yourself or stop; do not use services that bypass it.

### Cited findings
- The MGA licensee register page links to `register.mga.org.mt` for the actual search — [MGA licensee register](https://www.mga.org.mt/licensee-hub/licensee-register/) [VERIFIED: page shell seen]
- GCGRA publishes an "Our Licensees" page — [GCGRA](https://gcgra.gov.ae/en/licensing/our-licensees) (seen only as a search result)

### Inferences
- INTERPRETATION: The MGA and IoM are the two most likely places for a big group (e.g. JOYY/Bigo) to hold a licence for some other product; the small HK/Dubai shell companies are very unlikely to appear anywhere.

### Gaps
- Whether the GCGRA list is complete and current could not be checked.

## Q3. In the home jurisdictions (HK, UAE/Dubai, Singapore) and in Turkey: is a social casino / chance feature with cash-out lawful or licensable?

### Takeaway
No. In Hong Kong all gambling is unlawful except listed exceptions, and the only online betting allowed is the HKJC's; a "game for winnings in money or other property" run as a business is unlicensable. In the UAE gambling is a crime under the Penal Code unless the GCGRA licenses it, and the GCGRA has licensed only a few operators (lottery, one casino resort, one online platform). In Singapore, games where players can win money or things exchangeable for money are gambling; class licences cover only games without cash-out, and "online social gambling" stays banned. In Turkey, games of chance are a state monopoly and no private online casino licence exists.

### Cited findings

**Hong Kong – Gambling Ordinance (Cap. 148)** (verified copy dated 13.12.2018; text read from a full PDF copy)
- s.2: "gambling includes gaming, betting and bookmaking"; "game means a game of chance and a game of chance and skill combined and a pretended game of chance…"; "gaming means the playing of or at any game for winnings in money or other property whether or not any person playing the game is at risk of losing any money or other property"; "bookmaking means the soliciting, receiving, negotiating or settling of a bet by way of trade or business whether personally or by letter, telephone, telegram or on-line medium (including the service commonly known as the Internet)…"; "lottery includes… (g) any game, method, device or scheme for distributing or allotting prizes by lot or chance, whether promoted, conducted or managed in or outside Hong Kong" — [Cap. 148 PDF (verified copy)](https://cyrilla.org/api/files/15609306529264d4mtaiddm.pdf) [VERIFIED, primary text; check current version on elegislation.gov.hk]
- s.3(1): "Save as provided in subsections (2)…(8), gambling is unlawful." The exceptions are: private social gaming not run as a business (2); mahjong/cards in licensed restaurants or clubs without fee or bank (3)–(4); games of amusement with prizes, tombola and trade promotion competitions licensed under s.22 (5); licensed mahjong premises (6); private bets (7); gambling authorised under the Betting Duty Ordinance Cap. 108 (8, i.e. the HKJC). s.4: lotteries are unlawful except under Cap. 108, the Government Lotteries Ordinance or a s.22 licence — same source [VERIFIED]
- Using foreign gambling services from Hong Kong is itself an offence — [Mondaq/Mayer Brown comparative guide](https://www.mondaq.com/hongkong/media-it/1243556/gambling-comparative-guide) [secondary]
- INTERPRETATION: a slot/wheel/"lucky gift" paid with bought coins, with winnings that convert to cash through diamonds → agency → bank, fits "gaming… for winnings in money or other property" run "by way of trade or business". No s.22 licence covers online casino games; the HKJC holds the only betting authority. So an HK company (Beckoning Cube, GirlPower, Globjoy, Fastwall, JoyVoice, Mobile Alpha if HK) has no licence route at home. HK law mainly bites on players/conduct in HK, though; it does not itself forbid an HK company from serving users only abroad (that falls to the users' countries' law).

**UAE – Penal Code + GCGRA**
- Federal Decree-Law No. 31 of 2021 (Crimes and Penalties): art. 460 defines gambling; art. 461 punishes players; art. 462 punishes organisers/those who run a gambling place. Reported penalties: up to 2 years or up to AED 50,000 for players; heavier for organisers (one source: up to 10 years and at least AED 100,000). Older texts cite arts. 414–415 of the repealed 1987 code — [Legal500 UAE gambling chapter](https://www.legal500.com/guides/chapter/uae-gambling-law/); [JD Supra](https://jdsupra.com/legalnews/uae-s-gambling-laws-prohibition-7827798) [secondary; penalty figures not verified against the official text]
- GCGRA set up by federal decree in Sept 2023 as the federal commercial gaming regulator; the Penal Code bans stay in force alongside licensed gaming — [CMS](https://cms.law/en/omn/legal-updates/playing-by-new-rules-the-introduction-of-the-commercial-gaming-regulatory-authority-in-the-uae); [Mondaq](https://www.mondaq.com/gaming/1729372/uae-commercial-gaming-law-gcgra-licences-online-gaming-sports-wagering-and-lotteries) [secondary]
- Licensees reported: The Game LLC (UAE Lottery, July 2024); Wynn Al Marjan Island (commercial gaming facility operator, Oct 2024); Play971 by Coin Technology Projects LLC (internet gaming, sports wagering); and vendor licences — [ASGAM](https://www.asgam.com/index.php/2024/07/29/uae-regulator-launches-website-names-first-lottery-licensee/); [Khaleej Times](https://khaleejtimes.com/uae/uae-grants-first-commercial-gaming-licence-to-wynn-resorts?amp=1); [Gaming Intelligence](https://www.gamingintelligence.com/legal/230348-endorphina-and-igt-among-latest-uae-licence-approvals/) [news]
- The new Civil Transactions Law (Federal Decree-Law No. 25 of 2025, in force 1 June 2026) drops the old civil-code gambling articles (1012–1021) — [Greenberg Traurig](https://www.gtlaw.com/en/insights/2026/1/uae-civil-code-gambling-provisions-removed) [secondary]
- INTERPRETATION: Zili's publisher SOCIALTECH SOLUTIONS - FZCO (IFZA/Dubai Silicon Oasis free zone) and Yalla Technology FZ-LLC would need a GCGRA licence for any chance game with real-money value; a free-zone trade licence for software/IT does not authorise gaming. GCGRA licences are few and go to large, vetted operators, so a small social app has no realistic route.

**Singapore – Gambling Control Act 2022 (in force 1 Aug 2022) and class licences**
- "Money's worth" in the Act covers "virtual credits, virtual coins, virtual tokens, virtual objects or any similar thing that is purchased within, or as part of, or in relation to, a game of chance" — [Reed Smith summary](https://reedsmith.com/en/perspectives/2022/09/singapore-enacts-new-laws-on-gambling); [Act on SSO](https://sso.agc.gov.sg/Act/GCA2022) [secondary quote; SSO returned 403 to this session]
- MHA second reading: "Online social gambling will continue to be disallowed. It is difficult, if not impossible, to ascertain whether participants are socially acquainted online." Part 4 Division 2 "introduces a class licence regime… for lower-risk gambling products, including mystery boxes, online games with gambling elements, and business promotion lucky draws… an operator does not need to apply for a licence… as long as the stipulated conditions… are met" — [MHA speech](https://www.mha.gov.sg/media-room/newsroom/second-reading-of-gambling-control-bill-and-gambling-regulatory-authority-of-singapore-bill/) [VERIFIED, primary]
- GRA: Remote Games of Chance "refer to remote games with chance-based elements where players can win prizes that are money, money equivalent and/or any thing of value. An example… is loot boxes"; conditions in the Gambling Control (Remote Games of Chance – Class Licence) Order 2022, effective 15 Aug 2022 (S 681/2022). Mystery boxes: "More details on the class licence conditions will be provided at a later date." — [GRA licences page](https://www.gra.gov.sg/licenses-approvals) [VERIFIED, primary]
- Secondary summaries: the Order distinguishes Type 1 (free-to-play) and Type 2 (games with transferable in-game items); games offering real-world prize payouts remain prohibited; a GRA consultation proposed allowing in-game player-to-player marketplaces but said operators must not buy back items from players. MHA indicated a $100 prize cap for mystery boxes — [search summary of IMDA advisory](https://imdaonline.imda.gov.sg/onlineservices/forms/VG_Adv_Remote_Games.pdf); [Sigma](https://sigma.world/news/singapore-regulator-rgoc-reforms-in-game-trading/); [Mothership](https://mothership.sg/2022/07/social-gambling-singapore-legal) [secondary; Order text not read: SSO 403, GRA advisory page is JS-only]
- INTERPRETATION: BIGO Technology Pte. Ltd. and Vshow Pte. Ltd. (Singapore) could only run chance features with no cash-out under the class licence; a chance game paid with bought coins whose winnings convert to money (diamonds → cash) would be unlicensed gambling under the GCA, unless it got a full gambling operator licence, which in practice only Singapore Pools and the casinos hold. Nivi's terms choose Singapore law and SIAC arbitration, which does not change where the gambling law bites.

**Turkey – state monopoly**
- Milli Piyango's licence was transferred to the Türkiye Wealth Fund (TVF) for 49 years in 2017; Sisal Şans was authorised by TVF for 10 years (from 1 Aug 2020) to run Milli Piyango, Sayısal and Hemen Kazan under MPİ supervision; the licence stays with TVF. Sports betting (İddaa) is a separate 10-year contract (Şans Girişim–Scientific Games venture) — [NTV](https://www.ntv.com.tr/ekonomi/milli-piyangoda-yeni-donemsisal-sans-1-agustosta-basliyor,ohENffvw0ECqADB5Pta95g); [Daily Sabah](https://www.dailysabah.com/business/2019/08/30/turkish-italian-venture-lands-national-lottery-operation-deal); [iGaming Business](https://www.igamingbusiness.com/news/sisal-sans-jv-wins-turkish-lottery-contract) [news]
- Law 7258 art. 5 punishes offering games of chance from abroad over the internet to Turkey, mediating money transfers for them, and advertising them; players face fines (2026: ₺103,207–412,995) — phase-1 note `turkiye_hukuku.md`, citing [hukukihaber.net](https://www.hukukihaber.net/7258-sayili-kanun-turk-ceza-kanunu-ve-kabahatler-kanunu-cercevesinde-yasa-disi-bahis-ve-kumar-suclari-uygulama-notlari/amp) [secondary]
- INTERPRETATION: no Turkish licence category exists for a private company's online casino, slot or "lucky gift" game; horse racing betting is TJK's, lottery is MPİ/TVF's (operated by Sisal Şans), sports betting is Spor Toto/İddaa's. A foreign licence (Curaçao, Malta, Anjouan) gives no right in Turkey.

### Inferences
- INTERPRETATION: In every home jurisdiction found (HK, UAE free zone, Singapore) a purchased-coin chance game with cash-out is either unlicensable (HK) or needs a licence these companies demonstrably don't have on readable registers (UAE GCGRA, Singapore GRA full licence). The companies' structure (HK/Dubai shells, Singapore arbitration) looks like a choice of places with no gambling licence route, not of places that licensed them.

### Gaps
- Exact current text of UAE Penal Code arts. 460–462 and of the Singapore RGoC Class Licence Order was not read from official sources (SSO 403; UAE portal not tried).
- The current state of the GRA marketplace/buy-back amendment and the mystery-box order (2025–2026) is unconfirmed.
- 7258 text from mevzuat.gov.tr not re-read here (phase-1 note says it failed to open).

## Q4. Takeaway for the report: what store presence does and does not prove

### Takeaway
Being live on Google Play or the App Store is **not** evidence that an app's chance features are legal. Apple and Google require a licence for real-money gambling per territory, but they review the app, not each server-side game turned on later in a given country; Turkey has blocked many such apps (29 video-chat apps in Aug 2025; 9 live-streaming apps incl. Bigo, MICO, SUGO, Poppo, SoulChill on 14 Feb 2026) while some stayed listed in other stores. "Not found on the registers" plus "store-listed" means the competitors run these features without any licence we can see, at their own legal risk, which is not a model Similar Club can copy.

### Cited findings
- Apple Guideline 5.3.3: apps "may not use in-app purchase to purchase credit or currency for use in conjunction with real money gaming of any kind"; 5.3.4 real-money gaming needs licensing for each location, geo-restriction and must be free — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (via phase-1 `timo_ve_sektor.md`) [primary]
- BTK blocks: ~29 video-chat/dating apps (decisions 20 Aug 2025) and 9 live-streaming apps on 14 Feb 2026; Poppo Live, SoulChill still listed in the TR App Store on 25 Nov 2026 — phase-1 `timo_ve_sektor.md`, citing [DonanımHaber](https://www.donanimhaber.com/29-goruntulu-sohbet-ve-flort-platformuna-erisim-engeli--195556) and [iTunes lookup](https://itunes.apple.com/lookup?id=1077137248&country=tr) [news/primary]

### Inferences
- INTERPRETATION: For Similar Club (a UK company serving Turkey), no register route makes purchased-coin chance games with diamond cash-out lawful in Turkey. Getting a Curaçao or Malta licence would not help in Turkey and would only add costs. The compliant designs are: chance features with no cash-out value, or cash-out with no chance (gifts only), not both.

### Gaps
- Whether app stores have removed any of these apps specifically for gambling was not checked here.
