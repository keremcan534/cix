# UK law and regulation for a UK (England & Wales) Ltd running a Turkey-facing social voice-room app (coins, gifts→diamonds→agency cash-out, chance games)

Research date: 25 November 2026. Research notes, not legal advice. Labels used below:
- VERIFIED = statute or regulator text read in this session (cited).
- SECONDARY = law-firm / trade-press / tax-firm source read in this session (cited).
- INTERPRETATION = researcher's reasoning, not a source; a UK solicitor (gambling + payments) must confirm.
- UNVERIFIED (training knowledge) = believed correct but NOT re-checked this session; listed under Gaps, must be checked before use.

Facts about the product relevant to the analysis (from the project brief/CLAUDE.md): users buy coins with real money; coins buy gifts sent to hosts; hosts earn "diamonds" that agencies cash out to bank/crypto (USDT); chance features played with purchased coins (slots/"Oyun Salonu", wheel/"Rüzgâr Gülü", "Şanslı hediye" random multipliers, "Oda roketi" random rewards); production server today is an Oracle VM in Frankfurt (i.e. not in Great Britain).

---

## Q1. Gambling Act 2005: is the design "gaming for a prize", and when do coins count as "money's worth"?

### Takeaway
Under s.6 Gambling Act 2005, gaming = playing a game of chance for a prize, and a prize is "money or money's worth". The Gambling Commission's long-standing position is that in-game items/currency that can be converted to cash or traded for value ARE money's worth, and gambling with them needs a licence "in exactly the same manner" as cashable casino chips. Because this app's economy has a cash-out leg (coins → gifts → diamonds → agency payout to bank/USDT), coins won in a chance game are very likely to be treated as money's worth — the closed-loop "social casino" safe harbour does not fit this design.

