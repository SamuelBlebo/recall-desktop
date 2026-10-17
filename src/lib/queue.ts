import { S } from "./store";
import { dayEnd, dayStart } from "./util";
import { LEARNING, NEW, RELEARNING, REVIEW, DAY, MIN, type Card } from "./types";

const isLearning = (c: Card) => c.state === LEARNING || c.state === RELEARNING;

/** How many new/review answers were already given today, per deck. Cached per collection version. */
let cache = { v: -1, start: 0, newDone: new Map<number, number>(), revDone: new Map<number, number>(), total: 0 };
function todayDone() {
  const start = dayStart(S.settings.dayStartHour);
  if (cache.v === S.version && cache.start === start) return cache;
  const newDone = new Map<number, number>();
  const revDone = new Map<number, number>();
  let total = 0;
  for (let i = S.revlog.length - 1; i >= 0; i--) {
    const r = S.revlog[i];
    if (r.time < start) break;
    total++;
    const m = r.stateBefore === NEW ? newDone : revDone;
    m.set(r.deckId, (m.get(r.deckId) ?? 0) + 1);
  }
  cache = { v: S.version, start, newDone, revDone, total };
  return cache;
}
export const reviewedToday = () => todayDone().total;

const sumFor = (m: Map<number, number>, ids: Set<number>) => {
  let n = 0;
  for (const [k, v] of m) if (ids.has(k)) n += v;
  return n;
};

export interface Counts {
  newCount: number;
  learn: number;
  due: number;
}

/** New / learning / due counts for a set of decks, after daily limits. */
export function counts(ids: Set<number>): Counts {
  const end = dayEnd(S.settings.dayStartHour);
  let n = 0, l = 0, r = 0;
  for (const c of S.cards) {
    if (c.suspended || !ids.has(c.deckId)) continue;
    if (c.state === NEW) n++;
    else if (isLearning(c)) l++;
    else if (c.due <= end) r++;
  }
  const done = todayDone();
  return {
    newCount: Math.max(0, Math.min(n, S.settings.newPerDay - sumFor(done.newDone, ids))),
    learn: l,
    due: Math.max(0, Math.min(r, S.settings.reviewsPerDay - sumFor(done.revDone, ids))),
  };
}

/**
 * Picks the next card: learning cards that are due → reviews → new cards →
 * learning cards due within 20 min → cards skipped as "don't know" (always last).
 */
export function pickNext(ids: Set<number>, opts: { ahead: boolean; exclude?: number }): Card | null {
  const now = Date.now();
  const end = opts.ahead ? now + 3 * DAY : dayEnd(S.settings.dayStartHour);
  const pool = S.cards.filter((c) => !c.suspended && ids.has(c.deckId) && c.id !== opts.exclude);
  const byDue = (a: Card, b: Card) => a.due - b.due;
  const k = counts(ids);

  let pick = pool.filter((c) => isLearning(c) && !c.skipped && c.due <= now).sort(byDue)[0];
  if (pick) return pick;
  if (k.due > 0 || opts.ahead) {
    pick = pool.filter((c) => c.state === REVIEW && !c.skipped && c.due <= end).sort(byDue)[0];
    if (pick) return pick;
  }
  if (k.newCount > 0) {
    pick = pool.filter((c) => c.state === NEW && !c.skipped).sort((a, b) => a.id - b.id)[0];
    if (pick) return pick;
  }
  pick = pool.filter((c) => isLearning(c) && !c.skipped && c.due <= now + 20 * MIN).sort(byDue)[0];
  if (pick) return pick;
  pick = pool.filter((c) => c.skipped).sort(byDue)[0];
  return pick ?? (opts.exclude ? S.cards.find((c) => c.id === opts.exclude && c.skipped) ?? null : null);
}

/** Next time something in these decks becomes due (for the "finished" screen). */
export function nextDueAfterNow(ids: Set<number>): number | null {
  let best: number | null = null;
  const now = Date.now();
  for (const c of S.cards) {
    if (c.suspended || !ids.has(c.deckId) || c.state === NEW || c.due <= now) continue;
    if (best === null || c.due < best) best = c.due;
  }
  return best;
}
