import { useMemo, useState } from "react";
import { S, addTagsToNotes, deckById, deckFullName, deleteNotes, patchCards, resetCards, useStore } from "../lib/store";
import { searchCards } from "../lib/search";
import { stripCloze } from "../lib/cloze";
import { recallChance } from "../lib/scheduler";
import { fmtIvl, splitTags } from "../lib/util";
import { toast } from "../lib/toast";
import { NEW, REVIEW, type Card } from "../lib/types";
import { NoteEditor, deckOptions } from "../components/NoteEditor";
import { confirmDialog, promptDialog, setNav, useNav } from "../components/ui";

type SortKey = "card" | "deck" | "due" | "ivl" | "diff" | "lapses" | "added";
const LIMIT = 500;

const SAVED: [string, string][] = [
  ["All cards", ""],
  ["Due today", "is:due"],
  ["New", "is:new"],
  ["Learning", "is:learn"],
  ["Struggling (3+ lapses)", "lapses:>=3"],
  ["Exam traps", "tag:trap"],
  ["Skipped (don't know)", "is:skipped"],
  ["Flagged", "is:flagged"],
  ["Suspended", "is:suspended"],
  ["Leeches", "is:leech"],
  ["Added today", "added:1"],
];

export function BrowsePage() {
  useStore();
  const nav = useNav();
  const q = nav.browseQuery;
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "added", desc: false });
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const list = useMemo(() => {
    let res: Card[];
    try {
      res = searchCards(q);
    } catch {
      res = [];
    }
    const val = (c: Card): number | string => {
      const n = S.notes.get(c.noteId);
      switch (sort.key) {
        case "card": return stripCloze(n?.front ?? "").toLowerCase();
        case "deck": return deckFullName(c.deckId).toLowerCase();
        case "due": return c.state === NEW ? Number.MAX_SAFE_INTEGER : c.due;
        case "ivl": return c.state === REVIEW ? c.scheduledDays : -1;
        case "diff": return c.difficulty;
        case "lapses": return c.lapses;
        default: return c.id;
      }
    };
    return res.sort((a, b) => {
      const x = val(a), y = val(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -r : r;
    });
  }, [q, sort, S.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = nav.browseSel != null ? S.cards.find((c) => c.id === nav.browseSel) : undefined;
  const tags = useMemo(() => [...new Set([...S.notes.values()].flatMap((n) => n.tags))].sort(), [S.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const shown = list.slice(0, LIMIT);
  const chk = [...checked].filter((id) => S.cards.some((c) => c.id === id));
  const setQ = (v: string) => (setNav({ browseQuery: v }), setChecked(new Set()));
  const th = (key: SortKey, label: string, cls = "") => (
    <th className={`sortable ${cls}`} onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : false })}>
      {label}{sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
    </th>
  );
  const notesOf = (ids: number[]) => [...new Set(ids.map((id) => S.cards.find((c) => c.id === id)?.noteId).filter((x): x is number => x != null))];

  const bulk = {
    suspend: (v: boolean) => (patchCards(chk, { suspended: v }), toast(`${chk.length} card(s) ${v ? "suspended" : "unsuspended"}`)),
    flag: (v: number) => patchCards(chk, { flag: v }),
    move: (deckId: number) => (patchCards(chk, { deckId }), toast(`Moved ${chk.length} card(s) to ${deckFullName(deckId)}`)),
    reset: async () => {
      if (await confirmDialog(`Forget all progress on ${chk.length} card(s)? They become new cards again.`, { confirm: "Reset", danger: true })) resetCards(chk);
    },
    tag: async () => {
      const t = await promptDialog("Add tags", "", "Space separated, e.g. exam week3");
      if (t) addTagsToNotes(notesOf(chk), splitTags(t));
    },
    del: async () => {
      const notes = notesOf(chk);
      if (await confirmDialog(`Delete ${notes.length} note(s) and all their cards? This can't be undone (a backup is made every 30 minutes).`, { title: "Delete notes", confirm: "Delete", danger: true })) {
        deleteNotes(notes);
        setChecked(new Set());
        if (sel && notes.includes(sel.noteId)) setNav({ browseSel: null });
        toast(`Deleted ${notes.length} note(s)`);
      }
    },
  };

  return (
    <>
      <div className="phead"><h1>Browse</h1></div>
      <p className="sub" style={{ marginTop: -14 }}>
        Search like Anki: <code>deck:MATH_122</code> <code>tag:trap</code> <code>is:due</code> <code>is:new</code> <code>lapses:&gt;=3</code> <code>"exact phrase"</code> <code>-tag:leech</code>
      </p>
      <div className="bgrid">
        <div className="card flist">
          <h4>Saved searches</h4>
          {SAVED.map(([l, v]) => <a key={l} className={q === v ? "on" : ""} onClick={() => setQ(v)}>{l}</a>)}
          <h4>Decks</h4>
          {deckOptions().map((d) => {
            const v = `deck:${d.name.replace(/ /g, "_")}`;
            const depth = d.name.split("::").length - 1;
            return <a key={d.id} className={q === v ? "on" : ""} style={{ paddingLeft: 8 + depth * 12 }} onClick={() => setQ(v)} title={d.name}>{deckById(d.id)?.name}</a>;
          })}
          {tags.length > 0 && <h4>Tags</h4>}
          {tags.map((t) => <a key={t} className={q === `tag:${t}` ? "on" : ""} onClick={() => setQ(`tag:${t}`)}>#{t}</a>)}
        </div>

        <div>
          <input className="input" placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} id="browse-q" />
          <div className="card mt" style={{ overflow: "hidden" }}>
            {chk.length > 0 && (
              <div className="bulk">
                <b>{chk.length} selected</b>
                <button className="btn sm" onClick={() => bulk.suspend(true)}>Suspend</button>
                <button className="btn sm" onClick={() => bulk.suspend(false)}>Unsuspend</button>
                <button className="btn sm" onClick={() => bulk.flag(1)}>Flag</button>
                <button className="btn sm" onClick={() => bulk.flag(0)}>Unflag</button>
                <button className="btn sm" onClick={bulk.tag}>Add tags</button>
                <select className="input" style={{ width: "auto", padding: "4px 8px" }} value="" onChange={(e) => e.target.value && bulk.move(Number(e.target.value))}>
                  <option value="">Move to deck…</option>
                  {deckOptions().map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button className="btn sm" onClick={bulk.reset}>Reset</button>
                <button className="btn sm danger" onClick={bulk.del}>Delete</button>
                <button className="btn sm" onClick={() => setChecked(new Set())}>Clear</button>
              </div>
            )}
            <div className="tablewrap">
              <table>
                <thead className="sticky" style={{ background: "var(--panel)" }}>
                  <tr>
                    <th style={{ width: 30 }}>
                      <input type="checkbox" aria-label="Select all" checked={shown.length > 0 && shown.every((c) => checked.has(c.id))}
                        onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((c) => c.id)) : new Set())} />
                    </th>
                    {th("card", `Card (${list.length.toLocaleString()})`)}
                    {th("deck", "Deck")}
                    {th("due", "Due")}
                    {th("ivl", "Ivl", "num")}
                    {th("diff", "Diff", "num")}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const n = S.notes.get(c.noteId);
                    return (
                      <tr key={c.id} className={`brow ${sel?.id === c.id ? "sel" : ""}`} onClick={() => setNav({ browseSel: c.id })}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label="Select card" checked={checked.has(c.id)}
                            onChange={(e) => { const s = new Set(checked); if (e.target.checked) s.add(c.id); else s.delete(c.id); setChecked(s); }} />
                        </td>
                        <td>
                          <div className="trunc">
                            {c.flag ? <span style={{ color: "var(--again)" }}>⚑ </span> : null}
                            {c.suspended ? <span className="z">[susp] </span> : null}
                            {stripCloze(n?.front ?? "")}{n?.kind === "cloze" ? <span className="z"> · c{c.ord}</span> : n?.kind === "rev" && c.ord === 2 ? <span className="z"> · rev</span> : null}
                          </div>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{deckById(c.deckId)?.name}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{c.state === NEW ? <span className="n">new</span> : c.due <= now ? <span className="d">now</span> : fmtIvl(c.due - now)}</td>
                        <td className="num">{c.state === REVIEW ? c.scheduledDays + "d" : "–"}</td>
                        <td className="num">{c.difficulty ? c.difficulty.toFixed(1) : "–"}</td>
                      </tr>
                    );
                  })}
                  {!list.length && <tr><td colSpan={6} className="z">No cards match.</td></tr>}
                </tbody>
              </table>
              {list.length > LIMIT && <p className="psub" style={{ padding: "10px 14px" }}>Showing the first {LIMIT} of {list.length.toLocaleString()}. Narrow your search to see more.</p>}
            </div>
          </div>
        </div>

        <div className="card pad">
          {sel ? <CardPanel card={sel} /> : (
            <>
              <p className="ptitle" style={{ fontSize: 15 }}>Card editor</p>
              <p className="psub" style={{ marginTop: 6 }}>Select a card to edit it. Changes apply to the note and all its sibling cards. Tick boxes to change many cards at once.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function CardPanel({ card }: { card: Card }) {
  const rc = recallChance(card, Date.now());
  const revs = S.revlog.filter((r) => r.cardId === card.id);
  return (
    <>
      <p className="ptitle" style={{ fontSize: 15 }}>Edit note</p>
      <NoteEditor noteId={card.noteId} deckId={card.deckId} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => patchCards([card.id], { suspended: !card.suspended })}>{card.suspended ? "Unsuspend" : "Suspend"}</button>
        <button className="btn sm" onClick={() => patchCards([card.id], { flag: card.flag ? 0 : 1 })}>{card.flag ? "Unflag" : "Flag"}</button>
        <button className="btn sm" onClick={async () => (await confirmDialog("Forget all progress on this card?", { confirm: "Reset", danger: true })) && resetCards([card.id])}>Reset</button>
        <button className="btn sm danger" onClick={async () => {
          if (await confirmDialog("Delete this note and all its cards?", { confirm: "Delete", danger: true })) {
            deleteNotes([card.noteId]);
            setNav({ browseSel: null });
            toast("Note deleted");
          }
        }}>Delete</button>
      </div>
      <p className="psub small" style={{ marginTop: 14 }}>
        {["New", "Learning", "Review", "Relearning"][card.state]} · {card.reps} reviews · {card.lapses} lapses
        {card.stability ? ` · stability ${card.stability.toFixed(1)}d` : ""}
        {rc != null ? ` · recall now ≈ ${Math.round(rc * 100)}%` : ""}
        {revs.length ? ` · last answered ${new Date(revs[revs.length - 1].time).toLocaleDateString()}` : ""}
      </p>
    </>
  );
}
