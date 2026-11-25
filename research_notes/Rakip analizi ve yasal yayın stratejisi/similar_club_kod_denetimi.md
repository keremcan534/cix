# Similar Club: code and document audit of wallet, games, gifting and agency/payout (compliance input)

Scope: read-only audit of `/home/user/cix` on 25 Nov 2026 (branch as checked out). Code paths are repo-relative with
line numbers. Each section separates **[CODE]** (verified in server/app source), **[DOC]** (what `docs/*.md` claim) and
**[INF]** (my inference). Policy texts were checked on the web where cited. This is not legal advice; it is a factual
map for counsel.

---

## 1. Currencies, how they are obtained, and every conversion path

### Takeaway
There are three ledger currencies (coins, diamonds, game coins) plus "reward coins" (a coin channel). Coins become
diamonds 1:1 through any gift; diamonds become cash (withdrawal or Jeton Noktası) for women, agency owners and big-family
owners, or become coins again (Çevir) for anyone. Only game coins are a true closed loop.

### Cited Findings
- [CODE] Three balances on `users`: `coins`, `diamonds`, `game_coins`; the ledger accepts only `coin | diamond | game`; the ledger is append-only with `UNIQUE (user_id, currency, ref)` — [server/api/migrations/001_users_wallet.sql:9-12, 24-37](server/api/migrations/001_users_wallet.sql). Every balance change goes through `move` — [server/api/core.mjs:269-281](server/api/core.mjs).
- [CODE] Coins live in "lots" by channel. Final channel list: `google, apple, test, bonus, legacy, jeton_noktasi, toptan, bozdurma, cevir, kampanya, odul, ugurlu, canta` — [server/api/migrations/029_lucky_bags.sql](server/api/migrations/029_lucky_bags.sql) (last `coin_lots_channel_check`); labels and diamond-lock class per channel — [server/api/wallet.mjs:27-50](server/api/wallet.mjs).
- [CODE] **How coins are obtained:**
  - Google Play IAP (`google`) and App Store IAP (`apple`), server-verified — [server/api/purchases.mjs:1-33](server/api/purchases.mjs); first-purchase bonus (`bonus`) and campaign extra (`kampanya`) on store purchases.
  - Test top-up (`test`) only with `ALLOW_TEST_TOPUP=1` — [server/api/index.mjs:139,150,249-260](server/api/index.mjs); production server currently runs `TEST_MODE=1` by default — [.github/workflows/server.yml:56-59,169-173](.github/workflows/server.yml).
  - **Jeton Noktası** (`jeton_noktasi`): a user account with role `coins_bank` sells coins to people "who pay it outside the app" and records only a free-text receipt — [server/api/jeton.mjs:15-21, 253-286](server/api/jeton.mjs). Management sells it stock wholesale (`toptan`) and can itself load coins to any user against a TL amount (`admin_load`) — [server/api/jeton.mjs:1-14](server/api/jeton.mjs), [docs/JETON_YONETIMI.md](docs/JETON_YONETIMI.md) "Yönetim jeton yüklemesi".
  - Reward coins (`odul`): welcome coins, invite reward, call task, family chest — [server/api/referrals.mjs:91,161-162](server/api/referrals.mjs), [server/api/call-log.mjs:128](server/api/call-log.mjs), [server/api/family-more.mjs:205](server/api/family-more.mjs). They can be spent **only in the shop**, never on gifts, bags or games (`spendCoins use='paid'` excludes `odul`) — [server/api/wallet.mjs:123-145](server/api/wallet.mjs).
  - Şanslı hediye wins and Oda roketi coin prizes (`ugurlu`): "spent like any coin" — [server/api/wallet.mjs:42-44](server/api/wallet.mjs), [server/api/lucky.mjs:239-241](server/api/lucky.mjs), [server/api/room-rocket.mjs:208](server/api/room-rocket.mjs).
  - Şanslı çanta coin shares (`canta`) — [server/api/lucky-bags.mjs:152-153](server/api/lucky-bags.mjs).
  - Çevir (`cevir`) and Jeton Noktası diamond purchase (`bozdurma`) — see conversions below.
- [CODE] **Prices/rates and where configured:**
  - 1.000 coins = 220 TL list value (`COIN_VALUE_TL`, live key `coin_value_tl`) — [server/api/catalog.mjs:149](server/api/catalog.mjs), [server/api/live-registry.mjs:1027](server/api/live-registry.mjs). Packs 1.000–50.000 coins, product ids `coins_<n>`; retired packs up to 1.000.000 still credited — [server/api/catalog.mjs:160-181](server/api/catalog.mjs). Store price is set in Play Console.
  - VIP subscriptions 7/30/90 days at 145/285/599 TL — [server/api/catalog.mjs:217-221](server/api/catalog.mjs).
  - Diamond value 1.000 💎 = 1 USD (`EXCHANGE.diamondsPerUsd`, live key `diamonds_per_usd`) — [server/api/catalog.mjs:233](server/api/catalog.mjs), [server/api/live-registry.mjs:1091](server/api/live-registry.mjs).
  - Payout rate 1 USD = 49 TL (`PAYOUT_USD_TRY`, live `payout_usd_try`) vs. reporting rate 50,62 (`exchange_usd_try`) — [server/api/catalog.mjs:233,243](server/api/catalog.mjs), [server/api/live-registry.mjs:999,1110](server/api/live-registry.mjs).
  - Wholesale to Jeton Noktası 220 TL / 1.000 coins (`jeton_wholesale_tl`) — [server/api/catalog.mjs:259-260](server/api/catalog.mjs), [server/api/live-registry.mjs:1046](server/api/live-registry.mjs).
