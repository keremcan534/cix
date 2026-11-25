# Competitor dossier: Nivi (App Store id 6738346486 / Google Play com.candy.nivi.chat)

All sources were accessed on 2026-11-25 unless marked otherwise. Public pages and public metadata only: no account, no login, no APK/IPA download or decompile. "Public site bundle" means the JavaScript that the developer's public websites send to any browser (candycubehk.com, h5game.candycubehk.com/webpage/). It was read as text and nothing behind a login was called. In those bundles, minification sometimes shuffles which key belongs to which string, so only the **text values** are quoted and the key names should be read as approximate.

Identity check: the App Store id 6738346486 page, the Google Play package com.candy.nivi.chat and candycubehk.com all name **Beckoning Cube HK LIMITED**. The site links to `apps.apple.com/us/app/nivi/id6738346486`. Name collision: `nivichatapp.com` ("Nivi ChatApp") showed up in search but returned HTTP 522, so I could not confirm it is related. Treat it as unrelated until checked.

**Important naming note for the owners:** Nivi uses the currency names the opposite way to Similar Club. Users **buy "Diamonds" (Elmas)**. Hosts **earn "Coins" / "Pocket Coins"**, which the Turkish H5 text calls **"Puan"**, and these coins are what gets withdrawn.

## 1. Who is the developer, where is it registered, and are there sister or white-label apps?

### Takeaway
The seller is Beckoning Cube HK LIMITED, a Hong Kong company at The Cloud, Tai Kok Tsui, Kowloon. Its terms choose Singapore law with SIAC arbitration, and it stores data in Singapore. The same backend and H5 pages also serve "Layla" (published by a different HK company, GirlPower HK Limited) and a "Pocket" brand. That points to one operator group running several white-label apps.

