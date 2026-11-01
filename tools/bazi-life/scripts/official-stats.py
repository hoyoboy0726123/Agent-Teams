#!/usr/bin/env python3
"""Official statistics for the life simulation → src/sim/official-data.js (generated; do not edit that file).

Run from tools/bazi-life:  python3 scripts/official-stats.py [--cache DIR]
Downloads into --cache (default .official-cache/, ignored by git) and reuses what is already there, so a new year is
added by deleting the stale files and running it again. Needs python3 and xlrd 2.0.1 (pip install xlrd==2.0.1) for
the .xls in source 4; everything else uses the standard library.

Sources
  1. 內政部統計處「簡易生命表」全國 (single ages 0–84 and the open 85+), 民國81–114年 (1992–2025), one file a year
     (.htm, .ods or .xlsx): https://www.moi.gov.tw/cl.aspx?n=2953
  2. Human Life-Table Database (Max Planck Institute for Demographic Research), Taiwan, which holds 內政部's tables
     for the years 內政部 no longer posts: https://www.lifetable.de/Country/Country?cntr=TWN
     Used for 1956–1958, 1966–1967 and 1970–1991 (national, single ages; q(x) and the original e(x)). Its copies of
     1996–2003 are an older version than 內政部's current tables, so 內政部's own files are used for 1992 onwards.
  3. 衛生福利部統計處「死因統計」(政府資料開放平臺 dataset 5965): deaths by cause, sex and age group, 1992–2025.
  4. 衛生福利部統計處「113年度全民健康保險醫療統計年報」: 表1 people treated per 100,000 by disease, sex and age
     (門、住診合計), and 十五 the 2024 mid-year population by sex and age.
"""
import argparse, base64, csv, html, io, json, os, re, sys, urllib.parse, urllib.request, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "sim", "official-data.js")
MOI_PAGE = "https://www.moi.gov.tw/cl.aspx?n=2953"
HLD_ZIP = "https://www.lifetable.de/File/GetDocument/data%5CTWN%5CTWN.zip"
DEATHS_DATASET = "https://data.gov.tw/api/v2/rest/dataset/5965"
NHI_PAGE = "https://dep.mohw.gov.tw/DOS/lp-5103-113-xCat-y113.html"
UA = {"User-Agent": "Mozilla/5.0 (official-stats.py; bazi-life)"}


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
        f.write(r.read())
    os.replace(path + ".part", path)
    return path


def text_of(url, path):
    return open(fetch(url, path), encoding="utf-8", errors="replace").read()


# ---------- spreadsheets (.ods, .xlsx) with the standard library ----------
ODS = {"table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0", "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
       "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0"}


def read_ods(path):
    T, O = "{%s}" % ODS["table"], "{%s}" % ODS["office"]
    root = ET.fromstring(zipfile.ZipFile(path).read("content.xml"))
    book = {}
    for sh in root.iter(T + "table"):
        rows = []
        for r in sh.iter(T + "table-row"):
            cells = []
            for c in r:
                if c.tag not in (T + "table-cell", T + "covered-table-cell"):
                    continue
                v = c.get(O + "value")
                if v is None:
                    v = "".join("".join(p.itertext()) for p in c.findall("text:p", ODS)).strip()
                cells += [v] * min(int(c.get(T + "number-columns-repeated", "1")), 50)
            while cells and cells[-1] == "":
                cells.pop()
            rows += [cells] * min(int(r.get(T + "number-rows-repeated", "1")), 3)
        book[sh.get(T + "name")] = rows
    return book


