// Schedules for automations: daily / weekly / monthly / interval / cron, evaluated in the
// workspace time zone. The scheduler checks once a minute whether "now" matches.

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseField(field, min, max) {
  const out = new Set();
  for (const part of String(field).split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? Number(stepStr) : 1;
    let lo = min, hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-').map((x) => (DAYS.includes(x.toLowerCase()) ? DAYS.indexOf(x.toLowerCase()) : Number(x)));
      lo = a; hi = b ?? (stepStr ? max : a);
    }
    if (![lo, hi, step].every(Number.isFinite) || lo < min || hi > max || step < 1) throw new Error(`Invalid cron field "${field}"`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) throw new Error('Cron needs 5 fields: minute hour day-of-month month day-of-week');
  const dow = parseField(f[4].replace(/7/g, '0'), 0, 6);
  return { minute: parseField(f[0], 0, 59), hour: parseField(f[1], 0, 23), dom: parseField(f[2], 1, 31), month: parseField(f[3], 1, 12), dow, domAny: f[2] === '*', dowAny: f[4] === '*' };
}

// Wall-clock parts of a Date in a time zone.
export function zoned(date, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour % 24, minute: +parts.minute, dow: DAYS.indexOf(parts.weekday.slice(0, 3).toLowerCase()) };
}

// Normalise any schedule into a cron expression (interval handled separately).
export function toCron(s) {
  if (!s) return null;
  const [h, m] = String(s.time || '09:00').split(':').map(Number);
  switch (s.kind) {
    case 'daily': return `${m} ${h} * * ${s.days?.length && s.days.length < 7 ? s.days.join(',') : '*'}`;
    case 'weekly': return `${m} ${h} * * ${s.day ?? 1}`;
    case 'monthly': return `${m} ${h} ${s.date ?? 1} * *`;
    case 'cron': return s.expr;
    default: return null;
  }
}

export function validateSchedule(s) {
  if (!s) return null;
  if (s.kind === 'interval') {
    const minutes = Math.max(5, Math.min(Number(s.minutes) || 60, 60 * 24 * 31));
    return { kind: 'interval', minutes };
  }
  if (!['daily', 'weekly', 'monthly', 'cron'].includes(s.kind)) throw Object.assign(new Error('Unknown schedule kind'), { status: 400 });
  if (s.kind !== 'cron' && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(s.time || '')) throw Object.assign(new Error('Time must be HH:MM'), { status: 400 });
  try { parseCron(toCron(s)); } catch (e) { throw Object.assign(new Error(e.message), { status: 400 }); }
  const out = { kind: s.kind };
  if (s.kind === 'cron') out.expr = String(s.expr).trim();
  else out.time = s.time;
  if (s.kind === 'daily' && Array.isArray(s.days)) out.days = [...new Set(s.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  if (s.kind === 'weekly') out.day = Math.min(Math.max(Number(s.day) || 0, 0), 6);
  if (s.kind === 'monthly') out.date = Math.min(Math.max(Number(s.date) || 1, 1), 28);
  return out;
}

export function matches(schedule, date, tz) {
  const cron = toCron(schedule);
  if (!cron) return false;
  const c = parseCron(cron);
  const z = zoned(date, tz);
  if (!c.minute.has(z.minute) || !c.hour.has(z.hour) || !c.month.has(z.month)) return false;
  const domOk = c.dom.has(z.day), dowOk = c.dow.has(z.dow);
  if (c.domAny && c.dowAny) return true;
  if (c.domAny) return dowOk;
  if (c.dowAny) return domOk;
  return domOk || dowOk; // standard cron semantics
}

// Unique key for the minute a schedule fired, so a run happens at most once per slot.
export const minuteKey = (date, tz) => { const z = zoned(date, tz); return `${z.year}-${z.month}-${z.day} ${z.hour}:${z.minute}`; };

export function nextRuns(schedule, { tz, from = new Date(), count = 3, lastRunAt = null } = {}) {
  if (!schedule) return [];
  if (schedule.kind === 'interval') {
    const start = lastRunAt ? lastRunAt + schedule.minutes * 60_000 : from.getTime();
    return Array.from({ length: count }, (_, i) => new Date(Math.max(start, from.getTime()) + i * schedule.minutes * 60_000));
  }
  const out = [];
  const t = new Date(Math.ceil((from.getTime() + 1) / 60_000) * 60_000);
  for (let i = 0; i < 60 * 24 * 62 && out.length < count; i++, t.setTime(t.getTime() + 60_000)) {
    if (matches(schedule, t, tz)) out.push(new Date(t));
  }
  return out;
}

export function describe(s, lang = 'zh') {
  if (!s) return lang === 'zh' ? '手動執行' : 'Manual';
  const zhDays = ['日', '一', '二', '三', '四', '五', '六'];
  const enDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const d = lang === 'zh' ? zhDays : enDays;
  switch (s.kind) {
    case 'interval': return lang === 'zh' ? `每 ${s.minutes} 分鐘` : `Every ${s.minutes} min`;
    case 'daily': {
      const days = s.days?.length && s.days.length < 7 ? (s.days.join(',') === '1,2,3,4,5' ? (lang === 'zh' ? '平日' : 'Weekdays') : s.days.map((x) => d[x]).join(lang === 'zh' ? '、' : ', ')) : (lang === 'zh' ? '每天' : 'Daily');
      return `${days} ${s.time}`;
    }
    case 'weekly': return lang === 'zh' ? `每週${d[s.day]} ${s.time}` : `Weekly on ${d[s.day]} ${s.time}`;
    case 'monthly': return lang === 'zh' ? `每月 ${s.date} 日 ${s.time}` : `Monthly on day ${s.date} ${s.time}`;
    case 'cron': return `cron: ${s.expr}`;
    default: return '';
  }
}
