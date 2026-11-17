# Similar Club — project guide for Claude

<!-- Türkçe not: Bu dosya Claude'un her oturumda kendiliğinden okuduğu proje rehberidir. Projenin nasıl çalıştığını,
asla atlanmaması gereken kuralları ve her işte uygulanacak kontrol listesini tutar. Yeni bir kural ya da ders
çıktığında buraya eklenir. Açık riskler ve yayın öncesi eksikler: docs/DENETIM.md. -->

A social voice-room app for Turkey (rooms with mics, gifts, coins and diamonds, agencies, families, PK, games). The
owners are not engineers and are building it for the first time: they rely on you to notice what they would miss.
Read `docs/DENETIM.md` (open risks, launch blockers) before any non-trivial task, and say so when a request touches one.

## Talking to the owners

- They write casual Turkish. Answer in Turkish, plain words, short. Lead with the outcome; no jargon, no code in chat
  unless asked. Turkish in user-facing text, docs (`docs/*.md`), commit messages and PR text; English in code comments.
- When a request has a consequence they didn't mention (older APKs, money, legal, store policy, moderation, load), say it
  in one line and handle it, as with the gift prices in PR #152: a re-priced gift is hidden from older APKs.
- Decisions that are theirs (money rules, legal, accounts, what ships): ask, with a recommendation.

## Layout

| Path | What |
| --- | --- |
| `app/` | Expo (SDK 58) / React Native app, Expo Router. `src/lib/live/*` talks to the server ("live mode", `EXPO_PUBLIC_API_URL` set); without it the app runs a local demo (`src/data/mock.ts`). Read `app/AGENTS.md` for Expo rules. |
| `server/api/` | Node 22 API (no framework, `pg`), one module per feature, `index.mjs` routes, `migrations/*.sql` applied in order at start. Tests: `server/api/test/*.test.mjs` (a real Postgres, the API as a child process, `harness.mjs`). |
| `server/infra/` | Production templates: `compose.yaml` (postgres, livekit, api, caddy, finance), `Caddyfile`, `livekit.yaml`, `backup.sh`, `setup.sh`. |
| `docs/` | Feature docs in Turkish. `SUNUCU.md` (server, every endpoint), `YAYIN_HAZIRLIGI.md` (launch checklist), `DURUM_LISTESI.md` (what the APK really does), `DENETIM.md` (audit), `HEDIYE_YONETIMI.md`, `EMOJI_YONETIMI.md`, … |
| `.github/workflows/` | `server.yml` (tests on PR; deploy on merge), `preview.yml` (web + APK on merge), `app-check.yml` (typecheck, lint, tests on PR), `uptime.yml` (15-minute probe). |
| Finance panel | Separate repo `keremcan534/similarclup-finance-control` (Node 24, SQLite, Preact): runs the app's admin API through `server/api/panel.mjs` (`PANEL_ROUTES`, `X-Panel-Key`). |

Default branch: `ccr-0c79d9d5-0hfb46`. Merging to it deploys the server (`server.yml`, after its tests) and builds the
web and a debug-signed APK (`preview.yml`, release `preview-N`). Production today: one Oracle VM in Frankfurt (1 OCPU,
6 GB), `https://130-61-230-94.sslip.io`, running as a test server (`TEST_MODE=1`: device sign-in and free test coins).
`GET /api/health` shows the deployed commit.

## Checks before saying "done"

- Server: start Postgres, then `cd server/api && PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres
  POSTGRES_PASSWORD=… node --test --test-concurrency=4 test/*.test.mjs`. Gift video tests need `ffmpeg` and Python with
  numpy and Pillow. One file: `node --test test/<name>.test.mjs`. A test file that starts its own HTTP server must close
  it in `after()`, or the run hangs.
- App: `cd app && npm ci && npx tsc --noEmit && npx expo lint && npm test`. Tests are plain `node --test` over the
  pure modules (`tests/register.mjs` maps `@/`); a module that touches AsyncStorage at load needs
  `register('./api-stub-hooks.mjs')` and a dynamic import.
- Panel repo: Node 24 (`npx -y node@24`), `npm test`, `npx tsc --noEmit`.
- Run the whole suites, not just the new tests: shared tables, `my-data`, drift tests and source-text tests catch
  what a feature test doesn't.
- Load: `server/infra/loadtest/` (`docs/YUK_TESTI.md`) after a change to a hot path (room list, `/api/room`, gifts,
  rankings, `/token`, `/api/live`) or before raising room or user limits. Never against the live server.
