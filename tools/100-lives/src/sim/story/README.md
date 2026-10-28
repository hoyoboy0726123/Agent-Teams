# Writing story events

Every file here exports an array of events. `index.js` checks them once a year in this order: the times (`era.js`), the
life's skeleton (`core.js`), work storylines (`work.js`), then the stages of life (`child.js`, `teen.js`, `young.js`,
`adult.js`, `later.js`) and health and money (`health.js`). The API is the one of 命盤人生
(`../bazi-life/src/sim/story/README.md`), so the engine port runs these files unchanged; only the setting is new: an
**American** life, 1950–2025 births, told in American English.

| File | What is in it |
| --- | --- |
| `core.js` | The skeleton: school, work, love, marriage, kids, a home, retirement, serious illness and death. Its odds come from US statistics (`rates.js`). **No other file changes it.** |
| `work.js` | Multi-year work storylines: a startup, a career change, going back to school at night |
| `era.js` | US history 1950–2025 as an ordinary family met it |
| `child.js` (0–12), `teen.js` (13–18), `young.js` (19–30), `adult.js` (31–60), `later.js` (61+), `health.js` | Stories by stage of life |
| `common.js` | Shared helpers for the story files: scenes, pronouns, family words, the era's culture, US states |
| `check.mjs` | A self-check of every event (run `node src/sim/story/check.mjs`) |

## One event

```js
{
  id: "c_bullied",                    // unique across all files
  domain: "family", channel: "bad",   // which yearly tilt it takes (leave out for fixed milestones)
  tags: ["siblings"], about: "siblings", // optional: who it is about (chart reasons, family charts)
  ages: [7, 12], cooldown: 3, max: 2, once: false,
  when: (s, ctx) => s.studying,       // when it can happen at all
  p: (s, ctx) => 0.04,                // the base chance this year
  apply: (s, ctx) => ({ text, mood, big }),   // or `choice`, never both
}
```

- `domain`: career, wealth, love, health, study, family, move. `channel`: good, bad, change.
- `about`: father, mother, siblings or `partner`. `partner` only tilts the odds with the partner's chart when the
  current partner is the one entered in the family input (`s.partner.real`).
- `mood`: from about −16 to +12. `big: true` shows the line in bold and keeps it as a memory (`s.memory`).
- `grave: true`: deaths and serious illness. **Only `core.js` writes them.** No story file kills anyone or makes them
  seriously ill.
- `rare: true`: an event that may not happen once in 500 lives (the coverage test lets it be silent).
- `years: [from, to]` (era events): the calendar years it can happen in. Documentation, and `check.mjs` uses it.

## Choices

```js
choice: (s, ctx) => ({
  prompt: "Some kids at school keep picking on you. What do you do?",
  options: [
    { id: "c_bullied.teacher", label: "Tell your teacher", hint: "let a grown-up handle it", act: "seekHelp",
      style: "social", weight: 0.3, apply: (s, ctx) => ({ text: ctx.w("..."), mood: 1 }) },
    { id: "c_bullied.parents", label: "Tell Mom", ..., when: s => s.mother.alive },
    ...
  ],
})
```

- **4–6 options** per choice, and they really differ (not one answer said four ways).
- **Each life should read differently.** When the question comes up, pick a *scene* first (by era, age, family and
  situation, then at random): the prompt, the button words, the hints and the result lines all come from that one
  scene, so they match. Option `id`, `act`, `style`, `weight` and effects stay the same across scenes; only the words
  change. `scene(ctx, [a, b, null, …])` in `common.js` skips scenes that do not fit (`null`); `pickScene` takes weights.
- On a replay the player's recent everyday questions come up less often (`NOVELTY` in `life.js`), unseen ones more
  (`FRESH`). Big decisions (`core.js`, `work.js`) and questions certain in their year are asked as always.
- `id`: `event.option`, unique everywhere, and the part before the dot is the event's own id.
- `act`: the closest general action (`src/sim/actions.js`): jobSearch, jobHop, careerSwitch, study, studyAbroad,
  civilService, startup, sideJob, negotiate, dispute, quitJob, workAbroad, familyBusiness, pushThrough, retire, save,
  invest, buyHome, sellAsset, borrow, lend, insurance, lottery, donate, talk, counsel, avoid, separate, marry, wait,
  pursue, haveChild, noChild, care, hireCare, shareCare, reconcile, insist, cutOff, seekHelp, affair, rest, travel,
  exercise, seeDoctor, quitHabit, vice, hobby, volunteer, socialize, moveHome, emigrate, spiritual.
- `style`: risk, safe, family (family first), self (yourself first), health, social (reach out), learn. The auto
  player leans on the protagonist's personality, and each choice nudges the personality a little.
- `weight`: how often a typical person picks it; the options of one choice add up to about 1. It can be a function
  `(s, ctx) => number`. In a `calibrated` choice the weights alone decide (they reproduce a statistic).
