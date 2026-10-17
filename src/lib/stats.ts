import { S } from "./store";
import { dayKey } from "./util";
import { DAY, REVIEW } from "./types";

let cache = { v: -1, map: new Map<string, number>() };

/** Number of answers per study day, keyed by dayKey(). */
export function dailyCounts(): Map<string, number> {
  if (cache.v === S.version) return cache.map;
  const map = new Map<string, number>();
  const h = S.settings.dayStartHour;
  for (const r of S.revlog) {
    const k = dayKey(r.time, h);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  cache = { v: S.version, map };
  return map;
}

/** Key for a calendar date (local), matching dayKey() of reviews done that day. */
export const calendarKey = (d: Date) =>
  dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), S.settings.dayStartHour);

/** Consecutive study days ending today (or yesterday if nothing yet today). */
export function streak(): number {
  const days = dailyCounts();
  const d = new Date();
  if (!days.has(calendarKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(calendarKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/**
 * True retention: of the reviews of mature/review-state cards in the last `days`,
 * the share you remembered (Hard/Good/Easy). Null when there is no data yet.
 */
export function trueRetention(days = 30): number | null {
  const from = Date.now() - days * DAY;
  let pass = 0, total = 0;
  for (let i = S.revlog.length - 1; i >= 0; i--) {
    const r = S.revlog[i];
    if (r.time < from) break;
    if (r.stateBefore !== REVIEW) continue;
    total++;
    if (r.rating >= 2) pass++;
  }
  return total ? Math.round((pass / total) * 1000) / 10 : null;
}

/** Reviews and distinct study days within the last `days`. */
export function periodSummary(days: number) {
  const from = Date.now() - days * DAY;
  const keys = new Set<string>();
  let reviews = 0;
  for (let i = S.revlog.length - 1; i >= 0; i--) {
    const r = S.revlog[i];
    if (r.time < from) break;
    reviews++;
    keys.add(dayKey(r.time, S.settings.dayStartHour));
  }
  return { reviews, daysStudied: keys.size };
}
