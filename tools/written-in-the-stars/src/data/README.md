# US base rates (`us-rates.js`)

`us-rates.js` holds the US statistics behind 100 Lives. It is the US counterpart of
`../bazi-life/src/sim/official-data.js` and of the Taiwan figures that `../bazi-life/src/sim/rates.js` keeps inline.
The five tables `rates.js` imports (`LIFE_TABLES`, `CAUSE_AGES`, `CAUSE_SHARES`, `CHRONIC_AGES`, `CHRONIC_RATES`) keep
the same names and shapes, so the ported `rates.js` can import this file unchanged. The other exports are US
equivalents of `rates.js` constants, under US names.

**Do not edit `us-rates.js` by hand.** `build-us-rates.py` generates it:

```
python3 -I src/data/build-us-rates.py CACHE_DIR
```

`CACHE_DIR` holds the raw files listed at the top of the script, downloaded from the official sites (they are not kept
in the repo). The build needs poppler (`pdftotext`, `pdftocairo`). Values that were not read from an official table
are written in the script next to their source. They are listed in `APPROX` and marked *approx* below. `SOURCES` maps
each main export to `{ source, url, years, approx }`. `test/data.test.js` runs the sanity checks (`node --test`).

## Exports

| Export | What it is (shape) | Source | Years | Approx |
| --- | --- | --- | --- | --- |
| `LIFE_TABLES` | `[year, male q(x)·1e6 ages 0–84, female …, [e0 m, f], [e85 m, f]]`, Taiwan shape | SSA OCACT period life tables, 2024 Trustees Report (historical + Alternative 2) | every year 1950–2023, every 5 years 2025–2100, then 2110, 2125, 2150 | 2022–23 are Trustees estimates; 2110–2150 extend the 2090–2100 decline per age (≤2 %/yr) |
| `LIFE_TABLE_LAST_OBSERVED`, `LIFE_TABLE_FIRST_PROJECTED` | 2021, 2022 | same | | |
| `E0_PROJECTION` | `[[year, e0 m, e0 f]]` from the projected rows | same | 2025–2150 | as above |
| `CAUSE_AGES`, `CAUSE_SHARES` | Taiwan shape: `[year, {male, female: {cancer, heart, stroke}}]`, deaths share ×1e4 over 22 age groups (0, 1, 5, …, 100+) | NCHS HIST290A (1968–98, 10-year age groups); CDC WONDER Underlying Cause of Death 1999–2020 (D76, 5-year groups) | anchors 1970, 1980, 1990, 1995, 2000, 2005, 2010, 2015, 2018; each pools 3 years | pre-1970 holds 1970; after 2019 holds 2018 (2020 left out: COVID); 10-year groups fill both 5-year groups |
| `EXTERNAL_CAUSE_SHARES` | same shape, `{accidents, suicide}` | same | same | same |
| `OVERDOSE_SHARES` | `[year, {male: [...], female: [...]}]`, share ×1e4 | CDC WONDER D76 (X40–X44, X60–X64, X85, Y10–Y14) | 2000–2018 anchors + 2020 | |
| `POPULATION_2020` | `{ages: [0,5,…,85], male, female}` (POPULATION_2024 shape) | Census estimates via CDC WONDER | 2020 | 85+ from 80–84 × life-table ratio |
| `CHRONIC_AGES`, `CHRONIC_RATES` | Taiwan shape, per 100,000, `{male, female: {hypertension, diabetes}}` | Health, United States 2018 Table 22 (≥140/90 or medication, 2013–16); NCHS Data Brief 516 (diagnosed diabetes, 2021–23) | 2013–2023 | under 20; diabetes split by sex |
| `CANCER_INCIDENCE` | `{asr: {male, female, all}, byAge, medianAge}` per person-year | CDC U.S. Cancer Statistics, 2025 highlights, Table 1 | 2019–2023 | `medianAge` (67, SEER) |
| `US_STANDARD_2000` | 19 age groups per million (the US version of `WHO_STANDARD`) | NCI SEER standard populations | 2000 | |
| `TFR` | `[[year, births per woman]]` | NCHS NVSR 60-1 Table 4, NVSR 74-1 Table 2, Health US 2016 Table 3 | 1950, 1955, 1960–2023 | 1955, 1961–69 (GFR × ratio): listed in `TFR_APPROX` |
| `TFR_PROJECTION` | `[[year, tfr]]` | 2024 Trustees intermediate (ultimate 1.9 by 2050) | 2023–2150 | yes |
| `ASFR_BY_YEAR` | `[year, [[10, r], [15, r], …, [45, r], [50, 0]]]`, births per woman per year (the `ASFR_2024` shape) | as `TFR` | 1950, 1960, 1970, 1980, 1990, 2000, 2007, 2010, 2015, 2020, 2023 | |
| `NONMARITAL_BIRTH_SHARE` | `[[year, share]]` | Health US 2016 Table 4; NVSR 74-1 | 1950–2023 | 1950, 1960 |
| `MARRIED_SHARE`, `COHABITING_SHARE` | women's shares at age-group middles `[[age, share]]` | NSFG 2006–10, NCHS NHSR 49 Table 1 | 2006–10 | |
| `MEDIAN_FIRST_MARRIAGE` | `{male, female: [[year, age]]}` | Census MS-2 (CPS), read from the vector paths of Figure MS-2 | every year 1947–2025 | no (matches MS-2 to 0.1 yr) |
| `FIRST_MARRIAGE_BY_AGE` | cumulative probability of first marriage by 20/25/30/35/40 | NSFG, NHSR 49 Tables 3–4 | women 1995, 2002, 2006–10; men 2002, 2006–10 | |
| `NEVER_MARRIED_35_39` | never married (not cohabiting) and cohabiting shares | NSFG, NHSR 49 Tables 1–2 | 2006–10 | |
| `MARRIAGE_RATE` | crude rate per 1,000 | NCHS NVSS | 1950–2022 | 1950–1990 |
| `REMARRIAGE` | ever-remarried shares, remarriage share of weddings | Pew Research Center 2014 (ACS 2013) | 2013 | yes |
| `DIVORCE_TREND` | crude divorce rate per 1,000 (Taiwan shape) | NCHS MVSR 39(12) suppl. 2 Table 1; NCHS NVSS 2000–22 | 1950–1988, 1990, 1995, 2000–2022 | 1990, 1995 |
| `DIVORCE_REFINED` | divorces per 1,000 married women | MVSR 39(12) s2; NCFMR (ACS) | 1950–1988, 2023–24 | 2023, 2024 |
| `DIVORCE_DURATION` | share of divorces by marriage duration; median 7.1, mean 9.7 | MVSR 39(12) s2 Table 11 | 1988 | |
| `FIRST_MARRIAGE_SURVIVAL` | probability a first marriage is intact after 5/10/15/20 years | NSFG, NHSR 49 Tables 5–6 | 2006–10 (women also 1995) | |
| `EDUCATION_25_29`, `EDUCATION_25_PLUS` | `{highSchool, bachelor, …: [[year, %]]}` | Census P20-578 Figures 2 and 7 (CPS Table A-2), read from vector paths | 1940–2015 (by sex 1967–2015) | no (matches A-2 to 0.1 pt) |
| `EDUCATION_2024` | bachelor's shares by age band and sex | Census release CB25-TPS.60 | 2024 | |
| `EDUCATION_BY_COHORT` | `[cohort, {male, female: {highSchool, someCollege, associate, bachelor, graduate}}]` | derived from the above | cohorts 1950–2005 by 5 | level split; cohorts after 1988 |
| `COLLEGE_ENROLLMENT` | % of recent high school completers enrolled in college | NCES Digest Table 302.10 | 1960–2022 | all but 1960 |
| `HOMEOWNERSHIP_RATE` | `[[year, %]]` | Census HVS Table 14 (quarter mean); decennial census | 1950, 1960, 1964–2024 | 1950, 1960 |
| `HOMEOWNERSHIP_AGES`, `HOMEOWNERSHIP_BY_AGE` | `[year, [% by group <25, 25–29, …, 75+]]` | Census HVS Table 12 | 1985–2020 by 5, 2024 | |
| `FIRST_HOME_AGE` | median age of first-time buyers | NAR Profile of Home Buyers and Sellers | 1981–2025 | yes |
| `MOVER_RATE`, `MOVE_BY_AGE` | % who moved in the past year; relative rate by age | Census CPS ASEC Table A-1 / reports | 1948–2023 | most years; `MOVE_BY_AGE` all |
| `PAY_BY_AGE` | `[[age, pay ÷ all-ages median]]` (Taiwan shape) | BLS weekly earnings, full-time, Q4 2024 | 2024 | yes (secondary copy) |
| `UNEMPLOYMENT_RATE` | annual average % | BLS CPS LNU04000000 | 1950–2024 | yes (transcribed) |
| `RECESSIONS`, `RECESSION_YEARS` | NBER peak/trough months; calendar years in recession | NBER | 1948–2020 | |
| `RETIREMENT_AWARD_AGE`, `RETIREMENT_AT_62` | average age at Social Security retired-worker award; share at 62 | SSA Annual Statistical Supplement 2024, Table 6.B5 | 1940–2023 (62 share from 1965) | |
| `FULL_RETIREMENT_AGE` | by birth year | Social Security Act (1983 amendments) | | |
| `DRAFT_LOTTERY`, `MILITARY_SERVICE_SHARE` | Vietnam-era lotteries; share of men who served by cohort | Selective Service history; veteran counts | born 1944–53; cohorts 1950–1985 | yes |
| `APPROX`, `SOURCES` | lists | | | |