XL = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def read_xlsx(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", XL):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % XL["m"])))
    target = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    book = {}
    for sh in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", XL):
        p = target[sh.get("{%s}id" % XL["r"])].lstrip("/")
        p = p if p.startswith("xl/") else "xl/" + p
        rows = []
        for row in ET.fromstring(z.read(p)).iter("{%s}row" % XL["m"]):
            cells = {}
            for c in row.findall("m:c", XL):
                v, t = c.find("m:v", XL), c.get("t")
                val = shared[int(v.text)] if t == "s" and v is not None else (v.text if v is not None else "")
                col = 0
                for ch in re.match(r"[A-Z]+", c.get("r")).group(0):
                    col = col * 26 + ord(ch) - 64
                cells[col - 1] = (val or "").strip()
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
        book[sh.get("name")] = rows
    return book


# ---------- 1. 內政部 national life tables ----------
SEXES = {"全體": "all", "兩性": "all", "男性": "male", "女性": "female"}


def table_rows(rows):
    """{sex: {age: (q, l, d, L, T, e)}} from rows of a 全國 table; age 85 is the open 85+."""
    out, sex = {}, None
    for r in rows:
        if not r or not r[0]:
            continue
        first = r[0].replace(" ", "")
        if first in SEXES:
            sex = SEXES[first]
            out.setdefault(sex, {})
            continue
        if first.startswith("表") and "全國" not in first and "臺閩" not in first and sex:
            break
        m = re.fullmatch(r"(\d+)\+?", first)
        if not m or sex is None:
            continue
        try:
            vals = tuple(float(str(x).replace(",", "")) for x in r[1:7])
        except ValueError:
            continue
        age = int(m.group(1))
        if age <= 130 and 0 <= vals[0] <= 1 and age not in out[sex]:
            out[sex][age] = vals
    return out


def read_htm_table(path):
    t = open(path, "rb").read().decode("big5", errors="replace")
    t = html.unescape(re.sub(r"<[^>]+>", "\n", re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)))
    toks = [" ".join(x.split()) for x in t.splitlines() if x.strip()]
    rows, i = [], 0
    while i < len(toks):
        if toks[i] in SEXES:
            rows.append([toks[i]]); i += 1; continue
        if re.fullmatch(r"\d+\+?", toks[i]) and i + 6 < len(toks):
            try:
                nums = [float(v.replace(",", "")) for v in toks[i + 1:i + 7]]
                if int(toks[i].rstrip("+")) <= 130 and 0 <= nums[0] <= 1 and nums[1] <= 100000.5:
                    rows.append(toks[i:i + 7]); i += 7; continue
            except ValueError:
                pass
        i += 1
    return table_rows(rows)


def moi_tables(cache):
    page = text_of(MOI_PAGE, os.path.join(cache, "moi-2953.html"))
    out, seen = {}, set()
    for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', page, re.S):
        href, label = html.unescape(m.group(1)), html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
        mm = re.fullmatch(r"(\d+)年", label)
        if not mm or "Download.ashx" not in href or int(mm.group(1)) in seen:
            continue                  # the first list on the page is the 全國 table; the second is the full set
        roc = int(mm.group(1)); seen.add(roc)
        name = base64.b64decode(urllib.parse.parse_qs(urllib.parse.urlparse(href).query)["n"][0] + "==").decode("utf-8", "replace")
        ext = name.rsplit(".", 1)[-1].lower()
        path = fetch(href, os.path.join(cache, f"moi-{roc}.{ext}"))
        if ext in ("htm", "html"):
            t = read_htm_table(path)
        else:
            book = read_ods(path) if ext == "ods" else read_xlsx(path)
            sheet = next((n for n in book if n.startswith("表1")), None) or next(iter(book))
            t = table_rows(book[sheet])
        out[roc + 1911] = {s: t[s] for s in ("male", "female")}
    return out


# ---------- 2. Human Life-Table Database ----------
def hld_tables(cache):
    z = zipfile.ZipFile(fetch(HLD_ZIP, os.path.join(cache, "hld-TWN.zip")))
    rows = list(csv.reader(io.StringIO(z.read("TWN.csv").decode("utf-8", errors="replace"))))
    hdr = [h.strip() for h in rows[0]]
    I = {h: i for i, h in enumerate(hdr)}
    num = lambda v: float(v) if v.strip() not in ("", ".") else None
    out = {}
    for r in rows[1:]:
        if len(r) < len(hdr) or r[I["Region"]].strip() != "0" or r[I["Residence"]].strip() != "0" or r[I["TypeLT"]].strip() != "1":
            continue
        sex = {"1": "male", "2": "female"}.get(r[I["Sex"]].strip())
        if not sex:
            continue
        k = (int(r[I["Year1"]]), int(r[I["Year2"]]))
        out.setdefault(k, {}).setdefault(sex, {})[int(float(r[I["Age"]]))] = (num(r[I["q(x)"]]), num(r[I["e(x)Orig"]]), r[I["Ref-ID"]].strip())
    return out


