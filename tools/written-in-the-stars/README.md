# Written in the Stars

*Is your life written in the stars, or just luck? Live it 100 times.*

A free browser game for the US market: enter a birth date, time and place, live a whole American life year by year
with odds tilted by your Western birth chart (on top of US statistics), then watch the same chart live 99 more times.
The plan is in `PLAN.md`, the legal notes in `docs/COMPLIANCE.md`, the engine in `src/sim/README.md`.

## The site

| Route | What |
| --- | --- |
| `/` | The game: welcome (live numbers) → birth form with the Big Three → play → ending (life chart, fate vs luck over 100 lives, your sky, share card) |
| `/privacy`, `/terms` | Static policy pages (`src/legal.js`). The contact address is `CONTACT` at the top of that file, still the placeholder `TODO@example.com`, so the pages say “(contact address coming soon)” |
| `/fonts/*.woff2`, `/fonts/OFL.txt` | The display face, Fraunces (OFL), served by the site itself: no Google Fonts (`src/fonts.js`, `assets/fonts/`) |
| `/og.png`, `/robots.txt`, anything else | The share picture, the crawler rules, and a friendly 404 page (`public/404.html`) |
| `/api/stats` | POST anonymous event counts from the page; GET the totals with the `ADMIN_KEY` secret |
| `/api/live` | The welcome page's live numbers (real numbers only; `LIVE_DEMO` is off for good, since made-up activity reads as fake social proof). The page asks every 60 seconds, only while the welcome page is on screen |
| `/admin` | The back office (open it once as `/admin#key=…`); both sites together: https://bazi-life.mingpan.workers.dev/admin |

