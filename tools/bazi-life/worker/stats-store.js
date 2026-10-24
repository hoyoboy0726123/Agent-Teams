// The daily totals of worker/stats.js, in a SQLite-backed Durable Object (one instance, named "all"). It is part of the
// Worker's own deploy, so no separate database has to be created.
import { DurableObject } from "cloudflare:workers";

export class StatsStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS daily (day TEXT NOT NULL, page TEXT NOT NULL, metric TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, page, metric))");
  }
  // { day, page, counts: { metric: n } }
  add({ day, page, counts }) {
    for (const [metric, n] of Object.entries(counts)) {
      this.ctx.storage.sql.exec("INSERT INTO daily (day, page, metric, n) VALUES (?, ?, ?, ?) ON CONFLICT (day, page, metric) DO UPDATE SET n = n + excluded.n", day, page, metric, n);
    }
  }
  // Every row from `from` (a date) on.
  read(from) {
    return this.ctx.storage.sql.exec("SELECT day, page, metric, n FROM daily WHERE day >= ? ORDER BY day", from).toArray();
  }
}