def life_tables(cache):
    moi, hld = moi_tables(cache), hld_tables(cache)
    tables = []
    for (y1, y2), t in sorted(hld.items()):
        mid = (y1 + y2) / 2
        if (y1, y2) in ((1956, 1958), (1966, 1967)) or (y1 == y2 and 1970 <= y1 <= 1991):
            rec = {"year": mid, "source": "HLD " + t["male"][0][2]}
            for s in ("male", "female"):
                rec[s] = [t[s][a][0] for a in range(85)]
                rec["e0_" + s], rec["e85_" + s] = t[s][0][1], t[s][85][1]
            tables.append(rec)
    for y, t in sorted(moi.items()):
        rec = {"year": y, "source": f"內政部 {y - 1911}年"}
        for s in ("male", "female"):
            rec[s] = [t[s][a][0] for a in range(85)]
            rec["e0_" + s], rec["e85_" + s] = t[s][0][5], t[s][85][5]
        tables.append(rec)
    return tables


# ---------- 3. 死因統計: deaths by cause, sex and age group ----------
# Cause codes (codebook in the zip): ICD-9 years (民國96年 and before) and ICD-10 years (97年 on).
CAUSES = {"cancer": ("10", "06"), "heart": ("16", "16"), "stroke": ("18", "17")}
GROUP_STARTS = [0, 1] + list(range(5, 100, 5)) + [100]          # 0, 1–4, 5–9, …, 95–99, 100+


def group_of(code):
    c = int(code)
    if c in (1, 2): return 0
    if 3 <= c <= 6: return 1
    if 7 <= c <= 25: return c - 5                                 # 07 = 5–9 → index 2
    if c == 26: return len(GROUP_STARTS) - 1
    return None


ANCHORS = [(1993, (1992, 1993, 1994)), (1998, (1997, 1998, 1999)), (2003, (2002, 2003, 2004)), (2008, (2007, 2008, 2009)),
           (2013, (2012, 2013, 2014)), (2018, (2017, 2018, 2019)), (2024, (2023, 2024, 2025))]


def cause_shares(cache):
    meta = json.loads(text_of(DEATHS_DATASET, os.path.join(cache, "dataset-5965.json")))
    url = meta["result"]["distribution"][0]["resourceDownloadUrl"]
    z = zipfile.ZipFile(fetch(url, os.path.join(cache, "deaths.zip")))
    counts = {}                                                     # (year, sex, group, cause) → deaths
    for roc in range(81, 200):
        name = f"dead{roc}.csv"
        if name not in z.namelist():
            continue
        icd = 0 if roc <= 96 else 1
        for r in csv.DictReader(io.StringIO(z.read(name).decode("utf-8-sig"))):
            g, sex = group_of(r["age_code"]), {"1": "male", "2": "female"}.get(r["sex"].strip())
            if g is None or not sex:
                continue
            n, y = int(r["N"]), roc + 1911
            counts[(y, sex, g, "all")] = counts.get((y, sex, g, "all"), 0) + n
            for cause, codes in CAUSES.items():
                if r["cause"].strip() == codes[icd]:
                    counts[(y, sex, g, cause)] = counts.get((y, sex, g, cause), 0) + n
    out = []
    for anchor, years in ANCHORS:
        rec = {"year": anchor}
        for sex in ("male", "female"):
            rec[sex] = {}
            for cause in CAUSES:
                shares = []
                for g in range(len(GROUP_STARTS)):
                    tot = sum(counts.get((y, sex, g, "all"), 0) for y in years)
                    k = sum(counts.get((y, sex, g, cause), 0) for y in years)
                    shares.append(round(10000 * k / tot) if tot else 0)
                rec[sex][cause] = shares
        out.append(rec)
    return out


