import { useState } from "react";
import { S, deckById, deckWithChildren, useStore } from "../lib/store";
import { stripCloze } from "../lib/cloze";
import { dayStart } from "../lib/util";
import { periodSummary, streak, trueRetention } from "../lib/stats";
import { DAY, NEW, REVIEW } from "../lib/types";
import { BarChart, Heatmap, RecallDots } from "../components/charts";
import { deckOptions } from "../components/NoteEditor";
import { go } from "../components/ui";

export function StatsPage() {
  useStore();
  const [deck, setDeck] = useState<number | "all">("all");
  const ids = deckWithChildren(deck === "all" || deckById(deck) ? deck : "all");
  const cards = S.cards.filter((c) => ids.has(c.deckId));
  const active = cards.filter((c) => !c.suspended);

  // future due, 30 days
  const start = dayStart(S.settings.dayStartHour);
  const fc = Array(30).fill(0);
  for (const c of active) {
    if (c.state === NEW) continue;
    const i = Math.max(0, Math.floor((c.due - start) / DAY));
    if (i < 30) fc[i]++;
  }
  // card states
  const st = { New: 0, Learning: 0, Young: 0, Mature: 0, Suspended: 0 };
  for (const c of cards) {
    if (c.suspended) st.Suspended++;
    else if (c.state === NEW) st.New++;
    else if (c.state !== REVIEW) st.Learning++;
    else if (c.scheduledDays >= 21) st.Mature++;
    else st.Young++;
  }
  const col: Record<keyof typeof st, string> = { New: "var(--new)", Learning: "var(--learn)", Young: "var(--hard)", Mature: "var(--good)", Suspended: "var(--mute)" };
  // answers, 30 days
  const from = Date.now() - 30 * DAY;
  const ans = [0, 0, 0, 0, 0];
  let time = 0;
  for (const r of S.revlog) if (r.time >= from && ids.has(r.deckId)) (ans[r.rating]++, (time += r.durationMs));
  const struggling = [...cards].filter((c) => c.lapses > 0).sort((a, b) => b.lapses - a.lapses || b.difficulty - a.difficulty).slice(0, 8);
  const ret = trueRetention(30);
  const sem = periodSummary(17 * 7);
  const total = cards.length || 1;

  return (
    <>
      <div className="phead">
        <h1>Statistics</h1>
        <select className="input" style={{ width: "auto" }} value={deck} onChange={(e) => setDeck(e.target.value === "all" ? "all" : Number(e.target.value))}>
          <option value="all">All decks</option>
          {deckOptions().map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="tiles">
        <div className="card tile"><span>Cards</span><b>{cards.length.toLocaleString()}</b></div>
        <div className="card tile"><span>True retention · 30d</span><b>{ret == null ? "–" : ret + "%"}</b></div>
        <div className="card tile"><span>Day streak</span><b>{streak()}</b></div>
        <div className="card tile"><span>Study time · 30d</span><b>{Math.round(time / 60000)} min</b></div>
      </div>
      <div className="card pad mt"><RecallDots deckIds={ids} /></div>
      <div className="grid2 mt">
        <div className="card pad">
          <p className="ptitle" style={{ fontSize: 15 }}>Due in the next 30 days</p>
          <p className="psub" style={{ marginBottom: 8 }}>Today includes anything overdue</p>
          <BarChart vals={fc} labels={fc.map((_, i) => (i === 0 ? "today" : `+${i}d`))} color="var(--good)" />
        </div>
        <div className="card pad">
          <p className="ptitle" style={{ fontSize: 15 }}>Answer buttons · 30 days</p>
          <p className="psub" style={{ marginBottom: 8 }}>{ans.reduce((a, b) => a + b, 0)} answers</p>
          <BarChart vals={ans} labels={["Skip", "Again", "Hard", "Good", "Easy"]} color="var(--easy)" />
          <div className="legend2">{["Skip", "Again", "Hard", "Good", "Easy"].map((l, i) => <span key={l}>{l}: {ans[i]}</span>)}</div>
        </div>
      </div>
      <div className="card pad mt">
        <p className="ptitle" style={{ fontSize: 15 }}>Card states</p>
        <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", margin: "12px 0", background: "var(--panel2)" }}>
          {(Object.keys(st) as (keyof typeof st)[]).map((k) => <div key={k} title={`${k}: ${st[k]}`} style={{ width: `${(st[k] / total) * 100}%`, background: col[k] }} />)}
        </div>
        <div className="legend2">{(Object.keys(st) as (keyof typeof st)[]).map((k) => <span key={k}><i style={{ background: col[k], borderRadius: 2 }} />{k} {st[k]}</span>)}</div>
        <p className="psub small" style={{ marginTop: 8 }}>Young = interval under 21 days · Mature = 21 days or more</p>
      </div>
      <div className="card pad mt">
        <p className="ptitle" style={{ fontSize: 15 }}>Review activity · this semester</p>
        <p className="psub" style={{ marginBottom: 12 }}>{sem.reviews.toLocaleString()} reviews on {sem.daysStudied} days in the last 4 months (all decks)</p>
        <Heatmap maxWidth={620} />
      </div>
      <h2>Struggling cards</h2>
      <div className="card">
        <table>
          <thead><tr><th>Card</th><th>Deck</th><th className="num">Lapses</th><th className="num">Diff</th><th /></tr></thead>
          <tbody>
            {struggling.map((c) => (
              <tr key={c.id}>
                <td><div className="trunc" style={{ maxWidth: 420 }}>{stripCloze(S.notes.get(c.noteId)?.front ?? "")}</div></td>
                <td>{deckById(c.deckId)?.name}</td>
                <td className="num l">{c.lapses}</td>
                <td className="num">{c.difficulty.toFixed(1)}</td>
                <td style={{ textAlign: "right" }}><button className="btn sm" onClick={() => go("browse", { browseQuery: "", browseSel: c.id })}>Rewrite</button></td>
              </tr>
            ))}
            {!struggling.length && <tr><td colSpan={5} className="z">No forgotten cards yet. Nice.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
