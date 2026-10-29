#!/usr/bin/env python3
"""US statistics for Written in the Stars -> src/data/us-rates.js (generated; do not edit that file by hand).

    python3 -I src/data/build-us-rates.py CACHE_DIR

CACHE_DIR holds the raw files named below, downloaded by hand from the official sites (they are not kept in the
repository). Needs Python 3 and poppler's pdftotext / pdftocairo. Every table in the output carries its source; values
that are not read from an official table are written in this file, next to their source, and marked approx.

Raw files (CACHE_DIR/...):
  ssa/PerLifeTables_{M,F}_{Hist,Alt2}_TR2024.csv  SSA OCACT, period life tables of the 2024 Trustees Report
      https://www.ssa.gov/OACT/HistEst/PerLifeTables/2024/PerLifeTables_M_Hist_TR2024.csv (and _F_, _Alt2_)
  wonder/D76_{all,cancer,heart,stroke,accidents,suicide,overdose}.xml  CDC WONDER Underlying Cause of Death
      1999-2020 (D76), deaths by year, sex and five-year age group (XML API export)
  cdc/gmwk290a.pdf, cdc/dx196878.pdf  NCHS HIST290A, deaths for selected causes by 10-year age group, 1979-98 and
      1968-78 (https://www.cdc.gov/nchs/data/statab/gmwk290a.pdf, https://www.cdc.gov/nchs/data/dvs/dx196878.pdf)
  census/ms-2.pdf  Census Figure MS-2, median age at first marriage 1890-2025 (vector chart; read from its paths)
      https://www.census.gov/content/dam/Census/library/visualizations/time-series/demo/families-and-households/ms-2.pdf
  census/p20-578.pdf  Census P20-578, Educational Attainment in the United States: 2015 (Figures 2 and 7)
  hvs/histtab12.xlsx, hvs/histtab14.xlsx  Census HVS Tables 12 and 14 (https://www.census.gov/housing/hvs/data/)
  births/nvsr60_01.pdf, births/nvsr74-1.pdf  NCHS Births: Final Data for 2009 (Table 4) and for 2023 (Table 2)
  ssa/6b.html  SSA Annual Statistical Supplement 2024, Table 6.B5
      https://www.ssa.gov/policy/docs/statcomps/supplement/2024/6b.html
"""
import json, os, re, subprocess, sys, html, zipfile, xml.etree.ElementTree as ET

CACHE = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'us-rates.js')
P = lambda *a: os.path.join(CACHE, *a)


def pdftext(path, first=None, last=None):
    cmd = ['pdftotext', '-layout'] + (['-f', str(first), '-l', str(last)] if first else []) + [path, '-']
    return subprocess.run(cmd, capture_output=True, check=True).stdout.decode('utf-8', 'ignore')


def js(v):
    return json.dumps(v, separators=(',', ':'), ensure_ascii=False)


# ---------------------------------------------------------------- mortality (SSA Trustees Report 2024)
def ssa_tables(sex, kind):
    out = {}
    for line in open(P('ssa', f'PerLifeTables_{sex}_{kind}_TR2024.csv')):
        f = line.strip().split(',')
        if len(f) > 7 and f[0].isdigit() and f[1].isdigit():
            out.setdefault(int(f[0]), {})[int(f[1])] = (float(f[2]), float(f[7]))
    return out


SSA = {s: {**ssa_tables(s, 'Hist'), **ssa_tables(s, 'Alt2')} for s in 'MF'}
HIST_LAST = max(ssa_tables('M', 'Hist'))


def expect_from(q, x0):
    l, e = 1.0, 0.0
    for x in range(x0, len(q)):
        d = l * q[x]; e += l - d / 2; l -= d
    return e


def extended(sex, year):
    # beyond 2100: each age keeps the Trustees' 2090-2100 yearly rate of decline (0 to 2 % a year)
    a, b = SSA[sex][2090], SSA[sex][2100]
    q = []
    for x in range(120):
        r = 1 - (b[x][0] / a[x][0]) ** 0.1 if a[x][0] > 0 else 0
        r = min(0.02, max(0.0, r))
        q.append(b[x][0] * (1 - r) ** (year - 2100))
    q[119] = 1.0
    return q


def life_row(year):
    cols, e0, e85 = [], [], []
    for s in 'MF':
        if year in SSA[s]:
            t = SSA[s][year]; q = [t[x][0] for x in range(120)]
            e0.append(t[0][1]); e85.append(t[85][1])
        else:
            q = extended(s, year)
            e0.append(round(expect_from(q, 0), 2)); e85.append(round(expect_from(q, 85), 2))
        cols.append([round(q[x] * 1e6) for x in range(85)])
    return [year, cols[0], cols[1], e0, e85]


LIFE_YEARS = list(range(1950, 2024)) + list(range(2025, 2101, 5)) + [2110, 2125, 2150]
LIFE_TABLES = [life_row(y) for y in LIFE_YEARS]

# ---------------------------------------------------------------- causes of death
CAUSE_AGES = [0, 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]
WONDER_AGE = {'< 1 year': 0, '1-4 years': 1, '100+ years': 21}
for i, a in enumerate(CAUSE_AGES[2:21], start=2):
    WONDER_AGE[f'{a}-{a + 4} years'] = i


def wonder(name):
    t = open(P('wonder', f'D76_{name}.xml'), errors='ignore').read()
    out = {}
    for y, s, a, v in re.findall(r'<r><c l="(\d+)"/><c l="(\w+)"/><c l="([^"]+)"/><c v="([^"]*)"', t):
        a = html.unescape(a).strip()
        if a not in WONDER_AGE: continue
        n = int(v.replace(',', '')) if v.replace(',', '').isdigit() else 0
        cell = out.setdefault(int(y), {}).setdefault(s.lower(), [0] * len(CAUSE_AGES))
        cell[WONDER_AGE[a]] += n
    return out


W = {c: wonder(c) for c in ['all', 'cancer', 'heart', 'stroke', 'accidents', 'suicide', 'overdose']}


def hist290a(text):
    out, cause, sex = {}, None, None
    SEX = {'MALE': 'male', 'FEMALE': 'female', 'TOTAL, MALE': 'male', 'TOTAL, FEMALE': 'female', 'BOTH SEXES': 'both', 'TOTAL, BOTH SEXES': 'both'}
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith(('TABLE', 'CAUSE OF', 'RACE, SEX', '[Deaths', 'Source', '- Quantity', '...')) or 'TABLE 290A' in s: continue
        m = re.match(r'^(\d{4})\.*\s+(.*)$', s)
        if m and cause:
            if sex in ('male', 'female'):
                vals = [int(v.replace(',', '')) if re.fullmatch(r'[\d,]+', v) else 0 for v in m.group(2).split()]
                if len(vals) == 13 and vals[0] == sum(vals[1:]):
                    out.setdefault(cause, {}).setdefault(sex, {})[int(m.group(1))] = vals
            continue
        t = re.sub(r'\s+', ' ', s)
        if t in SEX: sex = SEX[t]; continue
        if re.match(r'^(WHITE|ALL OTHER|BLACK)\b', t): sex = 'race'; continue
        t = re.sub(r'^0\s*', '', t)
        if re.search(r'[A-Za-z]{3}', t): cause, sex = t.upper(), None
    return out


H = {}
for f in ['dx196878.pdf', 'gmwk290a.pdf']:
    for k, v in hist290a(pdftext(P('cdc', f))).items():
        for s, ys in v.items(): H.setdefault(k, {}).setdefault(s, {}).update(ys)


def hkey(*words):
    ks = [k for k in H if all(w in k for w in words)]
    assert ks, words
    return ks