# ---------- 4. 健保醫療統計: people treated for high blood pressure and diabetes, and the population ----------
def nhi(cache):
    import xlrd
    page = text_of(NHI_PAGE, os.path.join(cache, "nhi-113.html"))
    url = next(html.unescape(m.group(1)) for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', page, re.S)
               if "113年度全民健康保險醫療統計年報" in re.sub(r"<[^>]+>", "", m.group(2)))
    z = zipfile.ZipFile(fetch(url, os.path.join(cache, "nhi-113.zip")))
    def member(prefix):
        for i in z.infolist():
            n = i.filename
            try: n = n.encode("cp437").decode("big5")
            except (UnicodeEncodeError, UnicodeDecodeError): pass
            if n.split("/")[-1].startswith(prefix): return xlrd.open_workbook(file_contents=z.read(i))
        raise SystemExit(f"{prefix}… not found in the NHI zip")
    sh = member("一、").sheet_by_name("表1")
    head = sh.row_values(5)
    cols = [c for c in range(len(head)) if str(head[c]).strip() and str(head[c]).strip() != "總計"]   # each age group: total, male, female
    rows = {"hypertension": "I10-I15", "diabetes": "E08-E13"}
    rates = {"male": {}, "female": {}}
    for r in range(sh.nrows):
        v = sh.row_values(r)
        code = str(v[6]).strip().replace(" ", "")
        for k, icd in rows.items():
            if code == icd:
                rates["male"][k] = [round(float(v[c + 1]), 1) for c in cols]
                rates["female"][k] = [round(float(v[c + 2]), 1) for c in cols]
    ages = [int(re.match(r"\d+", str(head[c]).strip()).group(0)) for c in cols]
    pop_sh = member("十五").sheet_by_name("表2")
    pop = {"ages": [], "male": [], "female": []}
    for r in range(pop_sh.nrows):
        v = pop_sh.row_values(r)
        m = re.match(r"(\d+)", str(v[0]).strip())
        if m and str(v[1]).strip():
            pop["ages"].append(int(m.group(1))); pop["male"].append(round(float(v[2]))); pop["female"].append(round(float(v[3])))
    return {"ages": ages, "rates": rates}, pop


# ---------- output ----------
def js_list(xs):
    return "[" + ",".join(str(x) for x in xs) + "]"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", default=os.path.join(ROOT, ".official-cache"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    tables = life_tables(args.cache)
    shares = cause_shares(args.cache)
    chronic, pop = nhi(args.cache)
    q6 = lambda qs: js_list(int(round(q * 1e6)) for q in qs)
    out = ["// Generated by scripts/official-stats.py from the official tables named there; do not edit by hand.",
           "// Re-run the script when a new year is published.", "",
           "// 內政部 life tables (簡易生命表, 全國), single ages 0–84, as [year, male q(x) × 1e6, female q(x) × 1e6,",
           "// [male e0, female e0], [male e85, female e85]]. 1956–58 and 1966–67 sit at their middle year; 1956–1991 come from",
           "// the Human Life-Table Database's copies of 內政部's tables, 1992–2025 from 內政部's own files.",
           "export const LIFE_TABLES = ["]
    for t in tables:
        out.append(f"  [{t['year']:g}, {q6(t['male'])}, {q6(t['female'])}, [{t['e0_male']:.2f}, {t['e0_female']:.2f}], [{t['e85_male']:.2f}, {t['e85_female']:.2f}]],")
    out += ["];", "",
            "// 死因統計 (衛生福利部統計處): deaths from cancer, heart disease (高血壓性疾病除外) and stroke (腦血管疾病) as a share of",
            "// all deaths × 10,000, by sex and age group (CAUSE_AGES are the groups' first ages), each anchor year pooling",
            "// three years of deaths (2024: 2023–2025).",
            f"export const CAUSE_AGES = {js_list(GROUP_STARTS)};",
            "export const CAUSE_SHARES = ["]
    for s in shares:
        parts = ", ".join(f"{sex}: {{ " + ", ".join(f"{c}: {js_list(s[sex][c])}" for c in CAUSES) + " }" for sex in ("male", "female"))
        out.append(f"  [{s['year']}, {{ {parts} }}],")
    out += ["];", "",
            "// 全民健康保險醫療統計 113年 (2024), 表1: people treated (門、住診合計) per 100,000, by sex and age group",
            "// (CHRONIC_AGES are the groups' first ages; the last is 85 and over).",
            f"export const CHRONIC_AGES = {js_list(chronic['ages'])};",
            "export const CHRONIC_RATES = {"]
    for sex in ("male", "female"):
        out.append(f"  {sex}: {{ hypertension: {js_list(chronic['rates'][sex]['hypertension'])}, diabetes: {js_list(chronic['rates'][sex]['diabetes'])} }},")
    out += ["};", "",
            "// The 2024 mid-year population by sex and age group (同一份年報 十五、表2), for checks against the official totals.",
            f"export const POPULATION_2024 = {{ ages: {js_list(pop['ages'])}, male: {js_list(pop['male'])}, female: {js_list(pop['female'])} }};", ""]
    open(OUT, "w", encoding="utf-8").write("\n".join(out))
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(tables)} life tables ({tables[0]['year']:g}–{tables[-1]['year']:g}), "
          f"{len(shares)} cause-of-death anchors, chronic rates for {len(chronic['ages'])} age groups")


if __name__ == "__main__":
    sys.exit(main())
