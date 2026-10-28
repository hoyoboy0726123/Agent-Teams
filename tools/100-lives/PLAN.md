# 100 Lives — plan

**100 Lives** is the Western-astrology sister of 命盤人生 (`../bazi-life`, live at https://bazi-life.mingpan.workers.dev).
You enter a birth date, time and place, live a whole **American** life year by year (school, work, love, marriage,
home, health), with the odds of each year tilted by your **Western birth chart** and calibrated on **US statistics**,
then the same chart lives 99 more times: *is your life written in the stars, or just luck?*

It is a separate site (its own Worker and URL) built for the English-speaking market. It reuses the ideas and much of
the engine of 命盤人生, copied here and adapted, not shared.

## Why (from the market research, Oct 2026)

- Nobody simulates a whole life from a birth chart, in Western or Eastern astrology. That is the white space.
- The differentiator is **the same chart lived 100 times** (fate vs luck); plain "life sims" are crowded with 1in8b clones.
- English users want an identity badge (the **Big Three**: Sun, Moon, Rising), a shareable 9:16 card with one big number
  and a label, friend comparison, a voice with some wit. Free, no dark patterns, no mid-life paywall; "for entertainment".
- About 3 in 10 US adults look at astrology yearly, mostly for fun; core users are millennial and Gen Z women.

## Product decisions

- Setting: born in the **United States** (US life tables, marriage, divorce, births, home ownership, education, causes
  of death), US history as the backdrop (moon landing, 9/11, 2008, COVID…). Birth years 1950–2025.
- Astrology: **tropical** zodiac, **Whole Sign houses**, the classic seven planets plus Uranus/Neptune/Pluto, major
  aspects. Year-by-year timing: **annual profections** (the activated house and the lord of the year) plus **transits**
  of Saturn and Jupiter (Saturn returns at ~29.5 and ~59, Jupiter returns every ~12 years, Uranus opposition ~42).
  Unknown birth time: no Rising/houses, solar profections from the Sun sign, flagged.
- Everything runs in the browser; the site keeps no birth data (anonymous counts only, as in 命盤人生).
- Language: English only. Tone: warm, a little witty, never fatalistic; tendencies, not fate.

## Layout

```
src/astro/   chart (positions, Ascendant/MC, Whole Sign houses, aspects), timing (profections, transits, returns),
             luck (per-age tilts in the engine's shape), traits (personality from the chart), readings later
src/data/    US base rates with sources (us-rates.js)
src/sim/     the life engine, ported from ../bazi-life/src/sim with BaZi and Taiwan taken out behind the seam below
src/sim/story/  US English story events (same event API as ../bazi-life/src/sim/story/README.md)
test/        node --test
```

## The seam between the chart and the engine

The engine only needs, per life (`prepare(input)` → `prep`):

- `prep.luck[age]` = `{ age, L, score, m, reasons }` for ages 0–110:
  - `m[domain][channel]`: ln-odds tilt, clamped to ±ln 2. Domains are career, wealth, love, health, study, family
    and move; channels are good, bad and change.
  - `L`: the year's overall tone, −1..1. `score`: 0–100, for the life chart.
  - `reasons`: `[{ domains: [...], tags?: [...], text }]`, a one-line English "why" for the year.
  - Timing triggers are centred on the chart's own lifetime mean, so a whole population keeps the US base rates.
- `prep.traits0`: `{ drive, caution, warmth, curiosity, health }`, each 0–1.
- `prep.jobFit(job)` → −1..1, and `prep.intro` (one line: "Sun in Leo, Moon in Pisces, Scorpio rising").
- Later: `readingAt(age)` → `{ domains: { d: { level −2..2, text } } }`, and a natal reading.

## Tracks (run in parallel)

1. **Astro engine** (`src/astro`, tests against Swiss Ephemeris fixtures).
2. **US data** (`src/data/us-rates.js`, every number with its source).
3. **Engine port** (`src/sim`, without `story/`).
4. **Story** (`src/sim/story`, US English events, style guide first).
5. Then UI, readings, share card, Worker and deploy. Separately, in `../bazi-life`: English BaZi for Singapore,
   Malaysia and the diaspora (translation layer, then the story).
