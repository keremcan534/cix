# Apple App Store ve Google Play politikaları: sesli sohbet odaları, sanal para, hediye, para çekme ve şans oyunları (Kasım 2026)

Erişim tarihi: tüm kaynaklar 25 Kasım 2026'da okundu. Apple App Review Guidelines sayfası "Last Updated: October 16, 2026" diyor. Google Play politika sayfalarının çoğunda sürüm tarihi yok. Google'ın en son politika duyurusu 29 Ekim 2026 tarihli.

Etiketler: **VERIFIED** = birincil kaynaktan doğrudan alıntılanan metin. **INTERPRETATION** = benim çıkarımım; hukuki görüş değildir.

Hangi özellikten söz edildiği (Similar Club): IAP ile satılan coin, hostlara gönderilen hediyeler (host elmas alır), elmasın ajanslar aracılığıyla nakde çevrilmesi, Şanslı hediye (rastgele kat geri ödeme), Oyun Salonu (slot benzeri oyunlar), Rüzgâr Gülü (çark), Oda roketi ödülleri. Uygulama 18+, pazar Türkiye, şirket UK'de kayıtlı.

---

## S1. Apple App Review Guidelines: ilgili maddeler (5.3, 3.1.1, 3.1.3, 3.2.1/3.2.2, 2.3.1/2.5.19, 4.7, 1.2, 5.1.1(ix)) ve anlamları

### Takeaway
Apple, uygulamadaki coin'leri "tip" ve hediye olarak kullanmaya ve dijital içerik sağlayıcılara bahşişe açıkça izin veriyor (IAP zorunlu). Kendi tanımına göre, "gerçek paraya çevrilebilen oyun içi para" ile yapılan bahis **Gambling** (gerçek para kumarı) sayılıyor. Gerçek para kumarı ise lisans, coğrafi kısıtlama, ücretsiz uygulama ve IAP kullanmama şartlarına bağlı. Bunlara ek olarak, uygulamayı hizmeti sağlayan tüzel kişinin göndermesi gerekiyor (5.1.1(ix)). Şans oyunlarında kazanılan coin'ler, nakde çevrilen hediye ve elmas zinciriyle bağlantılıysa (INTERPRETATION) Apple'ın tanımı kağıt üzerinde "Gambling" tarafına düşüyor ve 5.3.3 ile çakışıyor.

### Cited Findings (VERIFIED)

**5.3 Gaming, Gambling, and Lotteries** — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (Last Updated: October 16, 2026)
- 5.3 giriş: "Gaming, gambling, and lotteries can be tricky to manage and tend to be one of the most regulated offerings on the App Store. Only include this functionality if you've fully vetted your legal obligations everywhere you make your app available and are prepared for extra time during the review process."
- 5.3.1: "Sweepstakes and contests must be sponsored by the developer of the app."
- 5.3.2: "Official rules for sweepstakes, contests, and raffles must be presented in the app and make clear that Apple is not a sponsor or involved in the activity in any manner."
- 5.3.3: "Apps may not use in-app purchase to purchase credit or currency for use in conjunction with real money gaming of any kind."
- 5.3.4: "Apps that offer real money gaming (such as sports betting, poker, casino games, horse racing) or lotteries must have necessary licensing and permissions in the locations where the app is used, must be geo-restricted to those locations, and must be free on the App Store. Illegal gambling aids, including card counters, are not permitted on the App Store. Lottery apps must have consideration, chance, and a prize."

**5.1.1(ix) Lisans sahibi tüzel kişi şartı** — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- "(ix) Apps that provide services in highly regulated fields (such as banking and financial services, healthcare, gambling, legal cannabis use, air travel and crypto exchanges) or that require sensitive user information should be submitted by a legal entity that provides the services, and not by an individual developer."
- Not: Mevcut metinde 5.3 altında "submitted by the legal entity that holds the licence" diye ayrı bir cümle yok. Kumar için tüzel kişi şartı 5.1.1(ix) maddesinde duruyor.

**3.1.1 In-App Purchase** — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- "If you want to unlock features or functionality within your app, (by way of example: subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full version), you must use in-app purchase. Apps may not use their own mechanisms to unlock content or functionality, such as license keys, augmented reality markers, QR codes, cryptocurrencies and cryptocurrency wallets, etc."
- "Apps may use in-app purchase currencies to enable customers to "tip" the developer or digital content providers in the app."
- "Any credits or in-game currencies purchased via in-app purchase may not expire, and you should make sure you have a restore mechanism for any restorable in-app purchases."
- "Apps may enable gifting of items that are eligible for in-app purchase to others. Such gifts may only be refunded to the original purchaser and may not be exchanged."
- "Apps offering "loot boxes" or other mechanisms that provide randomized virtual items for purchase must disclose the odds of receiving each type of item to customers prior to purchase."
- 3.1.1(a) / başka ödeme yöntemine yönlendirme: "In all other storefronts, except for the United States storefront, where this prohibition does not apply, apps and their metadata may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase."

