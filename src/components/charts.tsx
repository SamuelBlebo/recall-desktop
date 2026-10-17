import type { JSX } from "react";
import { S, deckWithChildren, useStore } from "../lib/store";
import { counts, reviewedToday } from "../lib/queue";
import { recallChance } from "../lib/scheduler";
import { stripCloze } from "../lib/cloze";
import { calendarKey, dailyCounts, periodSummary, streak, trueRetention } from "../lib/stats";
import { REVIEW } from "../lib/types";
import { go } from "./ui";

/* ---------------- heatmap ---------------- */

/** GitHub-style grid: one square per day, darker = more reviews. Default 17 weeks ≈ one semester. */
export function Heatmap({ weeks = 17, cell = 11, maxWidth }: { weeks?: number; cell?: number; maxWidth?: number }) {
  const days = dailyCounts();
  const gap = 3, step = cell + gap, top = 16, left = 28;
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - 7 * (weeks - 1));
  let max = 1;
  days.forEach((v) => (max = Math.max(max, v)));
  const rects: JSX.Element[] = [];
  const months: JSX.Element[] = [];
  let lastMonth = -1, lastLabel = -9;
  for (let w = 0; w < weeks; w++) {
    const wd = new Date(start);
    wd.setDate(start.getDate() + w * 7);
    if (wd.getMonth() !== lastMonth) {
      lastMonth = wd.getMonth();
      if (w - lastLabel >= 2) {
        months.push(<text key={"m" + w} x={left + w * step} y={10}>{wd.toLocaleString("en", { month: "short" })}</text>);
        lastLabel = w;
      }
    }
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      if (dt > today) continue;
      const v = days.get(calendarKey(dt)) ?? 0;
      rects.push(
        <rect key={`${w}-${d}`} x={left + w * step} y={top + d * step} width={cell} height={cell} rx={3}
          fill={v ? "var(--good)" : "var(--panel2)"} fillOpacity={v ? 0.25 + (0.75 * v) / max : 1}>
          <title>{`${dt.toDateString()}: ${v} review${v === 1 ? "" : "s"}`}</title>
        </rect>,
      );
    }
  }
  const W = left + weeks * step, H = top + 7 * step;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} {...(maxWidth ? { style: { width: "100%", maxWidth } } : { width: W, height: H })} role="img" aria-label="Review activity heatmap">
      {months}
      {["", "Mon", "", "Wed", "", "Fri", ""].map((l, i) => <text key={"d" + i} x={0} y={top + i * step + 9}>{l}</text>)}
      {rects}
    </svg>
  );
}

/* ---------------- recall dots ---------------- */

const BAND_COL = { crit: "var(--again)", risk: "var(--hard)", below: "var(--easy)", ok: "var(--good)" } as const;
const BAND_LAB = { crit: "Critical", risk: "At risk", below: "Below target", ok: "On target" } as const;
type Band = keyof typeof BAND_COL;

