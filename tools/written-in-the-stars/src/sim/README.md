# The life engine (`src/sim`)

Ported from bazi-life's `src/sim` (`../../../bazi-life/src/sim`). The engine is the same: a life advances one year
per `step()`, every event's chance is a US base rate tilted in ln-odds by that year's chart, choices stop the year,
and the same chart is lived 100 times with fixed seeds. Everything about BaZi and Taiwan is gone; the chart reaches
the engine only through the seam in `PLAN.md` (checked in `seam.js`).

## Modules

| File | What it does |
| --- | --- |
| `seam.js` | The contract with `src/astro`: `DOMAINS`, `CHANNELS`, `TRAITS`, `LN2`, `MAX_AGE` (110), `tilt(p, lnm)`; `makePrep` / `normalizeLuck` clamp every tilt to ±ln 2, fill missing ages and domains, guard `jobFit`; `neutralPrep(input)` (no chart, for tests and calibration) |
| `setup.js` | `prepare(input, { name, family })` → `prep = { chart, luck, traits0, jobFit, intro, name, family, input }`, calling `prepareChart` from `../astro/index.js` |
| `life.js` | The engine: `createLife({ prep, seed, auto, policy, majorOnly, seen, place, sex, birthYear, events })`, `runLife`, `topicOf`, `situationContext`, `personalTilt` (the family hook), `OWN`, `NOVELTY`, `FRESH`, `ALL_EVENTS`, `deathEvent` (the story's, or a plain fallback) |
| `monte.js` | `rerun({ prep, runs, key })`: the same chart 100 times; lifespan, illness, marriage, kids, college, home, abroad, service, hurdle years |
| `compare.js` | Expecting parents: birth slots from 39 weeks (`gestation`, `slotRange`, `checkSlot`), `slotOutlook(prep)` from the yearly scores, `runSlice` / `simulate` with shared seeds |
| `rates.js` | US base rates, the same function names as bazi-life's (list below), reading `../data/us-rates.js` |
| `world.js` | US states (by births) and cities, ~110 jobs tagged for `jobFit`, `jobsFor` / `pickJob` / `startJob` / `setJob` / `otherJob` / `moveTo`, schooling levels, the era's details (`chatTool`, `tripPlace`, `collegeTest`) |
| `people.js` | Partners, kids, friends with US names; `RELATIONS`, pronouns, `meetPlace` (by era: friends, church, bars, dating sites, apps), same-sex marriage by state and year, the family-partner hook (inactive with no family input) |
| `words.js` | `listWords` (serial comma), `callName`, `an`, `siblingCall`, `siblingWords`, `birthText` |
| `act.js` | What each general action does, the same rules for buttons and written answers; age floors (work 14, adult matters 18) |
| `actions.js` | The ~55 general actions: label, one-line description, English keywords |
| `intent.js` | The English keyword matcher for "write your own decision" (stems, negation, clause breaks) and the safety check (self-harm → 988, harm → another choice) |
| `interpret.js` | The prompt and reply check for a model behind the Worker (English) |
| `privacy.js` | Swaps the names the player typed for "you", "my brother", "my partner" before a written choice leaves the browser |
| `traits.js` | Personality from `prep.traits0`, nudged by choices; `styleWeight` steers the auto player |
| `grammar.js` | `{a|b}` templates, `variants`, `tidy`, `cap` |
| `rng.js` | Seeded random numbers (mulberry32) and `hashSeed` |
| `events.js` | Old import names (`EVENTS`, `COUNTIES`) |

## What the engine expects from the other tracks

### `src/astro` (chart engine)

`prepareChart(input) → { chart, luck, traits0, jobFit, intro }`, with
`input = { date: {y,m,d}, time: {h,mi} | null, place: { name, state, lat, lon, tz }, sex }`.

- `luck[age]` for ages 0–110: `{ age, L (−1..1), score (0..100), m[domain][channel] (ln-odds), reasons: [{ domains, tags?, text }] }`.
  The engine clamps `m` to ±ln 2 and fills gaps anyway; the birth year (age 0) is never tilted. Reason `tags` limit a
  reason to events with a matching tag (`spouse`, `children`, `father`, `mother`, `siblings`, `home`).
- `traits0`: drive, caution, warmth, curiosity, health in 0..1, about 0.5 over a population (each life adds ±0.12).
- `jobFit(job)` → −1..1. A job is `world.js`'s entry: it reads `job.house` (1–12), and the engine also gives
  `job.signs` and `job.elements` (by sector, `FIELD_TAGS`, with a few per-job overrides) and `job.houses`. A pick weight
  is `2^fit` (half to twice as likely).
- `intro`: one line, put at the end of the birth line.
- Optional: `prep.bodyAt(age)` for the health hurdle years in `monte.js` (bazi-life named a body system there).

### `src/data/us-rates.js`

The same export names and shapes as bazi-life's `official-data.js`:
- `LIFE_TABLES`: `[year, male q(x)×1e6, female q(x)×1e6, [e0 m, f], [eΩ m, f]]` for single ages 0..Ω−1 (any open age Ω;
  the Kannisto tail starts there);
- `CAUSE_AGES` and `CAUSE_SHARES`: `[year, { male|female: { cancer, heart, stroke: [share of all deaths × 1e4 by age group] } }]`;
- `CHRONIC_AGES` and `CHRONIC_RATES`: `{ male|female: { hypertension, diabetes: [per 100,000 by age group] } }`.

Optional exports override the figures written in `rates.js`: `E0_PROJECTION` (`{ year, male, female }`),
`CANCER_FATALITY` (`{ male: [α, β], female }`, to fit the US registry), `CANCER_REFERENCE`, `TFR`, `ASFR`,
`MEDIAN_FIRST_MARRIAGE`, `REFINED_DIVORCE`, `HIGH_SCHOOL`, `ENROLLMENT`.

### `src/sim/story` (the events)

`story/index.js` exports `ALL_EVENTS` (and may export `deathEvent`), with the event API of bazi-life's
`story/README.md`. What the story can use from the engine:

- `ctx`: `w`, `rng`, `roll`, `odds`, `person`, `arc`, `remember`, `nudge`, `luckAt`, `R` (rates.js), `prep`
  (`intro`, `jobFit`), `jobFit`, `intro`, `family`, `s`. Template slots: `{city}` ("Columbus, Ohio", or the country
  abroad), `{town}`, `{state}`, `{job}`, `{ajob}` ("a nurse"), `{partner}`, `{he}`/`{him}`/`{his}` (the partner's),
  `{kid}`, `{kids}`, `{friend}`, `{grand}`, `{chat}`, `{trip}`, `{age}`, `{year}`. Each log entry is capitalised.
- `rates.js`, with the arguments the story passes: `kindergarten(year)`, `juniorHigh(year)`, `hsDropout(year)` (each
  of the years at 16 and 17), `ged(age)`, `college(year, track)`, `communityShare(year)`, `afterHighSchool(year, sex,
  birthYear)`, `collegeDropout(year, track)`, `transfer(year)`, `master(year)`, `gradSchool(year)`, `enlist(sex, year)`,
  `military(birthYear, year, sex)` → `{ p, draft, years }`, `jobFind(age)`, `promotion(age)`, `jobChange(age)`,
  `layoff(year)`, `isRecession(year)`, `retire(age, sex, year)`, `homeBuy(age)`, `DOWN_PAYMENT`, `move(age, year?)`,
  `abroad(age)`, `dating(age, rel, year, sex)`, `breakup(age)`, `proposal(age, sex, year, marriages)`,
  `divorce(years, year)`, `crisis(years)`, `birth(motherAge, parity, year, married = true)`, `siblings(birthYear, rng)`,
  `deathRaw(age, sex, year)`, `death(age, sex, year)`, `serious(age, sex, year)`, `seriousType(age, sex, year, rng)`
  → "cancer" | "stroke" | "heart disease", `seriousFatality(...)`, `chronic(age, sex)`, `CHRONIC_HR`,
  `marketReturn(year)`, `dollars(units, year)`, `freezeYear(y)`.
- `world.js`: `JOBS` (by tier: basic, high, trade, associate, college, graduate), `SPECIAL_JOBS`, `militaryJob`,
  `BRANCHES`, `tier`, `EDU_ORDER`, `eduAtLeast`, `jobsFor`, `pickJob`, `fitOf`, `fitWeight`, `jobFit` (bazi-life's
  name; a weight, 1 = no fit), `jobHint`, `payBand`, `wage`, `startJob(s, ctx, job?)` (a job entry or a plain
  `[title, factor, field, house|null]`), `setJob`, `otherJob`, `moveTo(s, ctx, [[state or code, weight]]?)` → "City,
  State", `yearsMarried`, `bornSiblings`, `STATES`, `COUNTIES` (`[[state, weight]]`), `stateName`, `stateCode`,
  `regionOf`, `cityIn`, `placeLabel`, `ABROAD`, `chatTool`, `TRIP_PLACES`, `tripPlace`, `collegeTest` / `exam18Name`.
  A job is a list `[title, factor, field, house]` that carries the same fields by name.
- `people.js`: `newKid`, `newPerson`, `meetPlace` + `MEET_WORDS`, `pronoun` / `objectPronoun` / `possessive`,
  `surnameIn`, `surnameOf`, `sameSexCouple`, `canMarry` (by state, nationwide from 2015), `datingSex`, `RELATIONS`,
  `SHORT_RELATIONS`, and the partner hook (`partnerMember`, `realPartner*`, `keptForPartner`), all inactive with no
  family input.
- `act.js`: `marry`, `endRelationship`, `closeSpell`, `ownHome`, `loseJob`, `spend`, `act`.
- `words.js`: `listWords`, `callName`, `an`, `siblingCall`, `siblingWords`, `birthText(s, prep)`.

### The protagonist `s`, as the engine sets it

`county` holds the US state (its name, "Ohio"), `city` a city in it and `cityState` the state that city is in;
`birthCounty` and `birthCity` the birthplace. A birthplace outside the US (or none) gets a random state, weighted by
births. `edu` starts at "none" and the story moves it through elementary, middle, high, ged, certificate, associate,
bachelor, master, professional, doctorate. `job` is `{ title, factor, field, house, houses, since }`. Money is in
years of median full-time pay (about $58,000 in 2023; `R.dollars` turns it into a year's dollars). The rest is as
in bazi-life (`rel`, `partner`, `kids`, `health`, `traits`, `flags`, `arcs`, `memory`, `jobsHeld` with each job's
`fit`, `flags.livedAbroad`, `flags.served`).

## Removed or deferred, compared with bazi-life

- **BaZi**: the day master, strength, favourable and avoided elements, structures and their uses (`analysis.*` in
  `setup.js`, `traits.js`, `world.js`, `monte.js`, `words.js`). Personality comes from `traits0`; job fit from
  `jobFit`; the birth line from `intro`. Jobs carry houses, signs and elements instead of the five elements.
- **Name scoring** and the name comparison in expecting-parents mode (`compare.js` compares birth slots only; names do
  not tilt anything).
- **Family and partner charts** (bazi-life's family.js, the partner's chart in the couple tab): out for now. The hook
  is `prep.family`, null by default; a later family input may give `{ members: [{ relation, name, date, sex }],
  tilt(ev, s, ctx), reason(ev, s, ctx) }`. Members already name parents and siblings and set the partner; `tilt` is
  capped at ±0.15 and never applies to a grave event.
- **Taiwan**: counties, the five-year college and vocational tracks and the 15- and 18-year-old exams, conscription, arranged introductions, Taiwanese names, the
  Chinese free-text words, the help lines (now 988), the Chinese model prompt. `words.js` lost the day-master words.
- **Readings**: `reason-kinds.js` (which reading explains which event) waits for the readings track.
- **The body system in hurdle years** (five elements to organs): now an optional `prep.bodyAt(age)` hook.
- **Calibration**: bazi-life's `test/calibration.test.js` and `scripts/official-stats.py`, `cancer-fatality.mjs` are not
  ported yet. They need the real `us-rates.js` and the finished `story/core.js`. The figures marked "design" in
  `rates.js` (dating, proposals' centre, parity, the marital share of births by age, divorce duration, college
  dropout, home buying, moves, retirement) are to be tuned there to: total fertility, median age at first marriage, the
  share never married at 40–44, the refined divorce rate, bachelor's attainment by cohort, home ownership by age, the
  retirement age; and `CANCER_FATALITY` refitted to the US cancer registry.

## Tests

`node --test "test/**/*.test.js"`; the engine's are `test/sim-life.test.js`, `test/sim-world.test.js`,
`test/sim-intent.test.js`. A module of another track that is not in yet is replaced by its stand-in in
`test/sim-stubs/` (a resolve hook, `load.js`); the engine checks run on the stand-in story so they do not move when the
real story changes, and one test runs the real story when it exists. The intent test has 61 dev sentences; on 30 fresh
ones the matcher gets 16 first and 21 in its top three (the page shows the top three; the model path does better).

## Calibration

`test/calibration.test.js` (this replaces the "not ported yet" note above) lives auto-played lives born 1950–2000 with
no chart (`neutralPrep`) and checks them against `us-rates.js`, each target read for the person's own birth year or the
event's year; then it lives the first of them again with random charts (five lives per chart, same people and seeds)
and checks that no aggregate moves.

```
npm test                                       # quick: 2,000 + 1,000 lives in worker threads, pooled checks
CAL=full node --test test/calibration.test.js  # 20,000 + 10,000 lives, by sex and birth decade (several minutes)
CAL=fit  node --test test/calibration.test.js  # also prints a refitted rates.js EXPOSURE table
```

Checked: life expectancy (cohort, along the period tables) and the deaths over the table's (SMR); ever married by 45
and the median age at first marriage (MS-2 in the year the cohort marries); children by 45 (the ASFR diagonal) and
the nonmarital share of births; first marriages divorced within 5/10/20 years (NSFG survival); high school, some
college or associate, bachelor's or more at 30 and graduate degrees at 45 (EDUCATION_BY_COHORT); owning a home at 35
and 50 (HVS); cancer, heart disease and stroke shares of deaths at 45–69, 70–84, 85+ (CAUSE_SHARES) and the cancer
registry (CANCER_INCIDENCE on US_STANDARD_2000); service of men born 1950–55 vs later (MILITARY_SERVICE_SHARE); the
age at claiming Social Security and the share at 62 (SSA 6.B5).

What was fitted, and where:

- **Seeds** (`life.js`): neighbouring seeds gave mulberry32 streams that were not independent (lives 5000..5799 died
  1.5 years late although every yearly chance was right); the seed now goes through a hash finaliser first.
- **Mortality** (`rates.js solve`): the chain behind the healthy baseline follows the story's states exactly (the
  fifth year after a diagnosis is not diagnosable); chronic disease starts at 30 with the share reached by then;
  deaths the illnesses do not cause are given a cause (`suddenCause`) so every cause keeps its official share;
  `CANCER_FATALITY` is refitted to the US registry (age-standardised rates exact, median age 67).
- **Marriage**: every curve is read at the 2024-equivalent age (age minus the year's MS-2 shift) with an era level.
- **Births**: the year's ASFR and TFR, the year's nonmarital share spread over ages, over the fitted share of women
  who are couples able to have a baby (`EXPOSURE`, refit with `CAL=fit` when love or family events change).
- **School**: the dropout, enrollment and completion rates are solved per birth cohort and sex from
  EDUCATION_BY_COHORT; the graduation choice takes everyone who ever starts college.
- **Divorce** duration curve, **homes** (`homeBuy(age, year)`, with the HVS ownership of 30–39-year-olds as era),
  **military** (the cohort's share over the diploma share), **retirement** (hazards around the full retirement age,
  one in fifteen waits to 70).

For the story files: keep the net drift of `health.hr` at about 1 (the population's mean is about 1.006 now); never
marry, divorce, have babies or make anyone seriously ill outside `core.js`; core's love and family choices feed
`EXPOSURE`, so re-run `CAL=fit` after changing them; a death can now carry `s.health.diedOf` without a diagnosis before
it (`s.health.sudden`), so the death line should not always say "after a long fight".