### Cited Findings
- VERIFIED s.6(1): "In this Act 'gaming' means playing a game of chance for a prize." s.6(2): game of chance includes games mixing chance and skill, and games presented as involving chance; excludes sport. s.6(4): a person plays for a prize if he thereby acquires a chance of winning a prize "whether or not he risks losing anything at the game". s.6(5): "prize" (other than for gaming machines) "(a) means money or money's worth, and (b) includes both a prize provided by a person organising gaming and winnings of money staked." s.6(6): Secretary of State may by regulations deem activities to be or not be a game/game of chance — [Gambling Act 2005 s.6](https://www.legislation.gov.uk/ukpga/2005/19/section/6)
- VERIFIED (UKGC guidance "Digital and virtual currencies"): virtual currencies "are unregulated and generally issued and controlled by developers"; "the ability to convert any in-game items into cash, or to trade them" gives them real-world value, making them "articles of money or money's worth"; where gambling uses such items "a licence is required in exactly the same manner" as with casino chips that can later be cashed out. The page links to the UKGC position paper on virtual currencies, eSports and social casino gaming and the August 2016 discussion paper; it does not mention loot boxes — [UKGC: Digital and virtual currencies](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/digital-and-virtual-currencies)
- SECONDARY: UKGC discussion paper August 2016, position paper March 2017; Commission's view on virtual currencies unchanged between them; licence required where "skins" are traded or tradeable and so act as a de facto virtual currency and facilities for gambling with them are offered; for social casino (no cash-out) the Commission found "not sufficient risk to justify the introduction of additional gambling regulation" but reserved the right to act — [CMS: Further clarification](https://cms.law/en/gbr/legal-updates/further-clarification-of-the-gambling-commission-s-position-on-virtual-currencies-esports-and-social-gaming2); [Kemp Little](https://kemplittle.com/blog/the-gb-gambling-commissions-position-on-esports-virtual-currencies-and-social-casino-gaming); UKGC paper page: [UKGC discussion paper](https://www.gamblingcommission.gov.uk/about-us/page/virtual-currencies-esports-and-social-gaming-discussion-paper)
- VERIFIED (UKGC news, 7 Feb 2017, FutGalaxy): Dylan Rigby and Craig Douglas, directors of Game Gold Tradings Ltd, pleaded guilty (6 Feb 2017) to Gambling Act offences: providing unlicensed betting and gaming facilities and advertising unlawful gambling, as officers whose consent/connivance/negligence was involved. Penalties: Rigby £174,000, Douglas £91,000 (fines + costs). Mechanism: customers bought virtual "FUT coins" and gambled with them; coins could be converted into FIFA coins sold for real money on an unauthorised secondary market in which Rigby had an interest. Judge called it "very grave"; a 12-year-old was filmed gambling on the site. CEO: "All websites offering gambling facilities in Britain must be licensed." — [UKGC: Two men convicted](https://www.gamblingcommission.gov.uk/news/article/two-men-convicted-after-offering-illegal-gambling-parasitic-upon-popular)
- SECONDARY: a UKGC FOI list shows a prosecution of Sorare (football fantasy/NFT site) for providing unlicensed gambling facilities to GB consumers, trial listed 15 June 2026, Birmingham Magistrates' Court; outcome not found — via search summary of [UKGC FOI: deployment of prosecutorial powers](https://www.gamblingcommission.gov.uk/about-us/freedomofinformation/deployment-of-prosecutorial-powers) (not opened directly; verify).
- SECONDARY: no skins-specific UKGC prosecution in 2024–2025 was found in this session's searches — [Pinsent Masons Out-Law](https://www.pinsentmasons.com/out-law/news/gambling-regulator-secures-landmark-prosecutions-in-e-sports-betting-case); [iGaming Business](https://igamingbusiness.com/casino-games/gambling-commission-ramps-up-action-against-illegal-skins-and-esports-sites/)

### Inferences
- INTERPRETATION — transferability is the key fact. FutGalaxy shows that a coin which the operator itself never redeems can still be "money's worth" if a secondary route turns it into cash. In this app the route is built in: chance winnings (coins) → gift to a host → host's diamonds → agency cash-out to bank/USDT. A colluding user + host (or a user who is also a host via an agency) can turn chance winnings into cash. On the UKGC's stated test ("ability to convert ... into cash, or to trade them") the coins are very likely money's worth, so: "Şanslı hediye" multipliers, slots, wheel and room-rocket rewards = games of chance for a prize = gaming (s.6). Rocket/raffle-style mechanics where users pay in and winners are drawn could alternatively be a lottery (s.14) — needs solicitor analysis.
- INTERPRETATION — features that are NOT gambling on their own: buying coins and gifting them (no chance), hosts earning diamonds and being paid (a payment for content/services, not a prize). The legal problem arises only from combining chance + paid entry + a prize that is cash-convertible.
- INTERPRETATION — routes that would take chance features outside the Gambling Act definition (each needs solicitor confirmation): (a) remove chance features entirely; (b) make chance prizes non-cashable and non-transferable: rewards credited to a separate "game coin"/bonus balance that can never be gifted, never becomes diamonds and never reaches cash-out (a true closed loop) — the UKGC's 2017 social-casino position then applies; (c) free-to-play only (no purchased-coin stake) — note s.6(4)(b) means a prize game is gaming even when nothing is risked, so free entry alone is not enough if the prize is money's worth; the prize side must be closed-loop too; (d) cosmetic-only prizes (badges, frames) with no coin/diamond value. Ring-fencing must be technical (separate ledger, no conversion path), not just terms of service.
- INTERPRETATION — directors' personal exposure: FutGalaxy was prosecuted against directors as officers (consent/connivance/neglect), so the owners personally carry the risk, not only the company.

### Gaps
- The full text of the 2017 UKGC position paper was not retrieved (only the Commission's guidance page and law-firm summaries).
- UNVERIFIED (training knowledge): Gambling Act s.4 (remote gambling = gambling via internet/phone etc.), s.5 (facilities for gambling; providing equipment/opportunity), s.9 (betting), s.14 (lottery: payment to participate + prizes allocated by chance), s.33 (offence of providing facilities for gambling without an operating licence, max. on summary conviction 51 weeks' imprisonment and/or fine) — check at https://www.legislation.gov.uk/ukpga/2005/19/contents.
- UNVERIFIED (training knowledge): DCMS "Government response to the call for evidence on loot boxes" (July 2022) decided not to bring loot boxes into the Gambling Act and backed industry-led principles (e.g. no under-18 purchase without parental consent); Gambling Act review white paper "High stakes" (April 2023) and follow-ups (stake limits for online slots £5/£2 for 18–24s from 2025; statutory levy from April 2025). These were not re-checked this session.
- No UKGC statement found that directly addresses "gift to a host who cashes out" economies (live-streaming/voice-room gifting). This is a novel fact pattern; a written solicitor opinion is needed.

---

## Q2. Territorial scope: does a UK company commit an offence if it offers chance games only to Turkish users, with servers in Germany?

### Takeaway
VERIFIED: s.33 (unlicensed provision) applies to remote gambling only if (a) at least one piece of "remote gambling equipment" is in Great Britain, or (b) none is, but the facilities are used in GB and the provider knows or should know that. Company registration in the UK is not itself the trigger — equipment location and GB use are. A UK Ltd with all gambling equipment outside GB and GB users blocked is likely outside s.33, but the company and directors remain exposed to Turkish criminal law, and UK money-laundering law (POCA) on proceeds of crime committed abroad.

### Cited Findings
- VERIFIED s.36(1): for s.33 "it is immaterial whether facilities are provided (a) wholly or partly by means of remote communication; (b) ... inside the United Kingdom, outside the United Kingdom, or partly inside and partly outside." s.36(3) (as substituted by the Gambling (Licensing and Advertising) Act 2014, in force 1 Nov 2014): s.33 applies to remote gambling only if "(a) at least one piece of remote gambling equipment used in the provision of the facilities is situated in Great Britain, or (b) no such equipment is situated in Great Britain but the facilities are used there." s.36(3A): in case (b), offence only if the person "knows or should know that the facilities are being used, or are likely to be used, in Great Britain." s.36(4): "remote gambling equipment" = equipment used by or on behalf of the provider "(a) to store information relating to a person's participation in the gambling, (b) to present ... a virtual game ... (c) to determine all or part of a result or of the effect of a result, or (d) to store information relating to a result." s.36(5) excludes the player's own equipment — [Gambling Act 2005 s.36](https://www.legislation.gov.uk/ukpga/2005/19/section/36)
- SECONDARY (parliamentary answer summarised in search): the UKGC "expects operators to obey the laws of other jurisdictions in which they operate", requires them to report regulatory investigations/findings abroad, and to tell the Commission about a substantial customer base outside Britain; if operators are not acting lawfully abroad the Commission "will re-assess their suitability" to hold a GB licence — [Parallel Parliament: Gambling licensing question](https://parallelparliament.co.uk/question/9080/gambling-licensing)
- SECONDARY (UKGC FOI summarised in search): the Commission "does not provide a list of jurisdictions" licensees may or may not serve and expects operators to do their own due diligence — [UKGC FOI: online gambling licence restricted countries](https://www.gamblingcommission.gov.uk/about-us/freedomofinformation/online-gambling-licence-restricted-countries); UKGC also has a guidance page titled "Jurisdictions into which gambling businesses may not provide services" (not opened this session) — [UKGC page](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/jurisdictions-into-which-gambling-businesses-may-not-provide-services)

### Inferences
- INTERPRETATION — "equipment" is wide (storing participation info, determining results, storing results). If the RNG and ledger run in Frankfurt, but backups, an admin/finance panel database, a staging server or a developer laptop holding result data sit in the UK, case (a) could be met. A GB footprint audit (servers, backups, panel, logs) is needed before relying on s.36.
- INTERPRETATION — a UKGC licence cannot "cover" Turkish customers: the licence authorises provision under GB law only; the Commission itself expects compliance with foreign law and would treat knowingly serving a prohibiting country (Turkey) as a suitability issue. So a UKGC remote casino licence does not make chance games lawful for Turkish users and could be put at risk by them.
- INTERPRETATION — even with s.33 out of reach, offering unlicensed gambling to Turkish residents is a crime in Turkey; proceeds of that conduct may be "criminal property" for UK POCA 2002 purposes (dual-criminality test for overseas conduct), exposing the UK company, its bank and directors. Solicitor to confirm.

### Gaps
- UNVERIFIED: POCA 2002 ss.327–329 and s.340(2) (criminal conduct includes conduct abroad that would be an offence in the UK) and the overseas-conduct defence in s.327(2A) — not re-checked.
- Whether a UK-registered company with no GB equipment and GB users blocked has any UKGC reporting duty: none found.

---

## Q3. If chance games stay and GB users are served: which UKGC licences, costs, LCCP duties, timeline?

### Takeaway
A remote casino operating licence (covers slots, wheel, random-multiplier games) plus a personal management licence for key people; whoever supplies/manufactures the game software (incl. in-house RNG) needs a remote gambling software licence. Proposed fees from 1 Oct 2026 (smallest bands): remote casino ~£8,185 application + £7,000/yr; software ~£7,212 + £7,394/yr; PML £463. Ongoing LCCP compliance (age/ID verification before play, AML, safer gambling, RTP/game testing) — a heavy, multi-month project, unrealistic for a team without compliance staff, and it would not legalise Turkey.

### Cited Findings
- VERIFIED (DCMS government response on Gambling Commission fees): changes "will come into effect from 1 October 2026" via secondary legislation (page said not yet in force when published). Remote casino operating licence, by gross gambling yield (GGY): F1 <£250,000 annual £7,000 / application £8,185; F2 £250k–£875k £12,375 / £14,483; F3 £875k–£3m £19,569 / £25,628; G1 £3m–£10.5m £27,337 / £40,475. Personal management licence application and maintenance fee £370 → £463 (+25%). Remote gambling software licence (by gross sales): F1 <£875k annual £7,394 / application £7,212; F2 £875k–£3m £13,756 / £13,307 — [GOV.UK: Government response, fees from 1 Oct 2026](https://www.gov.uk/government/consultations/proposed-changes-to-gambling-commission-fees/outcome/government-response-to-the-propsals-for-changes-to-gambling-commission-fees-from-1-october-2026)
- SECONDARY: the previous UKGC remote casino page showed F1 (<£550,000 GGY) application £4,224 and G1 (£550k–£2m) £10,323 — pre-October-2026 bands — [UKGC: Remote casino operating licence](https://www.gamblingcommission.gov.uk/licensees-and-businesses/licences-and-fees/remote-casino-operating-licence)
- SECONDARY (LCCP): licence condition 8.1.1 allows display of foreign licences to GB screens only if it is plain that GB gambling relies on the UKGC licence; key-event reporting covers grant/refusal/withdrawal of foreign gambling permissions — search summary of [UKGC LCCP condition 8.1.1](https://www.gamblingcommission.gov.uk/consultation-response/changes-to-licence-condition-8-1-display-of-licensed-status/final-wording-of-amended-licence-condition-8-1-1); AML condition for operators based in foreign jurisdictions exists: [LCCP 12.1.2](https://www.gamblingcommission.gov.uk/licensees-and-businesses/lccp/condition/12-1-2-anti-money-laundering-measures-for-operators-based-in-foreign)

### Inferences
- INTERPRETATION — with GB users blocked and no GB equipment, no UKGC licence is needed (Q2), but that does not make the chance games lawful anywhere: Turkey prohibits them. A UKGC licence is therefore the wrong tool for this business; the realistic choices are (1) remove chance features, (2) close the loop (Q1), or (3) obtain a licence in, and serve only, countries that permit it — a different business.

### Gaps
- Confirm the 2026 fee regulations were actually made and are in force (SI number not found).
- UNVERIFIED (training knowledge, must check current LCCP and RTS): age and identity verification before deposit/play (LCCP social responsibility code 3.2.11 / RTS), RTS 7 (game info incl. RTP display), RTS 9 (RNG), independent test house testing, AML policies under LCCP 12.1.1 and MLR 2017 (remote casinos are "relevant persons" under MLR reg 8/14 — casinos only), customer interaction guidance, online slots stake limits, statutory levy; typical licensing timeline (UKGC target ~16 weeks but often longer). None re-verified this session.

---

## Q4. Payments and financial regulation of the coins→diamonds→agency payout chain (PSRs 2017, EMRs 2011, crypto, MLR, ECCTA, sanctions)

### Takeaway
Coins sold for the operator's own content sit in the limited-network/own-goods space, but the diamond cash-out turns the operator into the party moving value from payers (gift buyers) to third parties (hosts, via agencies). Whether that is a regulated payment service (money remittance) or e-money depends on structure; the commercial-agent exclusion is narrow. Paying in USDT through the company adds crypto-regime questions: FCA MLR registration today and FSMA authorisation from 25 Oct 2027. A UK payments solicitor must review the payout design.

### Cited Findings
- VERIFIED (PSRs 2017 Sch.1 Part 2, excluded activities, partial quotes): para 2(b) — "payment transactions between the payer and the payee through a commercial agent authorised in an agreement" [to negotiate/conclude on behalf of only the payer or only the payee]; para 2(k) — "services based on specific payment instruments that can be used only in a limited way" that "allow the holder to acquire goods or services only within a limited network of service providers" [or a limited range]; para 2(l) — electronic-communications-provider purchases of digital content, provided "the value of any single payment transaction does not exceed £40" and "the cumulative value ... for an individual subscriber in a month does not exceed £240" — [PSRs 2017 Sch.1 Pt 2](https://www.legislation.gov.uk/uksi/2017/752/schedule/1/part/2)
- VERIFIED-SECONDARY (FCA): MLR reg 14A cryptoasset exchange provider = exchanging cryptoassets for money, money for cryptoassets or crypto-to-crypto, arranging such exchanges, operating crypto ATMs; custodian wallet provider = safeguarding cryptoassets/private keys for customers; registration duty in regs 8L and 9; registration is AML/CTF only — [FCA: Cryptoassets – who needs to register](https://www.fca.org.uk/firms/cryptoassets/who-needs-register); [FCA: AML/CTF regime](https://www.fca.org.uk/firms/financial-crime/cryptoassets-aml-ctf-regime)
- VERIFIED (FCA): new cryptoasset regime under the Financial Services and Markets Act 2000 (Cryptoassets) Regulations 2026 starts 25 October 2027; authorisation gateway opened 30 September 2026; application window closes 28 February 2027; firms not applying must run off UK cryptoasset business before 25 Oct 2027; final rules published 30 June 2026 — [FCA: New regime for cryptoasset regulation](https://www.fca.org.uk/firms/new-regime-cryptoasset-regulation); [FCA: what you need to do](https://www.fca.org.uk/firms/new-regime-cryptoasset-regulation/what-you-need-to-do); [Pinsent Masons](https://www.pinsentmasons.com/out-law/analysis/fca-finalises-cryptoasset-regime-2027-authorisation-deadline)

### Inferences
- INTERPRETATION — coins: bought from the operator and spent only on the operator's own gifts/content → likely not e-money and not a payment instrument outside the limited-network idea (operator's own goods). Selling via Google Play/App Store, the store is the payment processor.
- INTERPRETATION — diamonds: a host's diamond balance is a claim on the operator, redeemable in money, funded by third parties' coin purchases. If diamonds are characterised as a monetary value stored for the purpose of payment transactions and accepted by persons other than the issuer, the EMRs could bite; if they are characterised as the operator's own remuneration for hosts' services (the operator buys hosts' content and pays them, like a revenue share), it is a normal commercial payment, not a payment service. Design and contracts should make the operator pay hosts/agencies its own money for services under a contract (revenue share), never "transfer the user's money to the host". Solicitor must confirm.
- INTERPRETATION — the commercial-agent exclusion (2(b)) requires the agent to act for only one side; an agency that collects for hosts and is also paid by the platform is a poor fit. Agencies receiving and passing on hosts' money may themselves be doing money remittance (in Turkey that is a Turkish-law question under Law 6493).
- INTERPRETATION — USDT payouts: if the company merely pays its own suppliers in USDT from its own wallet, it is a payer, probably not an "exchange provider" or custodian for customers; if it converts users'/hosts' balances to crypto as a service, holds crypto for them or arranges exchanges, MLR registration (now) and FCA authorisation (from 25 Oct 2027) become relevant. Also bank de-risking: UK banks often refuse gambling/crypto-linked flows.
- INTERPRETATION — MLR 2017: an unlicensed social app is not a "relevant person" (casino limb covers licensed casinos only), so MLR duties do not apply directly, but POCA principal offences and Terrorism Act duties apply to everyone; a cash-out economy is a classic laundering channel (stolen cards → coins → gifts → colluding host → cash). Expect banks/PSPs to demand KYC on payees regardless.

### Gaps
- PSRs 2017 Sch.1 Part 1 money remittance definition and reg 2 definitions not retrieved; FCA PERG 15 (Q&A on limited network, commercial agents, gaming) not retrieved this session.
- EMRs 2011 reg 2 definition of electronic money and reg 3 exclusions not retrieved; FCA PERG 3A not retrieved.
- UNVERIFIED (training knowledge): Economic Crime and Corporate Transparency Act 2023 s.199 "failure to prevent fraud" in force 1 September 2025, applies only to "large organisations" (2 of 3: >250 employees, >£36m turnover, >£18m assets) — a small company is likely out of scope, but the ECCTA "identification doctrine" reform (senior manager's offences attributed to the company, s.196) applies to all companies. Not re-checked.
- UNVERIFIED: OFSI sanctions (Sanctions and Anti-Money Laundering Act 2018 regimes; strict civil liability for breaches) — payouts to persons in Russia/Iran/Syria etc. or via sanctioned crypto addresses; screening of agencies/hosts needed. Not re-checked.

---

## Q5. UK consumer law (DMCC Act 2024, CMA, CRA 2015)

### Takeaway
UK consumer law protects consumers in the UK; for a Turkey-only user base its direct reach is limited, but if any UK users exist the DMCC Act price-transparency (drip pricing) rules, in force since 6 April 2025 and enforced directly by the CMA with fines, apply to in-app currency offers.

### Cited Findings
- SECONDARY: DMCC Act consumer-protection provisions commenced 6 April 2025; CMA published final price-transparency (drip pricing) guidance on 18 November 2025 and opened its first 8 DMCC investigations with advisory letters to 100 more businesses — [Osborne Clarke](https://www.osborneclarke.com/insights/uk-cma-finalises-guidance-price-transparency-under-dmcca-and-begins-enforcement-action); [SCL](https://www.scl.org/cma-issues-final-price-transparency-guidance-and-launches-first-investigations-under-dmcc-act/); [TLT](https://www.tlt.com/insights-and-events/insight/eight-enforcement-cases-and-a-hundred-warnings)
- SECONDARY: free-to-play games requiring an amount of in-game currency to access features/progress are an example to consider under "mandatory charges" in the drip-pricing rules — [DLA Piper, Sept 2025](https://www.dlapiper.com/insights/publications/2025/09/games-may-have-drip-but-no-drip-pricing---a-new-era-for-video-games-and-online-content)

### Inferences
- INTERPRETATION — good practice regardless of jurisdiction: show real-money price next to every coin bundle, don't let coin bundle sizes force leftover balances without disclosure, show odds for chance features, and never target minors. Turkish consumer law (Law 6502 and its distance-contract regulation) will be the main regime for Turkish users — outside this note's scope.

### Gaps
- UNVERIFIED: CMA's 2020–2021 online-games principles / in-game currency undertakings, and the EU CPC Network "key principles on in-game virtual currencies" (March 2025) — the latter is EU, not UK, but signals regulatory direction; not re-checked.
- UNVERIFIED: Consumer Rights Act 2015 Part 1 Ch.3 digital content (satisfactory quality, fit for purpose, as described); DMCC Act subscription-contract rules (Part 4 Ch.2) — commencement delayed, expected not before spring 2026 or later; confirm status.

---

## Q6. Online Safety Act 2023: does it apply with few/no UK users?

### Takeaway
VERIFIED: a user-to-user service is regulated only if it "has links with the United Kingdom": a significant number of UK users, UK as a target market, or (risk limb) capable of use in the UK with a material risk of significant harm to UK individuals from user content. Voice rooms with chat are user-to-user services. If UK access is blocked or negligible and the UK is not targeted, the OSA likely does not apply; if UK users are present, illegal-harms and children's risk assessments and highly effective age assurance duties follow.

### Cited Findings
- VERIFIED s.4(5): a service "has links with the United Kingdom" if "(a) the service has a significant number of United Kingdom users, or (b) United Kingdom users form one of the target markets for the service (or the only target market)." s.4(6): also if "(a) the service is capable of being used in the United Kingdom by individuals, and (b) there are reasonable grounds to believe that there is a material risk of significant harm to individuals in the United Kingdom presented by ... user-generated content" — [Online Safety Act 2023 s.4](https://www.legislation.gov.uk/ukpga/2023/50/section/4)

### Inferences
- INTERPRETATION — UK incorporation alone does not create "links with the UK". The s.4(6) risk limb is the danger: an 18+ live voice app with private rooms, gifting and cash-out (grooming/sexual exploitation risk) that is reachable from the UK could arguably meet it. A UK geo-block (store availability + IP) plus not marketing to the UK is the cleanest mitigation. Turkish Law 5651 (internet law, social network provider obligations, amended for digital game platforms) is the regime that actually governs content for Turkish users.

### Gaps
- UNVERIFIED (training knowledge): Ofcom illegal-harms duties enforceable from 17 March 2025; children's risk assessment due by 24 July 2025 and protection-of-children codes in force 25 July 2025 (highly effective age assurance). Not re-checked.
- Turkish Law 5651 amendments for "digital game platforms" — sources exist ([CMS Türkiye](https://cms.law/en/tur/legal-updates/tuerkiye-s-amends-internet-law-with-new-framework-for-digital-game-platforms-and-enhanced-obligations-for-social-network-providers); [Chambers](https://chambers.com/articles/a-new-era-for-children-and-gaming-in-turkey)) but were not read; another researcher should cover them.

---

## Q7. Data protection (UK GDPR, transfers to Turkey, KVKK)

### Takeaway
Not researched in depth this session (tool budget). Key points below are UNVERIFIED and must be checked.

### Cited Findings
- No sources retrieved this session.

### Inferences
- INTERPRETATION — a UK controller is subject to UK GDPR / DPA 2018 for all processing in the context of its UK establishment, whoever the users are; sending personal data to Turkey (agencies, Turkish staff, payout partners) is a restricted transfer requiring an IDTA / UK Addendum to EU SCCs plus a transfer risk assessment (Turkey has no UK adequacy regulations — UNVERIFIED). In parallel Turkish KVKK applies to processing of Turkish residents' data; its 2024 amendments (Law 7499, in force 1 June 2024) introduced standard contracts for transfers abroad, notified to the KVKK Board within 5 business days (UNVERIFIED). Voice recordings, ID documents for payouts, and payment data are high-risk.

### Gaps
- UK adequacy list, ICO transfer guidance, KVKK Article 9 as amended, VERBIS registration duty for foreign controllers — all need checking.

---

## Q8. Tax (UK corporation tax, VAT, Turkish VAT on e-services, Turkish DST, payments to hosts)

### Takeaway
Turkey requires foreign providers of electronic services to Turkish non-business consumers to register (simplified "VAT No. 3" regime) and declare Turkish VAT; Turkish DST (Law 7194) only applies above €750m global and TRY 20m Turkish in-scope revenue, so it is very unlikely to apply to this company; its rate is 5% in 2026 and 2.5% from 2027. UK corporation tax applies to the UK company's worldwide profits.

### Cited Findings
- SECONDARY: under Turkish VAT Law 3065 art. 9 (amended, in force 1 Jan 2018), non-resident electronic service providers supplying non-VAT-registered individuals in Turkey must register electronically for VAT ("VAT No. 3") and declare output VAT; a form on the Turkish Revenue Administration (GİB) website must be completed before the first return — [Rödl & Partner](https://roedl.com/insights/turkey-vat-return-electronic-service-providers); [International Tax Review](https://www.internationaltaxreview.com/article/3784363/turkey-new-vat-liability-for-non-resident-electronic-service-providers); [Avalara VATlive](https://www.avalara.com/vatlive/en/country-guides/asia/turkey/turkish-vat-electronic-services.html)
- SECONDARY (conflict): standard Turkish VAT rate 20% since Law 7456 (July 2023) per a Turkish law-firm blog; older sources say 18% — [Istanbul Law Firm blog](https://istanbullawyerfirm.com/blog/turkish-tax-law-foreign-ecommerce) (same source describes art. 9 as reverse-charge, which conflicts with Rödl/ITR's registration description — prefer Rödl/ITR).
- SECONDARY (EY): Turkish DST rate cut by Presidential Decision No. 10767 (Official Gazette 25 Dec 2025) to 5% from 1 Jan 2026 and 2.5% from 1 Jan 2027 (was 7.5% from 1 March 2020); thresholds: Turkey in-scope revenue > TRY 20m AND global revenue > €750m in the preceding period; scope includes online content sales and digital platform services; applies regardless of residence/PE — [EY Global Tax News, 6 Jan 2026](https://globaltaxnews.ey.com/news/2026-0117-turkiye-revises-digital-service-tax-rate-for-2026-and-2027); earlier rate: [EY 2020](https://globaltaxnews.ey.com/news/2020-5068-turkeys-75-percent-digital-services-tax-to-be-effective-1-march-2020)

### Inferences
- INTERPRETATION — if coins are sold through Google Play / App Store, the store may act as the party collecting and remitting Turkish VAT on the sale (marketplace model); direct web sales by the UK company would make the company itself liable to register in Turkey. Confirm with a Turkish tax adviser.
- INTERPRETATION — the company's UK VAT position on B2C e-services to Turkish consumers: place of supply is generally where the consumer belongs, so outside the scope of UK VAT (UNVERIFIED; HMRC VAT Notice 741A).
- INTERPRETATION — payments to Turkish hosts/agencies: Turkish withholding (e.g. on payments to Turkish individuals for services) and Turkish income tax obligations are mostly on the payee side when the payer is a non-resident without a PE; but a Turkish office, staff or dependent agents (agencies acting habitually for the company) could create a Turkish permanent establishment under the UK–Turkey double tax treaty. Transfer pricing only if there are related Turkish entities. Needs Turkish + UK tax advice.

### Gaps
- Turkish e-VAT and GİB official text (rate, registration portal) not read directly; Turkish "Elektronik Hizmet Vergisi" as a separate tax not found — the regime appears to be VAT art. 9 + DST, not a separate e-service tax.
- UK–Turkey double tax treaty PE article; Turkish withholding on payments abroad/at home (GVK art. 94) — not checked.
- Gambling taxes (UK Remote Gaming Duty, Turkish taxes) if chance games are kept — not checked.

---

## Q9. Hosts and agencies: workers or contractors? Modern slavery / exploitation

### Takeaway
Not researched with sources this session. Hosts are in Turkey, so Turkish labour law is primarily relevant; UK employment status law matters only for UK-based hosts.

### Cited Findings
- No sources retrieved this session.

### Inferences
- INTERPRETATION — UK status tests (employee / "worker" / self-employed) look at control, personal service and dependence; target-setting, minimum online hours and pay per hour set by the platform push hosts toward "worker" (UNVERIFIED: Uber BV v Aslam [2021] UKSC 5). Agency structures where agencies take large cuts, recruit young women and set hours carry exploitation/trafficking red flags; the Modern Slavery Act 2015 s.54 statement duty applies only at £36m+ turnover (UNVERIFIED), but criminal and reputational risk applies regardless. Contracts should make hosts independent contractors of agencies, with platform-level rules against coercion, ID/age checks (18+), and a complaint route.

### Gaps
- Turkish labour/social-security status of hosts; Turkish law on private employment agencies (İŞKUR licence) for agencies recruiting hosts; UK case law — all unverified.

---

## Q10. Country restrictions for chance features; Turkey's position

### Takeaway
Turkey prohibits online gambling not licensed by the state (Law 7258 and Law 5651 blocking powers), with heavy and increasing enforcement; chance features with purchased coins and a cash-out leg should be treated as prohibited for Turkish users. The UKGC publishes no list of forbidden countries and leaves compliance with foreign law to operators.

### Cited Findings
- SECONDARY: Law 7258 criminalises operating or enabling gambling without a licence, often prosecuted together with money laundering and fraud; Turkey reportedly blocked 548,420 illegal betting/gambling sites 2006–2025, 84,000 in 2025; penal-code overhaul with tougher prison terms and fines and Presidency blocking orders reported for 2026 (status of enactment inconsistent across sources) — [iGaming Expert: Turkey illegal gambling](https://igamingexpert.com/features/turkey-illegal-gambling/); [iGaming Expert: Turkey penal code](https://igamingexpert.com/features/turkey-penal-code/); [iGaming Business: crackdown](https://igamingbusiness.com/legal-compliance/turkish-authorities-illegal-betting-crackdown-ministers-claim-link-addiction/); [Casinos.com: $365m seizure](https://www.casinos.com/news/turkish-authorities-seize-365m-in-illegal-betting-crackdown)
- SECONDARY: UKGC does not provide a list of jurisdictions licensees may/may not serve; operators must do their own due diligence — [UKGC FOI](https://www.gamblingcommission.gov.uk/about-us/freedomofinformation/online-gambling-licence-restricted-countries)

### Inferences
- INTERPRETATION — for a social app with chance features, the usual "do not serve / geo-block" set includes Turkey, UAE, Saudi Arabia, Qatar, Kuwait and other states that ban gambling outright, mainland China, and also jurisdictions where social casino with purchasable coins has been litigated (e.g. Washington State, USA — Kater v Churchill Downs, UNVERIFIED). Google Play's real-money gambling and "simulated gambling" policies and Apple's App Review guideline 5.3 also constrain chance features with paid coins (UNVERIFIED this session). Because Turkey is the core market, geo-blocking Turkey is not viable: the feature design itself has to change.

### Gaps
- Official text of Law 7258 and the 2025–2026 amendments (Resmî Gazete) not read; penalty ranges not verified. Country-by-country survey not done (tool budget).

---

## Q11. Overall legal map (synthesis — INTERPRETATION throughout, built on the findings above)

### Takeaway
As designed, the combination "paid coins + chance games + coins giftable to hosts whose diamonds are cashed out" is the FutGalaxy pattern: in the UK it would be unlicensed gaming if GB users or GB equipment are involved, and in Turkey it is illegal gambling irrespective of UK law. The low-risk path is to break the link between chance and cash: no chance features with purchased coins, or chance rewards in a separate non-transferable, non-cashable balance.

### Cited Findings
- Prize = "money or money's worth" — [Gambling Act s.6](https://www.legislation.gov.uk/ukpga/2005/19/section/6); convertible/tradeable items = money's worth, licence needed — [UKGC guidance](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/digital-and-virtual-currencies); secondary-market conversion prosecuted — [UKGC FutGalaxy](https://www.gamblingcommission.gov.uk/news/article/two-men-convicted-after-offering-illegal-gambling-parasitic-upon-popular); territorial trigger = GB equipment or GB use — [s.36](https://www.legislation.gov.uk/ukpga/2005/19/section/36)

### Inferences
- Lawful as designed (UK view, subject to solicitor): selling coins, gifting, paying hosts/agencies a revenue share from the company's own funds under contract, voice rooms — provided GB users are blocked or OSA duties are met, data transfers are papered, and Turkish VAT is handled.
- Needs licence / high risk: Şanslı hediye, slots/Oyun Salonu, Rüzgâr Gülü wheel, Oda roketi random rewards — all, while coins can reach cash-out. A UKGC remote casino licence would not solve Turkey and is disproportionate.
- Needs payments review: diamond cash-out structure (EMRs/PSRs), agencies handling host money, USDT payouts (MLR reg 14A now, FSMA crypto authorisation from 25 Oct 2027).
- Changes that take chance features outside regulation (to be confirmed by solicitor): (1) remove them; (2) chance rewards only in a separate "game coin" balance that cannot be gifted, converted to diamonds, transferred or cashed out, with server-side enforcement and no coin purchases feeding that balance directly as a stake, or (3) cosmetic-only prizes; plus (4) block GB users and keep all game/RNG/ledger equipment outside GB as a second line of defence (not a substitute, because Turkish law still applies).
- Points that must go to a UK solicitor in writing: whether gift-to-host cash-out makes coins money's worth; whether a closed-loop game-coin redesign is outside s.6/s.14; s.36 equipment footprint; EMR/PSR status of diamonds and agency flows; POCA exposure from Turkish illegality; crypto payouts. Turkish counsel: Law 7258 status of current and redesigned features; Law 5651 obligations; VAT No. 3 registration; agency licensing.

### Gaps
- No court decision or UKGC statement found specifically on live-streaming gift economies with cash-out; the analysis is by analogy to skins/FutGalaxy.