- [CODE] **Conversion paths:**
  1. Coins → diamonds (recipient), 1:1, on every gift: `giftCoins` → `giftDiamonds` — [server/api/wallet.mjs:172-195](server/api/wallet.mjs); used by normal gifts [server/api/gifts.mjs:274](server/api/gifts.mjs), Şanslı share, bag gifts, bond gifts, paid DMs/calls (1 jeton = 1 elmas per `dm_price`, `call_voice_price`, `call_video_price` — [server/api/live-registry.mjs:168-170](server/api/live-registry.mjs)), private album ([docs/DENETIM.md](docs/DENETIM.md) "Özel albüm").
  2. Diamonds lock: store-coin diamonds 7 days, Jeton Noktası-coin diamonds 1 day (`LOCK_DAYS_STORE/JETON`) — [server/api/wallet.mjs:20-24](server/api/wallet.mjs). Only unlocked diamonds leave — [server/api/wallet.mjs:232-240](server/api/wallet.mjs).
  3. Diamonds → coins (Çevir), anyone incl. men: `floor(diamonds/1000 × usdTry × 1000/coinValueTl)` ≈ 230 coins per 1.000 💎 at defaults — [server/api/index.mjs:293-330](server/api/index.mjs), [server/api/catalog.mjs:236-237](server/api/catalog.mjs).
  4. Diamonds → cash (Para çek): 10.000–1.000.000 💎 per request, 10.000.000 💎/week, one open request, IBAN (any country, mod-97) or `other` free-text account; paid by the owner outside the app and marked paid — [server/api/withdraw.mjs:1-24, 106-140, 197-235](server/api/withdraw.mjs), [server/api/catalog.mjs:265-266](server/api/catalog.mjs).
  5. Diamonds → TL via a Jeton Noktası ("Anında bozdur"): the bank pays the host outside the app at the payout rate and receives coins worth value + 3 % — [server/api/jeton.mjs:288-320](server/api/jeton.mjs), [server/api/catalog.mjs:248-253](server/api/catalog.mjs).
  6. Cash-out eligibility (paths 4 and 5): agency owners, owners of families with ≥10 members (`family_cashout_members`), or any account whose **self-declared** gender is `Kadın`; men refused — [server/api/streamer-rule.mjs:61-73](server/api/streamer-rule.mjs), [server/api/live-registry.mjs:402](server/api/live-registry.mjs). Gender is set once by the user — [server/api/social.mjs:295-300](server/api/social.mjs).
  7. Game coins: written only by casino, wheel and live rocket; spendable only on those games — [server/api/casino.mjs:265,300](server/api/casino.mjs), [server/api/wheel.mjs:175,182](server/api/wheel.mjs), [server/api/rocket-live.mjs:300,387,555](server/api/rocket-live.mjs) (grep of every `move(..., 'game', ...)`).
  8. Diamonds → agency/BD commission and host weekly bonus (platform-paid diamonds) — [server/api/host-bonus.mjs:120](server/api/host-bonus.mjs), [server/api/agency-lib.mjs:729](server/api/agency-lib.mjs), [docs/AJANS_HIYERARSI.md](docs/AJANS_HIYERARSI.md) lines 3-33.
- [CODE] "Play money" guard: a server with test top-ups/sandbox on, or a DB that ever held a test coin, can never mark a withdrawal paid — [server/api/wallet.mjs:57-101](server/api/wallet.mjs), [server/api/withdraw.mjs:208-210](server/api/withdraw.mjs).
- [DOC] Economics example: 1.000-coin gift (220 TL) leaves the host 1 USD = 49 TL; at the top agency level the agency gets another 1 USD, BD ~0,1 USD; with weekly bonus up to ~2,6 USD ≈ 127 TL — [docs/AJANS_HIYERARSI.md:31-33](docs/AJANS_HIYERARSI.md).
- [DOC] `docs/COINS_BANK.md:139` lists a fourth "Bonus Credits" currency (`bonusCashable = 0`); [CODE] no such currency exists on the server (ledger CHECK allows only three). Doc is stale.

### Inferences
- [INF] Value cycle: purchase 220 TL → 1.000 coins → gift → 1.000 💎 → withdraw 49 TL (≈22 % of list price), or Çevir → ≈230 coins. Coins and diamonds are fungible across users; only `odul` coins and game coins are segregated.
- [INF] Because any self-declared woman (not only streamers in an agency) may withdraw, any two cooperating accounts form a coin → cash channel.

### Gaps
- Real Play Console prices and Google's commission share were not visible; the TL figures are list values in code.
- Whether VIP subscription revenue reaches the finance panel: [DOC] PARA_DENETIMI "Kalanlar" says it does not yet.

---

## 2. Chance features: stake, prize, odds, disclosure, and paths to cash

### Takeaway
Şanslı hediye is a chance draw staked with purchased coins whose prize is ordinary, giftable coins, so a prize can reach
cash via gift → diamonds → withdrawal; it is **on by default** for any 18+ (self-declared) user at Cömertlik Lv.2.
Oyun Salonu/Rüzgâr Gülü/Yörünge are closed-loop (game coins) but are staked with purchased coins, have a 60 % house edge,
and are hidden behind an admin-only switch that can be flipped server-side.

### Cited Findings

