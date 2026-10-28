# Written in the Stars

*Is your life written in the stars, or just luck? Live it 100 times.*

A free browser game for the US market: enter a birth date, time and place, live a whole American life year by year
with odds tilted by your Western birth chart (on top of US statistics), then watch the same chart live 99 more times.
The plan is in `PLAN.md`, the legal notes in `docs/COMPLIANCE.md`, the engine in `src/sim/README.md`.

## The site

| Route | What |
| --- | --- |
| `/` | The game: welcome (live numbers) → birth form with the Big Three → play → ending (life chart, fate vs luck over 100 lives, your sky, share card) |
| `/privacy`, `/terms` | Static policy pages (`src/legal.js`; the contact address is a TODO placeholder) |
| `/api/stats` | POST anonymous event counts from the page; GET the totals with the `ADMIN_KEY` secret |
| `/api/live` | The welcome page's live numbers (demo numbers while `LIVE_DEMO = "1"`) |
| `/admin` | The back office (open it once as `/admin#key=…`) |

Everything about the player runs in the browser: the chart, the life, the 100 reruns (in a Web Worker made from the
page's own script) and the "write your own decision" matcher (`src/sim/intent.js`). The Worker keeps only daily event
totals and an anonymous summary of finished lives (decade, Sun sign, age, married, home, kids). No cookies, no IDs.

### Files

- `src/index.html`: the page and its styles; `src/app.js`: the page logic (the build inlines it).
- `src/ui/`: `pixel.js` / `pixel-app.js` (pixel scenes, recap dialog, welcome slideshow; adapted from bazi-life),
  `kline.js` (life chart), `share.js` (9:16 share card on a canvas), `words.js` (sign words, labels, fate vs luck),
  `stats.js` (anonymous counts).
- `src/legal.js`: `/privacy` and `/terms`.
- `scripts/build.mjs`: builds `public/index.html`, `public/privacy.html`, `public/terms.html`.
- `worker/`: `index.js` (entry), `app.js` (routes), `stats.js`, `stats-store.js` (the `StatsStore` Durable Object),
  `admin.js`. `wrangler.jsonc` deploys it as the Worker `written-in-the-stars`.

## Build, test, deploy

```bash
npm run build                      # → public/
node --test test/site-*.test.js    # Worker and page unit tests (npm test runs everything)
PLAYWRIGHT=/opt/node22/lib/node_modules/playwright CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node test/site.e2e.mjs           # browser test of public/ (SHOTS=<dir> saves screenshots, FONTS=<dir> a local font copy)
npm run build && npx wrangler deploy
npx wrangler secret put ADMIN_KEY  # once, for /admin
```

For entertainment only: astrology has no proven scientific validity, and nothing here predicts anyone's future.
