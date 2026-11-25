# Zili (App Store id 6746039929): competitor dossier

All sources accessed 2026-11-25 unless noted otherwise. Identity confirmed via iTunes lookup for id 6746039929, which returns bundleId `com.vitalk.ios`, seller "SOCIALTECH SOLUTIONS - FZCO". The Android twin is `com.vitalk.android`, which uses the same `vitalk` naming and the same developer.

Name collisions to avoid:
- "Vitalk" (`health.tnh.vitalk`) is an unrelated Brazilian mental-health app.
- `sikayetvar.com/zil` is a different brand.

Method: public store pages, the iTunes lookup API, Google Play HTML, the developer's linked legal pages and web search only. No account, no APK/IPA download, nothing behind a login.

## 1. Who is the developer, where is it registered, and are there sister apps?

### Takeaway
Both stores name SOCIALTECH SOLUTIONS - FZCO as the publisher, a Dubai free-zone company with an address at "DSO-IFZA, Dubai Silicon Oasis". Zili's own Privacy Policy and Terms, however, name a different entity: GLOBJOY UNITED LIMITED, a Hong Kong company. The same developer publishes a second app, "Zili Chat" (`com.zili.android`). I could not confirm either company in a public registry.

### Cited Findings
**App Store listing**
- The App Store "Seller" is SOCIALTECH SOLUTIONS - FZCO (developer id 1814806609). Its developer page lists only one app, Zili. — [App Store TR](https://apps.apple.com/tr/app/zili/id6746039929); [Developer page](https://apps.apple.com/tr/developer/socialtech-solutions-fzco/id1814806609?platform=iphone); [iTunes lookup](https://itunes.apple.com/lookup?id=6746039929&country=tr)
- The App Store lists no seller website (`sellerUrl` = null). The only contact is contact@socialtech.info. — [iTunes lookup](https://itunes.apple.com/lookup?id=6746039929&country=tr); [App Store TR](https://apps.apple.com/tr/app/zili/id6746039929)
- The App Store links its privacy policy and terms to vitalk.net: https://www.vitalk.net/privacy.html and https://www.vitalk.net/terms.html. The vitalk.net home page shows only the word "Zili". — [App Store TR](https://apps.apple.com/tr/app/zili/id6746039929); [vitalk.net](https://www.vitalk.net/)

**Google Play listing**
- The Google Play developer is SOCIALTECH SOLUTIONS - FZCO, contact email socialtechfzco@gmail.com.
- The listed address is "DSO-IFZA IFZA Properties Dubai Silicon Oasis, إمارة دبيّ (Dubai), United Arab Emirates", phone +971 58 561 1686.
- No D-U-N-S number is shown.
- The listed website is https://www.vitalk.net/.
- Source: [Google Play com.vitalk.android](https://play.google.com/store/apps/details?id=com.vitalk.android&hl=en&gl=TR)

**Legal documents**
- The Privacy Policy (last updated 9 May 2025) says the platform is provided and controlled by GLOBJOY UNITED LIMITED, at RM B3, 19/F, Tung Lee Commercial Building, 91-97 Jervois Street, Sheung Wan (Hong Kong). — [vitalk.net/privacy.html](https://www.vitalk.net/privacy.html)
- The Terms (last updated 9 May 2025) also name GLOBJOY UNITED LIMITED and choose Hong Kong law. — [vitalk.net/terms.html](https://www.vitalk.net/terms.html)

**Sister app: Zili Chat**
- Package `com.zili.android`, same developer and address, 100K+ installs (embedded count 158,216), PEGI 18, updated 26 Oct 2026.
- Its legal pages are on a different domain: zilitalk.com/privacy.html and zilitalk.com/terms.html.
- Source: [Google Play com.zili.android](https://play.google.com/store/apps/details?id=com.zili.android&hl=en)
- The Zili Chat Terms (last updated 24 Aug 2026) name SOCIALTECH SOLUTIONS - FZCO as the contracting party, but still choose "the laws of HongKong, China". — [zilitalk.com/terms.html](https://www.zilitalk.com/terms.html)

**Registry searches**
- A web search for "GLOBJOY UNITED LIMITED" found no registry record. Only unrelated, similarly named companies came up. — [search result example, Companies House unrelated](https://find-and-update.company-information.service.gov.uk/company/OE007409/persons-with-significant-control)
- A web search for "SOCIALTECH SOLUTIONS FZCO" found no registry record. Unrelated "SocialTech" firms in Qatar and Riyadh came up. — [Odoo listing, unrelated](https://www.odoo.com/customers/social-tech-information-technology-4502934)

### Inferences
- ASSUMPTION: "FZCO" plus "DSO-IFZA" suggests a company licensed by the IFZA free zone (Dubai Silicon Oasis). This is common for Chinese-run social apps that want a UAE publishing entity.
- ASSUMPTION: The Hong Kong company GLOBJOY UNITED LIMITED is probably the original or operating entity, with the FZCO acting as the store publisher. That would explain why both apps choose Hong Kong law. The Sheung Wan address looks like a typical company-secretary address.
- ASSUMPTION: The package names (`com.vitalk.*`), the vitalk.net domain and the repeated release note on every version ("Solve some known issues for a smoother experience~", with a tilde) look like a Chinese white-label template.
- ASSUMPTION: The Play description pattern ("【 Party Rooms】… 【Share your moments】… Authenticity of users guaranteed") matches dozens of clone apps. Zili Chat (`com.zili.android`) is likely the older build of the same product. The App Store description still uses the "Zili Chat" style wording.
- A Gmail address for the developer contact is a weak-governance signal.

### Gaps
- The IFZA licence number and its status are unverified, because the IFZA/DSO public lookup was not queried successfully.
- The Hong Kong Companies Registry (ICRIS/e-Search) entry for GLOBJOY UNITED LIMITED is not verified. The search is paid or captcha-gated and was not done.
- No D-U-N-S number was found.
- OpenCorporates was not checked.
- Directors and shareholders are unknown.
- No other sister apps were found beyond Zili Chat. A reverse search on contact@socialtech.info across other stores (RuStore, Huawei) was not done.

## 2. What do the official documents say?

### Takeaway
The legal texts are generic templates covering an 18+ age limit, Hong Kong law, no refunds and no cash-out. They say virtual items can never be exchanged for money, yet a third-party agency site describes withdrawals in USD and USDT. I found no recharge agreement and no host or agency agreement in public.

### Cited Findings
**Zili Terms (vitalk.net, 9 May 2025)**
- Age limit: users must be "at least eighteen (18) years of age or older".
- Governing law: Hong Kong, with disputes settled by negotiation first.
- Purchases are "non-cancellable, non-refundable, and non-reversible".
- Virtual items ("diamonds", "points") are "non-exchangeable for any legal tender of any country or political entity".
- Posting gambling-related content is prohibited, and accounts linked to gambling can be terminated.
- Self-gifting can lead to termination and to withholding of "funds or virtual items".
- No list of prohibited regions. Users must be "physically located in a jurisdiction where the use of the Services is legally permitted".
- No host or agency section.
- Source: [vitalk.net/terms.html](https://www.vitalk.net/terms.html)

**Zili Privacy Policy (vitalk.net, 9 May 2025)**
- Says "We do not provide services to individuals under the age of 18."
- Data may be stored outside the user's country, for example in Hong Kong, Singapore or Malaysia.
- Processors are named only by category (cloud, payment, advertising). No SDK vendors are named.
- Source: [vitalk.net/privacy.html](https://www.vitalk.net/privacy.html)

**Zili Chat Terms (zilitalk.com, 24 Aug 2026)**
- Same wording as the Zili Terms, but the entity is SOCIALTECH SOLUTIONS - FZCO.
- Hong Kong law, 18+, non-refundable.
- Virtual items "may not be used as investments or transferred in any form".
- Source: [zilitalk.com/terms.html](https://www.zilitalk.com/terms.html)

### Inferences
- Inconsistency: the Terms forbid any exchange of virtual items for money, while an agency site describes diamonds converting to USD and withdrawals by bank, SBP, Volet and USDT (section 4). The public terms do not disclose the cash-out mechanism.
- Inconsistency: the Terms are 18+, but Apple shows 16+/17+ (see section 5).

### Gaps
- No recharge (top-up) agreement was found in public.
- No host or agency agreement was found in public.
- No withdrawal policy was found in public.
- No community guidelines URL was found in public.
- Any in-app-only documents need screenshots from the owners.
- The Zili Chat privacy policy at zilitalk.com/privacy.html was not fetched.

## 3. What games exist, how are they gated, and what can winnings be used for?

### Takeaway
Neither store description mentions any games, slots, wheels or lucky gifts. The only public chance-related signals are Apple's "Loot Boxes" descriptor and Google's "In-App Purchases (Includes Random Items)". I found no public source describing in-app games or how they are gated.

### Cited Findings
- Apple lists "Loot Boxes" among the content descriptors and has no gambling descriptor. — [iTunes lookup](https://itunes.apple.com/lookup?id=6746039929&country=tr); [App Store TR](https://apps.apple.com/tr/app/zili/id6746039929)
- On Google Play, `com.vitalk.android` is rated PEGI 18 with "Users Interact, In-App Purchases (Includes Random Items)". — [Google Play](https://play.google.com/store/apps/details?id=com.vitalk.android&hl=en&gl=TR)
- `com.zili.android` is rated PEGI 18 with "Users Interact, In-App Purchases", with no random items. — [Google Play](https://play.google.com/store/apps/details?id=com.zili.android&hl=en)
- The current Play description mentions only messages, voice rooms, "group activities", moments, profile and VIP. Gifts are no longer featured. — [Google Play](https://play.google.com/store/apps/details?id=com.vitalk.android&hl=en&gl=TR)
- The agency site lists earning sources: chats, calls, rooms, a "Task Center", invites, gifts and "contests". It mentions no lucky gift, wheel or slot. — [agent1009.org/en/earn](https://agent1009.org/en/earn)
- Searches for "Zili" with lucky gift or games found nothing specific to Zili. — [search result, trashbox.ru Zili listing](https://trashbox.ru/topics/215357/zili-onlajn-chat-vecherinka-1.14.0.0)

### Inferences
- ASSUMPTION: The "random items" or loot box element is probably a mystery box, lucky gift or gacha-style gift draw. This is not verified, and Zili may not offer any slot-type games at all. Its model looks more like paid 1-on-1 chat, calls and video calls (section 4).

### Gaps
- Which games exist in-app, if any, is unknown.
- How any games are gated (level, VIP, face verification, region, age) is unknown.
- Whether game winnings can be gifted to hosts is unknown.
- What exactly the "random items" or loot box is, and its odds disclosure, is unknown.

## 4. What is the money flow?

### Takeaway
Publicly visible flow:
1. A user buys "beans" through Apple or Google in-app purchase. iOS also sells "silver coins" and a PRO subscription.
2. The user spends coins or beans on gifts, paid messages and calls.
3. The host receives diamonds, credited at half the coins spent according to the agency site.
4. 5,000 diamonds convert to US$1.
5. The host withdraws via SBP (Russia), bank (Russia, Uzbekistan, Tajikistan, Kazakhstan), Volet or USDT TRC-20, after face verification.
6. An agent earns an 8-24% commission on the team's income.

Steps 3 to 6 come from an unofficial agency page only.

### Cited Findings
**iOS in-app purchase prices (TRY)** — source: [App Store TR](https://apps.apple.com/tr/app/zili/id6746039929)

| Item | Price |
|---|---|
| 6,500 beans | ₺63.99 |
| 13,000 beans | ₺129.00 |
| 32,750 beans | ₺319.99 |
| 65,500 beans | ₺639.99 |
| 198,000 beans | ₺1,919.99 |
| 330,000 beans | ₺3,199.99 |
| 670,000 beans | ₺6,399.99 |
| Monthly PRO, auto-renewing | ₺199.99 |
| Monthly PRO | ₺249.99 |
| 6,000 "siliver" coins | ₺129.00 |

Implied rate: about 100-105 beans per ₺1.

**Google Play prices**
- The price range for `com.vitalk.android` is "TRY 29.99 - TRY 3,019.99 per item". This is the main app's own range in the embedded page data; other ranges on the page belong to similar apps. — [Google Play](https://play.google.com/store/apps/details?id=com.vitalk.android&hl=en&gl=TR)

**Agency site (agent1009.org)**
The site describes itself as "An information resource of the Blockbuster agency" and "not the official website of the app developer". It is offered in RU, UZ, KZ, TJ, KG, AZ and EN. Source for all points below: [agent1009.org/en/earn](https://agent1009.org/en/earn)
- Conversion and minimum:
  - "10 coins spent by the user = 5 diamonds received by the host".
  - 5,000 diamonds = $1, which is also the minimum withdrawal.
  - Withdrawals require face verification. On iOS, "charm level" 2 or higher is also required.
- Processing: requests are handled daily until 12:00 Moscow time, crediting takes 0-3 days, and the user pays the channel fee.
- Withdrawal channels:

| Channel | Countries | Minimum |
|---|---|---|
| SBP | Russia | 5,000 diamonds |
| SBP via Pagsmile | Russia | 5,000 diamonds |
| Bank transfer | Russia, Uzbekistan, Tajikistan, Kazakhstan | 25,000 diamonds |
| Volet | All countries | 5,000 diamonds |
| USDT (TRC-20) | All countries | 5,000 diamonds |

- Host earning rates, in diamonds:

| Activity | Diamonds |
|---|---|
| Reply to a greeting in 1-on-1 chat | 10 per reply |
| Reply to a paid message within 12 hours | 50 per reply |
| Voice call | 600 per minute |
| Video call | 1,200 per minute |
| Rooms | up to 12,500 per hour at the top rank |
| Task Center | up to 100,000 per day |
| Inviting an invited man / woman | up to 50,000 / up to 25,000 |

- Agency: after inviting 3 hosts, a user can become an "agent partner" with an 8-24% commission on the team's income.

### Inferences
- ASSUMPTION: The "beans" sold on iOS and the "coins" in the agency text are probably the same spend currency under different names or translations. This is unverified.
- Rough payout: 10 coins become 5 diamonds, so 10,000 coins give the host $1. 10,000 beans cost about ₺98 on iOS, about US$2.3-2.8 at late-2026 rates (ASSUMPTION about the FX rate). The host side would receive roughly 35-45% of gross spend before Apple's cut. This assumes beans equal coins; treat it as an estimate only.
- The money flow is built around paid 1-on-1 messages and calls, with women paid per reply and per minute and invite bonuses that differ by gender. Together with the reviews in section 6, this matches the "paid companionship chat" model (Chamet, Olamet, Bunchat-like apps are shown as "similar apps" on Play) more than a game-hall model.
- Payout rails point to a Russian-speaking and Central Asian market: SBP, Pagsmile (a Latin American and emerging-market payment processor), Volet (formerly AdvCash) and USDT. No Payoneer and no coin-seller network were mentioned publicly.

### Gaps
- No official withdrawal or exchange rate document exists in public.
- Whether coin sellers, recharge agents or web top-up exist (cheaper than IAP) is unknown.
- Whether Turkey has a local payout channel (TRY bank, Papara) is unknown.
- The PRO subscription benefits are unknown.
- What "silver coins" are used for is unknown.

## 5. Age rating, content descriptors, and store description versus in-app reality

### Takeaway
- Apple: 16+ on the TR page (new rating system) and 17+ in the lookup API. Descriptors are "Frequent/Intense Mature/Suggestive Themes" and "Loot Boxes", with no gambling descriptor.
- Google: PEGI 18 with "Includes Random Items".
- The Terms say 18+.
- Store descriptions disclose no games and no cash-out.

### Cited Findings
**Apple rating and metadata**
- TR web page: age rating 16+, "Frequent: Mature or Suggestive Themes", "Contains: Loot Boxes, Messaging and Chat, User-Generated Content, Social Media". — [App Store TR](https://apps.apple.com/tr/app/zili/id6746039929)
- The iTunes lookup API returns `trackContentRating` 17+ with advisories `['Loot Boxes', 'Frequent/Intense Mature/Suggestive Themes']`. — [iTunes lookup](https://itunes.apple.com/lookup?id=6746039929&country=tr)
- Release date is 2025-11-11.
- Current version is 1.16.1, released 2026-11-25.
- Languages: AR, EN, KK, KY, RU, TG, TR, UK, UZ.
- Size is 239.4 MB, minimum iOS 15.0.
- TR rating: 3.0 from 48 ratings. TR chart position: No. 16 in Top Free Social Networking.
- Sources: [iTunes lookup](https://itunes.apple.com/lookup?id=6746039929&country=tr); [App Store TR](https://apps.apple.com/tr/app/zili/id6746039929)

**Storefront availability (lookup API)**

| Storefront | Available | Ratings | Average |
|---|---|---|---|
| GB | no | – | – |
| SA | no | – | – |
| US | yes | 7 | 4.0 |
| RU | yes | 73 | 3.58 |
| UZ | yes | 25 | 3.68 |
| KZ | yes | 15 | 4.2 |
| AZ | yes | 23 | 4.26 |
| DE | yes | 2 | – |
| AE | yes | 0 | – |

Source: [iTunes lookup RU](https://itunes.apple.com/lookup?id=6746039929&country=ru)

**Google Play**
- `com.vitalk.android`: 1M+ installs (embedded count 2,639,230), 3.4★ from 3.47K reviews, released 11 Nov 2025, updated 24 Nov 2026. — [Google Play](https://play.google.com/store/apps/details?id=com.vitalk.android&hl=en&gl=TR)
- The Play description now frames the app as "friends and people who already know each other" and says nothing about meeting strangers, hosts or gifts. The older Zili Chat listing says "We have plentiful users and hosts from across the globe". — [Google Play com.vitalk.android](https://play.google.com/store/apps/details?id=com.vitalk.android&hl=en&gl=TR); [Google Play com.zili.android](https://play.google.com/store/apps/details?id=com.zili.android&hl=en)

**Privacy declarations**
- Apple privacy label:
  - Tracking: Identifiers.
  - Linked to the user: Coarse Location, Phone Number, Device ID.
  - Source: [App Store TR](https://apps.apple.com/tr/app/zili/id6746039929)
- Google data safety: "No data shared with third parties".
  - Collected: photos, messages, app activity, purchase history, name, phone, sexual orientation (optional), files, voice recordings, and approximate and precise location.
  - Data is encrypted in transit, and deletion can be requested.
  - Source: [Play data safety](https://play.google.com/store/apps/datasafety?id=com.vitalk.android&hl=en_US)

### Inferences
- Discrepancy between the descriptions and the stated earnings model: neither store description mentions paid messages, paid calls or host earnings. The agency site documents host income per reply and per call-minute (section 4).
- Discrepancy in privacy: Play declares "no data shared with third parties", while the privacy policy names third-party advertising companies and payment processors (by category), and Apple declares tracking via identifiers.
- The Play description reworded toward "people who already know each other" may be a response to store policy on stranger-dating or companionship apps. ASSUMPTION; not verified.

### Gaps
- Whether the TR "16+" and the lookup "17+" are the same rating mapped differently or a mismatch is unclear. Most likely it is Apple's 2025 age-rating update shown differently on the web and in the API (ASSUMPTION).
- The IARC rating for Turkey specifically is not visible; the TR page shows PEGI.

## 6. Public enforcement, news and complaints; reviews about money and bans; technical clues

### Takeaway
I found no Turkish news, BTK access ban, court order or "yasa dışı bahis" (illegal betting) coverage about Zili. Turkish App Store reviews repeatedly claim the women are bots or AI and that the app is built to make men spend. Recent Play reviews look promotional, and one mentions "agents". I could not retrieve any SDK data.

### Cited Findings
**Turkish App Store reviews**
These are user claims and are not verified. Source: [App Store TR](https://apps.apple.com/tr/app/zili/id6746039929)
- "kgcvd" (12 Jun): most active users are AI, bonuses are taken by others, and users are pushed to buy gifts or VIP.
- "Hnc2106" (12 Jun): "Fake site", most people are AI, the aim is to make users message and spend.
- "emre63728" (2 Jul): "Herkes bot" ("everyone is a bot"), not a single real woman.
- "Sel.1903" (14 Jul): "scam".

**Google Play reviews (Oct-Nov 2026)**
- Five-star reviews in English with Filipino-sounding names, for example: "I also appreciate the support and opportunities it provides to its users and agents. Thank you, Zili team". — [Google Play](https://play.google.com/store/apps/details?id=com.vitalk.android&hl=en&gl=TR)

**Searches**
- "Zili" combined with şikayet (complaint) and jeton (coins) on şikayetvar found no Zili brand page. Results were for other apps. — [sikayetvar search result](https://www.sikayetvar.com/jeton)
- "Zili sesli sohbet uygulama" in Turkish found no news coverage. — [search results, e.g. kizlarsoruyor](https://www.kizlarsoruyor.com/internet-teknoloji/q24078632-arkadaslar-sadece-konusma-hakki-alabilecegim-bir-uygulama-var-mi)

**SDK and technical data**
- AppBrain returned HTTP 403 and Exodus Privacy returned HTTP 503 at access time, so no SDK list was obtained. — [AppBrain](https://www.appbrain.com/app/zili-online-chat-party/com.vitalk.android); [Exodus](https://reports.exodus-privacy.eu.org/en/reports/com.vitalk.android/latest/)
- APK mirror metadata pages exist (APKCombo, Uptodown, BlueStacks RU campaign page, Trashbox.ru 1.14.0.x), but were not opened in detail. — [APKCombo](https://apkcombo.com/zili-online-chat-party/com.vitalk.android/); [Uptodown](https://com-vitalk-android.en.uptodown.com/android); [BlueStacks RU](https://www.bluestacks.com/campaign/com.vitalk.android/ru/)
- The app is also on RuStore, according to the agency site. — [agent1009.org/en/earn](https://agent1009.org/en/earn)

### Inferences
- ASSUMPTION: The Filipino-named Play reviews praising "agents" fit a pattern of agency or host-recruited reviews.
- ASSUMPTION: The Turkish "all bots or AI" complaints may be real users meeting paid hosts who follow scripts. Our app would face the same moderation and consumer-trust issue if hosts are paid per reply.
- Zili is not available in the GB and SA App Store storefronts (section 5). ASSUMPTION: this may be a choice based on regulation or market, since the UK is stricter on loot boxes and gambling-like features. The reason is unknown.

### Gaps
- No BTK, Erişim Engelleme or court-ban search results were obtained. A direct search of the EngelliWeb or İFÖD lists was not done.
- No Turkish or Russian news was found. Russian media were not searched in depth.
- No gambling licence was checked. The UK Gambling Commission, Curaçao, MGA and Isle of Man registers were not queried. ASSUMPTION: unlikely to exist, since the Terms prohibit gambling content.
- The third-party SDK list is unknown: RTC vendor (Agora, Zego, TRTC), game SDK (Sud, Baishun), attribution (AppsFlyer, Adjust). Retry Exodus and AppBrain later.
- No Reddit or Ekşi Sözlük results were found. Ekşi was not queried directly.
- Sensor Tower and data.ai revenue estimates were not obtained.

### Need from owners: screenshot or test account
These are in-app screens I could not see.
- **Store and wallet**
  - Wallet and top-up screen: bean, coin and silver coin packages and their TRY prices. Is there any web-pay or "recharge agent" option besides IAP?
  - What "silver coins" are and what they buy; what Monthly PRO includes.
- **Host side**
  - Host and earnings screen: diamond balance, exchange rate (5,000 diamonds = $1?), withdrawal channels offered to a Turkish account, face-verification flow, "charm level" requirement.
  - Paid message and call pricing on the user side: coins per message, coins per minute for voice and video.
- **Agency**
  - Agency or "agent partner" screen: commission tiers (8-24%), invite rewards.
- **Games and random items**
  - Any games, lucky gift, wheel or mystery box (the "Loot Boxes" / "Random Items" element): where they appear, how they are gated (level, VIP, verification, region, age), and whether odds are shown.
- **Rules and documents**
  - In-app documents: recharge agreement, host agreement, withdrawal rules, community guidelines.
  - Age gate and verification at sign-up: whether 18+ is enforced, phone or face verification.
  - Region restrictions: whether Turkish users see the same features as RU, UZ or KZ users.
