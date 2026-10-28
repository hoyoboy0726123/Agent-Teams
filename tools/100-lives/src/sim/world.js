// The world: US states and cities, jobs, places abroad, and everyday details by era. Events and actions share these.
import { interp } from "./rates.js";

// [postal code, state, births in thousands (CDC/NCHS, 2023, rounded), main cities, largest first]. Births weight
// where a random life is born and, as a stand-in for where people live, where they move.
export const STATES = [
  ["AL", "Alabama", 58, ["Birmingham", "Huntsville", "Montgomery", "Mobile"]], ["AK", "Alaska", 9.5, ["Anchorage", "Fairbanks"]],
  ["AZ", "Arizona", 77, ["Phoenix", "Tucson", "Mesa"]], ["AR", "Arkansas", 35, ["Little Rock", "Fayetteville"]],
  ["CA", "California", 420, ["Los Angeles", "San Diego", "San Jose", "San Francisco", "Sacramento", "Fresno", "Oakland"]],
  ["CO", "Colorado", 62, ["Denver", "Colorado Springs", "Aurora"]], ["CT", "Connecticut", 35, ["Bridgeport", "New Haven", "Hartford"]],
  ["DE", "Delaware", 11, ["Wilmington", "Dover"]], ["DC", "District of Columbia", 8, ["Washington"]],
  ["FL", "Florida", 224, ["Miami", "Jacksonville", "Tampa", "Orlando", "Tallahassee"]], ["GA", "Georgia", 126, ["Atlanta", "Savannah", "Augusta"]],
  ["HI", "Hawaii", 16, ["Honolulu", "Hilo"]], ["ID", "Idaho", 23, ["Boise", "Idaho Falls"]],
  ["IL", "Illinois", 123, ["Chicago", "Rockford", "Peoria", "Springfield"]], ["IN", "Indiana", 79, ["Indianapolis", "Fort Wayne", "Evansville"]],
  ["IA", "Iowa", 37, ["Des Moines", "Cedar Rapids"]], ["KS", "Kansas", 34, ["Wichita", "Overland Park", "Topeka"]],
  ["KY", "Kentucky", 53, ["Louisville", "Lexington"]], ["LA", "Louisiana", 56, ["New Orleans", "Baton Rouge", "Shreveport"]],
  ["ME", "Maine", 12, ["Portland", "Bangor"]], ["MD", "Maryland", 70, ["Baltimore", "Silver Spring"]],
  ["MA", "Massachusetts", 69, ["Boston", "Worcester", "Springfield"]], ["MI", "Michigan", 101, ["Detroit", "Grand Rapids", "Lansing", "Ann Arbor"]],
  ["MN", "Minnesota", 63, ["Minneapolis", "Saint Paul", "Duluth"]], ["MS", "Mississippi", 34, ["Jackson", "Gulfport"]],
  ["MO", "Missouri", 70, ["Kansas City", "St. Louis", "Springfield"]], ["MT", "Montana", 11, ["Billings", "Missoula"]],
  ["NE", "Nebraska", 24, ["Omaha", "Lincoln"]], ["NV", "Nevada", 33, ["Las Vegas", "Reno", "Henderson"]],
  ["NH", "New Hampshire", 12, ["Manchester", "Nashua"]], ["NJ", "New Jersey", 101, ["Newark", "Jersey City", "Paterson", "Trenton"]],
  ["NM", "New Mexico", 22, ["Albuquerque", "Las Cruces", "Santa Fe"]], ["NY", "New York", 205, ["New York", "Buffalo", "Rochester", "Syracuse", "Albany"]],
  ["NC", "North Carolina", 122, ["Charlotte", "Raleigh", "Greensboro", "Durham"]], ["ND", "North Dakota", 10, ["Fargo", "Bismarck"]],
  ["OH", "Ohio", 128, ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron"]], ["OK", "Oklahoma", 49, ["Oklahoma City", "Tulsa"]],
  ["OR", "Oregon", 39, ["Portland", "Eugene", "Salem"]], ["PA", "Pennsylvania", 129, ["Philadelphia", "Pittsburgh", "Allentown", "Erie"]],
  ["RI", "Rhode Island", 10, ["Providence"]], ["SC", "South Carolina", 57, ["Charleston", "Columbia", "Greenville"]],
  ["SD", "South Dakota", 11, ["Sioux Falls", "Rapid City"]], ["TN", "Tennessee", 81, ["Nashville", "Memphis", "Knoxville", "Chattanooga"]],
  ["TX", "Texas", 391, ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso"]], ["UT", "Utah", 46, ["Salt Lake City", "Provo"]],
  ["VT", "Vermont", 5, ["Burlington"]], ["VA", "Virginia", 96, ["Virginia Beach", "Richmond", "Norfolk", "Arlington"]],
  ["WA", "Washington", 82, ["Seattle", "Spokane", "Tacoma"]], ["WV", "West Virginia", 17, ["Charleston", "Huntington"]],
  ["WI", "Wisconsin", 60, ["Milwaukee", "Madison", "Green Bay"]], ["WY", "Wyoming", 6, ["Cheyenne", "Casper"]],
];
const BY_CODE = new Map(STATES.map(r => [r[0], r])), BY_NAME = new Map(STATES.map(r => [r[1].toLowerCase(), r]));
const rowOf = x => (x ? BY_CODE.get(String(x).toUpperCase()) || BY_NAME.get(String(x).toLowerCase()) || null : null);
// A state as its name ("Ohio") from a postal code or a name; null when it is not a US state.
export const stateName = x => (rowOf(x) ? rowOf(x)[1] : null);
export const stateCode = x => (rowOf(x) ? rowOf(x)[0] : null);
// [[state name, weight], …], the weighted-list shape 命盤人生's events use for moving.
export const COUNTIES = STATES.map(([, name, w]) => [name, w]);
// Census regions.
const REGIONS = {
  northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  midwest: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  south: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"],
  west: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"],
};
export const regionOf = x => { const c = stateCode(x); return Object.keys(REGIONS).find(r => REGIONS[r].includes(c)) || null; };
// A city of a state, the bigger ones likelier.
export const cityIn = (state, rng) => { const r = rowOf(state); return r ? rng.weighted(r[3].map((c, i) => [c, 1 / (i + 1)])) : null; };
// A random US birthplace: { state (name), city }, weighted by births.
export function randomBirthplace(rng) {
  const state = rng.weighted(COUNTIES);
  return { state, city: cityIn(state, rng) };
}
// Where you live, for a sentence: "Columbus, Ohio", or the country when you live abroad.
export const placeLabel = s => s.abroad || (s.city && s.cityState === s.county ? `${s.city}, ${s.county}` : s.county || "");

// Where Americans go to work abroad (design weights).
export const ABROAD = [["Canada", 2], ["the UK", 2], ["Germany", 1.2], ["Japan", 1], ["Mexico", 1], ["Australia", 0.8], ["China", 0.6], ["South Korea", 0.5], ["Singapore", 0.5], ["the Netherlands", 0.4], ["the United Arab Emirates", 0.4], ["Ireland", 0.4]];

// ---------- schooling ----------
// s.edu, the highest level reached (story/README.md): none, elementary, middle, high, ged, certificate, associate,
// bachelor, master, professional, doctorate.
export const EDU_ORDER = ["none", "elementary", "middle", "high", "ged", "certificate", "associate", "bachelor", "master", "professional", "doctorate"];
export const eduAtLeast = (edu, level) => EDU_ORDER.indexOf(edu) >= EDU_ORDER.indexOf(level);
export const EDU_WORDS = { none: "no schooling yet", elementary: "elementary school", middle: "middle school", high: "a high school diploma", ged: "a GED", certificate: "a trade certificate", associate: "an associate degree", bachelor: "a bachelor's degree", master: "a master's degree", professional: "a professional degree", doctorate: "a doctorate" };
// The job list a level of schooling opens.
export const tier = edu => ({ none: "basic", elementary: "basic", middle: "basic", high: "high", ged: "high", certificate: "trade", associate: "associate", bachelor: "college", master: "graduate", professional: "graduate", doctorate: "graduate" })[edu] || "basic";
// The college test of the year: the SAT (from 1926, used by most selective colleges by the 1950s) and the ACT (1959).
export const collegeTest = year => (year < 1959 ? "the SAT" : "the SAT or ACT");
export const exam18Name = collegeTest;

// ---------- jobs ----------
// Each job: { title, factor, field, edu, house, houses, weight, minAge, from, until }
//   factor  pay relative to the median full-time earnings (rates.js PAY_BY_AGE): the BLS Occupational Employment and
//           Wage Statistics median for the occupation (May 2023, approximately) over about $58,000
//   field   the sector          edu   the job list (tier) it is on, from the schooling it needs
//   house   the house of the chart it belongs to, for prep.jobFit (houses: the primary first, then a second one).
//           The convention shared with src/astro: 1 athletes and founders, 2 finance, 3 teaching, writing and local
//           errands, 4 real estate, home and land, 5 arts, entertainment and children, 6 health and service, 7 consulting
//           and sales, 8 insurance and research, 9 academia, law and travel, 10 executive and public roles, 11 tech and
//           community, 12 hospitals, prisons and charities
//   weight  how common it is within its list (design, from employment counts); a function of the year when the job
//           grows or fades     minAge  the youngest age (default 14; 18 for driving, building sites, security…)
//   from, until  the years the job exists under that title
export const HOUSE_THEMES = {
  1: "athletes and founders", 2: "finance", 3: "teaching, writing and communication", 4: "real estate, home and land",
  5: "arts, entertainment and children", 6: "health and service", 7: "consulting and sales", 8: "insurance and research",
  9: "academia, law and travel", 10: "executive and public roles", 11: "tech and community", 12: "hospitals and charities",
};
const J = (title, factor, field, house, more = {}) => ({ title, factor, field, house, houses: more.houses || [house], weight: 1, minAge: 14, ...more });
const fading = (until, before, after = 0.3) => year => (year < until ? before : after);
const growing = (from, before, after) => year => interp([[from, before], [from + 15, after]], year);
const LISTS = {
  basic: [
    J("cashier", 0.51, "retail", 6, { houses: [6, 2], weight: 2 }), J("fast-food worker", 0.49, "food service", 6, { weight: 2 }),
    J("dishwasher", 0.53, "food service", 6), J("line cook", 0.62, "food service", 6, { houses: [6, 5] }),
    J("farmworker", 0.59, "agriculture", 4, { houses: [4, 6], weight: fading(1975, 2, 0.6), minAge: 14 }),
    J("janitor", 0.6, "service", 6, { houses: [6, 12] }), J("housekeeper", 0.55, "service", 6, { houses: [6, 4] }),
    J("warehouse worker", 0.64, "logistics", 6, { houses: [6, 3], minAge: 18, weight: growing(1990, 0.6, 1.6) }),
    J("landscaper", 0.64, "construction", 4, { houses: [4, 6] }), J("construction laborer", 0.78, "construction", 4, { houses: [4, 1], minAge: 18 }),
    J("factory worker", 0.72, "manufacturing", 6, { houses: [6, 10], minAge: 18, weight: fading(1990, 3, 1) }),
    J("home health aide", 0.58, "health care", 6, { houses: [6, 12], minAge: 18, weight: growing(1990, 0.3, 1.5) }),
  ],
  high: [
    J("retail salesperson", 0.58, "retail", 7, { houses: [7, 6], weight: 2 }), J("server", 0.6, "food service", 6, { houses: [6, 5], weight: 1.5 }),
    J("secretary", 0.75, "office", 6, { houses: [6, 3], weight: fading(1995, 2.5, 0) , until: 1995 }),
    J("administrative assistant", 0.79, "office", 6, { houses: [6, 3], weight: 1.5, from: 1985 }),
    J("telephone operator", 0.6, "communications", 3, { until: 1985, weight: 0.8 }),
    J("customer service representative", 0.68, "office", 3, { houses: [3, 6], weight: growing(1985, 0.5, 1.5) }),
    J("bank teller", 0.64, "finance", 2, { houses: [2, 6] }), J("delivery driver", 0.69, "logistics", 3, { houses: [3, 6], minAge: 18 }),
    J("truck driver", 0.93, "logistics", 3, { houses: [3, 9], minAge: 21 }),
    J("rideshare driver", 0.6, "logistics", 3, { from: 2012, minAge: 21, weight: 0.6 }),
    J("electrician", 1.06, "construction", 4, { houses: [4, 11], minAge: 18 }), J("plumber", 1.06, "construction", 4, { houses: [4, 6], minAge: 18 }),
    J("carpenter", 0.97, "construction", 4, { houses: [4, 5], minAge: 18 }), J("auto mechanic", 0.82, "repair", 6, { houses: [6, 1] }),
    J("welder", 0.84, "manufacturing", 6, { houses: [6, 1], minAge: 18 }), J("machinist", 0.86, "manufacturing", 6, { houses: [6, 11], minAge: 18, weight: fading(1990, 1.5, 0.7) }),
    J("hairstylist", 0.6, "beauty", 5, { houses: [5, 6] }), J("bartender", 0.6, "food service", 5, { houses: [5, 6], minAge: 21 }),
    J("childcare worker", 0.52, "child care", 5, { houses: [5, 6], minAge: 16 }), J("personal trainer", 0.79, "fitness", 1, { houses: [1, 6], minAge: 18, from: 1975 }),
    J("security guard", 0.62, "security", 12, { houses: [12, 6], minAge: 18 }), J("correctional officer", 0.91, "public safety", 12, { houses: [12, 10], minAge: 18 }),
    J("police officer", 1.29, "public safety", 10, { houses: [10, 6], minAge: 21 }), J("firefighter", 0.98, "public safety", 1, { houses: [1, 10], minAge: 18 }),
    J("mail carrier", 0.97, "government", 3, { houses: [3, 10], minAge: 18 }), J("EMT", 0.67, "health care", 6, { houses: [6, 12], minAge: 18, from: 1970 }),
    J("real estate agent", 0.93, "real estate", 4, { houses: [4, 7], minAge: 18 }), J("insurance agent", 1.02, "insurance", 8, { houses: [8, 7], minAge: 18 }),
    J("store manager", 0.83, "retail", 10, { houses: [10, 7], minAge: 18, weight: 0.8 }), J("medical assistant", 0.72, "health care", 6, { minAge: 18 }),
    J("flight attendant", 1.17, "travel", 9, { houses: [9, 6], minAge: 18, weight: 0.4 }),
    J("musician", 0.7, "arts", 5, { weight: 0.15 }), J("professional athlete", 1.4, "sports", 1, { houses: [1, 5], weight: 0.03, minAge: 18 }),
  ],
  trade: [
    J("electrician", 1.06, "construction", 4, { houses: [4, 11], minAge: 18 }), J("HVAC technician", 0.98, "construction", 4, { houses: [4, 6], minAge: 18, from: 1960 }),
    J("welder", 0.84, "manufacturing", 6, { houses: [6, 1], minAge: 18 }), J("licensed practical nurse", 1.0, "health care", 6, { houses: [6, 12], minAge: 18 }),
    J("cosmetologist", 0.62, "beauty", 5, { houses: [5, 6] }), J("auto technician", 0.85, "repair", 6, { houses: [6, 1] }),
    J("plumber", 1.06, "construction", 4, { houses: [4, 6], minAge: 18 }), J("dental assistant", 0.79, "health care", 6, { minAge: 18 }),
  ],
  associate: [
    J("registered nurse", 1.48, "health care", 6, { houses: [6, 12], weight: 2 }), J("dental hygienist", 1.51, "health care", 6),
    J("paralegal", 1.03, "law", 9, { houses: [9, 6], from: 1970 }), J("radiologic technologist", 1.26, "health care", 6, { houses: [6, 8] }),
    J("computer support specialist", 1.03, "tech", 11, { houses: [11, 6], from: 1980 }), J("web developer", 1.45, "tech", 11, { houses: [11, 5], from: 1996 }),
    J("respiratory therapist", 1.33, "health care", 6), J("preschool teacher", 0.64, "education", 5, { houses: [5, 3] }),
    J("veterinary technician", 0.74, "health care", 6), J("physical therapist assistant", 1.1, "health care", 6, { from: 1970 }),
    J("drafter", 1.07, "engineering", 4, { houses: [4, 11] }), J("funeral director", 1.05, "service", 8, { houses: [8, 12], weight: 0.3 }),
  ],
  college: [
    J("software developer", 2.28, "tech", 11, { from: 1985, weight: growing(1985, 0.5, 2.5) }), J("computer programmer", 1.7, "tech", 11, { from: 1960, until: 1990 }),
    J("accountant", 1.38, "finance", 2, { houses: [2, 6], weight: 1.5 }), J("elementary school teacher", 1.1, "education", 3, { houses: [3, 5], weight: 2 }),
    J("high school teacher", 1.12, "education", 3, { houses: [3, 9], weight: 1.5 }), J("marketing specialist", 1.17, "marketing", 7, { houses: [7, 3] }),
    J("financial analyst", 1.71, "finance", 2, { houses: [2, 8] }), J("civil engineer", 1.65, "engineering", 11, { houses: [11, 4] }),
    J("mechanical engineer", 1.72, "engineering", 11, { houses: [11, 6] }), J("graphic designer", 1.02, "design", 5, { houses: [5, 11] }),
    J("reporter", 0.98, "media", 3, { houses: [3, 9] }), J("social worker", 1.0, "social services", 12, { houses: [12, 11] }),
    J("HR specialist", 1.17, "office", 7, { houses: [7, 6] }), J("sales representative", 1.28, "sales", 7, { weight: 1.5 }),
    J("management consultant", 1.71, "consulting", 7, { houses: [7, 10] }), J("loan officer", 1.19, "finance", 2, { houses: [2, 7] }),
    J("insurance underwriter", 1.33, "insurance", 8, { houses: [8, 2] }), J("data analyst", 1.44, "tech", 8, { houses: [8, 11], from: 1990 }),
    J("event planner", 0.97, "hospitality", 5, { houses: [5, 7] }), J("public relations specialist", 1.16, "marketing", 7, { houses: [7, 3] }),
    J("operations manager", 1.74, "management", 10, { houses: [10, 6] }), J("project manager", 1.69, "management", 10, { houses: [10, 11] }),
    J("video editor", 1.14, "media", 5, { houses: [5, 11] }), J("actuary", 2.07, "insurance", 8, { houses: [8, 2], weight: 0.3 }),
    J("urban planner", 1.4, "government", 4, { houses: [4, 10], weight: 0.4 }), J("nonprofit program coordinator", 0.86, "nonprofit", 11, { houses: [11, 12] }),
    J("translator", 0.98, "language", 9, { houses: [9, 3], weight: 0.4 }), J("airline pilot", 3.78, "travel", 9, { houses: [9, 1], weight: 0.15, minAge: 23 }),
    J("actor", 0.9, "arts", 5, { weight: 0.1 }),
  ],
  graduate: [
    J("lawyer", 2.51, "law", 9, { houses: [9, 7], weight: 1.5 }), J("physician", 4.12, "health care", 6, { houses: [6, 10], minAge: 26 }),
    J("pharmacist", 2.34, "health care", 6, { houses: [6, 12] }), J("professor", 1.45, "academia", 9, { houses: [9, 3] }),
    J("medical scientist", 1.72, "research", 8, { houses: [8, 12] }), J("clinical psychologist", 1.66, "health care", 8, { houses: [8, 12] }),
    J("architect", 1.6, "design", 4, { houses: [4, 10] }), J("physical therapist", 1.72, "health care", 6),
    J("data scientist", 1.86, "tech", 11, { houses: [11, 8], from: 2010 }), J("economist", 1.98, "research", 2, { houses: [2, 9], weight: 0.4 }),
    J("librarian", 1.1, "education", 3, { houses: [3, 9] }), J("nurse practitioner", 2.17, "health care", 6, { houses: [6, 12], from: 1975 }),
    J("school principal", 1.78, "education", 10, { houses: [10, 3] }), J("veterinarian", 2.05, "health care", 6, { weight: 0.5 }),
    J("financial manager", 2.69, "finance", 2, { houses: [2, 10] }), J("hospital administrator", 1.9, "health care", 12, { houses: [12, 10] }),
    J("mental health counselor", 0.93, "health care", 12, { houses: [12, 8] }), J("school counselor", 1.06, "education", 3, { houses: [3, 12] }),
  ],
};
export const JOBS = LISTS;
// Jobs set by a storyline rather than drawn from a list.
export const SPECIAL_JOBS = {
  government: J("government clerk", 0.9, "government", 10, { houses: [10, 6] }),
  federal: J("federal program analyst", 1.4, "government", 10, { houses: [10, 11] }),
  familyBusiness: J("the family business", 0.8, "family business", 4, { houses: [4, 2] }),
  ownBusiness: J("small-business owner", 1.0, "self-employed", 1, { houses: [1, 10] }),
  military: J("soldier", 0.7, "military", 6, { houses: [6, 1], minAge: 17 }),
};
// A branch of the armed forces (by size; the Space Force from 2020).
export const BRANCHES = year => [["the Army", 4], ["the Navy", 2.5], ["the Air Force", 2], ["the Marine Corps", 1.2], ["the Coast Guard", 0.3], ...(year >= 2020 ? [["the Space Force", 0.05]] : [])];
export function militaryJob(rng, year) {
  const branch = rng.weighted(BRANCHES(year));
  const title = { "the Army": "soldier", "the Navy": "sailor", "the Air Force": "airman", "the Marine Corps": "Marine", "the Coast Guard": "Coast Guardsman", "the Space Force": "guardian" }[branch];
  return { ...SPECIAL_JOBS.military, title, branch };
}

const exists = (j, year) => (j.from === undefined || year >= j.from) && (j.until === undefined || year < j.until);
const weightAt = (j, year) => Math.max(0, typeof j.weight === "function" ? j.weight(year) : j.weight ?? 1);
// The jobs open to this person now: their schooling's list, the jobs of their era, at their age (a minor cannot
// drive a truck or work a building site).
export function jobsFor(s, list = JOBS[tier(s.edu)]) {
  const year = s.year ?? 2024;
  const now = list.filter(j => exists(j, year) && weightAt(j, year) > 0);
  const open = now.filter(j => s.age >= (j.minAge ?? 14));
  return open.length ? open : now.length ? now : list;
}
// How a job fits this chart, −1..1 (prep.jobFit, src/astro), and how much likelier that makes it: 2^fit, so between
// half and twice as likely, the same bound as a year's tilt.
export const fitOf = (ctx, job) => (ctx && typeof ctx.jobFit === "function" ? ctx.jobFit(job) : 0);
export const fitWeight = fit => Math.pow(2, Math.max(-1, Math.min(1, fit || 0)));
// A job for this person: likelier when it is common and when it fits the chart.
export function pickJob(s, ctx, list = JOBS[tier(s.edu)]) {
  const year = s.year ?? 2024;
  return ctx.rng.weighted(jobsFor(s, list).map(j => [j, weightAt(j, year) * fitWeight(fitOf(ctx, j))]));
}
// "$", "$$", "$$$" or "$$$$", from the job's pay.
export const payBand = job => (job.factor < 0.75 ? "$" : job.factor < 1.25 ? "$$" : job.factor < 2 ? "$$$" : "$$$$");
// The hint under a job offer: its sector and pay band, and a word when it clearly suits the chart or not.
export function jobHint(ctx, job) {
  const fit = fitOf(ctx, job);
  return `${job.field} · ${payBand(job)}${fit >= 0.35 ? " · in tune with your chart" : fit <= -0.35 ? " · against your chart's grain" : ""}`;
}

// Pay relative to the median: job, age (BLS medians by age), career level, and luck of the draw.
export const wage = (s, factor, ctx) => Math.max(0.3, factor * interp(ctx.R.PAY_BY_AGE, s.age) * (1 + 0.12 * s.career) * Math.exp(0.15 * ctx.rng.normal()));

// A job in the engine's shape, from a job entry (or an old-style [title, factor, field, house] list).
const asJob = j => (Array.isArray(j) ? J(j[0], j[1], j[2], j[3] || 6) : j);
export function setJob(s, ctx, job, { pay = 1 } = {}) {
  const j = asJob(job);
  s.employed = true; s.unemployedFor = 0;
  s.job = { title: j.title, factor: j.factor, field: j.field, house: j.house, houses: j.houses, since: s.age, ...(j.branch ? { branch: j.branch } : {}) };
  s.income = wage(s, j.factor, ctx) * pay;
  return j.title;
}
export function startJob(s, ctx, pick = null) {
  const title = setJob(s, ctx, pick || pickJob(s, ctx));
  s.done.add("firstJob");   // however the first job came, the "first job" choice is behind you
  if (s.home === "parents" && s.age >= 21 && ctx.rng.chance(0.4)) s.home = "rent";
  return title;
}
// Another job of the same schooling, likelier when it fits the chart.
export function otherJob(s, ctx) {
  return pickJob(s, ctx, JOBS[tier(s.edu)].filter(j => !s.job || j.title !== s.job.title));
}
// Moving to another state (or one of `options`, [[state, weight], …]): sets the state and a city in it, and returns
// the place for a sentence ("Denver, Colorado").
export function moveTo(s, ctx, options = null) {
  const list = (options || COUNTIES).filter(([c]) => c !== s.county);
  const pick = ctx.rng.weighted(list);
  s.county = stateName(pick) || pick;
  s.city = cityIn(s.county, ctx.rng); s.cityState = s.county;
  return placeLabel(s);
}
export const yearsMarried = s => (s.since === null || s.since === undefined ? 0 : s.age - s.since);

// Brothers and sisters already born and still alive, at least `minAge` years old.
export const bornSiblings = (s, minAge = 0) => s.siblings.list.filter(x => x.born && x.alive !== false && s.age - x.bornAt >= minAge);

// ---------- everyday details by era, for the wording ----------
// How people kept in touch: a noun phrase ("We talked on {chat} every night").
export function chatTool(year) {
  if (year < 1960) return "letters";
  if (year < 1997) return "the phone";
  if (year < 2006) return "AIM";
  if (year < 2012) return "texts";
  return "the group chat";
}
export const TRIP_PLACES = {
  home: ["the Grand Canyon", "Yellowstone", "the Jersey Shore", "Lake Tahoe", "Myrtle Beach", "the Outer Banks", "Niagara Falls", "Yosemite", "Nashville", "New Orleans", "Las Vegas", "the Smoky Mountains", "Cape Cod", "San Diego", "Key West", "Chicago", "New York City"],
  abroad: ["Cancún", "London", "Paris", "Rome", "Toronto", "the Bahamas", "Ireland", "Mexico City", "Barcelona", "Tokyo", "Costa Rica", "Iceland"],
};
// A trip: abroad more often in later decades (design); Disney World from 1971, Disneyland from 1955.
export function tripPlace(s, ctx) {
  const abroadShare = interp([[1955, 0.08], [1980, 0.18], [2000, 0.3], [2020, 0.35]], s.year);
  if (ctx.rng() < abroadShare) return ctx.rng.pick(TRIP_PLACES.abroad);
  const home = [...TRIP_PLACES.home, ...(s.year >= 1971 ? ["Disney World"] : []), ...(s.year >= 1955 ? ["Disneyland"] : [])];
  return ctx.rng.pick(home);
}