- Money: every test file ends with the money checks (`money-check.mjs` via `harness.mjs`): balances = ledger chain =
  coin lots, locks within diamonds, gift and paid-event legs. A test that needs a starting balance uses `h.credit` /
  `h.debit`, never raw SQL on wallet tables. `test/money-fuzz.test.mjs` races random money requests; a new money route
  goes into its mix. Server-made ledger refs contain `:` (client refs can't), so a client can't take them first.

## Rules that must never be skipped

**Money (coins, diamonds, game coins).** The server decides every price and balance; the app never sends an amount it
computed. A screen sends what it *showed* (gift `price`, Çevir `usdTry`, shop `price`): a moved value is a 409
`price_changed` / `rate_changed` for a newer app and `update_required` for an older one, and nothing moves. Every money
write is idempotent on `ref` (`once`, `claimRef`); the ledger is append-only. Checks that can change (hidden, re-priced)
go after the ref claim, so a retry of a send that went through gets its replay.

**Older APKs are in the wild.** Never change a response so an older parser breaks. Add fields; put new behaviour behind
a request flag the new app sends (`/api/catalog?gifts=2&emoji=1`) or a version; decide what an older app sees and test
it (an older app shows compiled names and prices, so a re-priced gift is left out of its catalog).

**Compiled data lives on both sides.** Gifts (`catalog.mjs GIFT_ROWS` ↔ `app/src/data/mock.ts`), shop items, packs,
sticker packs (`stickers.mjs` ↔ `app/src/data/catalog.ts`), rules modules: change both; `app/tests/server-catalog.test.ts`
fails on drift. Runtime changes go through Canlı ayarlar (`live-registry.mjs`) or the Yönetim tables, not a deploy.

**Database.** A new numbered migration, never an edit of an applied one. A table that references a user goes into the
data copy (`my-data.mjs`) or `my-data-tables.mjs` with the reason it doesn't (a test enforces it). A row the phones'
catalog version depends on (`rev`) is never deleted.

**Admin and panel.** Admin routes check `role = 'admin'` and write `audit_events` (before/after, `panelDetail`). A
route the finance panel calls goes in `PANEL_ROUTES` here *and* in the panel repo's `APP_ROUTES` with a permission (and
a role migration there). A new upload kind: `media.mjs` `KINDS`, `FILE_KEY`, `SENT_AS` if phones load it, and the
panel's `UPLOADS`.

**User content.** Validate on the server (type, size, magic bytes, dimensions), never trust the client. User text goes
through the contact filter; Turkish error sentences that say what to do.

**Store and legal.** 18+ app. Chance features with purchased coins (Şanslı hediye, Oyun Salonu, Rüzgâr Gülü, Oda roketi) and
cash-outs (para çekme, Jeton Noktası, agency payouts) are a legal question the owners haven't closed
(`docs/YAYIN_HAZIRLIGI.md` §1, `docs/DENETIM.md`): never widen them without saying so.

## Checklist for any feature

1. Server: route, validation, limits, audit, tests (success, refusals, permissions, idempotency, concurrency).
2. App: live client that parses defensively (malformed answers fall back, never crash), screens, tests.
3. Older APKs: what they see and do; a flag if behaviour changes.
4. Panel: does staff need to see or change it? Route lists, permission, page, panel tests.
5. Docs: `docs/SUNUCU.md` endpoint table, the feature's doc, `DURUM_LISTESI.md` / `YAYIN_HAZIRLIGI.md` if it changes
   what ships.
6. Data: migrations, `my-data`, backups, what deletion of an account does to it.
7. Ops: alerts (`alerts.mjs`), load (one room can hold hundreds), what breaks if a third-party key is missing.
8. Full suites green, typecheck and lint clean; PR as a draft with what changed for the owners in Turkish.

## Lessons

- PR #152: the app's own gifts and emoji packs became editable. Old APKs, the bag's reward value and the shop's
  name-based purchase path for older apps all needed explicit handling; the review found them, not the request.
- Load test (Nov 2026): one core holds one busy 200-person room plus a few hundred very active users. The top database
  cost was a per-request sum over a growing table (rankings); such reads need a cache or a summary table. Room size
  limits go up to 5000 people, far beyond one machine (`docs/YUK_TESTI.md`).
- Money audit (Nov 2026, `docs/PARA_DENETIMI.md`): no balance moved outside `move`, but two holes were real: a payer
  could pre-use a server ref (`call-{id}-{n}`) and make call minutes free, and a store refund missed coins held in
  escrow (pending bonds, open bags). A refund locking accounts piecemeal deadlocked with gifts; only the concurrent
  random test found it. Escrow, server-made refs and lock order are where money bugs hide.
- Live rocket launch (Nov 2026): it held the game bank and then wrote the same fuel rows twice. Postgres re-checks a
  foreign key when a row this transaction already wrote is written again, so the second write waited for a share lock
  on each owner's `users` row, while an owner playing another game held that row and waited for the bank. Under a
  shared lock (bank, round), write a row once, or lock accounts before the shared row as every other route does.
