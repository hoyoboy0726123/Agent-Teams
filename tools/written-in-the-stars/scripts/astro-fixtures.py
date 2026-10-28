#!/usr/bin/env python3
"""Swiss Ephemeris fixtures for the astro engine tests.

Writes test/fixtures/astro-swe.json: about 300 random US births 1930-2025 at the birthplaces of
src/astro/places.js, plus edge cases (DST change days, near midnight, Alaska, Hawaii, 1974 year-round DST,
Arizona, Indiana). For each: the UTC instant from Python's zoneinfo (fold=0: the earlier instant in the
fall-back hour, the pre-jump offset in the spring-forward gap), then apparent geocentric tropical longitudes
and speeds of the ten bodies and the Ascendant and MC from the Swiss Ephemeris (built-in Moshier ephemeris,
about an arc-second, no data files needed).

    pip install pyswisseph
    python3 scripts/astro-fixtures.py
"""
import json
import os
import random
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import swisseph as swe

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BODIES = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]
SWE_IDS = [swe.SUN, swe.MOON, swe.MERCURY, swe.VENUS, swe.MARS, swe.JUPITER, swe.SATURN, swe.URANUS, swe.NEPTUNE, swe.PLUTO]
FLAGS = swe.FLG_MOSEPH | swe.FLG_SPEED


def load_places():
    """Parse the birthplaces from src/astro/places.js (state, name, lat, lon, tz)."""
    src = open(os.path.join(ROOT, "src", "astro", "places.js"), encoding="utf-8").read()
    consts = dict(re.findall(r'\b([A-Z]+) = "([^"]+)"', src))
    places = []
    state = None
    token = re.compile(r'\["([A-Z]{2})", "[^"]+", \[|\["([^"]+)", (-?[\d.]+), (-?[\d.]+), ("[^"]+"|[A-Z]+)\]')
    for t in token.finditer(src[src.index("const RAW"):src.index("export const PLACES")]):
        if t.group(1):
            state = t.group(1)
            continue
        name, lat, lon, tz = t.group(2, 3, 4, 5)
        tz = tz.strip('"') if tz.startswith('"') else consts[tz]
        places.append({"name": name, "state": state, "lat": float(lat), "lon": float(lon), "tz": tz})
    return places


def to_utc(y, m, d, h, mi, tz):
    local = datetime(y, m, d, h, mi, fold=0, tzinfo=ZoneInfo(tz))
    return local.astimezone(timezone.utc), local.utcoffset().total_seconds() / 60


def case(kind, place, y, m, d, time):
    h, mi = (time if time else (12, 0))
    utc, offset = to_utc(y, m, d, h, mi, place["tz"])
    jd = swe.julday(utc.year, utc.month, utc.day, utc.hour + utc.minute / 60 + utc.second / 3600)
    bodies = {}
    for key, sid in zip(BODIES, SWE_IDS):
        xx, _ = swe.calc_ut(jd, sid, FLAGS)
        bodies[key] = {"lon": round(xx[0], 6), "speed": round(xx[3], 6)}
    _, ascmc = swe.houses_ex(jd, place["lat"], place["lon"], b"W", swe.FLG_MOSEPH)
    return {
        "kind": kind,
        "date": {"y": y, "m": m, "d": d},
        "time": {"h": h, "mi": mi} if time else None,
        "place": place,
        "utc": utc.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "offset": offset,
        "bodies": bodies,
        "asc": round(ascmc[0], 6),
        "mc": round(ascmc[1], 6),
    }


def main():
    rng = random.Random(20261028)
    places = load_places()
    by = {(p["name"], p["state"]): p for p in places}
    out = []
    for _ in range(300):
        p = rng.choice(places)
        y = rng.randint(1930, 2025)
        start = datetime(y, 1, 1).toordinal()
        day = datetime.fromordinal(start + rng.randrange(366 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 365))
        out.append(case("random", p, y, day.month, day.day, (rng.randrange(24), rng.randrange(60))))

    ny, chi, la, den = by[("New York", "NY")], by[("Chicago", "IL")], by[("Los Angeles", "CA")], by[("Denver", "CO")]
    # DST change days: around the jump, inside the spring-forward gap and the fall-back hour.
    for p, (y, m, d) in [(ny, (1985, 4, 28)), (chi, (2010, 3, 14)), (la, (1999, 4, 4)), (den, (1966, 4, 24)), (ny, (2007, 3, 11))]:
        for t in [(1, 59), (2, 30), (3, 0), (3, 1)]:
            out.append(case("dst-spring", p, y, m, d, t))
    for p, (y, m, d) in [(ny, (1985, 10, 27)), (chi, (2010, 11, 7)), (la, (1999, 10, 31)), (den, (1975, 10, 26)), (ny, (2007, 11, 4))]:
        for t in [(0, 59), (1, 0), (1, 30), (1, 59), (2, 0)]:
            out.append(case("dst-fall", p, y, m, d, t))
    # 1974: year-round daylight time from January 6.
    for t in [(8, 0), (23, 30)]:
        out.append(case("dst-1974", ny, 1974, 1, 15, t))
        out.append(case("dst-1974", chi, 1974, 2, 20, t))
    # Near midnight, including year ends.
    for p, (y, m, d) in [(ny, (1999, 12, 31)), (la, (1969, 7, 20)), (chi, (2000, 1, 1)), (by[("Houston", "TX")], (1988, 2, 29))]:
        for t in [(0, 0), (0, 1), (23, 59)]:
            out.append(case("midnight", p, y, m, d, t))
    # Alaska (zones changed in 1967 and 1983), Hawaii (UTC-10:30 before 1947), Arizona, Indiana.
    for p in [by[("Anchorage", "AK")], by[("Fairbanks", "AK")], by[("Juneau", "AK")], by[("Honolulu", "HI")], by[("Hilo", "HI")]]:
        for (y, m, d, t) in [(1940, 6, 1, (6, 30)), (1965, 1, 10, (22, 15)), (1983, 11, 1, (3, 0)), (2001, 7, 4, (16, 45))]:
            out.append(case("alaska-hawaii", p, y, m, d, t))
    for p in [by[("Phoenix", "AZ")], by[("Tucson", "AZ")]]:
        for (y, m, d, t) in [(1967, 7, 1, (12, 0)), (1990, 7, 1, (12, 0)), (2020, 7, 1, (5, 5))]:
            out.append(case("arizona", p, y, m, d, t))
    for p in [by[("Indianapolis", "IN")], by[("Fort Wayne", "IN")], by[("Evansville", "IN")], by[("Gary", "IN")]]:
        for (y, m, d, t) in [(1960, 7, 1, (12, 0)), (1990, 7, 1, (12, 0)), (2010, 7, 1, (12, 0))]:
            out.append(case("indiana", p, y, m, d, t))
    # Unknown time (noon).
    for p, (y, m, d) in [(ny, (1990, 8, 15)), (by[("Honolulu", "HI")], (1955, 3, 3))]:
        out.append(case("unknown-time", p, y, m, d, None))

    path = os.path.join(ROOT, "test", "fixtures", "astro-swe.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"source": f"Swiss Ephemeris {swe.version} (Moshier), Python zoneinfo fold=0", "cases": out}, f, indent=0)
    print(f"{len(out)} cases, {len(places)} places -> {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