/** One dot per review card, placed by how likely you are to remember it right now. */
export function RecallDots({ deckIds }: { deckIds?: Set<number> }) {
  const now = Date.now();
  const tgt = S.settings.retention * 100;
  const raw: { id: number; noteId: number; p: number }[] = [];
  for (const c of S.cards) {
    if (c.suspended || c.state !== REVIEW || (deckIds && !deckIds.has(c.deckId))) continue;
    const r = recallChance(c, now);
    if (r != null) raw.push({ id: c.id, noteId: c.noteId, p: r * 100 });
  }
  if (!raw.length)
    return (
      <div>
        <p className="ptitle" style={{ fontSize: 15 }}>Recall chance</p>
        <p className="psub">Each card you've studied will appear here as a dot showing how likely you are to remember it today.</p>
      </div>
    );
  const minP = Math.min(...raw.map((x) => x.p));
  const lo = Math.max(0, Math.min(tgt - 20, Math.floor((minP - 5) / 10) * 10));
  const hi = 100;
  const band = (p: number): Band => (p < 70 ? "crit" : p < 80 ? "risk" : p < tgt ? "below" : "ok");
  const cnt: Record<Band, number> = { crit: 0, risk: 0, below: 0, ok: 0 };
  const stack = new Map<number, number>();
  raw.sort((a, b) => a.p - b.p).forEach(({ p }) => stack.set(Math.round(Math.max(lo, p)), (stack.get(Math.round(Math.max(lo, p))) ?? 0) + 1));
  const tallest = Math.max(4, ...stack.values());
  const capped = Math.min(tallest, 12); // very tall columns get squeezed, not cut
  const step = Math.min(13, (12 * 13) / tallest);
  const base = 24 + capped * 13, H = base + 26, W0 = 1000;
  const px = (p: number) => 24 + ((p - lo) / (hi - lo)) * (W0 - 48);
  const used = new Map<number, number>();
  const dots = raw.map(({ id, noteId, p }) => {
    const b = band(p);
    cnt[b]++;
    const k = Math.round(Math.max(lo, p));
    const i = (used.get(k) ?? 0) + 1;
    used.set(k, i);
    const n = S.notes.get(noteId);
    return (
      <circle key={id} className="dotc" cx={px(k)} cy={base - (i - 1) * step} r={5} fill={BAND_COL[b]}
        onClick={() => go("browse", { browseQuery: "", browseSel: id })}>
        <title>{`${stripCloze(n?.front ?? "").slice(0, 70)} · ${p.toFixed(0)}% recall chance`}</title>
      </circle>
    );
  });
  const tx = px(tgt);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += hi - lo > 40 ? 10 : 5) ticks.push(v);
  return (
    <>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <p className="ptitle" style={{ fontSize: 15 }}>{raw.length} cards by recall chance</p>
          <p className="psub">One dot per studied card · how likely you are to remember it right now · click a dot to open it</p>
        </div>
        <div className="legend2">
          {(Object.keys(cnt) as Band[]).map((k) => (
            <span key={k}><i style={{ background: BAND_COL[k] }} />{BAND_LAB[k]} {cnt[k]}</span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W0} ${H}`} style={{ width: "100%", marginTop: 4 }} role="img" aria-label="Cards by recall chance">
        <line x1={tx} x2={tx} y1={8} y2={base + 8} stroke="var(--ink)" strokeDasharray="3 3" strokeWidth={1} />
        <text x={tx + 6} y={16} style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }}>Target {Math.round(tgt)}%</text>
        {dots}
        {ticks.map((v) => <text key={v} x={px(v)} y={H - 4} textAnchor="middle" style={{ fontSize: 12 }}>{v}%</text>)}
      </svg>
    </>
  );
}

/* ---------------- activity panel (top of Decks) ---------------- */

export function ActivityPanel() {
  useStore();
  const all = counts(deckWithChildren("all"));
  const span = 17 * 7;
  const sem = periodSummary(span);
  const ret = trueRetention(30);
  const stat = (label: string, value: string | number, sub?: string) => (
    <div className="astat"><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>
  );
  return (
    <div className="card pad">
      <div className="act">
        <div>
          <p className="ptitle">Review activity</p>
          <p className="psub">This semester · last 4 months</p>
          <div style={{ marginTop: 10 }}><Heatmap /></div>
        </div>
        <div className="astats">
          {stat("Due today", all.due + all.learn)}
          {stat("Reviewed today", reviewedToday())}
          {stat("Day streak", streak())}
          {stat("Retention · 30d", ret == null ? "–" : ret + "%")}
          {stat("This semester", sem.reviews.toLocaleString(), `studied ${sem.daysStudied}/${span} days`)}
        </div>
      </div>
      <div className="recallsec"><RecallDots /></div>
    </div>
  );
}

/* ---------------- simple bar chart ---------------- */

export function BarChart({ vals, labels, color, h = 140 }: { vals: number[]; labels: string[]; color: string; h?: number }) {
  const max = Math.max(1, ...vals);
  const bw = 400 / vals.length;
  const every = Math.ceil(vals.length / 8);
  return (
    <svg viewBox={`0 0 400 ${h + 18}`} style={{ width: "100%" }}>
      {vals.map((v, i) => {
        const bh = (v / max) * h;
        return (
          <rect key={i} x={i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx={2} fill={color}>
            <title>{`${labels[i]}: ${v}`}</title>
          </rect>
        );
      })}
      {labels.map((l, i) => (i % every === 0 ? <text key={i} x={i * bw} y={h + 14}>{l}</text> : null))}
    </svg>
  );
}
