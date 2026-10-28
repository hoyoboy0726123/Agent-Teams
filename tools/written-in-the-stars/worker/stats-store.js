// The daily totals of worker/stats.js, the heartbeats of the last minutes and the last finished lives, in a
// SQLite-backed Durable Object (one instance, named "all"), as in bazi-life. It is part of the Worker's own deploy,
// so no separate database has to be created.
import { DurableObject } from "cloudflare:workers";

const BEAT_WINDOW = 90e3, BEAT_KEEP = 10 * 60e3, LIVES_KEEP = 500;
export class StatsStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS daily (day TEXT NOT NULL, page TEXT NOT NULL, metric TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, page, metric))");
    sql.exec("CREATE TABLE IF NOT EXISTS beats (ts INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS lives (ts INTEGER NOT NULL, day TEXT NOT NULL, decade TEXT NOT NULL, sun TEXT NOT NULL, age INTEGER NOT NULL, married INTEGER NOT NULL, home INTEGER NOT NULL, kids INTEGER NOT NULL)");
  }
  // { day, page, counts: { metric: n }, life?, now? }
  add({ day, page, counts, life, now = Date.now() }) {
    const sql = this.ctx.storage.sql;
    for (const [metric, n] of Object.entries(counts)) {
      if (metric === "beat") { for (let i = 0; i < n; i++) sql.exec("INSERT INTO beats (ts) VALUES (?)", now); continue; }
      sql.exec("INSERT INTO daily (day, page, metric, n) VALUES (?, ?, ?, ?) ON CONFLICT (day, page, metric) DO UPDATE SET n = n + excluded.n", day, page, metric, n);
    }
    if (life) {
      sql.exec("INSERT INTO lives (ts, day, decade, sun, age, married, home, kids) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", now, day, life.decade, life.sun, life.age, life.married, life.home, life.kids);
      sql.exec("DELETE FROM lives WHERE ts < (SELECT ts FROM lives ORDER BY ts DESC LIMIT 1 OFFSET ?)", LIVES_KEEP);
    }
    if (counts.beat) sql.exec("DELETE FROM beats WHERE ts < ?", now - BEAT_KEEP);
  }
  // Every row from `from` (a date) on.
  read(from) {
    return this.ctx.storage.sql.exec("SELECT day, page, metric, n FROM daily WHERE day >= ? ORDER BY day", from).toArray();
  }
  // For the welcome page: lives finished in all, today's, pages beating in the last 90 s, the last few lives.
  live(day, now = Date.now()) {
    const sql = this.ctx.storage.sql, one = q => (q.toArray()[0] || {});
    return {
      total: Number(one(sql.exec("SELECT COALESCE(SUM(n), 0) AS n FROM daily WHERE metric = 'end'")).n) || 0,
      todayEnds: Number(one(sql.exec("SELECT COALESCE(SUM(n), 0) AS n FROM daily WHERE metric = 'end' AND day = ?", day)).n) || 0,
      beats: Number(one(sql.exec("SELECT COUNT(*) AS n FROM beats WHERE ts >= ?", now - BEAT_WINDOW)).n) || 0,
      lives: sql.exec("SELECT decade, sun, age, married, home, kids FROM lives WHERE day = ?", day).toArray(),
      recent: sql.exec("SELECT ts, decade, sun, age, married, home, kids FROM lives ORDER BY ts DESC LIMIT 5").toArray(),
    };
  }
}