**A. Şanslı (Uğurlu) hediye — OPEN LOOP, ON by default**
- [CODE] Stake: price × count × recipients of purchased/paid coins (not `odul`); recipient gets `sharePct` (default 10 %, panel range 1–50 %) as diamonds; the rest is a platform spend; each gift is one `crypto.randomInt` draw; a win pays `price × multiplier` to the **sender** as `ugurlu` coins — [server/api/lucky.mjs:14-24, 206-241](server/api/lucky.mjs), [server/api/lucky-rules.mjs:9-17](server/api/lucky-rules.mjs).
- [CODE] Multipliers 2–1.000×; default odds (out of 100.000): 2×15.000, 5×3.000, 10×800, 20×250, 50×60, 100×20, 500×2, 1000×1 → expected return 0,65× in coins (comment says "about 0.65×"); lk4 table ≈0,64× — [server/api/lucky-rules.mjs:23-37](server/api/lucky-rules.mjs). Default packages 20/100/500/1.000 coins.
- [CODE] Admin may set **any** odds table that sums to 100 % and any price 5–100.000 for up to 20 packages; no RTP floor/ceiling is enforced — [server/api/lucky-rules.mjs:47-80](server/api/lucky-rules.mjs). Edits are versioned and audited — [server/api/lucky.mjs:24-29, 346](server/api/lucky.mjs).
- [CODE] Counts include ×777; one request up to 16.000 draws (777 × 20 recipients) and combo `times` up to 50 — [server/api/lucky.mjs:55-63, 163-169](server/api/lucky.mjs). [DOC] "Onay yok: hiçbir hediye onay sormaz; tek dokunuşla gönderilir" — [docs/LUCKY_HEDIYE.md:35](docs/LUCKY_HEDIYE.md).
- [CODE] Gates: birth date present and ≥18, Cömertlik Lv.2 (≈35 coins spent), not blocked — [server/api/lucky.mjs:185-188](server/api/lucky.mjs). Platform daily payout cap 20.000.000 coins — [server/api/lucky-rules.mjs:38-39](server/api/lucky-rules.mjs), [server/api/lucky.mjs:209](server/api/lucky.mjs); [DOC] cap can be exceeded within one multi-draw send — [docs/PARA_DENETIMI.md](docs/PARA_DENETIMI.md) "Kalanlar".
- [CODE] Shown price and odds version are checked for newer apps (409 `price_changed`/`odds_changed`); older APKs play at current server odds — [server/api/lucky.mjs:7-9, 207](server/api/lucky.mjs); [DOC] [docs/LUCKY_HEDIYE.md:42-44](docs/LUCKY_HEDIYE.md).
- [CODE/DOC] Odds disclosure in app: odds table one tap away ("Olasılıklar" link under send button and on the shelf), not shown by default since 22 Nov 2026 — [app/src/components/room/gift-sheet.tsx:194-208, 617, 759](app/src/components/room/gift-sheet.tsx); [docs/LUCKY_HEDIYE.md:127](docs/LUCKY_HEDIYE.md). Expected return / house share deliberately **not** shown to players (owner decision) — [docs/LUCKY_HEDIYE.md:32](docs/LUCKY_HEDIYE.md), [docs/OYUN_MERKEZI.md](docs/OYUN_MERKEZI.md) "Kasa kuralı".
- [CODE] Wins are broadcast to every connected user in every room ("X kazandı … +1.000 jeton"), from `lucky_announce_min_coins` (default 0 = every win) — [server/api/lucky.mjs:30-31, 297](server/api/lucky.mjs), [server/api/live-registry.mjs:145,560](server/api/live-registry.mjs); [DOC] shown to everyone regardless of level — [docs/LUCKY_HEDIYE.md:56-62](docs/LUCKY_HEDIYE.md).
- [CODE] Path to cash: `ugurlu` coins are `paid`-use coins → any gift → recipient diamonds (7-day store lock) → withdrawal / Jeton Noktası if recipient is a woman/agency owner/family owner — [server/api/wallet.mjs:42-44, 139-161, 172-195](server/api/wallet.mjs), [server/api/streamer-rule.mjs:61-73](server/api/streamer-rule.mjs). [DOC] DENETIM Kritik §1 states this path explicitly and that the feature is "varsayılan olarak açık" — [docs/DENETIM.md:16-34](docs/DENETIM.md).
- [DOC] Contradiction: [docs/LUCKY_HEDIYE.md:113-114](docs/LUCKY_HEDIYE.md) says "Jetonlar nakde çevrilemez" / "Gerçek para karşılığı ödül, hukuki onay olmadan eklenmeyecek", while DENETIM §1 and the code show the coin → diamond → cash path exists.
- [INF] Illustration at defaults: a 500-coin (110 TL list) Altın Nal draw hitting 1000× (p = 1/100.000) pays 500.000 coins; gifted to a cooperating female account = 500.000 💎 = 500 USD ≈ 24.500 TL at the payout rate (subject to 1.000.000 💎/request and 10.000.000 💎/week caps).

**B. Oyun Salonu (casino: 13+ games incl. slots, Ejder ile Kaplan, Pachinko/bilye) — CLOSED LOOP, admin-only by default**
- [CODE] Stake from game coins first, then purchased coins; winnings always game coins; 60 % house, 40 % pool, JACKPOT share for slots; `crypto.randomInt` — [server/api/casino.mjs:1-24, 202-310](server/api/casino.mjs), [server/api/casino-rules.mjs:16, 62, 345](server/api/casino-rules.mjs).
- [CODE] Gate: `paidGamesOpen` = live `casino_open` contains `everyone` OR `role='admin'`; plus Cömertlik Lv.2; no age check — [server/api/wheel.mjs:35-42](server/api/wheel.mjs), [server/api/casino.mjs:227,244](server/api/casino.mjs), [server/api/live-registry.mjs:124,1230](server/api/live-registry.mjs). Per-game off switch `casino_off`, max bet `casino_max_bet`, daily rounds `casino_daily_rounds` (default 0 = no limit) — [server/api/live-registry.mjs:1211-1272](server/api/live-registry.mjs).
- [DOC] Odds table per game and RTP ≈40 % (e.g. Zar 6/36 × 2,4; Altın Kasa 39,97 %); app odds file `app/src/lib/casino-odds.ts` — [docs/OYUN_MERKEZI.md](docs/OYUN_MERKEZI.md) "Kasa kuralı" table; Pachinko 39,98–40,00 % — same doc "Pachinko".
- [DOC] Stale legal note in [docs/OYUN_MERKEZI.md](docs/OYUN_MERKEZI.md) "Hukuki uyarı" says casino winnings as coins could be gifted; [CODE] winnings are game coins, so that path no longer exists. What remains: stakes are bought with real money.
- [DOC] Daily per-game limits removed by owners (Nov 2026) — [docs/DENETIM.md:38-41](docs/DENETIM.md).

**C. Rüzgâr Gülü (wheel) — CLOSED LOOP, same switch**
- [CODE/DOC] 250/2.500/10.000-coin spins ×1/×10/×50; prizes game coins; 12 slices with stated odds; JACKPOT fund 1,5 % per spin; RTP ≈40 %; `WHEEL_DAILY` unset = no limit — [server/api/wheel.mjs:1-12, 46-49, 139-190](server/api/wheel.mjs), [server/api/wheel-rules.mjs:52-66](server/api/wheel-rules.mjs), [docs/RUZGAR_GULU.md](docs/RUZGAR_GULU.md).

**D. Canlı Yörünge (multiplayer crash game) — CLOSED LOOP, same switch**
- [CODE] Stake game coins then coins; win in game coins; crash point drawn server-side; house share live setting `rocket_house_pct` 3–90 % (default 60; at 90 % RTP is 10 %) — [server/api/rocket-live.mjs:503-560, 300](server/api/rocket-live.mjs), [server/api/rocket-live-rules.mjs:1-40](server/api/rocket-live-rules.mjs), [server/api/live-registry.mjs:1274-1288](server/api/live-registry.mjs).

**E. Oda roketi (room rocket) — no longer chance, but coin prizes are open-loop; OFF by default**
- [CODE] Since 25 Nov 2026 prizes go by contribution rank (most spender gets biggest coin prize), not by draw; coin prizes are `ugurlu` (giftable → cashable); `enabled: false` by default — [server/api/room-rocket.mjs:1-11, 198-208](server/api/room-rocket.mjs), [server/api/room-rocket-rules.mjs:26,123](server/api/room-rocket-rules.mjs). [DOC] [docs/ODA_ROKETI.md](docs/ODA_ROKETI.md) "Hukuk". [DOC] Stale: [docs/DURUM_LISTESI.md:104-105](docs/DURUM_LISTESI.md) still says prizes are "çekilir" / "şansla dağıtılan".

