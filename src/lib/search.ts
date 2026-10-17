import { S, deckWithChildren, deckFullName } from "./store";
import { stripCloze } from "./cloze";
import { dayEnd } from "./util";
import { LEARNING, NEW, RELEARNING, REVIEW, DAY, type Card, type Note } from "./types";

type Test = (c: Card, n: Note) => boolean;

/** Splits a query into terms, keeping "quoted phrases" together. */
function tokens(q: string): string[] {
  return [...q.matchAll(/-?(?:[a-z]+:)?"[^"]*"|\S+/gi)].map((m) => m[0]);
}

function cmp(expr: string, value: number): boolean {
  const m = expr.match(/^(<=|>=|<|>|=)?(-?\d+(?:\.\d+)?)$/);
  if (!m) return false;
  const x = Number(m[2]);
  switch (m[1] || "=") {
    case "<": return value < x;
    case ">": return value > x;
    case "<=": return value <= x;
    case ">=": return value >= x;
    default: return value === x;
  }
}

/**
 * Anki-style search. Supports: plain words, "phrases", -negation,
 * deck:Name (use _ for spaces, includes subdecks), tag:name, is:new|learn|review|due|suspended|flagged|skipped|leech,
 * lapses:>=3, reps:>5, ivl:>=30, added:7 (last 7 days), rated:1 (answered in last N days), front:/back: text.
 */
export function compileQuery(q: string): Test {
  const tests: Test[] = [];
  for (let tok of tokens(q.trim())) {
    let neg = false;
    if (tok.startsWith("-") && tok.length > 1) {
      neg = true;
      tok = tok.slice(1);
    }
    const i = tok.indexOf(":");
    const key = i > 0 ? tok.slice(0, i).toLowerCase() : "";
    let val = (i > 0 ? tok.slice(i + 1) : tok).replace(/^"|"$/g, "");
    let t: Test;
    switch (key) {
      case "deck": {
        const want = val.replace(/_/g, " ").toLowerCase();
        const roots = S.decks.filter((d) => d.name.toLowerCase() === want || deckFullName(d.id).toLowerCase() === want);
        const ids = new Set<number>();
        roots.forEach((r) => deckWithChildren(r.id).forEach((x) => ids.add(x)));
        t = (c) => ids.has(c.deckId);
        break;
      }
      case "tag": {
        const w = val.toLowerCase().replace(/\*$/, "");
        t = (_c, n) => n.tags.some((x) => x.toLowerCase() === w || x.toLowerCase().startsWith(w + "::") || (val.endsWith("*") && x.toLowerCase().startsWith(w)));
        break;
      }
      case "is": {
        const v = val.toLowerCase();
        const end = dayEnd(S.settings.dayStartHour);
        t = (c, n) =>
          v === "new" ? c.state === NEW
          : v === "learn" ? c.state === LEARNING || c.state === RELEARNING
          : v === "review" ? c.state === REVIEW
          : v === "due" ? c.state !== NEW && c.due <= end && !c.suspended
          : v === "suspended" ? c.suspended
          : v === "flagged" ? c.flag > 0
          : v === "skipped" ? c.skipped
          : v === "leech" ? n.tags.includes("leech")
          : false;
        break;
      }
      case "lapses": t = (c) => cmp(val, c.lapses); break;
      case "reps": t = (c) => cmp(val, c.reps); break;
      case "ivl": t = (c) => c.state === REVIEW && cmp(val, c.scheduledDays); break;
      case "added": {
        const since = Date.now() - Number(val) * DAY;
        t = (_c, n) => n.created >= since;
        break;
      }
      case "rated": {
        const since = Date.now() - Number(val) * DAY;
        t = (c) => c.lastReview != null && c.lastReview >= since;
        break;
      }
      case "front": { const w = val.toLowerCase(); t = (_c, n) => stripCloze(n.front).toLowerCase().includes(w); break; }
      case "back": { const w = val.toLowerCase(); t = (_c, n) => n.back.toLowerCase().includes(w); break; }
      default: {
        const w = (key ? tok : val).replace(/^"|"$/g, "").toLowerCase();
        t = (_c, n) => (stripCloze(n.front) + "\n" + n.back + "\n" + n.tags.join(" ")).toLowerCase().includes(w);
        val = w;
      }
    }
    tests.push(neg ? (c, n) => !t(c, n) : t);
  }
  return (c, n) => tests.every((f) => f(c, n));
}

export function searchCards(q: string): Card[] {
  const test = compileQuery(q);
  return S.cards.filter((c) => {
    const n = S.notes.get(c.noteId);
    return n ? test(c, n) : false;
  });
}