**3.1.3 Other Purchase Methods (giriş)** — [Apple](https://developer.apple.com/app-store/review/guidelines/)
- "The following apps may use purchase methods other than in-app purchase. Apps in this section cannot, within the app, encourage users to use a purchasing method other than in-app purchase, except for apps on the United States storefront and as set forth in 3.1.1(a) and 3.1.3(a). Developers can send communications outside of the app to their user base about purchasing methods other than in-app purchase."

**3.2.1 Acceptable / 3.2.2 Unacceptable** — [Apple](https://developer.apple.com/app-store/review/guidelines/)
- 3.2.1(vii): "Apps may enable individual users to give a monetary gift to another individual without using in-app purchase, provided that (a) the gift is a completely optional choice by the giver, and (b) 100% of the funds go to the receiver of the gift. However, a gift that is connected to or associated at any point in time with receiving digital content or services must use in-app purchase."
- 3.2.1(iii): "...all other items and services may not expire."
- 3.2.2 (current list): "(i) Creating an interface for displaying third-party apps, extensions, or plug-ins similar to the App Store or as a general-interest collection." / "(iii) Artificially increasing the number of impressions or click-throughs of ads, as well as apps that are designed predominantly for the display of ads." / "(v) Arbitrarily restricting who may use the app, such as by location or carrier." / "(vii) Artificially manipulating a user's visibility, status, or rank on other services unless permitted by that service's Terms and Conditions." / "(x) Apps must not force users to rate the app, review the app, download other apps, or other store-related actions in order to access functionality..." (ii) and (vi) are "Intentionally omitted." The current 3.2.2 has no clause on creator cash-outs.

**2.3.1 / 2.5.19 Gizli veya belgelenmemiş özellikler** — [Apple](https://developer.apple.com/app-store/review/guidelines/)
- 2.3.1(a): "All new features, functionality, and product changes must be described with specificity in the Notes for Review section of App Store Connect (generic descriptions will be rejected) and accessible for review. Similarly, marketing your app in a misleading way ... is grounds for removal of your app from the App Store or a block from installing via alternative distribution and termination of your developer account."
- 2.3.1(b): "Egregious or repeated behavior is grounds for removal from the Apple Developer Program. ... if you're dishonest, we don't want to do business with you."
- 2.5.19 (in the October 2026 text the "hidden features" sentence moved here): "Don't include any hidden, dormant, or undocumented features in your app; your app's functionality should be clear to end users and App Review. Attempting to hide undocumented features in your app binary, such as through code obfuscation or other methods, is grounds for removal of your app from the App Store and termination of your developer account."
- 2.3.12: "Apps must clearly describe new features and product changes in their "What's New" text."
- 2.5.2: apps "may not ... download, install, or execute code which introduces or changes features or functionality of the app, including other apps."
- 2.3.6: "Answer the age rating questions in App Store Connect honestly ... If your app is mis-rated, customers might be surprised by what they get, or it could trigger an inquiry from government regulators."
- 5.1.1 / 3.1.1(a) misuse: "If your app engages in misleading marketing practices, scams, or fraud in relation to the entitlement, your app will be removed from the App Store and you may be removed from the Apple Developer Program."

**4.7 Mini apps / mini games (HTML5)** — [Apple](https://developer.apple.com/app-store/review/guidelines/)
- "Apps may offer certain software that is not embedded in the binary, specifically HTML5 and JavaScript mini apps and mini games, streaming games, chatbots, and plug-ins. ... You are responsible for all such software offered in your app, including ensuring that such software complies with these Guidelines and all applicable laws. Software that does not comply with one or more guidelines will lead to the rejection of your app."
- 4.7.1: such software must "follow Guideline 3.1 in order to offer digital goods or services to end users" and include filtering, reporting and blocking.
- 4.7.4: "You must provide an index of software and metadata available in your app. It must include universal links that lead to all of the software offered in your app."
- 4.7.5: "Your app must provide a way for users to identify software that exceeds the app's age rating, and use an age restriction mechanism based on verified or declared age to limit access by underage users."

**1.2 User-Generated Content** — [Apple](https://developer.apple.com/app-store/review/guidelines/)
- Required: "A method for filtering objectionable material from being posted to the app; A mechanism to report offensive content and timely responses to concerns; The ability to block abusive users from the service; Published contact information so users can easily reach you".
- "Apps with user-generated content or services that end up being used primarily for pornographic content, Chatroulette-style experiences, random or anonymous chat, objectification of real people ..., making physical threats, or bullying do not belong on the App Store and may be removed without notice."
- "Developers who fail to implement appropriate safeguards or fail to remediate identified violations after notice may be considered in violation of the Developer Code of Conduct. ... Egregious or repeated behavior is grounds for immediate removal of your app from the App Store, and from the Apple Developer Program."
- 1.2.1 (Creator Content): "Such creator content may include video, articles, audio, and even casual games. The App Store supports apps offering such user-generated content so long as they follow all Guidelines, including Guideline 1.2 ... and Guideline 3.1.1 for payments and in-app purchases." 1.2.1(a): "Creator apps must provide a way for users to identify content that exceeds the app's age rating, and use an age restriction mechanism based on verified or declared age to limit access by underage users."

**Apple'ın yeni yaş derecelendirme sistemi** — [Apple Developer News, 24 July 2025](https://developer.apple.com/news/?id=ks775ehf); [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
- "The updated age rating system adds 13+, 16+, and 18+ to the existing 4+ and 9+ ratings." Also: "Please provide responses to the updated age rating questions for each of your apps by January 31, 2026, to avoid an interruption when submitting your app updates in App Store Connect." And: "you can set a higher age rating after you respond to the age ratings questions."
- Definitions (Chance-Based Activities):
  - **Gambling**: "Betting or wagering using real money or in-game currency that may be exchanged for real money. May include: casino or card games, sports and non-sports betting, or lotteries and raffles." → 18+
  - **Simulated Gambling**: "Betting or wagering without using real money or in-game currency that can be exchanged for real money." → Infrequent 13+, Frequent 18+
  - **Loot Boxes**: "Virtual containers that provide players with randomized virtual items for purchase." → 9+ (16+ in Australia)
  - **Contests**: "Events that allow users to compete with one another for rankings, rewards, or the achievement of personal goals." → Infrequent 4+, Frequent 13+
  - Capabilities: "Messaging and Chat" ("text, voice and/or video chat ...") and "User-Generated Content"; In-App Controls: "Age Assurance".
- Brazil note on the same page: apps with fixed-odds betting need an SPA licence (an example of country-specific licence checks in App Review).

**Komisyon** — [Apple Small Business Program](https://developer.apple.com/app-store/small-business-program/); [Google Play service fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)
- Apple: 15% for Small Business Program members (under USD 1M proceeds), otherwise 30% (the standard rate). For the EU, Apple announced in August 2026 that most developers will pay 15% from October 1 ([Apple Newsroom, Aug 2026](https://apple.com/newsroom/2026/08/apple-announces-changes-for-apps-in-the-european-union)). Not relevant to Turkey or the UK.
- Google (VERIFIED, help page text): "15% for the first $1M (USD) revenue earned by the developer each year; 30% for earnings in excess of $1M"; "regional rollout date (June 30, 2026 for the EEA, UK, and US; September 30, 2026 for Australia and Japan)" with new tiers (10% rates appear). Turkey is not in the new regional list, so the classic 15%/30% applies.

### Inferences (INTERPRETATION)
- **Coin satışı:** IAP zorunlu (3.1.1). Coin'lerin süresi dolamaz, iOS'ta site üzerinden coin satışına uygulama içinden yönlendirme yapılamaz (ABD hariç).
- **Hostlara hediye ve bahşiş:** 3.1.1 coin ile "digital content providers"a bahşişe açıkça izin veriyor. Host'un elması nakde çevirmesini Apple yasaklamıyor; ödeme Apple'ın dışında, geliştirici tarafından yapılıyor. Bu, yaratıcı ekonomisi uygulamalarının (TikTok Live, Bigo, Twitch) bugünkü modeli. Riskli olan, nakde çevrilebilen değerin bir şans mekanizmasından geçmesi.
- **Şanslı hediye / Rüzgâr Gülü / slot / roket:** Apple'ın tanımı açık: bahis "in-game currency that may be exchanged for real money" ile yapılıyorsa "Gambling" sayılıyor. Kullanıcı coin'i IAP ile alıyor (3.1.1), şansla kat kat kazanıyor, kazandığı coin'i bir hosta gönderiyor ve host bunu nakde çeviriyorsa, Apple'a göre coin dolaylı yoldan gerçek paraya çevrilebilir sayılabilir. O zaman 5.3.3 (IAP ile alınan coin gerçek para oyununda kullanılamaz) ve 5.3.4 (her ülkede lisans, coğrafi kısıtlama, ücretsiz uygulama) devreye girer. Türkiye'de özel bir şirketin online casino lisansı alması mümkün değil (bkz. S5). Dolayısıyla bu birleşim iOS'ta kurala uygun hâle getirilemez. "Simulated Gambling" sınıfında kalabilmek için şanstan gelen değerin nakde çevrilebilecek hiçbir yola bağlanmaması gerekir: kazanç ayrı, devredilemeyen, hediye edilemeyen bir para birimi olmalı ya da şans oyunu tamamen kaldırılmalı.
- **Ganimet kutusu oranları:** Şanslı hediye ve rastgele ödüller rastgele sanal ürün sayılır. Oranlar satın almadan önce gösterilmeli (3.1.1).
- **Yaş derecelendirmesi:** Slot, çark gibi "Frequent Simulated Gambling" otomatik olarak 18+ verir. Gizli veya yanlış yanıt verilmiş anket 2.3.6 ve 2.3.1 ihlalidir.
- **Mini oyunlar (HTML5):** Oyun Salonu sunucudan yüklenen HTML5 oyunlarıysa 4.7 kapsamına girer: geliştirici her oyundan sorumlu, 4.7.4 gereği bir oyun dizini gerekir, 4.7.5 gereği yaş kısıtlaması gerekir. İncelemede kapalı olup sonradan sunucudan açılan şans özellikleri 2.5.19'un ("hidden, dormant, or undocumented features") ve 2.3.1'in tam olarak yasakladığı şeydir. Yaptırım: uygulamanın kaldırılması ve geliştirici hesabının kapatılması.
- **UGC ve sesli oda:** 1.2 kapsamında filtre, raporlama, engelleme ve iletişim bilgisi zorunlu. "Random or anonymous chat" ağırlıklı kullanıma dönüşürse uygulama kaldırılabilir.

### Gaps
- Apple'ın "nakde çevrilebilen elmasa giden hediye zinciri" hakkında yaptığı resmî bir açıklama veya inceleme notu bulunamadı. Apple yalnızca tanımlardaki "may be exchanged for real money" ifadesiyle konuya değiniyor.
- Eski 2.3.1 metninin 2.5.19'a ne zaman taşındığını gösteren bir değişiklik kaydını doğrulamadım. Sayfanın Ekim 2026 sürümünde gizli özellik cümlesi 2.5.19'da yer alıyor.

---

## S2. Google Play: Real-Money Gambling, Games & Contests, simüle kumar, ödemeler, ganimet kutusu, Families, Deceptive Behavior, Device & Network Abuse, UGC, CSAE, Financial features

### Takeaway
Google, "gerçek parayla (para ile satın alınan uygulama içi ürünler dahil)" bahis yapıp gerçek değerde ödül kazanmayı lisans ve başvuru olmadan yasaklıyor. Satın alınan sanal paranın yalnızca kendi uygulaması içinde kullanılmasını şart koşuyor. Lisanslı kumar uygulamaları ise Play Billing kullanamıyor ve AO (Adults Only) derecelendirmesi almak zorunda. Türkiye, Google'ın kumar ülke listesinde yer alıyor ama Türk hukukunda bu lisansları yalnızca devlet kurumları veriyor (bkz. S5).

### Cited Findings (VERIFIED)

**Real-Money Gambling, Games, and Contests** — [Google Play policy](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en)
- Summary: "While Google Play generally prohibits apps from facilitating real-money gambling and gaming, an exception is made for those that are licensed and approved by Google. All approved apps must be free to download, must not use In-app Billing, and must prevent access for minors and unauthorized locations."
- Gambling apps are allowed "in select countries, as long as the Developer completes the application process for gambling apps being distributed on Google Play, is an approved governmental operator and/or is registered as a licensed operator with the appropriate governmental gambling authority in the specified country, and provides a valid operating license in the specified country".
- Requirements include: "Developer must have a valid gambling license for each country or state/territory in which the app is distributed; ... App must prevent under-age users from using the app; App must prevent access and use from countries, states/territories, or the geographic areas not covered by the developer-provided gambling license; App must NOT be purchasable as a paid app on Google Play, nor use Google Play In-app Billing; App must be free to download and install from the Google Play store; App must be rated AO (Adult Only) or IARC equivalent; and App and its app listing must clearly display information about responsible gambling."
- **Key convertibility clause:** "For all other apps which do not meet the eligibility requirements for gambling apps ... we don't allow content or services that enable or facilitate users' ability to wager, stake, or participate using real money (including in-app items purchased with money) to obtain a prize of real world monetary value. This includes but is not limited to, online casinos, sports betting, lotteries, and games that accept money and offer prizes of cash or other real world value".
- Examples of violations: "Games that accept money in exchange for an opportunity to win a physical or monetary prize"; "Apps that accept or manage wagers, in-app currencies, winnings, or deposits in order to gamble for, or obtain a physical or monetary prize."
- Gamified Loyalty Programs, Game apps: rewards "may only be awarded and redeemed on a fixed ratio basis ... and the earning of benefits or redemptive value may not be wagered, awarded or exponentiated by game performance or chance-based outcomes." Table: chance-based loyalty in Game apps is "Not Allowed".
- In-app ads for gambling are only allowed if "App must not provide simulated gambling content (for example, social casino apps; apps with virtual slot machines)". Violation example: "A simulated casino game that promotes or directs users to real money casinos".

**Common violations for gambling apps** — [Google](https://support.google.com/googleplay/android-developer/answer/13381106?hl=en)
- "Existing app cannot be repurposed for real-money gambling. The app was previously published with a rating lower than Adults Only (or equivalent) and was then updated to include real-money gambling features. ... you must upload your new real-money gambling app bundle or APK as a new app with a new package name."
- Geo-gating: "existing accounts may not operate the app within countries disallowed ... and apps must block the sign-up of new accounts in these geographies."

**Country/region allowances (Türkiye)** — [Google](https://support.google.com/googleplay/android-developer/answer/12256011?hl=en)
- "Turkey — Subject to the application and licensing requirements in this "Online Real-Money Gaming and Gambling Apps" section, apps with the following types of online real money gaming and/or gambling products are allowed: Online Casino games; Sports Betting; Lotteries" (example resource: Türkiye Yeşilay Cemiyeti).
- The United Kingdom is also listed (Online casino games, sports betting incl. DFS where legal, lotteries).
- Pilots: "There are currently no active pilots on Google Play." (effective June 4, 2026) — [Google](https://support.google.com/googleplay/android-developer/answer/12918670?hl=en)

**Age-Restricted Content and Functionality (new, Oct 2025)** — [Google policy](https://support.google.com/googleplay/android-developer/answer/16302250?hl=en); [Announcement Oct 30, 2025](https://support.google.com/googleplay/android-developer/answer/16550159?hl=en)
- "apps meeting the descriptions below are required to use the Play Console functionality and tools to block minors: Apps that facilitate Real Money Gambling, Games, and Contests. Apps whose core functionality is to facilitate matchmaking or dating. ... Apps whose core functionality is to facilitate randomly connecting users to spontaneously communicate with people they do not know. Apps whose core functionality is for users to communicate anonymously..."
- The random/anonymous chat expansion came with the July 15, 2026 announcement ([Announcements](https://support.google.com/googleplay/android-developer/announcements/13412212?hl=en)): "our Age-Restricted Content and Functionality and Child Safety Standards policies have new requirements and restrictions for anonymous chat and random chat apps."
- The Oct 30, 2025 announcement also says: "The Financial features declaration must be completed for every app on your account, even if it does not contain any financial features. As of October 30, you will not be able to make any updates to your app(s) until you complete this declaration." The declaration categories include "Mobile payments and digital wallets" and "Money transfer and wire services" ([Google](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en)).

**Payments policy** — [Google](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)
- Play Billing is required for "Items (such as virtual currencies, extra lives, additional playtime, add-on items, characters, and avatars)".
- Play Billing must not be used where "payments include peer-to-peer payments, online auctions, and tax exempt donations" or "payment is for content or services that facilitate online gambling".
- "In-app virtual currencies must only be used within the app or game title for which they were purchased."
- Loot box rule: "Apps and games offering mechanisms to receive randomized virtual items from a purchase including, but not limited to, "loot boxes" must clearly disclose the odds of receiving those items in advance of, and in close and timely proximity to, that purchase."
- "Developers must clearly and accurately inform users about the terms and pricing..."

**Families** — [Google Play Families Policies](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)
- Not allowed in apps targeting children: "Apps that include real or simulated gambling." Ads to children: "Gambling: Ads for simulated gambling, contests or sweepstakes promotions, even if free to enter."

**Deceptive Behavior** — [Google](https://support.google.com/googleplay/android-developer/answer/9888077?hl=en)
- "Attempts to manipulate Play review processes, including misleading reviewers as to the purpose and functionality of your apps, are strictly prohibited."
- Violation examples: "Apps with different core functionality based on a user's geography, device parameters, or other user-dependent data where those differences are not prominently advertised to the user in the store listing."; "Apps that change significantly between versions without alerting the user ... and updating the store listing."; "Apps that attempt to modify or obfuscate behavior during review."
- "Any claim that an app is a "prank", "for entertainment purposes" (or other synonym) does not exempt an app from application of our policies."

**Device and Network Abuse (dinamik kod)** — [Google](https://support.google.com/googleplay/android-developer/answer/9888379?hl=en)
- "An app distributed via Google Play may not modify, replace, or update itself using any method other than Google Play's update mechanism. Likewise, an app may not download executable code (such as dex, JAR, .so files) from a source other than Google Play. This restriction does not apply to code that runs in a virtual machine or an interpreter where either provides indirect access to Android APIs (such as JavaScript in a webview or browser)."
- "Apps or third-party code, like SDKs, with interpreted languages (JavaScript, Python, Lua, etc.) loaded at run time (for example, not packaged with the app) must not allow potential violations of Google Play policies."

**User Generated Content** — [Google](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)
- Moderation that "Requires users accept the app's terms of use and/or user policy before users can create or upload UGC; Defines objectionable content and behaviors ...; Conducts UGC moderation ... providing an in-app system for reporting and blocking objectionable UGC and users"; "Provides safeguards to prevent in-app monetization from encouraging objectionable user behavior."
- Violations: "implementing or permitting paid features that principally encourage the sharing of objectionable content"; "Apps that continually fail to address user complaints about objectionable content."

**Child Safety Standards (CSAE)** — [Google](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en)
- "We require Anonymous and Random Chat apps, and apps in the Social and Dating categories to comply with our Child Safety Standards policy." Requirements: "Have published standards against child sexual abuse and exploitation (CSAE); Provide an in-app mechanism for user feedback; Address child sexual abuse material (CSAM); Comply with child safety laws; and Provide a child safety point of contact."
- "The presence or absence of child users in your app is irrelevant to this policy."

**NFT / blockchain (analogy for "chance at value")** — [Google](https://support.google.com/googleplay/android-developer/answer/16302285?hl=en)
- "anything of monetary value should not be accepted in exchange for a chance to obtain an NFT of unknown value." Violation: "Pay-to-play social casino games, such as slot machines, that reward NFTs."

### Inferences (INTERPRETATION)
- **Coin satışı:** Play Billing zorunlu. Coin'ler yalnızca kendi uygulamasında kullanılabilir.
- **Hediye → elmas → nakit (ajans):** Google'ın Payments politikası P2P ödemeleri Play Billing dışında bırakıyor. "In-app virtual currencies must only be used within the app" maddesi ise satın alınan coin'in uygulama dışında değer taşımasını sınırlıyor. Elmasın ayrı bir kazanç birimi olarak nakde çevrilmesi pazarda yaygın bir model (Bigo, TikTok). Google bunu yasaklayan açık bir cümle içermiyor. Asıl risk yine şans katmanında.
- **Şans oyunları + nakde çevrilebilen değer:** Google'ın yasak cümlesi doğrudan bu durumu tanımlıyor: "wager... using real money (including in-app items purchased with money) to obtain a prize of real world monetary value". Coin ile çevrilen çark veya slot, hediye edilip nakde çevrilebilen coin kazandırıyorsa bu cümleye girer. Lisanssız olduğu için uygulamanın kaldırılması riski doğar. Lisansla bile Play Billing kullanılamaz, uygulama AO olmak zorundadır ve mevcut paket adına kumar eklenemez.
- **Şans tabanlı ödül veren oyun uygulaması:** Google'ın "Game apps" kuralı, para ile bağlantılı ödüllerin "exponentiated by ... chance-based outcomes" olmasını yasaklıyor. Şanslı hediyenin "kat kat geri verme" mekanizması bu tanıma çok yakın.
- **Gizli özellikler:** Coğrafyaya veya kullanıcıya göre farklı çekirdek işlev sunup bunu mağaza sayfasında belirtmemek ve incelemede davranışı değiştirmek, Deceptive Behavior politikasına göre açıkça yasak. Bunun yaptırımı uygulamanın kaldırılması ve hesap kapatılması (S4).
- **HTML5 oyunlar:** WebView'deki JavaScript dex yasağından muaf. Ancak "must not allow potential violations of Google Play policies", yani sunucudan sonradan eklenen bir oyun da politikaya tabi.
- **CSAE:** Sosyal kategorideki her uygulama yayımlanmış CSAE standartlarına, uygulama içi geri bildirime ve bir irtibat kişisine sahip olmak zorunda. Bu Similar Club için de geçerli.

### Gaps
- Google Play'in ayrı bir "Simulated gambling" politika sayfası bulunamadı. Simüle kumar, IARC içerik derecelendirmesinde ve Families/Ads kurallarında geçiyor. Age-Restricted politikası simüle kumarı reşit olmayanları engelleme zorunluluğu kapsamına almıyor (yalnızca RMG, flört, rastgele ve anonim sohbet).
- Google'ın "nakde çevrilebilen elmas + şans" kombinasyonu hakkında yaptığı resmî bir açıklama bulunamadı.

---

## S3. Açık soru: Şans oyununda kazanılan coin bir hosta hediye edilip host bunu nakde çevirebiliyorsa, mağazalar bunu "gerçek para kumarı" sayar mı?

### Takeaway
İki mağazanın da yazılı tanımı bu durumu kapsıyor. Apple'a göre "Gambling" = "in-game currency that may be exchanged for real money" ile bahis. Google'a göre yasaklanan, "real money (including in-app items purchased with money)" ile "prize of real world monetary value" elde etmek. Google Ads ayrıca "virtual currencies or items that have real-world value" ile oynanan oyunları açıkça online kumar sayıyor ve sweepstakes kumarhanelerini sosyal kumarhane tanımından çıkarıyor. İki mağaza da bu modeli ayrıca ele alan bir açıklama yayımlamamış. Sonuç bir yorumdur ama metinler aynı yönü gösteriyor.

### Cited Findings (VERIFIED)
- Apple: "Gambling: Betting or wagering using real money or in-game currency that may be exchanged for real money." / "Simulated Gambling: Betting or wagering without using real money or in-game currency that can be exchanged for real money." — [Apple age ratings definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
- Apple 5.3.3: "Apps may not use in-app purchase to purchase credit or currency for use in conjunction with real money gaming of any kind." — [Apple](https://developer.apple.com/app-store/review/guidelines/)
- Google Play: "we don't allow content or services that enable or facilitate users' ability to wager, stake, or participate using real money (including in-app items purchased with money) to obtain a prize of real world monetary value." — [Google Play](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en)
- Google Play: "In-app virtual currencies must only be used within the app or game title for which they were purchased." — [Payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)
- Google Ads Gambling and games policy, definition: gambling includes "anything that functions in the following way: Staking something of value on the outcome of events or processes determined by an element of chance with the opportunity to win something of value". Online gambling examples include "online gambling games played with virtual currencies or items that have real-world value." "Social casino games are online simulated gambling-style games where there is no opportunity to win something of value." "Examples of games that are not social casino games: Sweepstake casinos". Social casino certification requires "statements that they aren't offering or promoting real money gambling and are not providing prizes of real-world value." — [Google Ads policy](https://support.google.com/adspolicy/answer/6018017?hl=en)
- Trade press: the "Sweepstake casinos" line was added on Oct 28, 2025 — [CasinoBeats](https://casinobeats.com/2025/11/03/google-sweepstakes-casino-ad-policy-update/); [iGaming Expert](https://igamingexpert.com/news/business/google-sweepstake-policies-2025/) (secondary; the date is not confirmed on Google's page).
- Google Ads: Türkiye is NOT in the social-casino ad country lists (Group 1 / Group 2). Türkiye online gambling ads: "Lotteries; Sports betting — Operator must be a state licensed entity." — [Google Ads policy](https://support.google.com/adspolicy/answer/6018017?hl=en)
- Google Ads: "We take violations of this category very seriously and consider them egregious. If we find violations of this Social casino games policy, we will suspend your Google Ads accounts upon detection and without prior warning". — [Google Ads policy](https://support.google.com/adspolicy/answer/6018017?hl=en)
- Court precedent on "thing of value": Kater v. Churchill Downs (9th Cir. 2018) held that Big Fish Casino's virtual chips "extended the privilege of playing Big Fish Casino, and fell within Wash. Rev. Code § 9.46.0285's definition of a 'thing of value'" (chips could NOT be cashed out, yet still counted) — [Justia](https://law.justia.com/cases/federal/appellate-courts/ca9/16-35010/16-35010-2018-03-28.html)

### Inferences (INTERPRETATION)
- Similar Club'daki zincir şöyle: IAP coin → şans (Şanslı hediye kat geri ödemesi, çark, slot, roket) → coin → hediye → host elması → ajans üzerinden nakit. Bu zincirde şanstan çıkan değer, başka bir kullanıcı üzerinden de olsa gerçek paraya dönüşebiliyor. Apple tanımındaki "may be exchanged for real money" ifadesi, değişimin kimin elinde gerçekleştiğini ayırt etmiyor. Bir inceleyici veya düzenleyici bunu "Gambling" sayabilir. Kullanıcılar arasında para aktarımı (ör. "host'a ver, sonra paylaşırız" anlaşmaları) bu riski fiilen gerçek kılar.
- ABD'deki Kater davası, nakde çevrilemeyen fişlerin bile "thing of value" sayılabileceğini gösterdi. Nakde çevrilebilen bir zincir bundan çok daha zayıf bir konumda.
- İki mağazanın da kabul ettiği güvenli tasarım (INTERPRETATION): şans oyunlarının girdisi ve çıktısı satın alınan coin ile nakde çevrilebilen elmastan tamamen ayrılmalı. Kazançlar ayrı, devredilemeyen, hediye edilemeyen ve nakde çevrilemeyen bir "oyun puanı" olmalı. Ya da şans oyunları tamamen kaldırılmalı. Bu ayrım yapılmadan bu özellikleri yalnızca belirli ülkelere ya da inceleme sonrasına açmak, S4'teki gizleme yasaklarına girer.

### Gaps
- Apple ya da Google'ın "kullanıcıdan kullanıcıya hediye + yaratıcı nakit çekimi + şans" modelini doğrudan ele alan resmî bir metni ya da basın açıklaması bulunamadı.
- Google Ads'deki Ekim 2025 cümlesinin tarihi yalnızca ikincil kaynaklardan doğrulandı.

---

## S4. Yaptırım örnekleri ve davalar

### Takeaway
Bu alanda en önemli dava, ABD'de Apple, Google ve Meta'ya karşı açılan "social casino" davaları. Bölge mahkemesi, platformların ödeme işlemesi nedeniyle Section 230 dokunulmazlığından yararlanamayacağına hükmetti. 9. Daire 2024'te ara temyizi reddetti (erken bulundu). Dava 2026'da yeniden 9. Daire önünde. Kasım 2026 itibarıyla mağazalar adına bir uzlaşma bulunamadı. Big Fish davasında oyun şirketleri 155 milyon USD ödedi.

### Cited Findings (VERIFIED, secondary sources)
- April 2024: a 9th Circuit panel heard argument on whether Section 230 shields Apple, Meta and Google over "illegal gambling apps"; Judge Edward Davila had held the platforms immune except when they processed "unlawful transactions for unlawful gambling" — [Courthouse News, Apr 8, 2024](https://www.courthousenews.com/ninth-circuit-takes-up-thorny-issue-of-immunity-for-purveyors-of-gambling-apps/)
- The 9th Circuit rejected the interlocutory Section 230 appeal as premature in 2024 — [Law360](https://www.law360.com/articles/1839563/9th-circ-rejects-quick-section-230-appeal-in-casino-app-mdl) (headline only; paywalled)
- April 2026: EFF filed a second amicus brief: "The district court ruled that the companies do not have Section 230 immunity" because they let the apps use their payment processing for in-app chip purchases; plaintiffs "spent large sums of money on virtual chips and even became addicted to these games" — [EFF, Apr 23, 2026](https://www.eff.org/deeplinks/2026/04/eff-9th-circuit-again-app-stores-shouldnt-be-liable-processing-payments-user)
- Nov 2026: "Meta, Apple, Google Fight 'Casino Games' MDL At 9th Circ." — [Law360](https://www.law360.com/compliance/articles/2551138) (headline/summary only; search summary dated it Nov 17, 2026, unverified)
- Big Fish settlement: Churchill Downs USD 124M + Aristocrat USD 31M = USD 155M, resolving Thimmegowda v. Big Fish Games and Kater v. Churchill Downs — [Womble Bond Dickinson](https://www.womblebonddickinson.com/us/node/13825); [GeekWire 2020](https://www.geekwire.com/2020/big-fish-games-pay-155m-tweak-games-part-class-action-settlement-gambling/)
- Older precedent: Apple and Google removed hundreds of gambling apps disguised as other apps whose gambling functions were hidden during review (Trend Micro finding, ~2019) — [Gambling Insider](https://www.gamblinginsider.com/news/7903/apple-and-google-remove-illegal-gambling-apps)
- Google Play: a 180-day appeal window for account terminations was introduced in Oct 2025 — [Google, Oct 30, 2025](https://support.google.com/googleplay/android-developer/answer/16550159?hl=en)
- Market observation: the US App Store listing of YouStar (a voice chat room app) carries a "Simulated Gambling" label and mentions a lucky wheel mini-game — [App Store](https://apps.apple.com/us/app/-/id1377028992). This shows that voice-room apps with simulated wheels are on the store under a declared label; it does not show whether their winnings are convertible.

### Inferences (INTERPRETATION)
- ABD davası mağazaları sosyal kumarhane ödemeleri konusunda daha temkinli hâle getiriyor. Mağazalar ödeme işleyen taraf olarak sorumlu tutulabileceği için inceleme sırasında "gerçek değer" bağlantısını daha sıkı denetleyebilir.
- Yaptırım zinciri: uygulamanın reddedilmesi veya kaldırılması → Apple Developer Program'dan ya da Play'den hesabın kapatılması (2.3.1(b), 2.5.19, 1.2). Google'da bu, "bağlantılı hesaplar" nedeniyle aynı şirketin başka uygulamalarını da etkileyebilir (Google politika metninde bunu doğrulamadım).

### Gaps
- Sesli sohbet veya canlı yayın uygulamalarının özellikle "şanslı hediye" ya da slot yüzünden mağazadan kaldırıldığını gösteren güvenilir bir kaynak bulamadım.
- Davanın 2026'daki dosya numarası ve son durumu birincil kaynaktan (PACER veya 9. Daire) doğrulanamadı. Law360 haberlerine ödeme duvarı nedeniyle erişilemedi.
- Big Fish uzlaşmasının nihai onayı doğrulanmadı.

---

## S5. Türkiye'ye özgü mağaza kuralları ve 5651 sayılı Kanun

### Takeaway
Google'ın kumar ülke listesinde Türkiye online casino, spor bahsi ve piyango kategorileriyle yer alıyor. Ancak bu yalnızca "yerel lisans" ile mümkün. Google Ads'in Türkiye kuralı ise "Operator must be a state licensed entity" diyor. Türk hukukunda online casino lisansı yok, spor bahsi ve şans oyunları devlet tekelinde (INTERPRETATION; ayrıntısı hukuk notlarında). Bu yüzden UK'de kayıtlı bir şirket Türkiye için RMG yolunu pratikte kullanamaz. 5651 sayılı Kanun, Türkiye'den günlük 1 milyonun üzerinde erişimi olan sosyal ağ sağlayıcılarına yerel temsilci zorunluluğu getiriyor. 2026 değişikliği (7578 sayılı Kanun, 1 Kasım 2026'da yürürlükte) oyun platformları için eşiği 100.000 günlük erişime indiriyor.

### Cited Findings
- (VERIFIED) Google Play country allowance for Turkey: "Online Casino games; Sports Betting; Lotteries", subject to "the application and licensing requirements" — [Google](https://support.google.com/googleplay/android-developer/answer/12256011?hl=en)
- (VERIFIED) Google Ads, Türkiye: "Online gambling: Lotteries; Sports betting. Operator must be a state licensed entity." Türkiye is not on the social casino ad lists — [Google Ads](https://support.google.com/adspolicy/answer/6018017?hl=en)
- (VERIFIED, secondary) Law 5651: foreign and domestic social network providers with over one million daily accesses from Türkiye must appoint a local representative; fine of TRY 10 million if not appointed within 30 days of ICTA notice, then ad ban and bandwidth throttling — [CMS](https://cms.law/en/tur/legal-updates/tuerkiye-s-amends-internet-law-with-new-framework-for-digital-game-platforms-and-enhanced-obligations-for-social-network-providers); [Erdem & Erdem](https://www.erdem-erdem.av.tr/en/insights/did-social-network-platforms-comply-with-the-new-regulations-in-turkey)
- (VERIFIED, secondary) Law No. 7578 (Official Gazette 1 May 2026, No. 33240): obligations for social network providers and game platforms in force from 1 November 2026; foreign game platforms with daily access from Türkiye over 100,000 must appoint a local representative; social network providers over 10 million daily access have additional duties — [CMS](https://cms.law/en/tur/legal-updates/tuerkiye-s-amends-internet-law-with-new-framework-for-digital-game-platforms-and-enhanced-obligations-for-social-network-providers); [Gün + Partners PDF](https://gun.av.tr/media/b1imwl1g/amendments-to-the-law-no-5651-concerning-social-media.pdf); [Gürkaynak](https://www.gurkaynak.av.tr/Content/dosya/3969/a-new-era-for-children-and-gaming-in-turkey-understanding-law-no-5651-s-2026-am.pdf)
- (VERIFIED) Apple 3.2.2(v) prohibits "Arbitrarily restricting who may use the app, such as by location or carrier". By contrast, 5.3.4 requires RMG apps to be "geo-restricted" to licensed locations — [Apple](https://developer.apple.com/app-store/review/guidelines/)

### Inferences (INTERPRETATION)
- Türkiye'de lisans yolu kapalı olduğu için Similar Club her iki mağazada da şans oyunlarını yalnızca "simüle" kumar olarak tutabilir. Bunun şartı, şanstan gelen değerin nakde çevrilebilen zincirden tamamen ayrılması.
- Oda içi oyunlar 7578 sayılı Kanun'daki "oyun platformu" tanımına girebilir. Bu durumda Türkiye'den günlük erişim 100.000'i aştığında yerel temsilci gerekir. Kapsam bu notun dışında; hukuk notlarına bakılmalı.
- Similar Club'ın sosyal ağ sağlayıcısı sayılıp sayılmayacağı ve yerel temsilci eşiği, kullanıcı sayısı arttığında gündeme gelecek bir uyum maddesi.

### Gaps
- Apple'ın Türkiye vitrinine özgü bir kumar ya da sosyal ağ şartı bulunamadı. Apple'ın yaş derecelendirme sayfasında Türkiye için bölgesel bir not yok (Avustralya, Brezilya, Kore ve Vietnam var).
- Türkiye'de Apple veya Google'ın BTK talebiyle bir sosyal sohbet uygulamasını kaldırdığına dair doğrulanmış bir örnek bulunamadı.
- Oyun platformu tanımının sesli oda içindeki mini oyunları kapsayıp kapsamadığı netleşmedi.

---

## Özellik bazında özet tablo (INTERPRETATION, alıntılara dayanır)

| Özellik | Apple | Google Play |
| --- | --- | --- |
| Coin satışı | IAP zorunlu, süresi dolamaz (3.1.1) | Play Billing zorunlu, coin yalnız bu uygulamada kullanılır (Payments) |
| Hosta hediye / bahşiş | Açıkça izinli: "tip ... digital content providers" (3.1.1) | Satış Play Billing ile. Hediye uygulama içinde kalırsa açık bir yasak yok |
| Elmas → nakit (ajans) | Açık bir yasak yok. Şans değeriyle bağlantılıysa "Gambling" tanımı tetiklenir | Açık bir yasak yok. Şansla birleşirse RMG yasağına girer |
| Şanslı hediye (rastgele kat) | Ganimet kutusu oranları gösterilmeli. Kazanç nakde çevrilebiliyorsa Gambling → 5.3.3/5.3.4 | Ganimet kutusu oranları + RMG yasağı ("in-app items purchased with money") |
| Slot / Rüzgâr Gülü / roket | Simüle → sık oynatılıyorsa 18+. Nakde çevrilebiliyorsa Gambling | Simüle → IARC derecelendirmesi. Nakde çevrilebiliyorsa lisanssız RMG, kaldırılır |
| HTML5 oyunlar | 4.7: geliştirici sorumlu, oyun dizini, yaş kapısı | JS muaf ama politikaya tabi. dex/.so indirmek yasak |
| İncelemede kapalı tutulan özellik | 2.5.19 / 2.3.1: uygulamanın kaldırılması + hesabın kapatılması | Deceptive Behavior: "modify or obfuscate behavior during review" yasak |
| Sesli oda moderasyonu | 1.2: filtre, raporlama, engelleme, iletişim bilgisi | UGC + CSAE standartları, irtibat kişisi |
