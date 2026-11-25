# H5 / in-room chance and casual game vendors behind MENA/Turkey voice-chat apps (phase 2)

Access date for every source: **2026-11-25**. Labels: **VERIFIED** = read on the cited page or file; **CIRCUMSTANTIAL** =
consistent indirect evidence, not a statement by the parties; **ASSUMPTION** = my inference or background knowledge;
**UNKNOWN** = searched, nothing public found.

Method note for the report writer (what was different from phase 1):
- Web search engines still return almost nothing for Baishun/LeaderCC/"Greedy" vendors. The breakthroughs came from
  **public GitHub code search** (small app developers who committed vendor docs and integration code to public repos)
  and from a **public academic dataset**: the artefacts of the USENIX Security 2025 paper *TapTrap* (TU Wien,
  `beerphilipp/taptrap`), which publishes the activity lists of 99,705 Play Store apps. I only read those published
  result files; I did not download or decompile any APK. The dataset's APK path folder is named `free_18_12_24`, so the
  APKs were most likely collected around **December 2024** (ASSUMPTION from the folder name).
- One attempt to call the LeaderCC ShowDoc API directly was blocked by the session's safety rules and was not repeated;
  only pages a normal browser opens were read.
- Activity names show that a vendor's SDK code was **shipped in an APK at that time**. They do not prove the vendor is
  still used today, which games are enabled, or in which countries.

---

## 1. Which vendors exist, and what do they sell?