Everything but `/api/*` and `/admin` is a Workers Static Asset (`public/`, the `assets` block of `wrangler.jsonc`):
Cloudflare serves it without running the Worker, free, and it does not count against the Free plan's 100,000 Worker
requests a day (shared with bazi-life). `html_handling` is `none`; the clean URLs `/`, `/privacy` and `/terms` are 200
rewrites in `public/_redirects`, and the headers the Worker used to set (`no-cache` pages with an ETag, `nosniff`,
`strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, the permissions policy; a day's cache for `og.png`, the
fonts and `robots.txt`) are in `public/_headers`. `npm run build` writes both from `scripts/static-site.mjs`, and
copies `assets/og.png` and `assets/fonts/` in (`public/` is not in git).

**When the day's Worker requests run out**, Cloudflare answers `/api/*` with its own error 1027 (a 429 or a 5xx, with
an HTML page) until 00:00 UTC, but the site still loads and the game plays to the end. Any `/api/live` answer that is
not the JSON is a failure; after a first one the page asks again 5 seconds later, and two in a row hide the live
numbers and show "So many lives today that the live numbers are paused until {time} your time. The game still works."
(`src/ui/live-pause.js`; `{time}` is the next 00:00 UTC in the viewer's own time, with the weekday when it is not
today). One blip shows nothing. The counts simply fail silently.

Everything about the player runs in the browser: the chart, the life, the 100 reruns (in a Web Worker made from the
page's own script) and the "write your own decision" matcher (`src/sim/intent.js`). The Worker keeps only daily event
totals and an anonymous summary of finished lives (decade, Sun sign, age, married, home, kids). No cookies, no IDs, and
nothing stored in the browser for the counts: a visit is one `view` (the old `wits.lastVisit` date and the `visitor` and
`return` events it drove are gone, since analytics storage needs consent under the EU ePrivacy rules). The browser keeps
only `wits.theme` and `wits.majorOnly`.

### Files

- `src/index.html`: the page and its styles; `src/app.js`: the page logic (the build inlines it).
- `src/ui/`: `pixel.js` / `pixel-app.js` (pixel scenes, recap dialog, welcome slideshow; adapted from bazi-life),
  `kline.js` (life chart), `share.js` (9:16 share card on a canvas), `words.js` (sign words, labels, fate vs luck),
  `stats.js` (anonymous counts).
- `src/legal.js`: `/privacy` and `/terms`; `src/fonts.js`: the `@font-face` rules for the self-hosted Fraunces (the
  build fills them into `src/index.html` and the policy pages). The woff2 files are Google Fonts' own latin and
  latin-ext subsets (upright 400–600 and italic 500), with `assets/fonts/OFL.txt`.
- `scripts/build.mjs`: builds `public/index.html`, `public/privacy.html`, `public/terms.html`, copies `og.png` and the
  fonts in, and writes `public/_redirects`, `_headers`, `robots.txt` and `404.html` (`scripts/static-site.mjs`).
- `worker/`: `index.js` (entry), `app.js` (routes), `stats.js`, `stats-store.js` (the `StatsStore` Durable Object),
  `admin.js`. `wrangler.jsonc` deploys it as the Worker `written-in-the-stars`, with `public/` as its static assets; the
  Worker runs only for `/api/*` and `/admin` (`run_worker_first`).
- `src/ui/stats.js` sends one post a minute: the time on screen, plus the milestones and, while a life is played, the
  `beat` that counts it as playing now (no separate heartbeat request).

## The natal reading and the AI report hook

The ending page reads the player's real birth chart after the fate-vs-luck cards: **“Your birth chart, read in full”**,
seven collapsible chapters (chart overview with the wheel, element/modality bars, day or night chart and chart ruler;
the Big Three in depth; planet by planet; the twelve houses; the tightest major aspects; the timeline of profections,
Saturn and Jupiter returns and the Uranus opposition, tied to this life's events, plus a ten-year outlook from today for a
birth the player typed in; an overall reading). It is deterministic and hand-written, no AI, about 4,500 words for a
typical chart:

- `src/astro/reading.js` builds it: `natalReading(chart, { life, own, today, moons })` → chapters of plain blocks.
  It combines sign × house × dignity × aspects × timing (`timing.js`, `luck.js` `lordCondition`), with traditional
  rulers. Without a birth time it uses solar houses (flagged), drops the Rising sign and the Moon's aspects, and reads
  both Moon signs when the Moon changed sign that day.
- `src/astro/text/`: the text tables: `signs.js` (Sun, Moon, Rising portraits), `planets.js` (8 planets × 12 signs,
  dignities, retrogrades), `houses.js` (12 houses, 10 bodies × 12 houses, the chart ruler's house), `aspects.js`
  (45 pairs × conjunction/harmony/tension), `themes.js` (balance, sect, Sun–Moon blends, timeline, synthesis).
- `src/ui/reading-view.js` renders the chapters; `src/ui/wheel.js` draws the chart wheel (SVG, `role="img"` with a
  description, and the planet table as its text alternative).

Below it, the **AI Astrology Report** card has a real “Get my AI report” button, under a future-tense description (“We're
building an AI astrologer that will read your whole chart…”). AI reports are not open yet: a press
shows “Coming soon!” and counts `ai_report` (each press) and `ai_report_u` (once per page load), like bazi-life's
`ai_life`. Nothing about the chart is sent. `/admin` shows both, with the click rate per finished life
(`ai_report_u / end_u`).

## The back office

`/admin` (`worker/admin.js`) shows this site's numbers, with a link at the top to the combined dashboard of both sister
sites, **https://bazi-life.mingpan.workers.dev/admin** (tabs 總覽, 命盤人生 and Written in the Stars, in Traditional
Chinese). That page reads this Worker's `GET /api/stats` across origins:

- CORS is allowed for exactly one origin, `ADMIN_ORIGIN` in `wrangler.jsonc` vars (`https://bazi-life.mingpan.workers.dev`):
  a preflight `OPTIONS /api/stats` gets 204 with `Access-Control-Allow-Origin`, `Allow-Headers: authorization`,
  `Allow-Methods: GET` and `Vary: Origin`; a GET gets the same origin header on every answer, so a refused key (401)
  can be told apart from no answer. No other origin gets CORS; without `ADMIN_ORIGIN` nobody does.
- The key check is unchanged: the same `ADMIN_KEY` secret has to be set on both Workers (one key opens both).
- The beacon (`POST /api/stats`) is unchanged: only this site's own pages may send it.

## Build, test, deploy

```bash
npm run build                      # → public/
node --test test/site-*.test.js    # Worker and page unit tests (npm test runs everything)
PLAYWRIGHT=/opt/node22/lib/node_modules/playwright CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node test/site.e2e.mjs           # browser test of public/, served as static assets are (test/helpers/static-site.mjs);
                                   # SHOTS=<dir> saves screenshots; fails on any Google Fonts request
npm run build && npx wrangler deploy   # on your own computer (see below)
npx wrangler secret put ADMIN_KEY  # once, for /admin: the same key as bazi-life's
```

Deploy from your own computer: the static-asset upload is authorised by a one-time token of Cloudflare's own, which
the Claude Code cloud proxy replaces with the account's API token, so the upload fails there. Nothing has to be set
in the Cloudflare dashboard; the first deploy with assets uploads about 2 MB, later ones only the changed files.
`npx wrangler dev --local` serves the site as Cloudflare would.

For entertainment only: astrology has no proven scientific validity, and nothing here predicts anyone's future.