### Cited Findings
- App Store (TR): Seller/Satıcı is "Beckoning Cube HK LIMITED". The developer name is shown as "Beckoning Cude HK" (typo on the store) with developer id 1780310073. Copyright "© 2024 Beckoning Cube HK LIMITED". Developer site candycubehk.com. Support at candycube.service@gmail.com. — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486)
- The App Store developer page lists only one app, Nivi. — [Apple developer page](https://apps.apple.com/tr/developer/beckoning-cude-hk/id1780310073?platform=iphone)
- Google Play developer is "BECKONING CUBE HK LIMITED". Address: Rm 11 20/F THE CLOUD, 111 TUNG CHAU ST, 大角咀 (Tai Kok Tsui), 九龍 (Kowloon), Hong Kong. Phone +852 6268 9790. Email furen.xue@candycubehk.com. Support email market@candycubehk.com. The Play developer page lists only com.candy.nivi.chat. No D-U-N-S number is shown. — [Google Play](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=en&gl=TR); [Play developer page](https://play.google.com/store/apps/developer?id=BECKONING+CUBE+HK+LIMITED&hl=en)
- EMIS profile: "Beckoning Cube Hk Limited", Hong Kong SAR, address "Rm 11, 20/F, The Cloud", industry "Other Computer Related Services", incorporation year shown as 2024. Company number and directors are paywalled. A search-engine summary of the same page gave a conflicting date (13 July 2026), so the exact date is unverified. — [EMIS](https://www.emis.com/php/company-profile/HK/Beckoning_Cube_Hk_Limited__Beckoning_Cube_Hk_Limited__en_22826290.html)
- Terms of Service: "We, Beckoning Cube HK LIMITED. and our affiliates…". Effective "2024/10", updated "2026/3". "This Agreement shall be governed by… the laws of Singapore… finally resolved by Singapore International Arbitration Center… one arbitrator… English." The grievance contact is market@candycubehk.com. — [candycubehk.com Terms](https://candycubehk.com/#/termsofservice) (text read from the public site bundle `/assets/index-DHVqmWcO.js`)
- Privacy Policy: "We securely store your personal information at Singapore." It also says cross-border transfer recipients are held to data standards "similar… to those of Singapore". — [candycubehk.com Privacy](https://candycubehk.com/#/privatepolicy)
- The Terms still contain another brand's name, left over from a template: "Pocket does not handle payments…", "BY ACCEPTING THESE TERMS, YOU AGREE Pocket IS NOT REQUIRED TO PROVIDE A REFUND", and "Pocket welcomes users from all around the world". The Terms also mention "pocket coins". — [Terms](https://candycubehk.com/#/termsofservice)
- The candycubehk.com website calls the API at `https://api.pocketliveapp.com/` and loads its logo from `https://image.laylachat.com/image/app_icon/nivi_128.png`. Its Arabic login text says "تسجيل الدخول إلى حساب كونكت مي" ("log in to your ConnectMe account"), and an image alt text reads "Why Choose ConnectMe". These are further leftovers from another template. — [candycubehk.com](https://candycubehk.com/) (public bundle)
- The H5 web app at h5game.candycubehk.com/webpage picks its favicon by user agent ("nivi" or "layla", defaulting to "layla"). It has child-safety routes `/kid_deal_nivi`, `/kid_deal_layla` and `/kid_deal_pocket`. Nivi's Google Play listing points to `https://h5game.candycubehk.com/webpage/#/kid_deal_nivi` as its Child Safety Standards page. — [h5game.candycubehk.com/webpage](https://h5game.candycubehk.com/webpage/); [Google Play](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=en&gl=TR)
- "Layla-Voice Chat & Party Rooms" (com.layla.chat) on Google Play is published by GirlPower HK Limited, Rm 101 31/F Harbour City, The Gateway Tower 5, 15 Canton Rd, Tsim Sha Tsui, Kowloon, +852 4659 8900, billionsmatch@gmail.com. It has 5M+ downloads, 4.5★, 62.3K reviews and PEGI 18. "More by" lists ChatA, Ohla, 4Chat and Winko. — [Google Play Layla](https://play.google.com/store/apps/details?id=com.layla.chat&hl=en&gl=TR)
- Code comments on candycubehk.com are in Chinese (for example "立即检查 hash 并重定向"), and the site ships zh/en/ar translations. — [candycubehk.com](https://candycubehk.com/) (public HTML)

### Inferences
- INFERENCE: Nivi, Layla and a "Pocket"/"Pocket Live" brand probably share one backend and template (pocketliveapp.com API, laylachat.com image CDN, one H5 bundle). They are published under at least two Hong Kong shell-style entities (Beckoning Cube HK, GirlPower HK). This is the white-label pattern common in Chinese-run voice-chat apps aimed at MENA and Turkey.
- INFERENCE: Hong Kong incorporation combined with Singapore law and data storage, and a Gmail support address, suggests a light corporate presence. Suing or enforcing a Turkish consumer claim against it would be hard.
- INFERENCE: The App Store id range (6738…) and the "© 2024" line suggest the iOS app was created in late 2024. Google Play appears to have released it on 14 Apr 2025: the date "Apr 14, 2025" appears in the Play page's embedded data. This is moderately confident only.

### Gaps
- HK Companies Registry (ICRIS) company number, incorporation date, directors and shareholders: not retrieved (ICRIS charges a fee and EMIS is paywalled). OpenCorporates returned 403.
- I searched for, but did not find, a Singapore ACRA entity, a UAE entity, a Turkish Ticaret Sicili Gazetesi record or a UK Companies House record. **UNKNOWN** whether any local Turkish entity exists.
- **UNKNOWN**: whether "Pocket"/"Pocket Live" is a live store app. No listing was found by search.
- `nivichatapp.com` was not reachable (HTTP 522), so its relationship is UNKNOWN.

## 2. What do the official documents say about currency, refunds, cash-out, agencies, gambling, regions, age and governing law?

### Takeaway
The public Terms define Diamonds as purchasable "virtual items" that are used "for… sending gifts and playing games". Earned "virtual gains" are "pocket coins". All purchases are final. The Terms let the company claw back coins from recipients after a chargeback, and forfeit balances on account deletion or after 12 months of inactivity. They forbid content "promoting gambling services" but say nothing about licensing, regions or cash-out. Cash-out rules appear only in the H5 pages, not in the Terms. No recharge agreement or host/agency agreement was found as a separate public document.

### Cited Findings
- Eligibility: "you represent and warrant that you are an adult". "no minors may register for an Account or use the Services". — [Terms §1, §3.5](https://candycubehk.com/#/termsofservice)
- Contradictions on age: the Privacy Policy talks about under-13s ("anyone under the age of 13… ('Minor')"). Terms §8.2 says "If you are under 18… you must obtain your parent's or guardian's consent before making any purchases." — [Privacy §VIII](https://candycubehk.com/#/privatepolicy); [Terms §8](https://candycubehk.com/#/termsofservice)
- Scope of the service: "allowing you to live stream, watch live streams, purchase or send virtual gifts, communicate instantly and add friends." — [Terms §2](https://candycubehk.com/#/termsofservice)
- Virtual currency: "'virtual items', as known as diamonds or others… can only be used in the Software." "Virtual items can be used to purchase value added Services, such as sending gifts and playing games… exchange rate… determined by us at our sole discretion." "The exchange rate between virtual items and legal currency varies according to your purchase channel." There is also an explicit warning against "illegal or unauthorized channels" for recharging. — [Terms §7.1–7.4](https://candycubehk.com/#/termsofservice)
- Earned currency: "You may receive some virtual gains… such as pocket coins… Unless otherwise agreed between you/your agent and us, you are only allowed to use virtual gains… such as exchanging into virtual items." Note the reference to "your agent", which implies agencies. — [Terms §7.9](https://candycubehk.com/#/termsofservice)
- Refunds: "ALL PURCHASES OF VIRTUAL ITEMS… ARE FINAL, NON-REFUNDABLE, NONTRANSFERABLE". Payments are handled by "Apple's App Store and Google's Google Play Store, among others". The phrase "among others" implies other channels too. — [Terms §7.6, §8.1](https://candycubehk.com/#/termsofservice)
- Chargeback clawback: if a payment is reversed, "Coins attributable to the actual paid portion… credited or transferred to another user… we may adjust or deduct… from that user… recorded as an outstanding Coins adjustment… offset against eligible Coins subsequently credited". — [Terms §7.11](https://candycubehk.com/#/termsofservice)
- Forfeiture: on voluntary account cancellation, "virtual items, virtual gains, virtual gift, game currency, etc. will be waived automatically". After more than 12 months of inactivity the company may "suspend or expire" virtual assets. — [Terms §7.13–7.14, §1.8](https://candycubehk.com/#/termsofservice)
- "Nobility" (VIP) purchases cannot be transferred or refunded, and the price can be adjusted at any time. — [Terms §6](https://candycubehk.com/#/termsofservice)
- Gambling: the Community Guidelines say "We do not permit content promoting gambling services, or that could be perceived as advertising for casinos, sports betting, or any other commercial gambling activities." The Terms mention no gambling licence and no list of prohibited regions. — [Terms §11.2](https://candycubehk.com/#/termsofservice)
- Privacy: data may be shared with a "Game business partner, who may receive the information about your account (such as the amount of diamonds)". "You can also use third-party developed H5 pages or mini programs." — [Privacy Policy](https://candycubehk.com/#/privatepolicy)
- Account deletion (H5 text): "If you are part of a agency, account deletion will not be possible." The Turkish version reads "Bir ajansın parçasıysanız, hesap silme mümkün olmayacaktır." There is a 30-day recovery period. — [h5game.candycubehk.com/webpage](https://h5game.candycubehk.com/webpage/) (public bundle `js/app.7b3cced0.js`)
- Apple listing billing text: Nivi Pro is a monthly auto-renewing subscription. — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486)

### Inferences
- INFERENCE: The Terms are a generic template (still naming "Pocket") and do not cover the cash-out, agency and reseller system that the H5 pages describe. Hosts' payout rights therefore rest on in-app H5 rules that can change at any time, not on a signed agreement.
- INFERENCE: Blocking account deletion for agency members likely conflicts with store account-deletion requirements and with KVKK erasure rights. This is a compliance weakness worth noting for comparison.

### Gaps
- No public **recharge (top-up) agreement**, **host agreement** or **agency agreement** document was found on candycubehk.com. They may exist only in-app.
- **UNKNOWN**: any list of prohibited countries or regions. **UNKNOWN**: whether in-app age verification exists beyond self-declaration. The Privacy Policy mentions only an optional "Profile Picture Authenticity Authentication".
- Need from owners: screenshots of the in-app "Agreement/Protocol" links (user agreement, recharge agreement, host/agency agreement) and the in-app VIP/Nobility rules page.

## 3. Virtual currencies, conversion rates and withdrawal rules (money flow)

### Takeaway
The money flow, as far as public material shows, runs like this:
1. Users buy Diamonds through IAP, and possibly via other channels the Terms call "among others".
2. Diamonds pay for gifts, games, lucky gifts and VIP.
3. Recipients earn Coins/"Pocket Coins" ("Puan" in Turkish).
4. Coins can be converted back into Diamonds (in-app H5 and the candycubehk.com web wallet), withdrawn directly (bank, $2 fee), sent to the agency leader who pays offline (bank card/USDT), sent to a "Reseller" who receives them as Diamonds and pays offline, or paid out through "official offline withdrawal" at local money exchanges using a WhatsApp redemption code.

### Cited Findings
- iOS in-app purchase prices, TR storefront: 2745 Diamonds ₺64,99; 13698 Diamonds ₺329,00; 27450 Diamonds ₺649,00; 54900 Diamonds ₺1.299,99; Value Pack ₺64,99; Nivi Pro ₺229,99; Limited Deal 1/2/3 ₺64,99 / ₺124,99 / ₺329,00; Lucky package ₺249,99. — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486)
- US storefront: 13698 Diamonds $6.29; 27450 Diamonds $12.49; 54900 Diamonds $24.99; Nivi Pro $4.99; Value Pack $1.29; Lucky package $4.99; Limited Deal 1 $1.29, 2 $2.49, 3 $6.29. GB: 2745 Diamonds £0.99; 13698 Diamonds £5.99; 27450 Diamonds £11.99; 54900 Diamonds £24.99; Nivi Pro £4.99. SA: 27450 Diamonds SAR 49.99; 54900 Diamonds SAR 99.99; Nivi Pro SAR 19.99. — [App Store US](https://apps.apple.com/us/app/nivi/id6738346486); [GB](https://apps.apple.com/gb/app/nivi/id6738346486); [SA](https://apps.apple.com/sa/app/nivi/id6738346486)
- Google Play in-app purchase range: "TRY 27.39 - TRY 6,136.69 per item". — [Google Play](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=en&gl=TR)
- Web wallet on candycubehk.com, which requires login (only its public code was read, no login was attempted). It shows "Diamonds", "Coins", "Exchange", "Guild Wallet", "Personal Wallet", "Most Popular" and the message "Successfully exchanged {{coins}} coins for {{diamonds}} diamonds". It calls `/api/trade/guildWallet/exchangeDiamondForWeb` and `/api/trade/withdraw/getWithdrawConfigForWeb`. Login is by the app's user ID, a Cloudflare Turnstile check and a code sent to the app. — [candycubehk.com](https://candycubehk.com/) (public bundle)
- H5 withdrawal rules: "The withdrawal feature is currently available in select countries only." "The actual amount received may be slightly lower than the displayed amount due to exchange rate fluctuations and fees." "You can only withdraw once per day." "$2 fee per withdrawal." "Withdrawable (≈USD {n})". Turkish: "Çekilebilir (≈ USD {n})". There is a "Bank Account Number" field. "Payments will be processed collectively next Monday." — [h5game.candycubehk.com/webpage](https://h5game.candycubehk.com/webpage/) (public bundle)
- Withdrawal options in the H5 pages: "Self Withdrawal", "Transfer to Agency Leader", "Transfer to Reseller", "Convert to Diamonds" and "Offline withdrawal". Earnings are held in "Pending Settlement" for a risk review of up to {s} hours. — [h5game](https://h5game.candycubehk.com/webpage/)
- Paying through the agency leader: "This operation will send a request to the agency leader, who will transfer the payment to you offline." "Please confirm the payment method (bank card/USDT, etc.) with the agency leader in advance". The Turkish string reads: "Lütfen ödeme yöntemini (banka hesabı/USDT vb.) önceden ajans sahibiyle netleştirin. Ajans sahibi talebi reddederse Puanlarınız otomatik olarak hesabınıza iade edilir." The text adds: "If the agency leader confirms… payment… but you have not received the money, please keep the chat record and file an appeal". — [h5game](https://h5game.candycubehk.com/webpage/)
- Reseller (coin trader): "Transfers are only supported to a Reseller". "Please confirm offline payment details with the Reseller in advance". "Your coins are now the other user's diamonds. Please talk to them about the payment." There are also "Enter RESELLER UID", "Verified Reseller" and routes `/agencyReseller`, `/resellerList`, `/to-reseller` and `/resellerSummerEvent`. — [h5game](https://h5game.candycubehk.com/webpage/)
- Official offline withdrawal: "In some countries, due to insufficient withdrawal channels, the platform offers a withdrawal method by cooperating with local channel partners". "Hosts can use the WhatsApp exchange code from the money exchange to collect their wages at a local money exchange." "WhatsApp is the only channel for sending the redemption code." "Fees… vary by country". — [h5game](https://h5game.candycubehk.com/webpage/)
- Agency pages: "Agency Verification", "Agency Information", "Agency Earnings", "Agency rewards". — [h5game](https://h5game.candycubehk.com/webpage/)
- A Turkish Play review (Ayşe Tetik, 19 Oct 2026) confirms that cash-out and agency transfer exist in Turkey: "uygulamanızda şuan çekim yapamıyorum ilk çekimimi yapıcaktım… mevcut sürüm çok eski… ajans sahibinede aktaramıyoruz… puanlarımız nolucak". — [Google Play TR](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=tr&gl=TR)

### Inferences
- INFERENCE, calculated from Apple prices: about 2,197 diamonds per US$1 (54900/$24.99, 27450/$12.49), about 42.2 diamonds per ₺1 (2745/₺64.99, 54900/₺1,299.99), and about 2,288 diamonds per £1 at the low tier. The coin→USD withdrawal rate and the coin→diamond exchange rate are **not public**.
- INFERENCE: The reseller route works as a closed coin-trader market. A host sells earned coins, which become another user's diamonds, and the buyer pays offline. This lets users top up outside Apple and Google billing. It also moves value between users for off-platform cash with no KYC visible to the platform. AML and store-policy exposure is high.
- INFERENCE: USDT payouts through agency leaders and money-exchange redemption codes over WhatsApp mean the platform pushes the fiat leg off its own books.

### Gaps
- **UNKNOWN**: coin→USD rate, minimum withdrawal (shown only as "{n}"), host share of gift value, agency commission, and which countries (Turkey included?) get "Self Withdrawal" versus offline withdrawal.
- Need from owners: screenshots or a test account showing the wallet page, the Exchange (coins→diamonds) rate table, the withdrawal page with minimum, fee and rate in Turkey, the reseller list, and the agency earnings page.

## 4. Games, gating, and what winnings can be used for

### Takeaway
The public H5 help text confirms in-room games that take diamond "bets", pay out "winnings" in regular diamonds, and track a "Prize Return Rate". It also confirms "lucky gifts" and a "diamond chest" drop. Because winnings are regular diamonds, and diamonds are what gifts are bought with, game winnings can (by inference) become gifts and therefore host-withdrawable coins. Neither store listing mentions games. Which game titles exist and how they are gated could not be seen.

### Cited Findings
- "Game Diamond Info": "1. Only used for games." "2. In-game, Game Diamonds work the same as regular diamonds… Diamonds won with Game Diamonds are regular diamonds." "3. Game Diamonds are used first." Turkish: "Oyun Elması ile kazanılan elmas normaldir." — [h5game](https://h5game.candycubehk.com/webpage/) (route `/game_coin_des`)
- Room game event rules: "Prizes are awarded based on the number of participants and the actual diamonds spent in the room (user bets minus user winnings)." "Definition of Active Player: A player who bets more than 1,000 diamonds in a day." "Prize Return Rate". Turkish: "kullanıcı bahisleri eksi kullanıcı kazançları", "Bir gün içinde 1.000'den fazla elmas bahis yapan oyuncu". — [h5game](https://h5game.candycubehk.com/webpage/)
- Lucky gifts and diamond chest: "When a user sends gifts totaling over 50,000 diamonds in a room (lucky gifts are calculated at 0.1 times their value), a diamond chest drops that anyone in the room can open to grab diamonds." — [h5game](https://h5game.candycubehk.com/webpage/)
- Gift chests: Wooden 1,500, Silver 7,500 and Gold 25,000 diamonds, which "contain[s] the following gifts". "The recipient receives Coins and charm points based on the gift value from the chest." — [h5game](https://h5game.candycubehk.com/webpage/)
- The Terms say diamonds are for "sending gifts and playing games", and the Privacy Policy mentions a "Game business partner" that receives diamond balances. — [Terms](https://candycubehk.com/#/termsofservice); [Privacy](https://candycubehk.com/#/privatepolicy)
- There is a "Lucky package" in-app purchase (₺249,99 / $4.99). — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486)
- On the store descriptions: Apple describes MBTI and personality matching, messaging and translation only. Google describes messaging, voice rooms, translation and profile decorations. Neither mentions games, lucky gifts, betting or withdrawals. — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486); [Google Play](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=en&gl=TR)

### Inferences
- INFERENCE: Diamonds won in games are ordinary diamonds, and ordinary diamonds buy gifts that turn into the recipient's withdrawable coins. So game winnings can very likely be gifted to hosts and end up cashed out. This is a real-money gambling-like loop: buy diamonds, bet, win diamonds, gift, coins, cash.
- INFERENCE: The "Game business partner" together with "third-party developed H5 pages or mini programs" suggests a third-party game SDK or H5 provider (vendors of the Sud/Baishun type). This is **not confirmed**. Neither name appears in the public policies.
- REPORT ONLY: there is a discrepancy. The store text does not disclose games, while public H5 rules describe betting games and cash withdrawal. I made no attempt to reveal how the features are shown or hidden.

### Gaps
- **UNKNOWN**: game titles (slots, wheel, Greedy, Teen Patti, Ludo, fruit machine and so on), unlock conditions (level, VIP, verification, region, age), and whether games are geo-gated for Turkey or for iOS.
- Need from owners: screenshots or a test account showing the in-room games menu, any game unlock messages, the lucky-gift rules page and the room diamond-chest event.

## 5. Store age rating, content descriptors, ratings, reviews and technical clues

### Takeaway
Apple rates Nivi 18+ with "Mature or Suggestive Themes, Messaging and Chat, User-Generated Content, Social Media". There is no gambling descriptor on the TR, US, GB or SA pages. Google Play rates it PEGI 18 with "Users Interact, Shares Location, In-App Purchases", again with no "Simulated Gambling" descriptor. Google's Data safety section says "No data collected", which contradicts the Privacy Policy's list of 8 SDKs and Apple's tracking label. Reviews describe bots and paid messaging, account blocks, Telegram/Nigeria contact solicitation, and failed withdrawals or agency transfers.

### Cited Findings
- Apple TR: 18+. Mature/suggestive themes "Infrequent". Descriptors: Mature or Suggestive Themes, Messaging and Chat, User-Generated Content, Social Media. Category Entertainment, ranked No. 32 in Entertainment. 224.3 MB, iOS 15+, iPhone only. 9 languages including Turkish and Arabic. Rating 2.7★ from 291 ratings. — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486)
- Apple US: 18+, 3.8★, 28 ratings. GB: 1.0★, 2 ratings. SA: 3.1★, 15 ratings, No. 32 Entertainment. The word "Gambling" does not appear on the US, GB or SA pages. — [US](https://apps.apple.com/us/app/nivi/id6738346486); [GB](https://apps.apple.com/gb/app/nivi/id6738346486); [SA](https://apps.apple.com/sa/app/nivi/id6738346486)
- Apple version history (TR): 2.19.0 (about 19 Nov 2026), 2.18.0 "Fully upgraded VIP/SVIP" (3 Nov), 2.13.0 "in-room bullet screen", 2.10.0 "backpack", 2.7.0 "new mic mode", 2.3.0 "VIP Hide Location / SVIP Exclusive Emoji". The earliest listed version is 1.11.0 (07/11/2025). — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486)
- Apple privacy label: Identifiers (Device ID) are used to track and are linked to the user for third-party advertising. Coarse location, name, photos and videos, messages, audio, user ID, usage and diagnostics are listed as "not linked". — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486)
- Google Play: "Nivi: Voice Chat & Messaging", titled in Turkish as "Nivi - Sesli oda ve sohbet". 1M+ downloads, 2.9★, 1.53K reviews, PEGI 18 "Users Interact, Shares Location, In-App Purchases". Updated Nov 17, 2026, version 2.12.0, Android 6.0+. Data safety: "No data shared with third parties", "No data collected". There is an in-store event: "Follow the Treasure Trail — exclusive items and supply coins await!" — [Google Play](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=en&gl=TR)
- Third-party SDKs declared in the Privacy Policy: Agora SDK, Tencent Cloud SDK, Tencent RTC (TRTC) SDK, ishumei (Shumei risk-control) SDK, Firebase Analytics, ThinkingData SDK, Alibaba Cloud httpdns, and LiveData (iLiveData, which processes "Text, pictures, audio, video you send… your voice, portrait"). Login is via phone, Google, Facebook or TikTok. The website uses Google Analytics G-6BN40G0F90 and Cloudflare Turnstile. The H5 pages use the ThinkingData browser SDK. — [Privacy Policy](https://candycubehk.com/#/privatepolicy); [candycubehk.com](https://candycubehk.com/)
- App Store TR reviews (dated 2025): "Uygulama tam bir yalancı" (the app is a total liar; female profiles are bots/AI), "DOLANDIRICILIK" (fraud; accounts cannot be closed), "Sakın indirmeyin" (don't download; claims personal-data theft), "Dolandırıcı hepsi" (all scammers). The developer replied with generic messages. — [App Store TR](https://apps.apple.com/tr/app/nivi/id6738346486)
- Google Play TR reviews: Mehmet Kaan (13 Nov 2026), "uygulama da bot ve sadece kazanç için yaziyolar belirli kişiler saçma ücret istiyor mesaj hakkı yok" (bots who write only to earn, absurd fees for messages). Ayşe Tetik (19 Oct 2026) could not withdraw or transfer to the agency owner (see §3). Yasin Çil (19 Oct 2026), "sürekli yok telegramın var mı yok Nijerya" (constant requests for Telegram, Nigeria contacts). — [Google Play TR](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=tr&gl=TR)
- Google Play EN reviews: Aelx (20 Sep 2026), "Full of fake people trying to make you spend as much chat ticket as possible". Killer G (11 Oct 2026), account blocked after logging out and the appeal "cannot even find my ID". — [Google Play EN](https://play.google.com/store/apps/details?id=com.candy.nivi.chat&hl=en&gl=TR)

### Inferences
- INFERENCE: Declaring "No data collected" in Google Data safety while the policy lists Firebase, ThinkingData, Shumei and iLiveData looks like a misdeclaration, and is a Google Play policy risk for Nivi.
- INFERENCE: The reviews fit a paid-message model ("chat ticket", "mesaj hakkı") where earning accounts ("kazanç için yazıyorlar") are paid per message or gift, plus off-platform solicitation.

### Gaps
- The Exodus Privacy report could not be loaded (proxy closed the connection) and AppBrain returned 403. The SDK list therefore comes only from the developer's own policy, not from an independent scan.
- **UNKNOWN**: Sensor Tower / data.ai revenue and download estimates (not checked).

## 6. Gambling licences and public enforcement (Turkey and elsewhere)

### Takeaway
No public document from Nivi claims any gambling licence, and none of its pages mentions UKGC, Curaçao, MGA or Isle of Man. I found no Nivi-specific BTK access ban, court decision, news story or şikayetvar complaint. Comparable apps have been blocked in Turkey: 29 chat and dating apps in August 2025, and SUGO in February 2026.

### Cited Findings
- No mention of any licence appears in the Terms or the Privacy Policy. The only gambling reference is the ban on content promoting gambling. — [Terms](https://candycubehk.com/#/termsofservice)
- A şikayetvar search for "Nivi" returned no Nivi page. The closest result was the unrelated "nivo". — [sikayetvar nivo](https://www.sikayetvar.com/nivo)
- Context, not about Nivi, from search results that were not opened in full: BTK blocked about 29 chat and dating apps (including Azar, LivU and Tango) by a decision dated 20 Aug 2025. — [tamindir](https://www.tamindir.com/haber/turkiye-flort-uygulamalari-erisim-engeli_99262/); [webtekno](https://www.webtekno.com/29-goruntulu-gorusme-uygulamasi-erisim-engeli-h160768.html)
- Context: SUGO (voice chat) was reported blocked in Turkey by a BTK decision of 14 Feb 2026. The article mentions claims of gift and payment systems being misused for illegal betting, but does not give this as the official reason. — [gazetebirlik](https://www.gazetebirlik.com/genel/sugo-neden-acilmiyor-kapatildi-mi-erisim-engeli-ne-zaman-kalkacak/939057)

### Inferences
- INFERENCE: Nivi has the same risk features that preceded blocks of similar apps: 18+ chat, paid messaging, betting games with diamond winnings, and offline/USDT cash-out through agencies and resellers. It also has no Turkish entity to receive notices. A BTK access block is plausible, but none was found as of 2026-11-25.

### Gaps
- The UK Gambling Commission public register, the Curaçao (CGA) register and the MGA register were **not queried** in this pass. The absence of a licence is inferred only from the app's own documents saying nothing.
- EngelliWeb/İFÖD block lists and Ekşi Sözlük or Reddit discussions were not checked. **UNKNOWN** whether Nivi or its domains (candycubehk.com, pocketliveapp.com) are blocked in Turkey.
- Need from owners (consolidated list of in-app screens and flows I could not see): (1) registration, age gate and verification screens; (2) in-app agreements (user, recharge, host, agency); (3) the recharge page, including any web-pay or "official reseller" recharge links and their prices compared with the IAP prices; (4) the games menu, each game's unlock rule (level/VIP/region) and its payout or return-rate screens; (5) lucky-gift rules and the diamond-chest event; (6) wallet: coins→diamonds exchange table, withdrawal page (Turkey minimum, fee, USD rate, methods), reseller list, agency leader transfer; (7) agency application and earnings and commission pages; (8) VIP/SVIP and Nobility price table; (9) the paid-message ("chat ticket" / "mesaj hakkı") pricing; (10) the account-deletion flow for an agency member.