## Notes for the engine port

- **Mortality** runs to 2150, so the Taiwan code's "scale the last table to the 2070 target" path never fires.
  `LATEST_TABLE_YEAR` in the ported `rates.js` therefore reads 2150. Use `LIFE_TABLE_LAST_OBSERVED` for "observed".
- **Heart disease** follows the NCHS definition and includes hypertensive heart disease (Taiwan's excludes it).
  Shares after 2019 hold 2017–19, because 2020 is distorted by COVID-19. The 2021–2023 tables are not included.
- **Chronic conditions** are measured prevalence (NHANES), not "people treated" (Taiwan's NHI). That makes
  hypertension higher, mostly at young ages.
- **The cancer check** uses the 2000 US standard population (`US_STANDARD_2000`) and `CANCER_INCIDENCE`, not
  `WHO_STANDARD` / `CANCER_2023`. `CANCER_FATALITY` must be refitted against them.
- **Births**: about 40 % of US births are nonmarital. The Taiwan formula divides the population rate by the married
  share. A port should count cohabiting couples too (`COHABITING_SHARE`), or use `NONMARITAL_BIRTH_SHARE`.
- **Marriage timing changes by era** (`MEDIAN_FIRST_MARRIAGE`, 1947–2025). Taiwan has to use today's timing for
  every era; the port does not.
- **Retirement**: the age series is Social Security claiming, which is not the same as leaving work.
- **Military**: there is no conscription after 1973. The analogue is the 1969–72 draft lottery for men born
  1944–53, plus voluntary service.
- **Missing official tables.** Some hosts could not be reached here: www2.census.gov (MS-2, A-1/A-2 and CPS mobility
  files), bls.gov, nces.ed.gov, data.cdc.gov and archive.cdc.gov. MS-2 and the education series were therefore read
  from the vector paths of Census's own figures. Unemployment, pay and college enrolment are transcribed and marked
  approx.
- **CDC WONDER.** The cause-of-death extracts (1999–2020) were fetched with the WONDER API, which requires accepting
  WONDER's data-use terms. The terms cover national aggregate statistics like these. The 2018–2023 WONDER dataset was
  not queried.