**F. Şanslı çanta (lucky bag) — free entry for participants, random split**
- [CODE] Sender pays the whole bag; anyone in the room who taps joins free; shares split and dealt at random; coin bags pay `canta` coins (giftable), gift bags pay recipients diamonds — [server/api/lucky-bags.mjs:1-19, 152-153](server/api/lucky-bags.mjs), [server/api/lucky-bag-rules.mjs:1-60](server/api/lucky-bag-rules.mjs). No odds/selection-method text found on the server; split rule is in code comments only.

**G. Others checked**
- [CODE] Zar Düellosu (room dice duel) is disabled in live builds: `if (liveBuild()) return { ok: false, reason: 'Zar Düellosu şu an kapalı.' }` — [app/src/lib/games.ts:310-314](app/src/lib/games.ts).
- [CODE] PK, room games (Ludo, Renk Kartları, XOX, Dört Taş, Okey) and events move no money (no `spendCoins/creditCoins/move` in pk.mjs, pk-cross.mjs, room-games.mjs, events.mjs).
- [CODE] Level/VIP/event/task rewards are shop items via `grantReward` ("Jeton, elmas ya da para ödül olarak bu yoldan verilmez") — [docs/CANTA.md](docs/CANTA.md) "Sunucuda: tek ödül yolu".
- [CODE] Host weekly bonus pays **diamonds** by earnings tiers (deterministic) — [server/api/host-bonus.mjs:120](server/api/host-bonus.mjs).

### Inferences
- [INF] Open-loop chance paths: Şanslı hediye (default on), Şanslı çanta (free entry, so likely not "gaming" for participants, but prizes are cashable), Oda roketi (now rank-based, default off). Closed-loop: Oyun Salonu, Rüzgâr Gülü, Yörünge.
- [INF] Even closed-loop games: a player who wins game coins saves purchased coins for gifts (fungibility of the stake side), a weaker but arguable "money's worth" link counsel should assess.

### Gaps
- Could not run the app to see exactly what a non-admin, Lv.0 user sees; based on code and docs.

---

## 3. Gating: age, level, region, KYC, test mode, flags and what reviewers see

### Takeaway
Age is a self-declared birth year enforced server-side only for Şanslı hediye; there is no region/country gate, no
platform gate and no KYC anywhere. Chance features are switched by server-side live settings, so the reviewed binary can
behave differently later.

