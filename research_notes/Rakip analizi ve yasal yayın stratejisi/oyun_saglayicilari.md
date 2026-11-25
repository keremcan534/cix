# Oda içi oyun sağlayıcıları (3rd-party in-room game vendors) ve build-vs-buy

Access date for every web source below: 2026-11-25 (research done that day). Labels used:
**VERIFIED** = read on the cited page; **ASSUMPTION** = my inference or unverified background knowledge, never a fact;
**UNKNOWN** = searched, nothing public found.

Search coverage note (important for the report writer): the web search engine available returned almost nothing on
the Chinese/MENA "voice-room game vendor" segment (Baishun/BSGames, LeaderCC, YoHo, Hippo, JoyPlay, "Greedy"/"Fruit
Party"/"Lucky 77" suppliers). Six differently phrased queries (English and Chinese) for Baishun alone returned zero
relevant hits. This segment mostly markets through sales decks, WeChat/Telegram and trade fairs, not indexable docs.
Absence of results is NOT evidence that these vendors don't exist; it means nothing about them can be cited.

---

## 1. Which vendors exist, where are they registered, what games, what commercial model?

### Takeaway
Only three vendors in this space have public, citable material: **SUD (sud.tech, China)** with full public developer
docs that include coin-entry poker/Teen Patti and a settlement "commission" field; **ZEGOCLOUD**, which **removed its own
mini-game platform on 20 June 2025** and now only "refers" third-party games; and **ByteSun via Agora's Extensions
Marketplace** (H5 games, paid-entry battles). No vendor publishes prices or revenue-share percentages; all say "contact
sales". Casual web-game networks (GameDistribution) are ad-funded and a different model entirely.

### Cited Findings

**SUD / Sud.Tech (VERIFIED)**
- GitHub organisation "Sud.Tech" (handle SudTechnology), location "China", domain sud.tech verified by GitHub, contact
  help@sud.tech, 32 public repositories, "no public members" — [GitHub SudTechnology](https://github.com/SudTechnology)
- Repos include `hello-sud-plus-android`, `hello-sud-plus-ios`, `sud-mgp-android`, `sud-mgp-doc`, and a family of
  MIT-licensed `sud-gip-auth` server SDKs in Java, Node.js, .NET, PHP and Go — [GitHub SudTechnology](https://github.com/SudTechnology)
- sud.tech home page brands itself "Pioneer & Leader of Gamification Interactive"; the page itself lists no games,
  clients, prices or certifications — [sud.tech](https://sud.tech/)
- Game titles visible in SUD docs: DrawGuess (Pictionary), Rocket, Baseball, Werewolf, Undercover, "Number Bomb",
  "Guess the Word", **Texas Hold'em Pro** and **TeenPatti Pro** — [SUD docs index](https://docs-gitbook.sud.tech/en-US/);
  [SUD Agora ASR page](https://docs-gitbook.sud.tech/en-US/app/Client/Audio/Detail/AgoraAndroid.html);
  [SUD Entry with score API](https://docs-gitbook.sud.tech/en-US/app/Server/API/EntryWithScore/)
- SUD has a dedicated **"entry with score API (Texas Hold 'em Pro, TeenPatti Pro)"** — in-page heading "In-game Points
  API (Texas Hold'em, TeenPatti)" — with sub-APIs "In-game Payment Order", "Query Order", "Query User Settlement
  Information", "Query Basic Information for a Single Game", "Query All Round IDs" — [SUD Entry with score](https://docs-gitbook.sud.tech/en-US/app/Server/API/EntryWithScore/)
- The per-user settlement callback carries `score` (points earned), `remain_score`, an optional **`commission_score`
  ("commission points deducted")** and `is_ai` (0 = user, 1 = **robot**; `uid` empty for robots) — [SUD user settle notify](https://docs-gitbook.sud.tech/en-US/app/Server/HttpsCallback/notify/UserSettleNotify.html)
- A server push event "add ai" exists (adds AI players to a game) — [SUD docs index](https://docs-gitbook.sud.tech/en-US/)
- A third-party, unofficial Go SDK for SUD MGP exists (Chinese README) — [Linuxea/sud-server-sdk](https://github.com/Linuxea/sud-server-sdk)
- No page found lists SUD's pricing, revenue share, company legal entity, clients, or certifications — UNKNOWN (see Gaps).

**ZEGOCLOUD (VERIFIED)**
- ZEGO's own solution list still describes a "Mini Game Engine": "Through SDK and server-side API, it provides
  developers with mini game resources and play-together services" — [ZEGO solutions FAQ](https://www.zegocloud.com/docs/faq/zego-solutions)
- But: **"Starting from June 20, 2025, the mini-game platform and its related solutions have been removed from the
  official website."** Alternative offered: "ZEGOCLOUD offers third-party mini-game referral services, including casual
  and live-comment based games"; pricing: "contact the ZEGOCLOUD sales representatives" — [ZEGO mini-game alternatives](https://www.zegocloud.com/docs/faq/mini-game-alternatives)
- Earlier ZEGO blog: the engine covered single/multi-player casual and competitive games for live streaming, voice chat
  rooms and voice radio; it describes a betting-game pattern where the operator's **business server** picks winners with
  large gold-coin totals and broadcasts them — [ZEGO blog: mini-game in live streaming](https://www.zegocloud.com/blog/use-mini-games-live-streaming)
- ZEGO "Social-Gaming Solution" blog dated 12 Nov 2025; the fetched page body contained no vendor names, game list or
  pricing — [ZEGO social-gaming blog](https://www.zegocloud.com/blog/social-gaming-solution)
- Tamatem's Ludo app "Wanas" used ZEGOCLOUD for voice (press item) — [oilnow.gy press release](https://oilnow.gy/?p=58324)

**ByteSun via Agora Extensions Marketplace (VERIFIED)**
- Agora blog: "ByteSun Game provides proven, multi-language HTML5 mini-games"; "primarily integrated through HTML5 web
  embedding", with "an SDK ... available as an option for deeper integration" — [Agora blog: ByteSun](https://www.agora.io/jp/blog/elevate-your-global-live-streaming-with-agora-rtc-and-bytesun-mini-games)
- Titles: Football Star, Neon Beats, Snake Ladder, Candy Star, Tower Ladder (host PK), Monster, UNO (social chat rooms),
  "Magic Slot & Guessing" (live shopping) — same source
- Commercial model as described: "Players pay service fees to join multiplayer battles, generating instant platform
  revenue", plus ads/branded games; vendor-claimed +80% retention, 90-min sessions, ">$100,000 USD in incremental monthly
  revenue" (marketing claims, no named client) — same source. No company location stated.
- Agora's Extensions Marketplace (launched RTE2021) hosts third-party and Agora extensions with unified billing —
  [Agora Extensions Marketplace docs](https://docs.agora.io/en/realtime-media/marketplace);
  [Agora RTE2021 launch](https://agora.io/en/news/agora-to-launch-extensions-marketplace-today-at-the-worlds-largest-real-time-engagement-conference)

**Tencent TRTC (VERIFIED negative)**
- TRTC docs describe conference, call, live and voice-room ("语聊房") components; no mini-game/third-party game product
  appeared in search — [Tencent Cloud TRTC doc](https://cloud.tencent.com/document/product/647/49327)

**Casual HTML5 game networks (VERIFIED, partly secondary)**
- GameDistribution: official embed is an **iframe** pointed at an embed URL with game set by URL parameters —
  [GameDistribution/gd-embed-game](https://github.com/GameDistribution/gd-embed-game); self-reported reach "over 300M users
  a month" — [PocketGamer.biz](https://www.pocketgamer.biz/gamedistribution-expand-mobile-game-reach-with-zero-acquisition-costs)
- Model is ad revenue share, three-way between publisher site, developer and GameDistribution; a third-party blog claims
  the developer gets "only 33%" — [Gamearter on Medium](https://medium.com/gamearter/https-medium-com-gamearter-right-way-of-game-distribution-in-our-opinion-6f0088a3bd11)
  (unverified against GD's terms); a 2017 forum thread shows disputed/unpaid developer earnings — [html5gamedevs](https://html5gamedevs.com/topic/32413-gamedistributioncom-offers-revenue-share)
- Google's H5 Games Ads (AdSense for Platforms) notes that when you use a distributor, the distributor controls
  monetization and revenue sharing — [Google H5 games ads](https://www.google.ca/adsense/start/solutions/h5-games-ads/)

**Voice-social apps with Ludo/Domino (VERIFIED, as competitor context, not vendors)**
- Yalla Ludo: "the first Ludo application that added in-game voice-chatting and chatroom functionalities" —
  [App Store: Yalla Ludo](https://apps.apple.com/us/app/id1419536376); Yalla's Jalsat offers hand, ludo, jackaroo, trix —
  [App Store: Jalsat](https://apps.apple.com/us/app/id6752764540)
- Yalla is reported to build its own games (Ludo, SLG) in-house rather than buy — [Baijing: Yalla SLG](https://www.baijing.cn/article/45395)
- TopTop Lite (KSA) offers jackaroo, carrom, ludo, domino — [App Store: TopTop Lite](https://apps.apple.com/us/app/toptop-lite-%D8%AA%D9%88%D8%A8-%D8%AA%D9%88%D8%A8-ksa/id6470972816)

### Inferences
- ASSUMPTION: SUD's docs show the vendor runs **coin-entry poker and Teen Patti with a commission (rake) field and AI
  robots in the same match as real users**. If a voice app plugs that in with coins that can be bought and (via
  diamonds) cashed out, it is a chance/casino product with a house cut — exactly the legal question already open for
  Similar Club (`docs/DENETIM.md`). Robots seated against paying users are an extra consumer-protection/fairness risk.
- ASSUMPTION: The segment's leaders consolidate or exit: ZEGO, one of the two big RTC vendors, dropped its own
  mini-game platform in June 2025 and became a referrer. Vendor-continuity risk for any buyer is real.
- ASSUMPTION (background knowledge, not verified this session): SUD is commonly described in Chinese trade press as a
  Shenzhen-area company serving MENA/SEA voice apps; Baishun (BSGames), LeaderCC, YoHo etc. are reported in industry
  chatter as suppliers of "Greedy"/"Fruit"/"Lucky 77"-style coin games to voice-room apps on revenue-share deals. None of
  this could be confirmed with a public source; do not present as fact.

### Gaps
- Baishun/BSGames, LeaderCC, YoHo, Hippo, JoyPlay, Volcengine/Huoshan game offerings, and generic "Greedy / Fruit
  Party / Lucky 77" suppliers: **UNKNOWN** — no indexable public page found (6+ queries).
- Famobi, Poki, CrazyGames licensing terms for embedding in a third-party app: not researched in depth (budget); UNKNOWN.
- No vendor publishes revenue-share %, monthly fee or per-DAU pricing: UNKNOWN everywhere (all "contact sales").
- SUD's legal entity, registration, funding and named clients: UNKNOWN.
- Public client lists naming specific voice apps (e.g. which apps use SUD): none found.

---

## 2. How does the technical integration typically work?

### Takeaway
Per SUD's public docs (the only full public spec found): a client SDK renders the game (Android, iOS, Web, Flutter), the
app and game talk through two decoupled state machines, the operator server authenticates the player via a short code →
server-side token (JWT recommended), and **coins stay on the operator's server**: the vendor calls the operator's
`get_account / get_score / update_score` callbacks and sends signed settlement notifications with order IDs. ByteSun
(Agora) is mostly a plain H5 embed. Idempotency, retry and reconciliation rules are thinly documented publicly.

### Cited Findings
- SUD client: "On the client side, the game and the app are mutually finite state machines with no coupling
  logically" (`ISudFSMMG` game→app states, `ISudFSTAPP` app→game); quick-starts for iOS, Android, Web, Flutter —
  [SUD docs index](https://docs-gitbook.sud.tech/en-US/)
- SUD server auth: "On the server side, JWT standard is recommended for the authentication and data exchange", or
  `SudMGPAuth`, or a custom token; operator implements HTTPS callbacks `get_sstoken`, `update_sstoken`,
  `get_user_info` — [SUD docs index](https://docs-gitbook.sud.tech/en-US/); [SUD Node quick start](https://docs-gitbook.sud.tech/en-US/app/Server/StartUp-Node.html)
- SUD money/points callbacks the **operator** implements: `report_game_info`, `get_account`, `get_score`,
  `update_score`, with "callback signature verify"; server APIs `create order`, `batch create orders`, `query order` —
  [SUD docs index](https://docs-gitbook.sud.tech/en-US/)
- SUD notify events include match start, match settle, user settle, order changed, order batch changed, bid result,
  room game rule, player connection status, room seat changed — same source
- User settle notify: `notify_id`, `notify_time` (ms), `app_id`, `notify_event = sud.mg.merchant.user.settle`, data
  with `mg_id`, `room_id`, `match_id`, `settle_at`, per-player `order_id`, `out_order_id` (merchant-defined), `score`,
  `remain_score`, `commission_score`, `is_ai`; operator replies `ret_code` 0 = success. **Retry/dedup behaviour is not
  documented on that page**; signature check is on a separate page — [SUD user settle notify](https://docs-gitbook.sud.tech/en-US/app/Server/HttpsCallback/notify/UserSettleNotify.html)
- SUD voice integration: the app pulls PCM audio from Agora/ZEGO RTC and passes it to the SDK for speech games
  (Werewolf, Undercover, Pictionary ASR) — [SUD Agora Android](https://docs-gitbook.sud.tech/en-US/app/Client/Audio/Detail/AgoraAndroid.html)
- ZEGO (historical): business server sends an in-room message telling members to load the game; host gets a launch code
  from the backend; likes/gifts relayed to ZEGO via the game server — [ZEGO Android minigame blog](https://www.zegocloud.com/blog/android-minigame-engine);
  [ZEGO live-streaming mini-game blog](https://www.zegocloud.com/blog/use-mini-games-live-streaming)
- ByteSun: "primarily integrated through HTML5 web embedding" — [Agora blog: ByteSun](https://www.agora.io/jp/blog/elevate-your-global-live-streaming-with-agora-rtc-and-bytesun-mini-games)
- GameDistribution: iframe embed — [gd-embed-game](https://github.com/GameDistribution/gd-embed-game)

### Inferences
- ASSUMPTION: In the SUD model the **game outcome is decided on the vendor's servers**, and the operator only receives
  `update_score`/settle calls. The operator's ledger therefore trusts a third party's result and commission number;
  Similar Club's rule "the server decides every price and balance" would become "the vendor's server decides".
- ASSUMPTION: An integration would need to map vendor `order_id`/`notify_id` onto Similar Club's idempotent `ref`
  (server-made refs contain `:`), keep a game-coin escrow per match, and reconcile daily against vendor reports
  (`Query game report information`, `query_user_settle`) — the vendor docs give the hooks but not the guarantees.
- ASSUMPTION: Anti-cheat is vendor-side and undocumented publicly; with `is_ai` robots allowed, the operator can't
  independently verify that a real user lost to a fair opponent.

### Gaps
- Callback retry policy, timeout, ordering and dedup guarantees (SUD): not on public pages fetched. UNKNOWN.
- `update_score` page detail: URL returned 404 at access time; semantics (incr/decr, round id) UNKNOWN.
- No vendor documents anti-cheat, device fingerprinting or collusion detection publicly.

---

## 3. Do vendors expose RTP/odds to operators? RNG certification? Gambling supplier licences?

### Takeaway
**Nothing public.** None of the vendor pages found mentions RTP, odds tables, house-edge settings, GLI / iTech Labs /
BMM RNG certification, or a UKGC/MGA supplier licence. The only economics knob visible is SUD's `commission_score`
(a rake deducted at settlement).

### Cited Findings
- SUD docs index: pricing, commercial terms, RTP, odds and commission rules are not discussed; only the
  `commission_score` field and "add ai" event appear — [SUD docs index](https://docs-gitbook.sud.tech/en-US/);
  [SUD user settle notify](https://docs-gitbook.sud.tech/en-US/app/Server/HttpsCallback/notify/UserSettleNotify.html)
- SUD Entry-with-score page: no rake, house fee, odds or RTP configuration described — [SUD Entry with score](https://docs-gitbook.sud.tech/en-US/app/Server/API/EntryWithScore/)
- sud.tech home: no certifications mentioned — [sud.tech](https://sud.tech/)
- ByteSun page: no RTP/odds/certification; paid-entry battle model only — [Agora blog: ByteSun](https://www.agora.io/jp/blog/elevate-your-global-live-streaming-with-agora-rtc-and-bytesun-mini-games)

### Inferences
- ASSUMPTION: If a vendor held a UKGC remote gambling software licence or MGA B2B licence it would normally advertise it;
  the silence suggests these vendors position themselves as "social games" suppliers, not regulated gambling suppliers.
  This must be confirmed by asking any vendor directly in writing.
- ASSUMPTION: Apple's 3.1.1 odds-disclosure rule (see §4) and Similar Club's own practice of showing a probability
  table would be hard to meet with a vendor that doesn't disclose odds to the operator.

### Gaps
- Whether any of these vendors has GLI/iTech/BMM RNG certificates: UNKNOWN (no public claim found).
- Whether operators can set RTP or rake per game: UNKNOWN beyond the existence of `commission_score`.
- Vendor registrations on UKGC/MGA public registers: not checked (would need register lookups; not done in budget).

---

## 4. Legal / store implications of using a chance-game vendor

### Takeaway
Under the **UK Gambling Act 2005** supplying gambling software without a licence is an offence and UK licensed operators
must buy only from licensed suppliers; whether in-app coins are "money's worth" hinges on whether they can be cashed out
or traded for value. **Apple 4.7** makes the app developer responsible for every HTML5 mini game it offers, and
**Google Play** bans games where users pay for a chance to win monetary prizes unless licensed real-money gambling.
In short: buying a game moves the code risk, **not** the legal/store risk — the operator keeps it.

### Cited Findings
**UK Gambling Commission (VERIFIED)**
- Gambling software = "computer software for use in connection with remote gambling" (s.41(2)); offence: "a person
  commits an offence if in the course of a business" manufactures, supplies, installs or adapts gambling software
  "unless he acts in accordance with an operating licence" (s.41(1)) — [UKGC: What is gambling software](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/what-is-gambling-software)
- Licence condition 2.2.1: "All gambling software used by the licensee must have been manufactured by the holder" of a
  gambling software operating licence and "supplied to the Licensee by a holder" of one — same source; in force since
  31 March 2015 — [UKGC: When is a licence required](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/when-is-a-licence-required)
- Where "overall control, design and development of the product sits with the third party (the development company)
  then the development company needs a gambling software licence"; the final supplier to a GB-licensed operator needs one
  even if it does no development; software supplied only to operators licensed elsewhere need not meet GB technical
  standards — [UKGC: When is a licence required](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/when-is-a-licence-required)
- UKGC's guidance "does not provide a definitive legal view" — [UKGC: What is gambling software](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/what-is-gambling-software)
- UKGC 2017 position (via law-firm summaries): items won in social gaming are not "money or money's worth" **unless they
  can be converted into cash or traded for items of value**; where they can, providing facilities to gamble with them
  needs an operating licence — [CMS](https://cms.law/en/gbr/legal-updates/gambling-commission-clarifies-position-on-virtual-currencies-esports-and-social-gaming);
  [Kemp Little](https://kemplittle.com/blog/the-gb-gambling-commissions-position-on-esports-virtual-currencies-and-social-casino-gaming)
  (position paper itself not opened; verify wording)

**Apple App Review Guidelines (VERIFIED, verbatim from live page)**
- 4.7: "Apps may offer certain software that is not embedded in the binary, specifically HTML5 and JavaScript mini apps
  and mini games ... **You are responsible for all such software offered in your app, including ensuring that such
  software complies with these Guidelines and all applicable laws.**" — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 4.7.1: such software must follow privacy rules (5.1), have objectionable-content filtering, reporting and blocking,
  and "follow Guideline 3.1 in order to offer digital goods or services"; 4.7.2 no exposing native APIs without Apple's
  permission; 4.7.3 no sharing data/permissions without explicit consent each time; 4.7.4 "provide an index of software
  and metadata ... universal links"; 4.7.5 identify software exceeding the app's age rating and age-gate it — same source
- 5.3.3: "Apps may not use in-app purchase to purchase credit or currency for use in conjunction with real money gaming
  of any kind." 5.3.4: real money gaming "must have necessary licensing and permissions in the locations where the app
  is used, must be geo-restricted to those locations, and must be free on the App Store" — same source
- 3.1.1: loot boxes / randomized items for purchase "must disclose the odds of receiving each type of item to customers
  prior to purchase" — same source
- App Review has classified free/skill apps as "real money gambling ... or real money skill-based gaming" in practice —
  [Apple Developer Forums thread](https://developer.apple.com/forums/thread/825845)

**Google Play (VERIFIED)**
- Real-money gambling apps allowed only "in select countries" with "a valid gambling license for each country"
  (Turkey not named on the page) — [Google Play: Real-Money Gambling, Games, and Contests](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en)
- "Other Real-Money Games, Contests, and Tournament Apps": violations include "**Games that accept money in exchange for
  an opportunity to win a physical or monetary prize**" — same source
- The same page says apps must not "provide simulated gambling content" (social casino, virtual slots) in the ads-related
  requirements — same source (context of that rule is ads/specific programs; read the full text before relying on it)
- Device and Network Abuse: "an app may not download executable code (such as dex, JAR, .so files) from a source other
  than Google Play"; "This restriction does not apply to code that runs in a virtual machine or an interpreter", e.g.
  JavaScript in a webview; "Don't use third-party SDKs in your app that download executable code" — [Google Play: Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379?hl=en)
- Litigation: a California federal judge (Sept 2025) refused to dismiss suits accusing Apple, Google and Meta of
  facilitating illegal gambling via casino-style apps by processing payments — reported in
  [Nashua Telegraph (Jan 2026)](https://www.nashuatelegraph.com/news/2026/01/16/as-gambling-apps-grow-attention-turns-to-app-store-guidelines/)
  (secondary; not read in full)

### Inferences
- ASSUMPTION: Turkey is not UK; UK law is a reference model. The UK logic still maps cleanly: Similar Club's coins are
  bought, and gift winnings → diamonds → cash-out (para çekme, Jeton Noktası). Under the UKGC test that is "money's
  worth", so a vendor's coin game in such an app would be gambling and the vendor an (unlicensed) software supplier.
  Turkish-law analysis (7258 sayılı Kanun etc.) belongs to the legal researcher, not here.
- ASSUMPTION: Using an unlicensed vendor does not shift liability: Apple 4.7 says so explicitly; Google's prohibition
  targets the app. The operator carries store removal, account termination and local-law exposure; the vendor at most
  carries contractual liability, and Chinese vendors with no local presence are hard to sue.
- ASSUMPTION: Google's dynamic-code rule does not block H5 games in a WebView (JS exemption), so the store risk is about
  content (gambling), not about the loading technique. A native vendor SDK that downloads `.so` game engines at runtime
  would breach it; check any SDK for that.
- ASSUMPTION: Apple 4.7.4 (index with universal links) and 4.7.5 (age gate per item) are new obligations Similar Club
  would have to build for any third-party H5 catalog.

### Gaps
- Whether any listed vendor has been named in a store takedown or enforcement action: UNKNOWN.
- UKGC public register lookups for these vendors: not done.
- Full Google Play "simulated gambling" context (which programs/ads it applies to): not fully read.

---

## 5. Build vs buy

### Takeaway
Public evidence favours **build (or buy only skill/social games with no coin stakes)** for Similar Club: vendors don't
publish odds, certifications, licences or prices; the operator stays legally and store-responsible anyway; one major
platform (ZEGO) already exited; and Similar Club has **already built** its own Ludo, card, XOX, Dört Taş and Oyun Salonu
games with server-decided outcomes, its own ledger and probability tables.

### Cited Findings
- Similar Club already has in-house room games (Ludo, Renk Kartları, XOX, Dört Taş; rules mirrored server/app with
  step-by-step tests) and an Oyun Salonu (wheel, slot, Pachinko, Ejder ile Kaplan) with an admin report of house share —
  local file `/home/user/cix/docs/OYUN_MERKEZI.md`
- Similar Club audit: Oyun Salonu winnings go to separate game coins, but bets can be made with purchased coins; the
  rocket's house share is a live setting (default 60%); per-game daily caps were removed in Nov 2026; legal question open —
  local file `/home/user/cix/docs/DENETIM.md` (lines ~30-45)
- Vendor economics are opaque: ZEGO "contact the ZEGOCLOUD sales representatives for billing details" —
  [ZEGO mini-game alternatives](https://www.zegocloud.com/docs/faq/mini-game-alternatives); SUD docs carry no pricing —
  [SUD docs index](https://docs-gitbook.sud.tech/en-US/)
- Vendor exit risk: ZEGO removed its mini-game platform on 20 June 2025 — [ZEGO mini-game alternatives](https://www.zegocloud.com/docs/faq/mini-game-alternatives)
- Operator stays responsible for embedded H5 games (Apple 4.7) and must index and age-gate them (4.7.4/4.7.5) —
  [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Third-party SDKs that download executable code are banned on Play — [Google Play: Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379?hl=en)
- Big MENA voice-game players build their own games (Yalla: Ludo then SLG in-house) — [Baijing](https://www.baijing.cn/article/45395)

### Inferences (all ASSUMPTION)
- **Buy pros:** many polished titles fast (SUD's catalog incl. speech games that use the RTC audio stream); multiplayer
  netcode and art done; vendor claims retention uplift (ByteSun's +80% is marketing, unaudited).
- **Buy cons:** (1) economics set by vendor (rake via `commission_score`, unknown rev-share) — Similar Club loses control
  over house edge and can't show a verified probability table; (2) ledger trust moves to a foreign server — conflicts with
  the project rule that the server decides every balance; idempotency/reconciliation guarantees undocumented; (3)
  compliance: no public RNG cert or licence, so no audit trail to show a regulator or store; (4) data/privacy: user IDs,
  room IDs and possibly audio (PCM for ASR games) go to a China-based vendor — KVKK cross-border transfer question and
  Apple 4.7.3 consent per instance; (5) security: third-party JS in a WebView sharing session tokens; (6) lock-in and
  continuity (ZEGO precedent); (7) older-APK constraint: a vendor SDK update means a new APK, while vendor H5 changes ship
  without Similar Club's review — content can change under the operator's store listing.
- **Middle path:** if buying, buy only **skill/social games with no coin stake and no prize** (Pictionary, Werewolf,
  UNO-style) through H5, keep coins out of the vendor integration entirely, and keep chance games in-house (or off).
- Cost/time-to-market: no public numbers exist to compare; Similar Club has already paid the build cost for its current
  set, so the marginal case for buying is mainly catalog breadth, not speed.

### Gaps
- No public price points (rev-share %, fees, per-DAU) to quantify buy cost: UNKNOWN.
- No public case study naming a voice app's revenue from a vendor's games (only ByteSun's unnamed ">$100k/month" claim).
- KVKK/Turkish-law specifics of sending data/audio to a Chinese vendor: out of scope here; for the legal researcher.