- `when`: an option that only shows in some situations (a sibling to ask, a car to sell).
- The `prompt` and every result `text` must make sense on their own: someone reading only that line should know what
  happened.
- When the player writes their own answer, the story line opens with the prompt's first sentence ("Your company is
  laying people off, and your name is on the list. You decide…"). If the prompt has no sentence before the question,
  return `topic: "A friend wants to open a food truck with you"` from the choice.
- Storylines over several years and school gates: when a written answer matches no button, the buttons' `apply` does
  not run. Return `onFree: (actionId, s, ctx) => …` to move the story on. `core.js`'s `senior`, `ccDone` and
  `graduateUni` use it to close the gate (otherwise the same graduation question comes back every year). Leaving
  school is always `leaveSchool(s)` (it records `s.flags.leftSchool`, which the first-job question reads).

## Pacing

- `core.js` and `work.js` choices are life's big decisions (`major` in `index.js`) and are always asked.
- Every other choice is an everyday one: at most one a year, skipped when the year already had a choice. The later a
  file is in `index.js`, the more often it is skipped.
- With "only ask the big decisions" on, everyday choices are made by the personality, so each option must stand on its
  own: never assume the player saw the question.
- About 40 choices in a life. Childhood holds seven or eight story events, three or four of them choices; the teen
  years about the same.

## What `ctx` offers

| | |
| --- | --- |
| `ctx.w(template or list, vars)` | A sentence. A list gives one this life has not used yet |
| `ctx.rng()`, `.int(n)`, `.pick(list)`, `.chance(p)`, `.between(a, b)`, `.weighted([[value, weight]])` | Randomness |
| `ctx.roll(domain, channel, p)` | A roll tilted by this year's chart, true or false |
| `ctx.odds(domain, channel, p)` | The tilted probability |
| `ctx.person({ role, sex, birthYear, how })` | A new person (role: partner, kid, friend, grandkid) with `name`, `call` (how the story calls them), `nature` (`{ word, crisis }`) |
| `ctx.arc.start(id, data, inYears)`, `.at(id, stage)`, `.go(id, stage, inYears)`, `.end(id, outcome)`, `.get(id)` | Storylines over several years |
| `ctx.remember(kind, text, extra)` | Keep something for later events to look back on (`s.memory`) |
| `ctx.nudge(trait, delta)` | Change the personality |
| `ctx.luckAt(age)` | That year's luck (`.reasons` are the chart's one-line reasons) |
| `ctx.R` | The US statistics in `rates.js` |
| `ctx.prep` | The chart's `prep` (`intro`, `jobFit(job)`); the story only reads `intro` and `jobFit` |

## Templates

- `{a|b|c}` picks one at random. They nest and may be empty (`{|really }`).
- `{name}` puts in a variable. The usual ones need no passing: `{city}` (where you live now), `{job}`, `{partner}`,
  `{kid}` (the youngest child), `{kids}`, `{friend}` (a friend of yours), `{trip}` (a trip destination), `{age}`,
  `{year}`. For pronouns use `they(p)`, `them(p)`, `their(p)` from `common.js` (he/she, him/her, his/her) in the code,
  not a template slot.
- Only `ctx.w()` expands templates. Never put `{` or `}` in a plain string.
- Variables go in as they are: a `{a|b}` inside a variable's value is not expanded; expand it with `ctx.w()` first.
- `{friend}` and `{trip}` stay the same person and place through one event, from the question to the result.
- Each event has at least 3 templates, or one template with at least 8 combinations. Vary them by era (`s.year`),
  place, job and family.
- The story tests treat the words `undefined`, `null`, `NaN`, `function` and `[object` in a line as a bug. Don't use
  them in prose ("a fundraising event", not "a function").

## The protagonist `s`