HIST_CAUSE = {
    'all': hkey('ALL CAUSES'),
    'cancer': [k for k in H if k.startswith('MALIGNANT NEOPLASMS') and 'INCLUDING' in k],
    'heart': [k for k in H if 'DISEASES OF HEART' in k],
    'stroke': [k for k in H if k.startswith('CEREBROVASCULAR')],
    'accidents': [k for k in H if k in ('ACCIDENTS AND ADVERSE EFFECTS (E800-E949)', 'E800-E949- ACCIDENTS')],
    'suicide': [k for k in H if k.startswith('SUICIDE')],
}
# 10-year groups of HIST290A (<1, 1-4, 5-14, 15-24, ..., 75-84, 85+) for each CAUSE_AGES group
TEN = [1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11, 11]


def hist_deaths(cause, sex, year):
    for k in HIST_CAUSE[cause]:
        if year in H[k].get(sex, {}): return [H[k][sex][year][TEN[g]] for g in range(len(CAUSE_AGES))]
    raise KeyError((cause, sex, year))


def pooled(cause, sex, years):
    tot = [0] * len(CAUSE_AGES)
    for y in years:
        d = W[cause][y][sex] if y >= 1999 else hist_deaths(cause, sex, y)
        tot = [a + b for a, b in zip(tot, d)]
    return tot


def shares(cause, sex, years):
    num, den = pooled(cause, sex, years), pooled('all', sex, years)
    return [round(1e4 * n / d) if d else 0 for n, d in zip(num, den)]


ANCHORS = [(1970, range(1969, 1972)), (1980, range(1979, 1982)), (1990, range(1989, 1992)), (1995, range(1994, 1997)),
           (2000, range(1999, 2002)), (2005, range(2004, 2007)), (2010, range(2009, 2012)), (2015, range(2014, 2017)),
           (2018, range(2017, 2020))]
CAUSE_SHARES = [[y, {s: {c: shares(c, s, ys) for c in ['cancer', 'heart', 'stroke']} for s in ['male', 'female']}] for y, ys in ANCHORS]
EXTERNAL_SHARES = [[y, {s: {c: shares(c, s, ys) for c in ['accidents', 'suicide']} for s in ['male', 'female']}] for y, ys in ANCHORS]
OVERDOSE_SHARES = [[y, {s: shares('overdose', s, ys) for s in ['male', 'female']}] for y, ys in ANCHORS[4:] + [(2020, [2020])]]

# Census-based population used by WONDER for 2020 (five-year groups, 85+ combined)
pop = {}
t = open(P('wonder', 'D76_all.xml'), errors='ignore').read()
for y, s, a, v, p in re.findall(r'<r><c l="(\d+)"/><c l="(\w+)"/><c l="([^"]+)"/><c v="([^"]*)"/><c v="([^"]*)"', t):
    a = html.unescape(a).strip()
    if y != '2020' or a not in WONDER_AGE or not p.replace(',', '').isdigit(): continue
    g = WONDER_AGE[a]; age = CAUSE_AGES[g]
    k = min(85, 0 if age < 5 else age)
    pop.setdefault(s.lower(), {}).setdefault(k, 0)
    pop[s.lower()][k] += int(p.replace(',', ''))
POP_AGES = list(range(0, 90, 5))
# WONDER gives no population for the groups over 85: 85+ = 80-84 x (person-years lived 85+ / 80-84) in the 2020
# SSA period table (a stationary-population ratio; approx).
def person_years(sex, year, a, b):
    q = [SSA[sex][year][x][0] for x in range(120)]; l, out = 1.0, 0.0
    for x in range(120):
        d = l * q[x]
        if a <= x < b: out += l - d / 2
        l -= d
    return out
for sex, S in (('male', 'M'), ('female', 'F')):
    pop[sex][85] = round(pop[sex][80] * person_years(S, 2020, 85, 120) / person_years(S, 2020, 80, 85))
POPULATION_2020 = {'ages': POP_AGES, 'male': [pop['male'][a] for a in POP_AGES], 'female': [pop['female'][a] for a in POP_AGES]}

# ---------------------------------------------------------------- vector charts (Census figures)
def svg_paths(pdf, page, out):
    subprocess.run(['pdftocairo', '-svg', '-f', str(page), '-l', str(page), pdf, out], check=True)
    return open(out).read()


def series(svgtext, year0, x0, px_year, y0, px_unit, skip_thin=True):
    res = {}
    for m in re.finditer(r'<path[^>]*>', svgtext):
        p = m.group(0); st = re.search(r'stroke="([^"]*)"', p)
        if not st or st.group(1) == 'rgb(0%, 0%, 0%)': continue
        w = re.search(r'stroke-width="([^"]*)"', p)
        if skip_thin and w and float(w.group(1)) < 1: continue
        tr = re.search(r'matrix\(([^)]*)\)', p)
        a, b, c, d, tx, ty = map(float, tr.group(1).split(',')) if tr else (1, 0, 0, 1, 0, 0)
        for x, y in re.findall(r'([-\d.]+) ([-\d.]+)', re.search(r' d="([^"]*)"', p).group(1)):
            X = a * float(x) + c * float(y) + tx; Y = b * float(x) + d * float(y) + ty
            res.setdefault(st.group(1), {})[int(round(year0 + (X - x0) / px_year - 0.01))] = round((y0 - Y) / px_unit, 1)
    return res


TMP = os.path.join(CACHE, 'tmp-svg'); os.makedirs(TMP, exist_ok=True)
# MS-2: the y axis starts at 16 years on the axis line (121.24 pt from the bottom, page flipped by the matrix),
# 2 years per 36.61 pt; x: 1890 at 69.06 pt, 4.0877 pt a year, points at mid-year.
ms2 = series(svg_paths(P('census', 'ms-2.pdf'), 1, os.path.join(TMP, 'ms2.svg')), 1889.5, 69.0625, 4.08768, 540 - 121.238281, 18.3072, skip_thin=False)
ms2 = {k: v for k, v in ms2.items() if len(v) > 50}
blue = [v for k, v in ms2.items() if k.startswith('rgb(28.9')][0]; red = [v for k, v in ms2.items() if k.startswith('rgb(58.3')][0]


def fill(d):
    ys = sorted(d); out = {}
    for y in range(ys[0], ys[-1] + 1):
        if y in d: out[y] = d[y]; continue
        a = max(k for k in ys if k < y); b = min(k for k in ys if k > y)
        out[y] = round(d[a] + (d[b] - d[a]) * (y - a) / (b - a), 1)
    return out


MEDIAN_FIRST_MARRIAGE = {'male': sorted(fill({y: round(16 + v, 1) for y, v in blue.items()}).items()),
                         'female': sorted(fill({y: round(16 + v, 1) for y, v in red.items()}).items())}

fig2 = series(svg_paths(P('census', 'p20-578.pdf'), 4, os.path.join(TMP, 'fig2.svg')), 1940, 92.33, 5.570, 626.91, 2.660)
fig7 = series(svg_paths(P('census', 'p20-578.pdf'), 9, os.path.join(TMP, 'fig7.svg')), 1967, 93.82, 8.640, 397.50, 5.911)
pick = lambda d, pre: [v for k, v in d.items() if k.startswith(pre)][0]
EDU = {'hs_25_29': pick(fig2, 'rgb(85.09'), 'hs_25plus': pick(fig2, 'rgb(70.19'), 'ba_25_29': pick(fig2, 'rgb(92.54'),
       'ba_25plus': pick(fig2, 'rgb(77.64'), 'ba_25_29_male': pick(fig7, 'rgb(70.19'), 'ba_25_29_female': pick(fig7, 'rgb(85.09')}
EDU = {k: sorted(v.items()) for k, v in EDU.items()}