### Takeaway
Six vendors are now documented from public material: **BAISHUN** (H5 coin games incl. Greedy-type "Fruit", Rocket crash,
slots, "Lucky Gift", Ludo; robots bet alongside users), **LeaderCC / Quantum Nexus** (77-title casino catalogue: slots,
Dragon Tiger, Teen Patti, Lucky777, baccarat, sic bo), **JoyPlay** (Hong Kong; dice, Ferris wheel, slots, 777, blackjack,
poker, Ludo, UNO), **Wave Games** (Pakistan; Greedy Lion, Lucky 77, Teen Patti, with public prices), **SUD / 忽然科技**
(Shanghai; mostly casual/social games plus coin-entry Texas Hold'em and Teen Patti; bought the Cocos engine in Nov 2025),
plus ZEGO/ByteSun from phase 1. "YoHo" is **not a vendor**: it is a voice-chat app (see §4). No public trace of a game
vendor called "Hippo" was found.

### Cited Findings

**BAISHUN (百顺 — "BAISHUN gaming platform") — VERIFIED from a copy of its integration document**
- A file "BAISHUN Game Access Documentation V1.2.txt" — "Game access documentation (H5) Version 1.2.8 - 2025.03.24",
  change log from 2023.05.04 — is committed in a public repo of a small voice-app developer — [QaisarWaheed/dark-party](https://raw.githubusercontent.com/QaisarWaheed/dark-party/HEAD/BAISHUN%20Game%20Access%20Documentation%20V1.2.txt);
  the same developer's second repo summarises it from "assets/BAISHUN Game Access Documentation V1.2.8.pdf" — [dark-party-2 BAISHUN_game_settings.md](https://raw.githubusercontent.com/QaisarWaheed/dark-party-2/HEAD/docs/BAISHUN_game_settings.md)
- Game list in the document (game_id → name): 1001 Texas Hold'em, 1004 Slots, 1005 Joy Bounce, 1006 Fruit Slot, 1007
  Angel and Devil, 1008 Whack-a-Mole, 1009 Gesture Guess, 1010 Lottery, 1012 Digital War, 1013 Horse Racing, 1014 Fast 3,
  1015 Billiards, 1016 Rocket, 1017 Fruit 2, 1018 Horse Racing 2, 1019 Slots 2, 1020 Fruit Ranch, **1021 Lucky Gift**,
  1022 Fishing, 1023 Lava Slots, 1024 Camel Racing, 1025 Dog Racing, 1026 Roulette Chest, 1027 Witch Slots, 1028 LUDO,
  1029 Fruit Roulette; the sample game-list response uses `"name":"greedy"` — same source
- Integration model: the operator calls BAISHUN's game-list API, downloads each game as a **zip package** (default host
  Alibaba Cloud OSS), stores it in the app, opens it in a full-screen **WebView**, and talks to it through a **JSBridge**
  (`getConfig`, `destroy`, `gameRecharge`, `gameLoaded`, `walletUpdate`); game modes "2: Half Screen (Streamer Show)"
  and "3: Full screen (Game Lobby)" — same source
- `gameRecharge`: "When the game coins are insufficient ... the APP will be notified, and the APP will open the mall
  page" (the game pushes the user to the operator's coin shop) — same source
- Money model: **coins stay on the operator's server**; BAISHUN calls the operator's `POST /v1/api/change_balance` with
  `currency_diff` (negative = debit), `diff_msg` = "bet", "result", "refund", "buyin", "buyout", a unique `order_id`,
  `game_round_id`, `room_id`. The operator must lock per user ("may be called multiple times in one second") and must not
  settle twice when BAISHUN "make[s] up the order" with the same `order_id`. Error 1008 = insufficient balance, 1023 =
  "Restricted IP" — same source
- Auth: md5(SignatureNonce + AppKey + Timestamp), valid 15 seconds; one-time `code` exchanged for `ss_token` — same source
- **Robots**: message types `robot_bet`, `robot_result` ("Robot betting", "Robot settlement") for "All Games", and for
  Rocket `crash_robot_result` and `robot_top_jackpot` ("Robot first price"); Rocket also has `user_cash_out` with
  `odds` and `top_jackpot` — same source
- Slots "sceneMode" levels: "1: Maitreya 2: USA 3: 777"; game server nodes "101: Singapore (Alibaba Cloud) 201: Dubai
  (AWS) 301: Silicon Valley (Alibaba Cloud) 401: Frankfurt (Alibaba Cloud)" — same source
- Domains in the document: test server `game-cn-test.jieyou.shop`, `game-center-test.jieyou.shop` (game packages),
  icons on AWS S3 bucket `bsyx-store` (ap-southeast-1); sample URLs contain `bobilive-com-test` and `yomi_dev` — same source
- Other independent public repos integrate the same vendor: a Flutter widget `baishun_game_web_view.dart` pointing at
  `bobilive-comtest.jieyou.shop` — [taufiqurSabbir/meo](https://raw.githubusercontent.com/taufiqurSabbir/meo/HEAD/lib/src/features/room/presentation/component/games/baishun_game_web_view.dart);
  "BaishunGame integration" in a live-streaming Flutter app — [debs007/kinglive_flutter](https://raw.githubusercontent.com/debs007/kinglive_flutter/HEAD/lib/core/api/game_api.dart);
  backend requirements for "shaheenstar.online" — [dark-party-2 BACKEND_BAISHUN_REQUIREMENTS.md](https://raw.githubusercontent.com/QaisarWaheed/dark-party-2/HEAD/docs/BACKEND_BAISHUN_REQUIREMENTS.md);
  GitHub code search also lists `shaheerapp/emoliveapp` (`src/Api/baishun.tsx`) and `dalamber/baishun-test-game-server` —
  [GitHub code search "jieyou.shop"](https://github.com/search?q=jieyou.shop&type=code)
- No BAISHUN website, legal entity, country of registration, licence or price list was found — UNKNOWN.

**LeaderCC = Quantum Nexus — VERIFIED (sites), CIRCUMSTANTIAL (identity link)**
- `leadercc.com/product.jsp` serves a "Quantum Nexus" page: "Quantum Nexus™ 2024", "10 Year+", "400+" companies served,
  "product revenue exceeds ... 70 million+" (no currency/period), games praised "in Europe, America, the Middle East, and
  Southeast Asia"; contact marketing@quantum-nexus.net, **+44** 7526 229166; no address or legal entity — [leadercc.com/product.jsp](http://leadercc.com/product.jsp)
- Catalogue of 77 titles incl. Lucky777, Luck77, Teenpatti, Dragon Tiger II, Dragon Tiger Arena, SicBo, Baccarat,
  BlackJack2, Fruit Liberty Bell, Lucky Slots (with "JP prize"), SuperTurntable, Pizza/White Cat/Raccoon Ferris wheels,
  Arabian Gems, Alibaba's Cave of Fortune (243 paylines, "10,000x max win"), Cock Fighting, Football League ("coin
  payouts based on odds"), AVIA MASTERS, Gates Of Olympus, Sweet Bonanza, Starlight Princess, BIGGER BASS BONANZA, and
  one titled **"Racep Chamet"** — [quantum-nexus.net/productList.jsp](https://quantum-nexus.net/productList.jsp)
- Services page: IM, RTC, "Overseas payment: Help your software add overseas payment function", cloud server; no
  integration model, prices, RTP or licences — [quantum-nexus.net/companyService.jsp](https://quantum-nexus.net/companyService.jsp);
  company page: "Quantum Ltd.", "over a decade of experience", H5 game development and in-app games — [quantum-nexus.net/company.jsp](https://quantum-nexus.net/company.jsp)
- A public voice-room demo repo's README: "游戏对接 — 外部文档：https://docs.leadercc.com/web/#/5/23" — [ThinkerHu/LiveRoom ReadMe](https://raw.githubusercontent.com/ThinkerHu/LiveRoom/HEAD/ReadMe.md);
  its game list points at `gztest.leadercc.com/pokavoice_games/...`: 幸运摩天轮 (lucky Ferris wheel), 龙虎斗2.0 (Dragon
  Tiger), 多人捕鱼2.0 (fishing), 转盘2.0 (wheel), **水果拉霸2.0 (fruit slot, path `fruit_liberty_bell`)**, 超级财神爷
  (super god of wealth slot) — [ThinkerHu/LiveRoom GameList.json](https://raw.githubusercontent.com/ThinkerHu/LiveRoom/HEAD/app/src/main/assets/config/GameList.json)
- The public ShowDoc page itself rendered empty (JS app) — [docs.leadercc.com](https://docs.leadercc.com/web/#/5/23)

**JoyPlay (joysdk.com) — VERIFIED**
- "real-time interactive game service provider for overseas mobile markets", "social game SDK"; address "OFFICE 5, 8/F,
  MEGA CUBE, 8 WANG KWONG ROAD, KOWLOON BAY, KOWLOON, HONG KONG"; WhatsApp +852 5498 7223, don@joysdk.com; "© 2019 -
  2026 JoyPlay" — [joysdk.com/en](https://joysdk.com/en/)
- Games: Multiplayer Dice, Multiplayer Ferris Wheel, Slots, 777, Blackjack, VideoPoker, Multiplayer Poker, Car Racing,
  Football, Number Games, Ludo, UNO, Angel&Evil, Fish, Zeus, Rummy — same source
- Integration: "社交App只需要在应用中接入JoyPlay H5链接" (embed a JoyPlay H5 link) and "call JoyPlay's API ... within 30
  minutes"; clients only "众多知名欧美、中东、东南亚社交平台" — [joysdk.com/zh](https://joysdk.com/zh/)
- Marketing figures "Consume Coins 80%", "Promote Recharge 88%", "Improve Activity 96%" (unexplained) — [joysdk.com/en](https://joysdk.com/en/)
- GitHub profile "joysdk" names JoyPlay Technology Limited (Hong Kong) and says the SDK helps apps monetize through
  in-app currency and boost recharge — per search-result summary of [github.com/joysdk](https://github.com/joysdk)
  (page not opened directly; treat wording as unconfirmed)

**Wave Games (wavegames.online) — VERIFIED**
- "© 2026 Wave Games (since 2025)", Islamabad, Pakistan; WhatsApp +92 325 226 5427, supportwavetech@gmail.com; "150+
  Partner Apps" (none named) — [wavegames.online](https://wavegames.online/)
- Games: Teen Patti, Teen Patti Pro, Greedy Lion, Lucky 77, Crazy Fruit, Fruit Blast, Greedy King, Dragon Vs Tiger,
  Fruit Machine, Chicken Road, Forest Arrow — same source
- Integration: operator implements `GET /wave/game/userInfo` (balance) and `POST /wave/game/submitFlow` (type 1 = bet
  debit, type 2 = win credit); game UI by URL with `appKey`, `token`, `gameId`, over WebSocket — same source
- A public Kotlin file in an Indonesian-language voice-room app: "Game pihak ketiga (WaveGames). Game berjalan di
  WebView; coin dipotong dan ditambah ... lewat endpoint userInfo / submitFlow", with Greedy Lion (id 1), Fruit Blast
  Jackpot (8), Teen Patti (16), Crazy Fruit (54), Lucky 77 (77), Greedy King (80), Teen Patti Pro (81) and catalogue
  `my.wavegames.online/admin/game/list?appKey=` — [exbottod/rezo-star-voice-chat-room WaveGames.kt](https://raw.githubusercontent.com/exbottod/rezo-star-voice-chat-room/HEAD/app/src/main/java/com/rezochatvoice/exceo/WaveGames.kt)

**SUD / 忽然科技(上海)有限公司 — VERIFIED (adds to phase 1)**
- Legal name 忽然科技(上海)有限公司, founder/CEO 王法; Pre-A round "数千万元" led by 金沙江创投 (Nov 2022) — [36Kr](https://www.36kr.com/p/2020683667132681)
- Pre-A+ round Dec 2023 led by 东方融润; reported "已实现盈利"; serving "超过500个头部泛娱乐应用", 70%+ overseas — per
  search summaries of [Sina](https://finance.sina.com.cn/tech/roll/2023-12-13/doc-imzxvrpc9300220.shtml) and
  [Aliyun startup](https://startup.aliyun.com/info/1070074.html) (not opened in full)
- SUD bought the Cocos engine (厦门雅基软件) for a reported RMB 510 million, announced Nov 2025 — [Game World Observer](https://gameworldobserver.com/2025/11/13/the-cocos-engine-was-purchased-for-72-million);
  [OSChina](https://www.oschina.net/comment/news/391310)
- Volcengine's voice-room scene doc tells integrators to combine its RTC SDK with "SUD MGP 互动小游戏接入平台" — per search
  snippet of [Volcengine doc 6348/136529](https://volcengine.com/docs/6348/136529); Agora's own sample "play_zone" scene
  bundles SudMGPWrapper — [AgoraIO-Usecase/agora-ent-scenarios (GitHub code search)](https://github.com/search?q=tech.sud.mgp&type=code)

**Other**
- NetEase 云信 sells an SDK "桌游、PVP、休闲、棋类等数十种小游戏" for voice rooms; no chance games or vendors named — [yunxin.163.com/minigame](http://yunxin.163.com/minigame)
- Public Play/web listings openly advertise these titles in voice apps: "Voice Party" ("in-room webview mini-games
  including Greedy Animal Wheel, Lucky 77, and Food Wheel Party") and "Chat Aura" (Greedy Ferris Wheel, Lucky 77,
  Lucky Slots) — per search summaries of [Voice Party](https://play.google.com/store/apps/details?id=com.voiceparty.app)
  and [Chat Aura](https://play.google.com/store/apps/details?id=com.chataura.app&hl=en_US) (pages not readable by my tool);
  JOOH ("JOOH Private Limited, Pakistan"): in-room "Rocket, Dragon Tiger, and Greedy and Lucky 77 ... play with coins",
  "$1 = 10,000 coins", hosts "withdraw through a reseller" — [jooh.live](https://www.jooh.live/)

### Inferences
- ASSUMPTION: "BSYX" in the S3 bucket name fits 百顺游戏 (BaiShun YouXi) initials; jieyou.shop is BAISHUN's game
  domain. The document copy is not published by BAISHUN itself, but five unrelated public repos use the same domains and
  API names, so its authenticity is CIRCUMSTANTIAL-strong.
- ASSUMPTION: leadercc.com and quantum-nexus.net are one vendor (leadercc.com serves the Quantum Nexus page; both
  catalogues include "Fruit Liberty Bell").
- ASSUMPTION (background knowledge): several Quantum Nexus titles share names with well-known licensed casino slots
  (Gates of Olympus, Sweet Bonanza, Starlight Princess, Big Bass series are Pragmatic Play titles; Aviamasters is
  BGaming's; Chicken Road on Wave Games is InOut's). Either licensed or imitations — an IP/clone risk to ask about.
- The vendor market looks like two tiers: a cloud tier (SUD, ZEGO, Agora partners) with docs and investors, and a grey
  tier (BAISHUN, LeaderCC/Quantum Nexus, JoyPlay, Wave Games) marketed by WhatsApp/email with no entity or address
  beyond a HK office or a Pakistani phone number.

### Gaps
- BAISHUN's own site, legal entity, ownership and country: UNKNOWN (no indexed site; doc gives only domains).
- "Hippo" as a game vendor: no trace found (UNKNOWN). Possibly a mis-remembered name.
- Quantum Nexus legal entity (UK "Ltd"? +44 number only): not checked on Companies House (budget) — UNKNOWN.

---

## 2. Are they licensed gambling suppliers? RTP controls, house edge, RNG certificates?

### Takeaway
**No vendor claims any gambling licence (UKGC, MGA, Curaçao) or any RNG test certificate (GLI, BMM, iTech Labs).**
What they do expose is the opposite of a certified product: Wave Games sells **"RTP control access"** to the operator,
SUD has a `commission_score` rake field, and BAISHUN's protocol reports **robot bets and robot jackpots** in the same
rounds as real users.

### Cited Findings
- Wave Games: Starter and Advanced plans include "RTP control access" (page inconsistent on whether pay-as-you-go has
  it); only "fair algorithms" / "balanced math formulas", no certification — [wavegames.online](https://wavegames.online/)
- JoyPlay: "Fair math formula, verified by a large number of users" / "已通过海量用户验证过的算法，数值成熟稳健"; no
  licence or certificate — [joysdk.com/en](https://joysdk.com/en/); [joysdk.com/zh](https://joysdk.com/zh/)
- Quantum Nexus / LeaderCC: no licences, certificates or RTP mentioned on product, company or services pages —
  [productList](https://quantum-nexus.net/productList.jsp); [companyService](https://quantum-nexus.net/companyService.jsp)
- BAISHUN document: no RTP, odds table, licence or certificate; robot message types `robot_bet`, `robot_result`,
  `crash_robot_result`, `robot_top_jackpot` — [BAISHUN doc copy](https://raw.githubusercontent.com/QaisarWaheed/dark-party/HEAD/BAISHUN%20Game%20Access%20Documentation%20V1.2.txt)
- SUD: `commission_score` and `is_ai` robots (phase 1) — [SUD user settle notify](https://docs-gitbook.sud.tech/en-US/app/Server/HttpsCallback/notify/UserSettleNotify.html)
- Nivi's own help text tracks a "Prize Return Rate" for room games (phase 1) — [h5game.candycubehk.com/webpage](https://h5game.candycubehk.com/webpage/)

### Inferences
- ASSUMPTION: "RTP control" sold to the operator means the payout rate is a commercial dial, not a certified constant;
  robots seated against paying users mean a user cannot know whether the "winner" banner was real. Both are serious
  consumer-protection points and would fail any regulated-market technical standard.
- ASSUMPTION: Silence about licences is consistent with these vendors positioning as "social games" suppliers.

### Gaps
- UKGC/MGA register lookups: the UKGC search URL I tried returned 404 (the register is a JS app); MGA not tried.
  Not verified either way — the writer should say "no licence claimed", not "confirmed unlicensed".

---

## 3. What commercial terms are public?

### Takeaway
Only **Wave Games** publishes prices: **$400/month (3 games), $600/month (full catalogue + customisation), or 15% of
monthly profit** with no fixed fee. Everyone else is "contact sales". SUD's model per press: the app pays SUD, SUD
shares with game developers.

### Cited Findings
- Wave Games: "Starter: $400/month, any 3 games. Advanced: $600/month, full catalog plus customization. Pay as you go:
  15% of monthly profit, no fixed fee"; 7-day trials; integration PDF "after partner signup" — [wavegames.online](https://wavegames.online/)
- SUD: SDK + cloud service sold to apps; open platform for upstream game makers — [36Kr](https://www.36kr.com/p/2020683667132681);
  fee/revenue-share figures not stated — same source
- JoyPlay, Quantum Nexus, BAISHUN: no prices or shares on public pages — [joysdk.com/en](https://joysdk.com/en/);
  [quantum-nexus.net/companyService.jsp](https://quantum-nexus.net/companyService.jsp)
- BAISHUN has a "customer backend" where appId/appChannel are viewed and operator API addresses configured — [BAISHUN doc copy](https://raw.githubusercontent.com/QaisarWaheed/dark-party/HEAD/BAISHUN%20Game%20Access%20Documentation%20V1.2.txt)

### Inferences
- ASSUMPTION: "15% of monthly profit" means the vendor shares the house's win (users' losses minus wins); the vendor is
  economically a co-operator of the chance game, which matters for any "we only resell software" defence.

### Gaps
- Revenue-share terms of BAISHUN, LeaderCC, JoyPlay, SUD: UNKNOWN.

---

## 4. Which links "app X uses vendor Y" can be evidenced, and how strongly?

### Takeaway
Hard technical evidence exists for **mid-size MENA voice apps** (Hilo, StarChat, Tada, Yaahlan, Hawa, Lama), not for
the big names. For **Nivi, Zili, Timo, Bigo, Poppo, MICO, Yalla**: no vendor link found. **SUGO** and **YoHo/MICO**
ship their own game modules; **Chamet** has a half-screen H5 game screen with an unidentified vendor; **SoulChill** shows
Momo's web framework but no vendor.

### Cited Findings (evidence strength in brackets)

Technical artefact = TapTrap published activity lists ([TapTrap README](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/README.md),
USENIX Security 2025, 99,705 Play apps). App identity = public Google Play title for the package.

| App (Play title, package) | Vendor evidence | Strength |
| --- | --- | --- |
| Hilo — Group Chat & Video (`com.qiahao.nextvideo`) | `ui.baishun.BaiShunGameActivity`, `BaiShunWebActivity` — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.qiahao.nextvideo.json) | Technical artefact → BAISHUN |
| StarChat — Group Voice Chat Room (`com.qhqc.starvoice`) | `BaiShunGameActivity` **and** `tech.sud.mgp...SudUnityPlayerActivity` — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.qhqc.starvoice.json) | Technical artefact → BAISHUN + SUD |
| Tada — Voice Rooms & Games (`com.vpb.popo`) | `othergame.OtherBaiShunGameActivity`, `OtherYuanYouGameActivity`, `zegogame.PlayerMatchActivity` — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.vpb.popo.json) | Technical artefact → BAISHUN (+ ZEGO game, + unknown "YuanYou") |
| Honeycam Pro / Lite (`com.honeycam.pro`, `.lite`) | `thirdsdkgame.business.baishunsdk.BaiShunGameActivity`, `LuckyTurntableActivity`, `GameBetFullActivity` — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.honeycam.pro.json) | Technical artefact → BAISHUN |
| Yaahlan — Voice Chat Party & Games (`com.immomo.biz.yaahlan`) | `weblogic.sud.SudGameActivity`, `SudGame1v1Activity`, `giftlib.rocket` — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.immomo.biz.yaahlan.json) | Technical artefact → SUD |
| Hawa — Gaming Together (`com.hawatalk.live`, OWOL Technology Pte. Ltd.) | `tech.sud.mgp` Unity activities — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.hawatalk.live.json) | Technical artefact → SUD |
| DiDO, WeGo Party, Binmo lite, ScMeet lite | `com.dido.sud.CreateSudGameActivity`; `com.wego_sudmgp.*`; `tech.sud.mgp` — [GitHub code search in TapTrap](https://github.com/beerphilipp/taptrap/tree/main/vulnerable_app_detection/results/2025-05-20/output) | Technical artefact → SUD |
| Lama / Lama Lite (WeNext Limited) | `gift.luckygift.LuckyGiftRecordActivity`, `newludo.LudoActivity`, `okey101.Okey101GameActivity`, `webview.BSWebViewActivity` — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.wenext.lama.json) | In-house Ludo/Okey; "BS" WebView = CIRCUMSTANTIAL only (could mean anything) |
| **SUGO** (`com.voicemaker.android`; Sugo lite `com.fiya.android`, same Play dev id) | in-house `com.biz.ludo.*` (Ludo lobby/shop/bag), `biz.audio.superwinner.SuperWinnerTurntableTestActivity`; no third-party vendor activity — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.voicemaker.android.json) | CIRCUMSTANTIAL: in-house games; absence of vendor names is not proof (H5 vendors can run in a generic WebView) |
| **YoHo** — Group Voice Chat Room (`com.voicechat.live.group`) | `MicoGameTestActivity`, `MicoTestGameSdkActivity`, `MicoTestH5BrowserHelpActivity`, `TestRoomRocketAnimActivity` — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.voicechat.live.group.json) | CIRCUMSTANTIAL: YoHo shares MICO's code base and an own "game SDK"; YoHo is an app, not a vendor |
| **Chamet** (`com.hkfuliao.chamet`, FULIAO HONG KONG LIMITED) | `HalfScreenChametGameWebActivity`, `LuckyWinDialogActivity`, `WithDrawWebViewActivity` — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.hkfuliao.chamet.json); privacy policy names no game partner — [Chamet privacy](https://h5.uchamet.com/appH5/pact/privacy.html); Quantum Nexus lists a title "Racep Chamet" — [productList](https://quantum-nexus.net/productList.jsp) | UNKNOWN vendor; Quantum Nexus link = CIRCUMSTANTIAL (a title name only) |
| **SoulChill** (`com.live.soulchill`, dev "SpaceCape") | only WebView activities, incl. Momo's `com.immomo.mk` framework — [TapTrap file](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.live.soulchill.json) | UNKNOWN vendor; Momo code-base link CIRCUMSTANTIAL |
| Ahlan (`com.dobai.kis`), ViYa (`com.kinkey.vgo`) | `AudioGameRoomActivity`, `GameCenterActivity`; ViYa `LuckyGiftRecordActivity` — [TapTrap Ahlan](https://raw.githubusercontent.com/beerphilipp/taptrap/HEAD/vulnerable_app_detection/results/2025-05-20/output/com.dobai.kis.json) | No vendor visible |
| **Nivi** | Public H5 bundle references no game-vendor domain (only pocketliveapp.com, koudailive.com, laylachat.com, Feishu, Tencent COS, ThinkingData, adjust, and **papara.com** as a payout-account field); Privacy Policy mentions an unnamed "Game business partner" (phase 1) — [h5game.candycubehk.com/webpage](https://h5game.candycubehk.com/webpage/) | UNKNOWN vendor (VERIFIED negative for the public bundle) |
| Zili, Timo, Bigo, Poppo, MICO, Yalla | Not found in TapTrap search by name; no repo or doc links. Yalla builds in-house (phase 1, [Baijing](https://www.baijing.cn/article/45395)) | UNKNOWN |
| Small apps: Shaheen Star / Dark Party, Rezo Star / Viza, emoliveapp, kinglive, meo | Vendor docs and code in their public repos (see §1) | Direct technical artefact (BAISHUN, Wave Games) |

Extra Nivi finding (VERIFIED as text in the public bundle): the same H5 bundle contains a page for "Pocket
元宇宙语音社交平台" with China record numbers "蜀ICP备2022020984号-1" and "川网文（2022）3451-727号" and a download link
`pocket_cn.apk` on a Tencent COS bucket in ap-chengdu — [h5game.candycubehk.com/webpage](https://h5game.candycubehk.com/webpage/) (public JS).

### Inferences
- ASSUMPTION: BAISHUN's real clients are mid-size Arabic/MENA voice and 1-v-1 video apps (Hilo, StarChat, Tada,
  Honeycam) and many small South-Asian white-label apps; SUD is the default for the bigger "games + voice" apps
  (Yaahlan/Momo, Hawa). The biggest groups (Yalla, MICO/YoHo, SUGO) appear to build their own.
- ASSUMPTION: Nivi's operator is likely Chengdu-linked (Sichuan ICP and 川网文 numbers in the same bundle). The named
  Chinese company could be found by an ICP lookup (not done: needs a records site).
- ASSUMPTION: Nivi's `papara.com` field means Turkish payouts to Papara e-wallets — relevant for the Turkish legal
  analysis of cash-out (not a vendor point).

### Gaps
- No direct statement (press release, case study, privacy-policy partner name) links any of the ten named competitor
  apps to any vendor. Data-safety and Exodus checks were not repeated (Exodus failed in phase 1).
- TapTrap shows 2024 builds only; current builds may differ.

---

## 5. What does this mean legally for an operator?

### Takeaway
Buying games moves code, not risk. The store rules make the app responsible for every H5 game it shows; the vendors
here claim no licence or certificate, sell RTP dials, seat robots and share profit — so an operator that plugs them in
is running an uncertified chance game under its own name.

### Cited Findings
- Apple 4.7: "You are responsible for all such software offered in your app, including ensuring that such software
  complies with these Guidelines and all applicable laws" — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Google Play: violations include "Games that accept money in exchange for an opportunity to win a physical or monetary
  prize" — [Google Play: Real-Money Gambling, Games, and Contests](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en)
- UK: supplying gambling software without an operating licence is an offence (Gambling Act 2005 s.41); licensed operators
  may use only licensed suppliers' software — [UKGC: What is gambling software](https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/what-is-gambling-software)
- BAISHUN games are downloaded as zip packages and updated by version number outside the store — [BAISHUN doc copy](https://raw.githubusercontent.com/QaisarWaheed/dark-party/HEAD/BAISHUN%20Game%20Access%20Documentation%20V1.2.txt)

### Inferences
- ASSUMPTION: Remote zip/H5 updates let the vendor change odds or content after store review; the operator carries that.
- ASSUMPTION: For Similar Club, a vendor like BAISHUN/Wave Games would break the house rules (`CLAUDE.md`): outcomes and
  balances decided on a foreign server; robot bets; RTP set by contract; no odds table to show users; data to unknown
  entities (KVKK). Fits the phase-1 conclusion: keep chance games in-house or off, buy only no-stake social games.

### Gaps
- Turkish-law application (7258 sayılı Kanun) is for the legal researcher.