| Field | |
| --- | --- |
| `age`, `year`, `birthYear`, `sex` (male/female), `county` (the US state you live in, a postal code or a name), `birthCounty`, `abroad` | `stateOf(s)` in `common.js` gives the postal code |
| `edu`, `studying`, `track` | schooling, below |
| `employed`, `job` (`{ title, factor, field, since }`), `career` (0–5), `income` (relative to the US median), `savings`, `debt`, `retired`, `unemployedFor` | work and money, in years of median pay |
| `rel` (single/dating/married/divorced/widowed), `partner` (a person with `age`; `real: true` for the family input's partner), `exes`, `marriages`, `divorces`, `guard`, `crisis` | love |
| `kids` (people with `age`, `call`, `sex`), `friends`, `siblings.list`, `father`, `mother` (`{ alive, age, name }`) | family and friends |
| `health` (`chronic`, `serious`, `hr`, `fitness`, `smoke`, `drink`, `stress`, `checkups`) | health |
| `traits` (drive, caution, warmth, health, curiosity, 0–1) | personality |
| `home` (parents/rent/own), `flags`, `arcs`, `memory`, `done` (event ids that happened), `last` (event id → last age) | the rest |

### US schooling (`s.edu` is the highest level reached, `s.track` what you are in now)

| Age | Stage | `track` | `edu` when done |
| --- | --- | --- | --- |
| 5 | Kindergarten (not everyone in the 1950s–60s; near universal from the 1980s) | | |
| 6 | Elementary school, first grade | `elementary` | `elementary` on entry |
| 11 or 12 | Middle school (grades 6–8, most places from the 1980s) or junior high (7–9, earlier) | `middle` | `middle` on entry |
| 14 | High school, grades 9–12. The PSAT, SAT (from 1926) and ACT (from 1959) in junior year; AP classes; prom; a driver's license at 16 | `high` | `high` at graduation; `ged` by exam later |
| 16–17 | Dropping out is legal from 16 in most states (`hsDropout`) | | still `middle` |
| 18 | Graduation, and the big choice (`senior`): a four-year college, community college, trade school, a job or the military | | |
| 18–19 | Trade school (one or two years: electrician, welding, cosmetology, HVAC, LPN) | `trade` | `certificate` |
| 18–20 | Community college (two years, then a job or a transfer) | `community` | `associate` |
| 18–22 | Four-year college (freshman to senior year, a major declared by sophomore year) | `college` | `bachelor` |
| 22+ | Graduate school: a master's or MBA (2 years), law school (3, then the bar), med school (4, then residency), a PhD (5–6) | `grad`, `law`, `med`, `phd` | `master`, `professional`, `doctorate` |

Military service is a job (`s.job.field === "military"`) with `s.flags.serviceUntil`, the age it ends; the
Vietnam-era draft lottery (men born 1950–1953) is in `era.js`, enlisting at 18 is in `core.js`, and the GI Bill can
send a veteran to college afterwards.

### Flags the story files leave for later ones

`common.js` and the files' top comments list them. The main ones: `s.flags.bff` (the best friend's id),
`s.flags.pet`, `s.flags.talent` (piano, Little League, Scouts…), `s.flags.homeMoney` ("tight"/"ok"),
`s.flags.liveWith` (after a divorce), `s.flags.collegeMajor`, `s.flags.served` (`{ branch, from }`),
`s.flags.drafted`, `s.flags.firstCar`, `s.flags.license`, `s.flags.gedPlan`, `s.flags.nightSchool`.

## Don't touch the statistics

`test/calibration.test.js` checks that the simulated population still matches US statistics (births, age at first
marriage, divorce, retirement, home ownership, schooling, lifespan). Story files:

- never marry, divorce, have a baby, buy a home, retire, kill anyone or make anyone seriously ill; `core.js` does those;
- may change a job (quit, switch) or health (`hr`) only a little (`hr` by at most ×0.97 or ×1.03 at a time), both ways;
- say in a comment that their probabilities are assumptions (no statistic exists for "you got a puppy");
- respect the age floors of the general actions (`act.js`): work from 14–16, marriage, loans, investing, lottery
  tickets and moving abroad from 18; a child's "save", "study" and "care" mean the child's version.

## Voice

- **Native American English, second person.** "You", never "the player". Lines are whole sentences: "You learned to
  ride a bike in the church parking lot, and Dad ran beside you longer than he needed to."
- **Warm, specific, a little witty, sometimes quietly moving.** The concrete detail beats the adjective: "You kept the
  ticket stub in your wallet for eleven years" beats "it meant a lot to you." A BitLife-style absurd beat now and then
  is welcome ("Your science fair volcano erupted on the principal"), but no one is the butt of the joke.
- **The era is in the details.** Saturday-morning cartoons, a Schwinn with a banana seat, a Walkman, a mixtape, the
  family's first VCR, AOL dial-up and its screech, a Razr flip phone, prom, a first car with a tape deck, student
  loans, a 401(k), a 30-year mortgage, Thanksgiving with the whole family and the one uncle. Only things that existed
  that year (`kidsCulture(year)`, `chatOf(year)`, `musicOf(year)` in `common.js`).
- **Never mean, never fatalistic.** Tendencies, not fate. Illness, loss and failure keep their dignity.
- **No stereotypes, inclusive.** Families come in every shape. Same-sex couples marry from 2015 nationwide
  (`canMarry`); before that, write history kindly (a commitment ceremony, a domestic partnership, Massachusetts from
  2004). Faith, politics and identity show up as part of a life, never as a verdict.
- **No graphic violence, sex or self-harm.** History is told as a person saw it at home, at school or at work: the
  TV in the living room, the line at the gas station, the empty shelves in March 2020.
- **No Chinese text** in this folder (`check.mjs` checks).

## Checking

```bash
node src/sim/story/check.mjs   # ids, options, weights, templates, ages, characters; tries every choice on sample lives
npm test                       # everything, calibration included
```
