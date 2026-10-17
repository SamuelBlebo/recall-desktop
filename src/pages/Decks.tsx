import { Fragment } from "react";
import { useStore, childDecks, deckWithChildren, deckFullName, ensureDeckPath, renameDeck, deleteDeck, toggleCollapsed, backupNow, S } from "../lib/store";
import { counts } from "../lib/queue";
import { loadSampleDecks } from "../lib/sample";
import { toast } from "../lib/toast";
import { exportDeckCsv } from "../lib/exporter";
import { ActivityPanel } from "../components/charts";
import { openImport } from "../components/ImportCsv";
import { Icon, Menu, confirmDialog, go, promptDialog, study } from "../components/ui";
import type { Deck } from "../lib/types";

export async function newDeckFlow(parent?: Deck) {
  const prefix = parent ? deckFullName(parent.id) + "::" : "";
  const name = await promptDialog(parent ? `New subdeck in ${parent.name}` : "New deck", "",
    parent ? undefined : 'Tip: use "::" to make a subdeck, e.g. UG Courses::MATH 126');
  if (!name) return;
  ensureDeckPath(prefix + name);
  toast("Deck created");
}

function Status({ due, fresh }: { due: number; fresh: number }) {
  if (due > 0) return <span className={`status ${due >= 30 ? "crit" : "risk"}`}><span>{due} due</span></span>;
  if (fresh > 0) return <span className="status below"><span>New ready</span></span>;
  return <span className="status ok"><span>Caught up</span></span>;
}

function DeckRows({ parent, depth }: { parent: number | null; depth: number }) {
  return (
    <>
      {childDecks(parent).map((d) => {
        const kids = childDecks(d.id).length > 0;
        const k = counts(deckWithChildren(d.id));
        return (
          <Fragment key={d.id}>
            <tr>
              <td style={{ paddingLeft: 14 + depth * 22 }}>
                {kids ? (
                  <button className="tog" onClick={() => toggleCollapsed(d.id)} aria-label={d.collapsed ? "Expand" : "Collapse"}>{d.collapsed ? "▸" : "▾"}</button>
                ) : <span style={{ display: "inline-block", width: 20 }} />}
                <span className="dk" onClick={() => study(d.id)}>{d.name}</span>
              </td>
              <td className={`num n ${k.newCount ? "" : "z"}`}>{k.newCount}</td>
              <td className={`num l ${k.learn ? "" : "z"}`}>{k.learn}</td>
              <td className={`num d ${k.due ? "" : "z"}`}>{k.due}</td>
              <td><Status due={k.due + k.learn} fresh={k.newCount} /></td>
              <td style={{ width: 130 }}>
                <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 6 }}>
                <button className="btn sm" onClick={() => study(d.id)}>Study</button>
                <Menu items={[
                  ["Add cards here", () => go("add", { addDeck: d.id })],
                  ["Browse cards", () => go("browse", { browseQuery: `deck:${deckFullName(d.id).replace(/ /g, "_")}`, browseSel: null })],
                  ["New subdeck", () => newDeckFlow(d)],
                  ["Rename", async () => { const n = await promptDialog("Rename deck", d.name); if (n) renameDeck(d.id, n); }],
                  ["Import CSV into this deck", () => openImport({ deckId: d.id })],
                  ["Export as CSV", () => exportDeckCsv(d.id)],
                  ["Delete", async () => {
                    const n = [...deckWithChildren(d.id)].reduce((a, id) => a + S.cards.filter((c) => c.deckId === id).length, 0);
                    if (await confirmDialog(`Delete "${d.name}"${kids ? " and its subdecks" : ""} with ${n} card${n === 1 ? "" : "s"}? A backup is made first.`, { title: "Delete deck", confirm: "Delete", danger: true })) {
                      await backupNow(true);
                      deleteDeck(d.id);
                      toast("Deck deleted");
                    }
                  }, true],
                ]} />
                </div>
              </td>
            </tr>
            {kids && !d.collapsed && <DeckRows parent={d.id} depth={depth + 1} />}
          </Fragment>
        );
      })}
    </>
  );
}

export function DecksPage() {
  useStore();
  const all = counts(deckWithChildren("all"));
  const date = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  if (!S.decks.length)
    return (
      <>
        <div className="phead"><h1>Decks</h1></div>
        <div className="card empty">
          <div className="big">Welcome to Recall</div>
          <p className="psub" style={{ marginBottom: 20 }}>Everything stays on this PC. No internet needed.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn pri" onClick={() => newDeckFlow()}>+ Create a deck</button>
            <button className="btn ghost" onClick={() => openImport({})}><Icon name="upload" size={16} />Import CSV</button>
            <button className="btn ghost" onClick={() => { const n = loadSampleDecks(); toast(`Loaded ${n} sample cards`); }}>Load sample decks</button>
          </div>
        </div>
      </>
    );

  return (
    <>
      <div className="phead">
        <h1>Decks</h1>
        <span className="btn ghost" style={{ cursor: "default" }}><Icon name="calendar" size={15} />{date}</span>
        <button className="btn ghost" onClick={() => openImport({})}><Icon name="upload" size={15} />Import CSV</button>
        <button className="btn ghost" onClick={() => newDeckFlow()}>+ New deck</button>
        <button className="btn pri" onClick={() => study("all")}>Study all · {all.newCount + all.learn + all.due}</button>
      </div>
      <ActivityPanel />
      <div className="card pad mt" style={{ paddingBottom: 8 }}>
        <p className="ptitle">Your decks</p>
        <p className="psub" style={{ marginBottom: 8 }}>Click a deck to study it. <span className="n">New</span> · <span className="l">Learning</span> · <span className="d">Due</span></p>
        <table>
          <thead><tr><th>Deck</th><th className="num">New</th><th className="num">Learn</th><th className="num">Due</th><th>Status</th><th /></tr></thead>
          <tbody><DeckRows parent={null} depth={0} /></tbody>
        </table>
      </div>
    </>
  );
}