### Cited Findings
- [CODE] App sign-up asks only a birth year and stores `YYYY-12-31` — [app/src/lib/signup.ts:4-26](app/src/lib/signup.ts). Server refuses a birth date under 18 when one is saved, but does not require one at sign-up (no `birth_date` check in auth.mjs/index.mjs) — [server/api/social.mjs:42, 301-309](server/api/social.mjs).
- [CODE] Server age checks exist only in `lucky.mjs:185`. None in casino, wheel, rocket-live, lucky-bags, withdraw, jeton, agency (grep of `ageOf/MIN_AGE`).
- [CODE] Level gate: Cömertlik Lv.2 for Şanslı and all coin games (`casinoNeed` = `gate('wealth','casino',2)`) — [server/api/levels.mjs:411](server/api/levels.mjs).
- [CODE] No country/region gating in any money module (grep of `country|ülke` in lucky, casino, wheel, rocket-live, withdraw, jeton, features). Withdrawals accept an IBAN "of any country" — [server/api/withdraw.mjs:19-20, 36-44](server/api/withdraw.mjs).
- [CODE] No KYC: no identity/tax fields in withdraw/agency modules (grep `kyc|tax|vergi|identity|tc_no`); [DOC] "Vergi numarası istenmez" for agency applications — [docs/AJANS_BASVURU.md](docs/AJANS_BASVURU.md) "Başvuru formu"; [DOC] "Ödeme öncesi kimlik kontrolü bu açığı kapatır" (gender bypass) — [docs/YAYINCI_KURALLARI.md](docs/YAYINCI_KURALLARI.md), [docs/DENETIM.md:112](docs/DENETIM.md). Note: [docs/KIMLIK_NUMARASI.md](docs/KIMLIK_NUMARASI.md) is the in-app 12-digit user ID, **not** a national ID/KYC.
- [CODE] Kill switches: `FEATURES_OFF` (.env) and live `features_off` gate routes server-side (`gifts, purchases, topup, exchange, jeton, withdraw, games, shop, ...`); note Şanslı send (`POST /api/lucky/send`) and live-rocket bet are **not** in the `ROUTES` map — [server/api/features.mjs:32-66](server/api/features.mjs). Şanslı is turned off per package (`enabled`) — [server/api/lucky.mjs:205](server/api/lucky.mjs); games by `casino_off`/`casino_open`.
- [CODE] Only a minimum-version switch (`min_version`) differentiates app versions; no per-platform or per-country flags — [server/api/live-registry.mjs:1172](server/api/live-registry.mjs), [server/api/features.mjs:1-13](server/api/features.mjs).
- [CODE] Reviewer access: fixed review phone/e-mail OTP (`OTP_REVIEW_PHONE/CODE`, `OTP_REVIEW_EMAIL`) — [server/api/auth.mjs:44-46, 85-111](server/api/auth.mjs). A fresh review account is Cömertlik Lv.0 and not admin, so by default it sees **no** Oyun Salonu/Rüzgâr Gülü (hidden, `paidGames:false` from `/api/me`) — [server/api/index.mjs:232-240](server/api/index.mjs), [docs/OYUN_MERKEZI.md](docs/OYUN_MERKEZI.md) "Erişim kuralı". Şanslı shelf requires Lv.2 (≈35 coins spent) and 18+.
- [CODE] Test mode: deploy keeps `ALLOW_DEV_AUTH=1, ALLOW_TEST_TOPUP=1` while repo var `TEST_MODE` is 1 (default) — [.github/workflows/server.yml:56-59,169-173](.github/workflows/server.yml); on test servers admins are lifted to top levels (`TEST_ADMIN`) — [server/api/test-admin.mjs:1-8](server/api/test-admin.mjs).
- [POLICY] Apple 2.5.19: "Don't include any hidden, dormant, or undocumented features in your app; your app's functionality should be clear to end users and App Review." (the request's "2.3.1" is about review notes/misleading marketing) — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

### Inferences
- [INF] The coin-game code ships in every APK/IPA but is invisible unless `casino_open=everyone` is set server-side; turning it on after review without disclosure is the pattern 2.5.19 (and Play's deceptive-behaviour rules) target. Disclosing it in review notes and showing it to the review account would be the conservative route.
- [INF] Absence of geo-blocking matters for UK law (section 5).

### Gaps
- Whether the production APK/IPA will be built with `EXPO_PUBLIC_DEMO=0` and which review notes will be filed: not in the repo.

---

## 4. Agency / payout system

### Takeaway
Hosts earn diamonds 1:1 from gifts, paid messages/calls and the private album; agencies earn a platform-paid commission
(35–100 % of their hosts' weekly diamonds), BDs ~5 %, referring agencies 5 % for 4 weeks. Payouts are requested in-app
and paid manually outside the app; there is no KYC, no tax identifier and (for agencies) no stored payout account.

### Cited Findings
- [DOC/CODE] Agency weekly levels: Gönül Bağı 35 %, Başlangıç 50 % (200.000 💎/week) … Elmas 100 % (1.500.000 💎/week); level ≥1 needs 20 active hosts earning ≥10 USD/week; new agency 50 % for 4 weeks; commission is not deducted from the host — [docs/AJANS_HIYERARSI.md:3-33](docs/AJANS_HIYERARSI.md), code `server/api/agency-levels.mjs`, `agency-level-rules.mjs`, migration 122. BD commission separate ledger (default 5 %) — [docs/AJANS_HIYERARSI.md:98-99](docs/AJANS_HIYERARSI.md). Referral agency 5 % of sub-agency commission for 4 weeks — [docs/AJANS_HIYERARSI.md:104-109](docs/AJANS_HIYERARSI.md). Commission basis includes "şans hediyesi" (Şanslı share) — [docs/AJANS_HIYERARSI.md:17-19](docs/AJANS_HIYERARSI.md), [server/api/lucky.mjs:232](server/api/lucky.mjs) (`recordIncome(..., 'lucky_gift', ...)`).
- [DOC] Host weekly bonus up to 50 % of weekly earnings, paid as diamonds — [docs/JETON_YONETIMI.md](docs/JETON_YONETIMI.md) "Yayıncı haftalık bonusu"; [CODE] [server/api/host-bonus.mjs:120](server/api/host-bonus.mjs).
- [CODE] Agency payout request: approved agency, closed-period ledger rows, min `payout_policy.min_diamonds`, currency USD/TRY, refused on play-money servers, one open request, audited — [server/api/agency.mjs:946-971](server/api/agency.mjs). Table stores amount/usd/currency/approver/payer/payment_ref, **no bank account fields** — [server/api/migrations/005_agency_network.sql:219-238](server/api/migrations/005_agency_network.sql). Two-person rule (approver ≠ payer) and history table — [docs/AJANS_HIYERARSI.md:173-177](docs/AJANS_HIYERARSI.md).
- [CODE] Host withdrawal: stores holder name + IBAN/other text + IP; admin marks paid with payout rate and TL; self-decision forbidden; audited `withdrawal.paid/reject` — [server/api/withdraw.mjs:106-140, 197-235](server/api/withdraw.mjs). Holder name is not matched to the account's identity.
- [CODE] Payment methods: `iban` or `other` (free text up to 120 chars; could hold a wallet address, Papara, etc.) — [server/api/withdraw.mjs:47-55](server/api/withdraw.mjs). No crypto integration in code (grep `usdt|binance|crypto wallet` empty).
- [DOC] Who pays: "the owner pays outside the app" — [server/api/withdraw.mjs:1-2](server/api/withdraw.mjs); Jeton Noktası pays hosts for diamonds itself ("uygulama aracılık etmez") — [app/src/components/coins-bank-live.tsx:307](app/src/components/coins-bank-live.tsx). Finance Control panel approves payouts — [docs/DENETIM.md:126-127](docs/DENETIM.md).
- [DOC] YAYIN_HAZIRLIGI §2: "Komisyonun nakde dönmesi madde 1'deki hukuk kararına bağlı" — [docs/YAYIN_HAZIRLIGI.md](docs/YAYIN_HAZIRLIGI.md) table row "Ajans ağı".
- [DOC] Gender rule: men cannot withdraw since 18 Nov; self-declared gender is bypassable — [docs/YAYINCI_KURALLARI.md](docs/YAYINCI_KURALLARI.md), [docs/DENETIM.md:112](docs/DENETIM.md).

### Inferences
- [INF] Legal payer appears to be the UK company (owner pays), but no invoice/withholding, no contract fields in the server's payout data; Turkish income-tax/withholding and the hosts' status (self-employed/contractor) are unaddressed in code and docs.
- [INF] Gender-based cash-out eligibility is a potential discrimination issue (Turkish Law 6701 on equality; UK Equality Act if UK users) and is easily bypassed; counsel should weigh it.
- [INF] Multi-level agency/referral commissions paid on recruits' activity may draw scrutiny under Turkish rules on pyramid schemes (6502 art. 55) — for counsel; not verified.

### Gaps
- Panel repo (`similarclup-finance-control`) not in this checkout; payout approval UI, 2FA and its audit could not be verified.

---

## 5. Store purchases, IAP, refunds and non-IAP paths

### Takeaway
Google Play IAP is wired end to end; App Store verification exists on the server but the app has no iOS purchase flow,
and Apple refunds are not ingested. The Jeton Noktası is an in-app-advertised, off-store way to buy coins for cash.

### Cited Findings
- [CODE] Server verification: Google Play Developer API (purchase must be "purchased", consumed after credit, account id hash checked); App Store Server API production then sandbox; each store transaction once — [server/api/purchases.mjs:1-33, 133-171](server/api/purchases.mjs).
- [CODE] App billing is Android-only: `const android = Platform.OS === 'android'` drives shop status — [app/src/lib/live/billing.ts:50-60](app/src/lib/live/billing.ts). No `platform: 'ios'` purchase call in the app (only the type in [app/src/lib/api.ts:387](app/src/lib/api.ts)).
- [CODE] Refunds: Google voided purchases polled hourly and refunded (unspent coins, still-locked diamonds, agency commission, bonds, bags) — [server/api/refunds.mjs:1-13](server/api/refunds.mjs), [server/api/jeton.mjs:22-26](server/api/jeton.mjs). Unlocked diamonds are "reported as unrecovered". **No App Store Server Notifications**: "No App Store notifications are read yet" — [server/api/vip.mjs:35](server/api/vip.mjs).
- [CODE/UI] Non-IAP path: Profile menu "Jeton Noktası" for every user — [app/src/app/(tabs)/profil.tsx:118](app/src/app/(tabs)/profil.tsx); screen text "Jetonu mağazadan ya da bir Jeton Noktası'ndan alabilirsin" and "Jeton almak ya da elmasını bozdurmak için bir Jeton Noktası ile mesajlaş. Ödeme uygulama dışında yapılır" — [app/src/components/coins-bank-live.tsx:99, 248](app/src/components/coins-bank-live.tsx). No platform condition found around it.
- [CODE] Management itself can sell coins for TL to any user (`admin_load`, super admin only) — [docs/JETON_YONETIMI.md](docs/JETON_YONETIMI.md) "Yönetim jeton yüklemesi", [server/api/jeton.mjs:9-11](server/api/jeton.mjs).
- [CODE] Jeton Noktası sales bypass the user's daily spending limit (`capped: false`) — [server/api/jeton.mjs:276](server/api/jeton.mjs), [server/api/spend-limit.mjs:4-5](server/api/spend-limit.mjs).
- [DOC] Store accounts, product setup and legal texts are open owner items — [docs/YAYIN_HAZIRLIGI.md](docs/YAYIN_HAZIRLIGI.md) §1 rows 3, 7, 8, 11.
- [POLICY] Apple 3.1.1/3.1.3: apps "may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase" outside the US storefront; gifts "may only be refunded to the original purchaser and may not be exchanged"; purchased in-game currencies "may not expire" — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

### Inferences
- [INF] The Jeton Noktası as built (listing sellers, chat-to-buy, coins credited after an off-app TL payment) is the classic "coin reseller" pattern; on iOS it conflicts with 3.1.1/3.1.3 and on Google Play with the Payments policy (not fetched here; counsel/PM to confirm current Play Payments text).
- [INF] Apple 3.1.1 "gifts … may not be exchanged" vs. diamonds being exchangeable for cash/coins: creator payouts are common in live-stream apps, but counsel should confirm how Apple treats gift value convertible by the receiver.
- [INF] Apple refunds would leave coins/diamonds of refunded purchases in circulation until handled by hand.

### Gaps
- Google Play Payments policy page was not fetched; current text on resellers/alternative billing in Turkey unverified.

---

## 6. Responsible-play and consumer controls

### Takeaway
One user-set daily coin spending limit exists (with 24 h delay on raising); there is no self-exclusion, no session
reminder, no game-specific loss limit, no cooling-off, no RTP disclosure, and gifts (incl. Şanslı ×777) send without a
confirmation.

### Cited Findings
- [CODE] Daily spending limit: optional, 100–10.000.000 coins/day, lowering immediate, raising after 24 h; covers gifts, Şanslı, bags, games' coin part, shop; not game coins and not Jeton Noktası purchases — [server/api/spend-limit.mjs:1-24](server/api/spend-limit.mjs).
- [CODE] No self-exclusion / time-out / reality-check feature (grep `self.exclu|cooldown|reality check` found only bond/family cooldowns) — server grep.
- [DOC] Per-game daily limits removed by owners; "bir kişinin bir günde oynayabileceği jetonun üst sınırı yok" — [docs/DENETIM.md:38-41](docs/DENETIM.md); Şanslı "Gönderim sınırı yok" — [docs/LUCKY_HEDIYE.md:52](docs/LUCKY_HEDIYE.md).
- [DOC] Slot auto-spin stops at a user-chosen loss limit and on 10x+ wins — [docs/OYUN_MERKEZI.md](docs/OYUN_MERKEZI.md) "Altın Kasa".
- [DOC/CODE] Odds tables shown (one tap for Şanslı); RTP/house edge hidden from players by owner decision — sections 2A/2B above.
- [CODE] Win banners to all rooms (incentive/advertising of gambling-like outcomes) — section 2A.
- [DOC] Account history only last 50 rows in app — [docs/PARA_DENETIMI.md](docs/PARA_DENETIMI.md) "Kalanlar"; [CODE] `GET /api/ledger ... LIMIT 50` — [server/api/index.mjs:243-246](server/api/index.mjs).
- [DOC] Screens without shown-price checks remain (paid message/call price, bond, family, animation, seat colour) — [docs/PARA_DENETIMI.md](docs/PARA_DENETIMI.md) "Kalanlar".

### Inferences
- [INF] For a TR/UK legal strategy, minimum expected controls would be: hard age verification before any chance feature, deposit/spend caps default-on, self-exclusion, RTP and odds pages, no win broadcasting, confirmation on high-value sends.

### Gaps
- No data on actual user spending distribution (test server).

---

## 7. AML/KYC, data protection, consumer law (code-level facts)

### Takeaway
Money can enter for cash through Jeton Noktası accounts without any identity check and leave by IBAN or free-text
account to any self-declared woman; the only safeguards are diamond locks, weekly caps and manual payout approval.

### Cited Findings
- [CODE] Jeton Noktası records: who, whom, coins, TL, free-text receipt, IP, actor; immutable — [server/api/jeton.mjs:15-21](server/api/jeton.mjs), [server/api/migrations/006_coin_sources.sql:1-40](server/api/migrations/006_coin_sources.sql). No identity of buyers, no amount thresholds, `TRANSFER_MAX` 100.000.000 coins per transfer — [server/api/jeton.mjs:39](server/api/jeton.mjs).
- [CODE] Diamond locks (7 days store / 1 day Jeton Noktası) are the anti-refund-fraud control; refunds reverse locked diamonds and agency commission — [server/api/wallet.mjs:1-14](server/api/wallet.mjs), [server/api/jeton.mjs:22-26](server/api/jeton.mjs).
- [CODE] Money integrity: hourly ledger/lot consistency check with `money_mismatch` alert — [docs/PARA_DENETIMI.md](docs/PARA_DENETIMI.md), `server/api/money-check.mjs`. Alerts for unusual refunds/diamonds/test coins — [docs/YAYIN_HAZIRLIGI.md](docs/YAYIN_HAZIRLIGI.md) §2 "İzleme ve alarm".
- [CODE] Data: withdrawals keep holder, account (IBAN), IP; included in the user's data export; financial records kept on deletion — [server/api/my-data.mjs:8, 218](server/api/my-data.mjs), [server/api/my-data-tables.mjs:6-8](server/api/my-data-tables.mjs); casino rounds kept 180 days and deleted with the account — [server/api/casino.mjs:22](server/api/casino.mjs), [server/api/social.mjs:236-237](server/api/social.mjs).
- [DOC] Production is one Oracle VM in Frankfurt; privacy policy (UK GDPR/KVKK), terms and consent texts are placeholders awaiting a lawyer — [CLAUDE.md](CLAUDE.md) "Layout", [docs/YAYIN_HAZIRLIGI.md](docs/YAYIN_HAZIRLIGI.md) §1 rows 7, 11.
- [CODE] Retired coin packs up to 1.000.000 coins (23.599,99 TL) still credited if delivered — [server/api/catalog.mjs:176-181](server/api/catalog.mjs).

### Inferences
- [INF] Laundering cost via gift→withdrawal is high (~78 % spread at list price), but Jeton Noktası buying diamonds for TL and selling coins for TL off-platform is an unlicensed exchange-like activity; Turkish MASAK (Law 5549) and e-money/payment-services licensing (Law 6493) questions should go to counsel. Not verified.
- [INF] Turkish users' data hosted in Germany by a UK controller: KVKK cross-border transfer rules (art. 9) need a mechanism; not addressed in docs.
- [INF] Turkish distance-sales rules on digital content (right of withdrawal exception requires prior consent) and Apple/Google refund flows should be reflected in terms; no such texts exist yet.

### Gaps
- No AML policy, transaction monitoring thresholds or sanctions screening found in code or docs.

---

## 8. Existing open launch blockers on these topics (from DENETIM.md / YAYIN_HAZIRLIGI.md)

### Takeaway
The repo already flags chance-to-cash as the top legal blocker and records that owners expanded Şanslı hediye anyway.

### Cited Findings
- [DOC] DENETIM Kritik §1 "Şans oyunları ve nakde dönüş (siz + avukat)": Şanslı hediye default on, coin → gift → diamond → cash path; ×777 added 22 Nov ("hukuki yanı bize ait"); new packages/icons/videos 19 Nov; Oyun Salonu stakes with purchased coins; Yörünge live; daily limits removed; Oda roketi same risk; recommendation: first release with Şanslı off or winnings to a non-cashable balance — [docs/DENETIM.md:16-47](docs/DENETIM.md).
- [DOC] DENETIM Kritik §3 test mode, §7 accounts and legal texts; Önemli 0 gender rule; Önemli 6 panel 2FA — [docs/DENETIM.md:63-71, 92-100, 112, 126-127](docs/DENETIM.md).
- [DOC] DENETIM "Özel albüm" (paid photos, App Store 1.1/3.1, Play sexual content) and "Muzip hediyeler" (harassment, pay-to-clean) — [docs/DENETIM.md:225-292](docs/DENETIM.md).
- [DOC] YAYIN_HAZIRLIGI §1 row 1 (chance and money decisions incl. Jeton Noktası, para çekme, agency/invite commissions) ⛔; row 12 (Oyun Salonu legislation review) ⛔; §2 "Uğurlu, Oyun Salonu, Jeton Noktası" ⛔; §3 age-rating questionnaires incl. simulated gambling ⏳ — [docs/YAYIN_HAZIRLIGI.md](docs/YAYIN_HAZIRLIGI.md).
- [DOC] PARA_DENETIMI "Kalanlar": Şanslı daily cap exceedable; Çevir vs. Jeton Noktası rates; VIP purchases missing from finance panel — [docs/PARA_DENETIMI.md](docs/PARA_DENETIMI.md).

### Inferences
- None beyond the above.

### Gaps
- None.

---

## 9. Legal/policy reference points used (web-verified)

### Takeaway
Under UK law a prize of "money's worth" makes a chance game "gaming"; Turkish law criminalises providing place/means for
games of chance played for gain; both stores require licensing/geo-restriction for real-money gaming.

### Cited Findings
- UK Gambling Act 2005 s.6(1): "gaming" means playing a game of chance for a prize; s.6(5): "prize" … "means money or money's worth" and includes winnings of money staked — [legislation.gov.uk s.6](https://www.legislation.gov.uk/ukpga/2005/19/section/6).
- s.36(3): s.33 (unlicensed provision of facilities) applies to remote gambling if at least one piece of remote gambling equipment is in Great Britain, **or** none is but "the facilities are used there" — [legislation.gov.uk s.36](https://www.legislation.gov.uk/ukpga/2005/19/section/36).
- UKGC position (2016 discussion / 2017 position paper, via law-firm summaries): winning extra spins/credits/tokens in a social game is not licensable even if purchasable, but where in-game items are tradeable/exchangeable and act as de facto currency, facilities to gamble with them need a licence — [CMS summary](https://cms.law/en/gbr/legal-updates/gambling-commission-clarifies-position-on-virtual-currencies-esports-and-social-gaming); [UKGC discussion paper page](https://www.gamblingcommission.gov.uk/about-us/page/virtual-currencies-esports-and-social-gaming-discussion-paper) (not opened; primary text unverified).
- Apple 5.3.3: IAP may not buy credit/currency "for use in conjunction with real money gaming of any kind"; 5.3.4: real-money gaming needs licensing where used, geo-restriction, and must be free on the App Store; 3.1.1: odds of randomized virtual items must be disclosed prior to purchase — [Apple guidelines](https://developer.apple.com/app-store/review/guidelines/).
- Google Play (Real-money gambling, games and contests policy page): restricted are apps that let users "wager, stake, or participate using real money"; a violation example is "Games that accept money in exchange for an opportunity to win a physical or monetary prize" — [Play policy 9877032](https://support.google.com/googleplay/android-developer/answer/9877032). The page does not explicitly address virtual currency won and later exchanged for money.
- Turkey: TCK 228/6 defines kumar as games played for gain where profit/loss depends on luck (material gain required, luck the dominant factor) — [DergiPark article](https://dergipark.org.tr/tr/download/article-file/980867), [Barandoğan](https://barandogan.av.tr/blog/mevzuat/tck-madde-228-kumar-oynanmasi-icin-yer-ve-imkan-saglama-sucu) (secondary sources). Law 7258 art. 5/1-(b): 4–6 years' imprisonment for enabling games of chance to be played from Turkey via the internet; access blocking under Law 5651; security measures for legal persons — [Kadim Hukuk summary](https://kadimhukuk.com.tr/makale/yasadisi-bahis-sucu-cezasi-memuriyet/), [AYM 2016/179](https://normkararlarbilgibankasi.anayasa.gov.tr/Dosyalar/Kararlar/KararPDF/2016-179-nrm.pdf) (secondary; official Resmî Gazete text not checked).

### Inferences
- [INF] Şanslı hediye: consideration (purchased coins) + chance (server draw) + prize convertible to cash via the app's own gift/withdrawal system ⇒ strong argument for "money's worth" (UK) and "kazanç amacı" with material gain (TR). With no geo-block, any GB use brings s.33/s.36(3) into play for a UK company.
- [INF] Closed-loop games (game coins) are closer to the UKGC "social gaming" safe zone, but they look and feel like casino games (slots, crash, wheel with JACKPOT) and are bought with real money; Play's simulated-gambling and age-rating rules still apply.

### Gaps
- Google Play Payments policy and simulated-gambling ("social casino") ad/age rules not fetched in full.
- Whether Turkish authorities treat in-app "coin" wins as "maddi kazanç" when cash-out is only indirect: no case law located.

---

## 10. Gap table (feature | current behaviour | risk | what would close the gap)

| Feature | Current behaviour (refs) | Risk (store / UK / TR) | Options to close |
|---|---|---|---|
| Şanslı hediye | Purchased-coin stake, server draw, win paid as giftable `ugurlu` coins → gift → diamonds → cash; default ON; Lv.2 + self-declared 18+; ×777, 16.000 draws/request, no confirm; odds one tap away, RTP hidden; admin can set any odds; wins broadcast to all rooms (lucky.mjs:185-241, lucky-rules.mjs:23-80, wallet.mjs:42-44, streamer-rule.mjs:61-73) | Play real-money gambling; Apple 5.3.3/5.3.4; UK s.6 "money's worth" + s.33 if used in GB; TR 228 / 7258 art.5 | (a) Off at launch (package `enabled=false`); (b) pay wins only in a non-giftable, non-convertible balance (like game coins) or as cosmetics; (c) if kept: hard KYC/age, geo-block GB, odds+RTP page, confirmation, per-user caps, no win broadcasts, RTP bounds in panel |
| Oda roketi | Rank-based coin prizes as `ugurlu` (cashable); OFF by default (room-rocket.mjs:1-11,208; rules:26) | Prize-promotion / gambling-adjacent; paid-to-win ranking | Prizes as time-limited items only; or non-cashable coins |
| Şanslı çanta | Free entry for participants; random split; coin shares giftable, gift-bag shares are diamonds (lucky-bags.mjs:1-19,152) | Prize draw rules (Apple 5.3.1/5.3.2 official rules); cashable prizes | Publish split rules in app; make coin shares non-cashable; or limit to gifts with locks |
| Oyun Salonu / Rüzgâr Gülü / Yörünge | Stake with purchased coins (after game coins); wins only game coins (closed loop); 60 % house (Yörünge 3–90 % live); admin-only until `casino_open`; no age check; no daily limit (casino.mjs:202-310, wheel.mjs:35-49, rocket-live-rules.mjs, live-registry.mjs:1211-1288) | Simulated gambling rating/ads rules; Apple 2.5.19 if turned on post-review; UKGC "look and feel"; TR risk lower but not nil | Keep off at launch; if on: disclose to review, 18+ server check, limits, RTP page, house % bounds, no purchased-coin stakes (free daily game coins only) |
| Coin → diamond → cash for any self-declared woman | Withdraw/Jeton Noktası allowed by gender, not by streamer status (streamer-rule.mjs:61-73, withdraw.mjs:106-140) | Makes every coin effectively cashable; discrimination; easy bypass | Cash-out only for contracted, KYC'd streamers; ID + age + tax data; holder name = verified ID |
| Withdrawals / agency payouts | Manual off-app payment; IBAN any country or free text; no KYC, no tax ID; agency payouts store no account (withdraw.mjs:47-55; 005_agency_network.sql:219-238; AJANS_BASVURU "Vergi numarası istenmez") | AML (MASAK), tax withholding, sanctions; payer entity unclear (UK co.) | KYC provider before first payout; TR IBAN only matched to name; tax/contract records; payout entity in TR or licensed PSP; thresholds and monitoring |
| Jeton Noktası | Off-store coin sales for cash advertised to all users; buys host diamonds for TL; management can load coins against TL; bypasses spend limit (jeton.mjs:15-21,253-320; coins-bank-live.tsx:99,248; profil.tsx:118) | Apple 3.1.1/3.1.3 steering; Play Payments; AML/e-money; consumer refunds | Remove from store builds (or hide on iOS/Play); move to a licensed web shop outside the app if allowed; KYC agents; cap amounts |
| iOS purchases / refunds | No iOS purchase UI; Apple refunds not ingested (billing.ts:50-60; vip.mjs:35) | Apple 3.1.1 if iOS shipped with Jeton Noktası only; refund abuse | Add StoreKit flow; App Store Server Notifications v2 for refunds |
| Age verification | Birth year self-declared; server checks only for Şanslı; no age check on casino/withdraw (signup.ts:4-26; social.mjs:301-309; lucky.mjs:185) | 18+ store rating; gambling-adjacent features for minors; payouts to minors | Require birth date server-side; ID/age verification before chance features and payouts |
| Geo / platform gating | None (grep) | UK s.36(3) (use in GB); store per-country rules | Country gating by store country + IP + phone; per-platform feature flags |
| Hidden/dormant features | Coin games shipped but hidden server-side; Şanslı behind Lv.2 (wheel.mjs:35-42; index.mjs:232-240) | Apple 2.5.19; Play deceptive behaviour | Disclose in review notes; give review account the real state; don't flip on without new review |
| Responsible play | Optional daily spend limit only; no self-exclusion, no cooling-off, no per-game limits, RTP hidden, win banners, one-tap ×777 (spend-limit.mjs; DENETIM:38-41; LUCKY_HEDIYE:35,52) | Consumer protection; store social-casino expectations; UKGC social-responsibility expectations if licensed | Default caps, self-exclusion, reality checks, RTP/odds pages, confirmation over a threshold, no broadcasts |
| Legal texts / data | Privacy/terms placeholders; data in Frankfurt; financial data retained (YAYIN §1 rows 7,11; my-data.mjs) | KVKK cross-border, UK GDPR, consumer law (digital content withdrawal) | Lawyer-written terms incl. virtual currency, no-cash-value, refund and odds terms; KVKK transfer mechanism |
| Doc drift | LUCKY_HEDIYE says coins can't be cashed; OYUN_MERKEZI legal note outdated; DURUM_LISTESI says rocket is a draw; COINS_BANK lists a Bonus Credits currency not in code | Counsel may be misled | Align docs with code before legal review |