# ---------------------------------------------------------------- housing (Census HVS)
def xlsx_rows(path):
    z = zipfile.ZipFile(path); ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    ss = [''.join(t.text or '' for t in si.iter(ns + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(ns + 'si')]
    rows = []
    for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter(ns + 'row'):
        vals = {}
        for c in row.findall(ns + 'c'):
            v = c.find(ns + 'v')
            if v is None: continue
            col = 0
            for ch in re.match(r'[A-Z]+', c.get('r')).group(0): col = col * 26 + ord(ch) - 64
            vals[col - 1] = ss[int(v.text)] if c.get('t') == 's' else v.text
        rows.append([vals.get(i, '') for i in range(max(vals) + 1)] if vals else [])
    return rows


rows = xlsx_rows(P('hvs', 'histtab14.xlsx')); HOME_TOTAL = {}; year = None
for r in rows:
    if r and re.fullmatch(r'\d{4}', str(r[0]).strip()): year = int(r[0]); continue
    if r and str(r[0]).startswith('United States') and year:
        q = [float(x) for x in r[1:5] if re.fullmatch(r'[\d.]+', str(x))]
        if len(q) == 4: HOME_TOTAL[year] = round(sum(q) / 4, 1)

rows = xlsx_rows(P('hvs', 'histtab12.xlsx')); HOME_AGE = {}; header = None
GROUPS = ['Less than 25', '25 to 29', '30 to 34', '35 to 39', '40 to 44', '45 to 49', '50 to 54', '55 to 59', '60 to 64', '65 to 69', '70 to 74', '75 years']
for r in rows:
    if r and str(r[0]).startswith('Age of Householder'):
        header = {}
        for i, c in enumerate(r):
            m = re.match(r'(\d{4})(r?)', str(c).strip())
            if m and i: header[i] = (int(m.group(1)), bool(m.group(2)))
        continue
    if not r or not header: continue
    lab = re.sub(r'^[.…]+', '', str(r[0])).strip()
    for g, name in enumerate(GROUPS):
        if lab.startswith(name):
            for i, (yr, revised) in header.items():
                try: tot, own = float(r[i]), float(r[i + 1])
                except (ValueError, IndexError): continue
                slot = HOME_AGE.setdefault(yr, {})
                if revised or g not in slot: slot[g] = round(100 * own / tot, 1)
HOME_AGE_YEARS = [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024]
HOMEOWNERSHIP_BY_AGE = [[y, [HOME_AGE[y][g] for g in range(len(GROUPS))]] for y in HOME_AGE_YEARS]

# ---------------------------------------------------------------- births (NCHS)
def asfr_rows(text, start, stop):
    seg = text[text.index(start):]; seg = seg[:seg.index(stop)] if stop in seg else seg
    out = {}
    for line in seg.splitlines():
        line = re.sub(r'[^\x20-\x7e]', '.', line)
        m = re.match(r'^\s*(\d{4})\d?[\s.]+([\d,]+\.\d)\s+((?:[\d.]+\s+){9}[\d.]+)\s*$', line)
        if m and int(m.group(1)) not in out:
            v = [float(x) for x in m.group(3).split()]
            out[int(m.group(1))] = {'tfr': float(m.group(2).replace(',', '')), 'asfr': [v[0], v[1], v[4], v[5], v[6], v[7], v[8], v[9]]}
    return out


b74 = pdftext(P('births', 'nvsr74-1.pdf')); b60 = pdftext(P('births', 'nvsr60_01.pdf'))
BIRTHS = asfr_rows(b60, 'Table 4. Birth rates, by age of mother: United States, 1970', '               White')
BIRTHS.update(asfr_rows(b74, 'Table 2. Birth rates, by age of mother: United States, 2010', 'Non-Hispanic, single race'))
# Health, United States 2016, Table 3 (https://www.cdc.gov/nchs/data/hus/2016/003.pdf): 1950 and 1960, ages 10-14, 15-19,
# 20-24, 25-29, 30-34, 35-39, 40-44, 45-54
for y, r in {1950: [1.0, 81.6, 196.6, 166.1, 103.7, 52.9, 15.1, 1.2], 1960: [0.8, 89.1, 258.1, 197.4, 112.7, 56.2, 15.5, 0.9]}.items():
    BIRTHS[y] = {'tfr': round(5 * sum(r), 1), 'asfr': r}
assert all(y in BIRTHS for y in range(1970, 2024)), sorted(BIRTHS)
# NCHS general fertility rates (births per 1,000 women 15-44; Births: Final Data for 2009, Table 1) for the years
# without age-specific rates here; TFR = GFR x (TFR/GFR), the ratio interpolated between 1950, 1960 and 1970.
GFR = {1950: 106.2, 1955: 118.3, 1960: 118.0, 1961: 117.1, 1962: 112.0, 1963: 108.3, 1964: 104.7, 1965: 96.3, 1966: 90.8,
       1967: 87.2, 1968: 85.2, 1969: 86.1, 1970: 87.9}
ratio = {y: BIRTHS[y]['tfr'] / GFR[y] for y in (1950, 1960, 1970)}
TFR, TFR_APPROX = [], []
for y in range(1950, 2024):
    if y in BIRTHS: TFR.append([y, round(BIRTHS[y]['tfr'] / 1000, 3)]); continue
    if y in GFR:
        a, b = (1950, 1960) if y < 1960 else (1960, 1970)
        r = ratio[a] + (ratio[b] - ratio[a]) * (y - a) / (b - a)
        TFR.append([y, round(GFR[y] * r / 1000, 3)]); TFR_APPROX.append(y)
ASFR_YEARS = [1950, 1960, 1970, 1980, 1990, 2000, 2007, 2010, 2015, 2020, 2023]
ASFR_BY_YEAR = [[y, [[a, round(r / 1000, 4)] for a, r in zip([10, 15, 20, 25, 30, 35, 40, 45], BIRTHS[y]['asfr'])] + [[50, 0]]] for y in ASFR_YEARS]

# ---------------------------------------------------------------- retirement (SSA Annual Statistical Supplement, Table 6.B5)
t = open(P('ssa', '6b.html'), errors='ignore').read()
i = t.find('id="table6.b5"'); seg = t[i:t.find('</table>', i)]
RET, sex = {'male': [], 'female': []}, None
for tr in re.findall(r'<tr.*?</tr>', seg, re.S):
    cells = [re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', c))).strip() for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, re.S)]
    if any(c == 'Men' for c in cells): sex = 'male'; continue
    if any(c == 'Women' for c in cells): sex = 'female'; continue
    if sex and cells and re.match(r'^\d{4}', cells[0]):
        num = lambda c: float(c) if re.fullmatch(r'[\d.]+', c) else 0.0
        RET[sex].append([int(cells[0][:4]), num(cells[2]), num(cells[4])])   # year, average age, % at 62
RETIREMENT_AWARD_AGE = {s: [[y, a] for y, a, _ in v] for s, v in RET.items()}
RETIREMENT_AT_62 = {s: [[y, round(p / 100, 3)] for y, _, p in v if y >= 1965] for s, v in RET.items()}

# ---------------------------------------------------------------- chronic conditions (NHANES via NCHS)
def interp(points, x):
    if x <= points[0][0]: return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1: return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return points[-1][1]


CHRONIC_AGES = list(range(0, 90, 5))
MIDS = [a + 2.5 for a in CHRONIC_AGES]
# Health, United States 2018, Table 22 (https://www.cdc.gov/nchs/data/hus/2018/022.pdf): hypertension, measured
# systolic >= 140 or diastolic >= 90 mm Hg or taking medication, 2013-2016, percent, at the middles of 20-34, 35-44,
# 45-54, 55-64, 65-74 and 75+ (taken as 80). Under 20 (no table here): 0.1 % at 2.5, 0.2 % at 7.5, 0.5 % at 12.5 and
# 2 % (men) or 1 % (women) at 17.5 years (approx).
HTN = {'male': [(2.5, 0.1), (7.5, 0.2), (12.5, 0.5), (17.5, 2.0), (27, 7.7), (39.5, 21.6), (49.5, 35.8), (59.5, 52.2), (69.5, 61.1), (80, 67.4)],
       'female': [(2.5, 0.1), (7.5, 0.2), (12.5, 0.5), (17.5, 1.0), (27, 3.5), (39.5, 17.7), (49.5, 27.6), (59.5, 51.2), (69.5, 67.4), (80, 78.7)]}
# NCHS Data Brief 516 (https://www.cdc.gov/nchs/data/databriefs/db516.pdf): diagnosed diabetes, August 2021-August
# 2023, 2.2 % at 20-39, 12.1 % at 40-59, 20.5 % at 60+ (taken as 72), both sexes; men x 11.7/10.1 and women x 8.6/10.1
# (the brief's age-adjusted rates by sex; approx). Under 20: about 0.35 % in all (SEARCH for Diabetes in Youth,
# secondary; approx) spread as 0.05 / 0.2 / 0.45 / 0.6 % at 2.5 / 7.5 / 12.5 / 17.5 years.
DM_YOUTH = [(2.5, 0.05), (7.5, 0.2), (12.5, 0.45), (17.5, 0.6)]
DM = {sex: DM_YOUTH + [(30, 2.2 * f), (50, 12.1 * f), (72, 20.5 * f)] for sex, f in (('male', 11.7 / 10.1), ('female', 8.6 / 10.1))}
CHRONIC_RATES = {sex: {'hypertension': [round(interp(HTN[sex], m) * 1000, 1) for m in MIDS],
                       'diabetes': [round(interp(DM[sex], m) * 1000, 1) for m in MIDS]} for sex in ('male', 'female')}

# ---------------------------------------------------------------- schooling by birth cohort
# Census P20-578 figures give the share of 25-29-year-olds with high school and with a bachelor's degree (by sex from
# 1967); a cohort born in c is read in year c + 27. After 2015 the series run straight to 2024 values (approx):
# high school 95 %, bachelor's 41 % (men 36 %, women 46 %), from the Census 2024 release (42.8 % of 25-39-year-olds).
ext = lambda pts, v2024: pts + [[2024, v2024]]
HS = ext(EDU['hs_25_29'], 95.0); BA = ext(EDU['ba_25_29'], 41.0)
BAM = ext(EDU['ba_25_29_male'], 36.0); BAF = ext(EDU['ba_25_29_female'], 46.0)
# Before 1967 there is no split by sex: men's share is the total x 1.20 and women's x 0.84 (the 1967 ratios of the
# two figures; approx).
def ba_sex(y, sex):
    if y >= 1967: return interp(BAM if sex == 'male' else BAF, y)
    return interp(BA, y) * (1.20 if sex == 'male' else 0.84)
# Graduate degree: 38 % of bachelor's holders (Census 2024: 14.6 % of adults 25+ had an advanced degree, 38.6 % a
# bachelor's or more; approx). Associate degree: 4 % of the 1950 cohort rising to 10 % from the 1975 cohort on
# (Census CPS 2024: 10.8 % of adults 25+; approx). Some college without a degree: half the gap between high school and
# associate-or-more for the 1950 cohort, rising to 0.55 of it (approx).
COHORTS = list(range(1950, 2006, 5))
EDUCATION_BY_COHORT = []
for c in COHORTS:
    y = min(2024, c + 27); row = {}
    for sex in ('male', 'female'):
        hs = interp(HS, y) / 100; ba = ba_sex(y, sex) / 100
        assoc = interp([(1950, 0.04), (1975, 0.10)], c)
        some = max(0.0, (hs - ba - assoc) * interp([(1950, 0.5), (1990, 0.55)], c))
        grad = ba * 0.38
        row[sex] = {'highSchool': round(hs, 3), 'someCollege': round(some, 3), 'associate': round(assoc, 3), 'bachelor': round(ba - grad, 3), 'graduate': round(grad, 3)}
    EDUCATION_BY_COHORT.append([c, row])

# ---------------------------------------------------------------- write
L = []
w = L.append
w('// Generated by src/data/build-us-rates.py from the official tables named there; do not edit by hand.')
w('// US statistics for the Written in the Stars engine: the same exports and shapes as ../bazi-life/src/sim/official-data.js')
w('// (LIFE_TABLES, CAUSE_AGES, CAUSE_SHARES, CHRONIC_AGES, CHRONIC_RATES) plus the US values that the Taiwan engine')
w('// keeps inline in rates.js (births, marriage, divorce, school, work, home), under US names. Every export says')
w('// where it comes from; anything not read from an official table is listed in APPROX (and in README.md).')
w('')
w('// ---------- mortality ----------')
w('// SSA Office of the Chief Actuary, period life tables of the 2024 Trustees Report (Social Security area population):')
w(f'// historical tables 1900-{HIST_LAST} and the intermediate (Alternative 2) projection 2022-2100 by single age 0-119')
w('// (https://www.ssa.gov/OACT/HistEst/PerLifeTables/2024/PerLifeTables_{M,F}_{Hist,Alt2}_TR2024.csv).')
w('// Rows: [year, male q(x) x 1e6 for ages 0-84, female q(x) x 1e6, [male e0, female e0], [male e85, female e85]], the')
w('// same shape as the Taiwan tables, so rates.js continues ages 85+ with its Kannisto fit to e85. Every year 1950-2023,')
w('// then every 5 years 2025-2100 (Trustees intermediate), then 2110, 2125 and 2150: each age keeps the projection\'s')
w('// own 2090-2100 yearly rate of decline (capped at 2 %); e0 and e85 of those three rows are computed here (approx).')
w('// 2022 and 2023 are the Trustees\' estimates, not final tables. Between rows, rates.js takes q(x) log-linearly.')
w(f'export const LIFE_TABLE_LAST_OBSERVED = {HIST_LAST};')
w('export const LIFE_TABLE_FIRST_PROJECTED = 2022;')
w('export const LIFE_TABLES = [')
for r in LIFE_TABLES: w('  ' + js(r) + ',')
w('];')
w('// Life expectancy at birth along the Trustees projection (from the rows above), for a port that keeps the')
w('// Taiwan engine\'s "scale the last table to a target e0" projection instead of the projected rows.')
w('export const E0_PROJECTION = ' + js([[r[0], r[3][0], r[3][1]] for r in LIFE_TABLES if r[0] >= 2025]) + ';')
w('')
w('// ---------- causes of death ----------')
w('// Deaths from cancer, heart disease and stroke as a share of all deaths x 10,000, by sex and age group (the Taiwan')
w('// CAUSE_AGES groups; the last is 100+), each anchor pooling three years: 1970 (1969-71), 1980, 1990, 1995 from NCHS')
w('// HIST290A (deaths for selected causes by 10-year age group, 1968-78 and 1979-98; each 10-year group fills both of')
w('// its 5-year groups, 85+ fills 85-100+), 2000 (1999-2001), 2005, 2010, 2015 and 2018 (2017-2019) from CDC WONDER')
w('// Underlying Cause of Death 1999-2020 (five-year age groups). 2020 is left out (COVID-19); years after 2019 hold')
w('// 2018, years before 1970 hold 1970 (approx). Definitions follow NCHS: cancer = malignant neoplasms (ICD-10 C00-C97,')
w('// ICD-9 140-208, ICDA-8 140-209); heart = diseases of heart (I00-I09, I11, I13, I20-I51; it includes hypertensive')
w('// heart disease, which the Taiwan table leaves out); stroke = cerebrovascular diseases (I60-I69, 430-438). ICD-9 and')
w('// ICD-10 rows are not bridged (NCHS comparability ratios: cancer 1.01, heart 0.99, stroke 1.06).')
w('export const CAUSE_AGES = ' + js(CAUSE_AGES) + ';')
w('export const CAUSE_SHARES = [')
for r in CAUSE_SHARES: w('  ' + js(r) + ',')
w('];')
w('// Same shape for accidents (unintentional injuries: V01-X59, Y85-Y86; ICD-9 E800-E949) and suicide (X60-X84, Y87.0,')
w('// U03; E950-E959), same sources and anchors.')
w('export const EXTERNAL_CAUSE_SHARES = [')
for r in EXTERNAL_SHARES: w('  ' + js(r) + ',')
w('];')
w('// Drug overdose (X40-X44, X60-X64, X85, Y10-Y14, the NCHS definition), WONDER only: 2000-2018 anchors as above and')
w('// 2020 alone (the overdose wave). Rows: [year, {male: [...], female: [...]}] over CAUSE_AGES, share x 10,000.')
w('// Overdose deaths are also inside "accidents", "suicide" and other causes; do not add the two tables together.')
w('export const OVERDOSE_SHARES = [')
for r in OVERDOSE_SHARES: w('  ' + js(r) + ',')
w('];')
w('// The July 1, 2020 population by sex and five-year age group (85 = 85+): the Census Bureau estimates that CDC WONDER')
w('// uses as denominators (the US counterpart of POPULATION_2024); 85+ is estimated from 80-84 and the 2020 life table (approx).')
w('export const POPULATION_2020 = ' + js(POPULATION_2020) + ';')
w('')
STATIC = r'''// ---------- chronic conditions ----------
// Share of people with each condition per 100,000, by sex and age group (CHRONIC_AGES are the groups' first ages,
// the last is 85+), the shape of the Taiwan table. Unlike Taiwan's "people treated", these are NHANES prevalences:
// hypertension = measured >= 140/90 mm Hg or on medication, 2013-2016 (Health, United States 2018, Table 22), and
// diagnosed diabetes, 2021-2023 (NCHS Data Brief 516), interpolated between the published groups' middles. Under-20
// values and the diabetes split by sex are approx (see build-us-rates.py).
export const CHRONIC_AGES = /*CHRONIC_AGES*/;
export const CHRONIC_RATES = /*CHRONIC_RATES*/;

// ---------- cancer registry (the counterpart of the Taiwan CANCER_2023 check) ----------
// U.S. Cancer Statistics (CDC NPCR + NCI SEER), "Highlights from 2025 U.S. Cancer Statistics", Table 1: age-adjusted
// incidence of all new cancers, 2019-2023, per person-year, on the 2000 US standard population; and by age group.
// medianAge: NCI SEER Cancer Stat Facts, median age at diagnosis 67 (approx, secondary).
export const CANCER_INCIDENCE = { years: [2019, 2023], asr: { male: 490.4e-5, female: 428.9e-5, all: 453.4e-5 }, byAge: [[0, 16.4e-5], [15, 76.7e-5], [40, 548.6e-5], [65, 1795.1e-5], [75, 2276.5e-5]], medianAge: 67 };
// 2000 US standard population, 19 age groups, per million (NCI SEER standard populations); the US rates above use it
// where the Taiwan engine uses WHO_STANDARD.
export const US_STANDARD_2000 = [[0, 13818], [1, 55317], [5, 72533], [10, 73032], [15, 72169], [20, 66478], [25, 64529], [30, 71044], [35, 80762], [40, 81851], [45, 72118], [50, 62716], [55, 48454], [60, 38793], [65, 34264], [70, 31773], [75, 26999], [80, 17842], [85, 15508]];

// ---------- births ----------
// Total fertility rate (births per woman) by year. 1950 and 1960: 5 x the sum of the age-specific rates in Health,
// United States 2016, Table 3; 1970-2009: NCHS Births: Final Data for 2009 (NVSR 60-1), Table 4; 2010-2023: Births:
// Final Data for 2023 (NVSR 74-1), Table 2. The years in TFR_APPROX (1955, 1961-69) are the NCHS general fertility
// rate times the TFR/GFR ratio interpolated between 1950, 1960 and 1970 (approx); other years in between interpolate.
export const TFR = /*TFR*/;
export const TFR_APPROX = /*TFR_APPROX*/;
// After 2023: the 2024 Trustees Report's intermediate assumption, total fertility rising to an ultimate 1.9 by 2050
// (approx: the path between is a straight line here).
export const TFR_PROJECTION = [[2023, 1.621], [2050, 1.9], [2150, 1.9]];
// Births per woman per year by mother's age group [[first age, rate], ...] (10-14, 15-19, ..., 45-49; [50, 0] closes
// it), the shape of the Taiwan ASFR_2024, for anchor years; same sources as TFR (45-54 for 1950 and 1960).
export const ASFR_BY_YEAR = /*ASFR_BY_YEAR*/;
// Share of births to unmarried mothers. 1970-2015: Health, United States 2016, Table 4; 2009 (the peak) and 2023:
// NVSR 74-1; 1950 and 1960: NCHS Data Brief 18 and Ventura & Bachrach (2000), read as about 4 % and 5.3 % (approx).
export const NONMARITAL_BIRTH_SHARE = [[1950, 0.039], [1960, 0.053], [1970, 0.107], [1980, 0.184], [1990, 0.28], [1995, 0.322], [2000, 0.332], [2005, 0.369], [2009, 0.41], [2010, 0.408], [2015, 0.403], [2023, 0.4]];
// Women's current marital status by age, NSFG 2006-2010 (NCHS NHSR 49, Table 1): married (first or later marriage)
// and cohabiting shares at the age groups' middles (15-17, 18-19, 20-24, ..., 40-44). The Taiwan engine divides the
// population birth rate by MARRIED_SHARE; in the US 4 in 10 births are nonmarital, so a port should count
// cohabiting couples too (or use NONMARITAL_BIRTH_SHARE).
export const MARRIED_SHARE = [[16, 0.003], [18.5, 0.021], [22, 0.173], [27, 0.445], [32, 0.593], [37, 0.646], [42, 0.632]];
export const COHABITING_SHARE = [[16, 0.008], [18.5, 0.098], [22, 0.187], [27, 0.168], [32, 0.121], [37, 0.078], [42, 0.072]];

// ---------- marriage ----------
// Census Table MS-2, estimated median age at first marriage by sex, 1947-2025 (CPS), read from the vector paths of
// Figure MS-2 (the published table file sits on a host this build could not reach); the points reproduce MS-2 to
// 0.1 year (1950: 22.8 / 20.3, 2024: 30.2 / 28.6). Years the chart draws with a straight segment are interpolated.
export const MEDIAN_FIRST_MARRIAGE = /*MEDIAN_FIRST_MARRIAGE*/;
// NSFG (NCHS NHSR 49, Tables 3-4): probability of a first marriage by age 20, 25, 30, 35 and 40, for women in 1995,
// 2002 and 2006-2010 (listed as 2008) and men in 2002 and 2006-2010.
export const FIRST_MARRIAGE_BY_AGE = {
  female: [[1995, [[20, 0.25], [25, 0.59], [30, 0.76], [35, 0.84], [40, 0.86]]], [2002, [[20, 0.17], [25, 0.52], [30, 0.73], [35, 0.81], [40, 0.86]]], [2008, [[20, 0.13], [25, 0.44], [30, 0.68], [35, 0.78], [40, 0.84]]]],
  male: [[2002, [[20, 0.08], [25, 0.36], [30, 0.61], [35, 0.75], [40, 0.81]]], [2008, [[20, 0.05], [25, 0.31], [30, 0.56], [35, 0.71], [40, 0.78]]]],
};
// NSFG 2006-2010 (NHSR 49, Tables 1-2), ages 35-39: never married and not cohabiting, and cohabiting (some of whom were
// married before), the counterpart of Taiwan's "42 % of men 35-39 never married".
export const NEVER_MARRIED_35_39 = { year: 2008, male: { neverMarried: 0.16, cohabiting: 0.123 }, female: { neverMarried: 0.13, cohabiting: 0.078 } };
// Crude marriage rate per 1,000 population. 2000-2022: NCHS NVSS provisional counts (national-marriage-divorce-rates-
// 00-22.pdf); 1950-1990: NCHS, 100 Years of Marriage and Divorce Statistics and later NVSS reports (approx, transcribed).
export const MARRIAGE_RATE = [[1950, 11.1], [1960, 8.5], [1970, 10.6], [1980, 10.6], [1990, 9.8], [2000, 8.2], [2001, 8.2], [2002, 8], [2003, 7.7], [2004, 7.8], [2005, 7.6], [2006, 7.5], [2007, 7.3], [2008, 7.1], [2009, 6.8], [2010, 6.8], [2011, 6.8], [2012, 6.8], [2013, 6.8], [2014, 6.9], [2015, 6.9], [2016, 7], [2017, 6.9], [2018, 6.5], [2019, 6.1], [2020, 5.1], [2021, 6], [2022, 6.2]];
// Remarriage: Pew Research Center (2014, from Census ACS 2013): of adults who had been married before, 64 % of men and
// 52 % of women had remarried; 40 % of new marriages had at least one spouse marrying again (approx, secondary).
export const REMARRIAGE = { year: 2013, everRemarried: { male: 0.64, female: 0.52 }, newMarriagesWithRemarriage: 0.4 };

// ---------- divorce ----------
// Divorces and annulments per 1,000 population. 1950-1988: NCHS Monthly Vital Statistics Report 39(12) suppl. 2,
// Table 1 (1975 recomputed from its count, 4.8; the scan reads 4.6); 1990 and 1995: NCHS (approx, transcribed);
// 2000-2022: NCHS NVSS provisional (states without data excluded from the rate). The Taiwan DIVORCE_TREND has this shape.
export const DIVORCE_TREND = [[1950, 2.6], [1951, 2.5], [1952, 2.5], [1953, 2.5], [1954, 2.4], [1955, 2.3], [1956, 2.3], [1957, 2.2], [1958, 2.1], [1959, 2.2], [1960, 2.2], [1961, 2.3], [1962, 2.2], [1963, 2.3], [1964, 2.4], [1965, 2.5], [1966, 2.5], [1967, 2.6], [1968, 2.9], [1969, 3.2], [1970, 3.5], [1971, 3.7], [1972, 4], [1973, 4.3], [1974, 4.6], [1975, 4.8], [1976, 5], [1977, 5], [1978, 5.1], [1979, 5.3], [1980, 5.2], [1981, 5.3], [1982, 5], [1983, 4.9], [1984, 5], [1985, 5], [1986, 4.9], [1987, 4.8], [1988, 4.7], [1990, 4.7], [1995, 4.4], [2000, 4], [2001, 4], [2002, 3.9], [2003, 3.8], [2004, 3.7], [2005, 3.6], [2006, 3.7], [2007, 3.6], [2008, 3.5], [2009, 3.5], [2010, 3.6], [2011, 3.6], [2012, 3.4], [2013, 3.3], [2014, 3.2], [2015, 3.1], [2016, 3], [2017, 2.9], [2018, 2.9], [2019, 2.7], [2020, 2.3], [2021, 2.5], [2022, 2.4]];
// Divorces per 1,000 married women 15+ (the "refined" rate, the counterpart of Taiwan's 10.5 per 1,000 married people).
// 1950-1988: MVSR 39(12) suppl. 2, Table 1; 2023 and 2024: Bowling Green NCFMR from the ACS (approx, secondary).
export const DIVORCE_REFINED = [[1950, 10.3], [1955, 9.3], [1960, 9.2], [1965, 10.6], [1970, 14.9], [1975, 20.3], [1979, 22.8], [1980, 22.6], [1985, 21.7], [1988, 20.7], [2023, 14.4], [2024, 14.2]];
// Duration of marriage at divorce, divorce-registration area 1988 (MVSR 39(12) suppl. 2, Table 11): shares of divorces
// [first year of duration, share]; median 7.1 years, mean 9.7.
export const DIVORCE_DURATION = { year: 1988, shares: [[0, 0.034], [1, 0.327], [5, 0.28], [10, 0.14], [15, 0.095], [20, 0.06], [25, 0.064]], median: 7.1, mean: 9.7 };
// NSFG 2006-2010 (NHSR 49, Tables 5-6): probability that a first marriage is still intact (no divorce or separation)
// after 5, 10, 15 and 20 years; women also 1995.
export const FIRST_MARRIAGE_SURVIVAL = { female: [[5, 0.8], [10, 0.68], [15, 0.6], [20, 0.52]], male: [[5, 0.81], [10, 0.7], [15, 0.62], [20, 0.56]], female1995: [[5, 0.8], [10, 0.67], [15, 0.57], [20, 0.5]] };

// ---------- schooling ----------
// Census P20-578 (Educational Attainment in the United States: 2015), Figures 2 and 7, read from their vector paths
// (they reproduce CPS Table A-2 to 0.1 point, e.g. 1940: 38.1 / 5.9, 1970: 75.4 / 16.4): percent of 25-29-year-olds
// (and of all adults 25+) who completed high school and who hold a bachelor's degree, 1940-2015 (annual from 1964,
// straight lines before), and bachelor's by sex for 25-29-year-olds, 1967-2015.
export const EDUCATION_25_29 = { highSchool: /*EDU_HS_25_29*/, bachelor: /*EDU_BA_25_29*/, bachelorMale: /*EDU_BA_MALE*/, bachelorFemale: /*EDU_BA_FEMALE*/ };
export const EDUCATION_25_PLUS = { highSchool: /*EDU_HS_25PLUS*/, bachelor: /*EDU_BA_25PLUS*/ };
// Census, Educational Attainment in the United States: 2024 (release CB25-TPS.60): bachelor's or more.
export const EDUCATION_2024 = { bachelorAge25to39: 0.428, bachelorAge40to54: 0.415, bachelorAge55plus: 0.342, bachelorMen25plus: 0.371, bachelorWomen25plus: 0.401 };
// Highest level reached by birth cohort (shares of the cohort; highSchool is "high school or more"; the other five
// are exclusive levels above high school), for cohorts 1950, 1955, ..., 2005. highSchool and bachelor + graduate
// come from EDUCATION_25_29 at age 27 (2024 values for cohorts that are not yet 27); the split into some college,
// associate, bachelor and graduate is approx (see build-us-rates.py). Taiwan has no such table: it uses
// continuation rates (college(), master()).
export const EDUCATION_BY_COHORT = /*EDUCATION_BY_COHORT*/;
// Recent high school completers enrolled in college in the October after graduating, percent (NCES Digest Table
// 302.10, from the CPS). Only 1960 (45.1) was checked against the table here; the rest is transcribed (approx).
export const COLLEGE_ENROLLMENT = [[1960, 45.1], [1965, 50.9], [1970, 51.7], [1975, 50.7], [1980, 49.3], [1985, 57.7], [1990, 60.1], [1995, 61.9], [2000, 63.3], [2005, 68.6], [2009, 70.1], [2010, 68.1], [2015, 69.2], [2016, 69.8], [2019, 66.2], [2020, 62.7], [2021, 61.8], [2022, 62]];

// ---------- home ----------
// Homeownership rate, percent of households. 1964-2024: Census HVS Table 14 (mean of the four quarters); 1950 and
// 1960: decennial census (Historical Census of Housing Tables; approx, transcribed).
export const HOMEOWNERSHIP_RATE = /*HOME_TOTAL*/;
// Homeownership by age of householder (Census HVS Table 12: owner households / all households), percent, for the
// groups in HOMEOWNERSHIP_AGES (under 25, 25-29, ..., 70-74, 75+). Earlier than 1985: hold 1985 (approx).
export const HOMEOWNERSHIP_AGES = [15, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75];
export const HOMEOWNERSHIP_BY_AGE = /*HOME_BY_AGE*/;
// Median age of first-time buyers, National Association of Realtors, Profile of Home Buyers and Sellers (approx,
// secondary): about 29 in 1981, 31 in 2001, 33 in 2019, 35 in 2023, 38 in 2024, 40 in 2025.
export const FIRST_HOME_AGE = [[1981, 29], [1991, 30], [2001, 31], [2010, 30], [2019, 33], [2022, 36], [2023, 35], [2024, 38], [2025, 40]];

// ---------- moving ----------
// Share of people 1+ who lived in another home a year earlier, percent (Census CPS ASEC, Table A-1). 1948 (20.2),
// 2008 (11.9), 2009 (12.5), 2020 (9.3) and 2021 (8.4) are from Census reports; the rest is transcribed (approx).
export const MOVER_RATE = [[1948, 20.2], [1960, 20.0], [1970, 18.7], [1980, 17.2], [1990, 17.0], [2000, 14.2], [2005, 13.9], [2008, 11.9], [2009, 12.5], [2010, 11.6], [2015, 11.2], [2019, 9.8], [2020, 9.3], [2021, 8.4], [2023, 7.8]];
// Mover rate by age relative to the national rate (CPS ASEC shape: highest at 20-29; approx).
export const MOVE_BY_AGE = [[1, 1.2], [10, 0.9], [18, 1.6], [22, 2.3], [27, 2.1], [32, 1.5], [40, 0.95], [50, 0.6], [60, 0.45], [70, 0.4], [80, 0.45]];

// ---------- work ----------
// Pay by age relative to all ages: median usual weekly earnings of full-time wage and salary workers, BLS CPS,
// fourth quarter 2024, by age group (16-24 $766, 25-34 $1,136, 35-44 $1,356, 45-54 $1,336, 55-64 $1,268, 65+ $1,159;
// all $1,192), at the groups' middles (approx: read from a secondary copy, the BLS site could not be reached). Same
// name and shape as the Taiwan PAY_BY_AGE.
export const PAY_BY_AGE = [[20, 0.643], [29.5, 0.953], [39.5, 1.138], [49.5, 1.121], [59.5, 1.064], [68, 0.972]];
// Unemployment rate, annual average, percent (BLS CPS series LNU04000000; transcribed, the BLS site could not be
// reached: approx).
export const UNEMPLOYMENT_RATE = [[1950, 5.3], [1951, 3.3], [1952, 3], [1953, 2.9], [1954, 5.5], [1955, 4.4], [1956, 4.1], [1957, 4.3], [1958, 6.8], [1959, 5.5], [1960, 5.5], [1961, 6.7], [1962, 5.5], [1963, 5.7], [1964, 5.2], [1965, 4.5], [1966, 3.8], [1967, 3.8], [1968, 3.6], [1969, 3.5], [1970, 4.9], [1971, 5.9], [1972, 5.6], [1973, 4.9], [1974, 5.6], [1975, 8.5], [1976, 7.7], [1977, 7.1], [1978, 6.1], [1979, 5.8], [1980, 7.1], [1981, 7.6], [1982, 9.7], [1983, 9.6], [1984, 7.5], [1985, 7.2], [1986, 7], [1987, 6.2], [1988, 5.5], [1989, 5.3], [1990, 5.6], [1991, 6.8], [1992, 7.5], [1993, 6.9], [1994, 6.1], [1995, 5.6], [1996, 5.4], [1997, 4.9], [1998, 4.5], [1999, 4.2], [2000, 4], [2001, 4.7], [2002, 5.8], [2003, 6], [2004, 5.5], [2005, 5.1], [2006, 4.6], [2007, 4.6], [2008, 5.8], [2009, 9.3], [2010, 9.6], [2011, 8.9], [2012, 8.1], [2013, 7.4], [2014, 6.2], [2015, 5.3], [2016, 4.9], [2017, 4.4], [2018, 3.9], [2019, 3.7], [2020, 8.1], [2021, 5.3], [2022, 3.6], [2023, 3.6], [2024, 4]];
// NBER business cycle reference dates since 1948 (https://www.nber.org/research/data/us-business-cycle-expansions-
// and-contractions): [peak month, trough month]; and the calendar years that contain a recession month after the peak.
export const RECESSIONS = [["1948-11", "1949-10"], ["1953-07", "1954-05"], ["1957-08", "1958-04"], ["1960-04", "1961-02"], ["1969-12", "1970-11"], ["1973-11", "1975-03"], ["1980-01", "1980-07"], ["1981-07", "1982-11"], ["1990-07", "1991-03"], ["2001-03", "2001-11"], ["2007-12", "2009-06"], ["2020-02", "2020-04"]];
export const RECESSION_YEARS = [1949, 1953, 1954, 1957, 1958, 1960, 1961, 1970, 1973, 1974, 1975, 1980, 1981, 1982, 1990, 1991, 2001, 2008, 2009, 2020];
// Retirement: Social Security retired-worker awards (SSA Annual Statistical Supplement 2024, Table 6.B5): average age
// at award by sex and year, and the share awarded at 62. Claiming is not leaving work, but it is the official age
// series closest to Taiwan's labour-insurance retirement age.
export const RETIREMENT_AWARD_AGE = /*RET_AGE*/;
export const RETIREMENT_AT_62 = /*RET_62*/;
// Full retirement age by birth year (Social Security Act, 1983 amendments): 65 to 1937, +2 months a year to 66 for
// 1943-54, +2 months a year to 67 from 1960.
export const FULL_RETIREMENT_AGE = [[1937, 65], [1943, 66], [1954, 66], [1960, 67]];

// ---------- military service (US analogue of Taiwan's conscription) ----------
// Selective Service draft lotteries (Selective Service System history; approx, secondary): the Dec 1, 1969 lottery
// covered men born 1944-1950 (called up to number 195 for 1970), July 1, 1970 men born 1951 (to 125 for 1971),
// Aug 5, 1971 men born 1952 (to 95 for 1972), Feb 2, 1972 men born 1953 (none inducted). Induction ended in 1973;
// registration (no draft) resumed in 1980 for men born 1960 and later. A number at or under the cap meant an
// induction notice, unless deferred or exempt.
export const DRAFT_LOTTERY = [{ born: [1944, 1950], year: 1970, highestCalled: 195 }, { born: [1951, 1951], year: 1971, highestCalled: 125 }, { born: [1952, 1952], year: 1972, highestCalled: 95 }, { born: [1953, 1953], year: 1973, highestCalled: 0 }];
// Share of men who ever served, by birth cohort (approx, design from veteran counts): about 30 % of men born
// 1944-52, 15 % of 1955-64, 10 % of 1965-80 and 7 % after.
export const MILITARY_SERVICE_SHARE = [[1950, 0.3], [1955, 0.15], [1964, 0.15], [1965, 0.1], [1980, 0.1], [1985, 0.07]];

// ---------- what is approximate ----------
// Exports (or "export.field") whose values are not all read from an official table; README.md says why.
export const APPROX = ["LIFE_TABLES:2110,2125,2150", "CAUSE_SHARES:before 1970 and after 2019", "CHRONIC_RATES:under 20, diabetes by sex", "CANCER_INCIDENCE.medianAge", "TFR:1955,1961-1969", "TFR_PROJECTION", "NONMARITAL_BIRTH_SHARE:1950,1960", "MARRIAGE_RATE:1950-1990", "REMARRIAGE", "DIVORCE_TREND:1990,1995", "DIVORCE_REFINED:2023,2024", "POPULATION_2020:85+", "EDUCATION_BY_COHORT:level split, cohorts after 1988", "COLLEGE_ENROLLMENT:after 1960", "HOMEOWNERSHIP_RATE:1950,1960", "FIRST_HOME_AGE", "MOVER_RATE:most years", "MOVE_BY_AGE", "PAY_BY_AGE", "UNEMPLOYMENT_RATE", "DRAFT_LOTTERY", "MILITARY_SERVICE_SHARE"];

// ---------- sources ----------
export const SOURCES = {
  LIFE_TABLES: { source: "SSA OCACT, period life tables, 2024 Trustees Report (historical and Alternative 2)", url: "https://www.ssa.gov/OACT/HistEst/PerLifeTables/2024/", years: [1950, 2150], approx: "2022-2023 are Trustees estimates; 2025-2100 projected; 2110-2150 extended here" },
  CAUSE_SHARES: { source: "NCHS HIST290A (1968-98); CDC WONDER Underlying Cause of Death 1999-2020 (D76)", url: "https://www.cdc.gov/nchs/nvss/mortality/hist290a.htm; https://wonder.cdc.gov/ucd-icd10.html", years: [1969, 2019] },
  EXTERNAL_CAUSE_SHARES: { source: "as CAUSE_SHARES", years: [1969, 2019] },
  OVERDOSE_SHARES: { source: "CDC WONDER D76, ICD-10 X40-X44, X60-X64, X85, Y10-Y14", years: [1999, 2020] },
  POPULATION_2020: { source: "Census Bureau population estimates via CDC WONDER D76", years: [2020, 2020] },
  CHRONIC_RATES: { source: "Health, United States 2018 Table 22 (hypertension, 2013-2016); NCHS Data Brief 516 (diagnosed diabetes, 2021-2023)", url: "https://www.cdc.gov/nchs/data/hus/2018/022.pdf; https://www.cdc.gov/nchs/data/databriefs/db516.pdf", years: [2013, 2023], approx: "under 20; diabetes by sex" },
  CANCER_INCIDENCE: { source: "CDC U.S. Cancer Statistics, Highlights from 2025 U.S. Cancer Statistics, Table 1", url: "https://www.cdc.gov/united-states-cancer-statistics/publications/uscs-highlights.html", years: [2019, 2023] },
  TFR: { source: "NCHS NVSR 60-1 Table 4, NVSR 74-1 Table 2, Health US 2016 Table 3", url: "https://www.cdc.gov/nchs/data/nvsr/nvsr74/nvsr74-1.pdf", years: [1950, 2023], approx: "1955, 1961-69" },
  ASFR_BY_YEAR: { source: "as TFR", years: [1950, 2023] },
  NONMARITAL_BIRTH_SHARE: { source: "Health US 2016 Table 4; NVSR 74-1", years: [1950, 2023], approx: "1950, 1960" },
  MARRIED_SHARE: { source: "NSFG 2006-2010, NCHS NHSR 49 Table 1", url: "https://www.cdc.gov/nchs/data/nhsr/nhsr049.pdf", years: [2006, 2010] },
  MEDIAN_FIRST_MARRIAGE: { source: "Census MS-2 via Figure MS-2 (CPS)", url: "https://www.census.gov/content/dam/Census/library/visualizations/time-series/demo/families-and-households/ms-2.pdf", years: [1947, 2025] },
  FIRST_MARRIAGE_BY_AGE: { source: "NSFG, NHSR 49 Tables 3-4", years: [1995, 2010] },
  DIVORCE_TREND: { source: "NCHS MVSR 39(12) suppl. 2 Table 1; NCHS NVSS 2000-2022", url: "https://www.cdc.gov/nchs/data/mvsr/supp/mv39_12s2.pdf; https://www.cdc.gov/nchs/data/dvs/marriage-divorce/national-marriage-divorce-rates-00-22.pdf", years: [1950, 2022], approx: "1990, 1995" },
  DIVORCE_DURATION: { source: "NCHS MVSR 39(12) suppl. 2 Table 11", years: [1988, 1988] },
  FIRST_MARRIAGE_SURVIVAL: { source: "NSFG, NHSR 49 Tables 5-6", years: [2006, 2010] },
  EDUCATION_25_29: { source: "Census P20-578 Figures 2 and 7 (CPS Table A-2)", url: "https://www.census.gov/content/dam/Census/library/publications/2016/demo/p20-578.pdf", years: [1940, 2015] },
  EDUCATION_BY_COHORT: { source: "derived from EDUCATION_25_29 and Census 2024", years: [1950, 2005], approx: "level split" },
  HOMEOWNERSHIP_RATE: { source: "Census HVS Table 14; decennial census", url: "https://www.census.gov/housing/hvs/data/histtabs.html", years: [1950, 2024], approx: "1950, 1960" },
  HOMEOWNERSHIP_BY_AGE: { source: "Census HVS Table 12", url: "https://www.census.gov/housing/hvs/data/histtab12.xlsx", years: [1985, 2024] },
  UNEMPLOYMENT_RATE: { source: "BLS CPS LNU04000000 annual averages (transcribed)", years: [1950, 2024], approx: "all" },
  RECESSIONS: { source: "NBER Business Cycle Dating Committee", url: "https://www.nber.org/research/data/us-business-cycle-expansions-and-contractions", years: [1948, 2020] },
  RETIREMENT_AWARD_AGE: { source: "SSA Annual Statistical Supplement 2024, Table 6.B5", url: "https://www.ssa.gov/policy/docs/statcomps/supplement/2024/6b.html", years: [1940, 2023] },
  PAY_BY_AGE: { source: "BLS weekly earnings by age, Q4 2024 (secondary copy)", years: [2024, 2024], approx: "all" },
};
'''
HOME = [[1950, 55.0], [1960, 61.9]] + sorted([y, v] for y, v in HOME_TOTAL.items() if y <= 2024)
for k, v in {'CHRONIC_AGES': CHRONIC_AGES, 'CHRONIC_RATES': CHRONIC_RATES, 'MEDIAN_FIRST_MARRIAGE': MEDIAN_FIRST_MARRIAGE,
             'TFR': TFR, 'TFR_APPROX': TFR_APPROX, 'ASFR_BY_YEAR': ASFR_BY_YEAR, 'EDU_HS_25_29': EDU['hs_25_29'],
             'EDU_BA_25_29': EDU['ba_25_29'], 'EDU_HS_25PLUS': EDU['hs_25plus'], 'EDU_BA_25PLUS': EDU['ba_25plus'],
             'EDU_BA_MALE': EDU['ba_25_29_male'], 'EDU_BA_FEMALE': EDU['ba_25_29_female'], 'EDUCATION_BY_COHORT': EDUCATION_BY_COHORT,
             'HOME_TOTAL': HOME, 'HOME_BY_AGE': HOMEOWNERSHIP_BY_AGE, 'RET_AGE': RETIREMENT_AWARD_AGE, 'RET_62': RETIREMENT_AT_62}.items():
    assert '/*' + k + '*/' in STATIC, k
    STATIC = STATIC.replace('/*' + k + '*/', js(v))
assert '/*' not in STATIC.replace('/* ', '')
w(STATIC)
open(OUT, 'w').write('\n'.join(L).rstrip() + '\n')
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
