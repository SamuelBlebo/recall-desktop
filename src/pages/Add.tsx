import { useEffect, useMemo, useRef, useState } from "react";
import { S, addNotes, deckFullName, useStore } from "../lib/store";
import { clozeOrds, noteOrds, renderCard } from "../lib/cloze";
import { rich } from "../lib/rich";
import { splitTags } from "../lib/util";
import { toast } from "../lib/toast";
import type { NoteKind } from "../lib/types";
import { KIND_LABEL, deckOptions, wrapCloze } from "../components/NoteEditor";
import { openImport } from "../components/ImportCsv";
import { Icon, setNav, useNav } from "../components/ui";
import { newDeckFlow } from "./Decks";

// remembered between visits to the page
let last = { kind: "basic" as NoteKind, tags: "" };

export function AddPage() {
  useStore();
  const nav = useNav();
  const decks = deckOptions();
  const deckId = nav.addDeck != null && S.decks.some((d) => d.id === nav.addDeck) ? nav.addDeck : decks[0]?.id ?? null;
  const [kind, setKind] = useState<NoteKind>(last.kind);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tags, setTags] = useState(last.tags);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    last = { kind, tags };
  }, [kind, tags]);
  useEffect(() => frontRef.current?.focus(), []);

  const isCloze = kind === "cloze";
  const preview = useMemo(() => {
    if (!front.trim()) return [];
    const note = { id: 0, kind, front, back, tags: [], created: 0, modified: 0 };
    return noteOrds(kind, front).map((ord) => ({ ord, ...renderCard(note, { ord }) }));
  }, [kind, front, back]);
  const dup = useMemo(() => {
    const f = front.trim().toLowerCase();
    if (!f) return false;
    for (const n of S.notes.values()) if (n.front.trim().toLowerCase() === f) return true;
    return false;
  }, [front]);

  if (deckId == null)
    return (
      <>
        <div className="phead"><h1>Add cards</h1></div>
        <div className="card empty">
          <div className="big">Create a deck first</div>
          <p className="psub" style={{ marginBottom: 16 }}>Cards live inside decks, e.g. "UG Courses::MATH 122".</p>
          <button className="btn pri" onClick={() => newDeckFlow()}>+ Create a deck</button>
        </div>
      </>
    );

  const add = () => {
    if (!front.trim()) return toast(isCloze ? "Text is empty" : "Front is empty");
    if (isCloze && !clozeOrds(front).length) return toast("Mark at least one cloze: select text and press Ctrl+Shift+C");
    if (!isCloze && !back.trim()) return toast("Back is empty");
    const n = addNotes([{ kind, front: front.trim(), back: back.trim(), tags: splitTags(tags), deckId }]);
    toast(`Added ${n} card${n === 1 ? "" : "s"} to ${deckFullName(deckId).replace(/::/g, " › ")}`);
    setFront("");
    setBack("");
    frontRef.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") (e.preventDefault(), add());
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c" && isCloze && frontRef.current) {
      e.preventDefault();
      wrapCloze(frontRef.current, front, setFront);
    }
  };

  return (
    <div onKeyDown={onKey}>
      <div className="phead">
        <h1>Add cards</h1>
        <button className="btn ghost" onClick={() => openImport({ deckId })}><Icon name="upload" size={15} />Import CSV</button>
      </div>
      <div className="grid2">
        <div className="card pad">
          <div className="row">
            <div className="grow">
              <label className="f" style={{ marginTop: 0 }}>Note type</label>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
                {(Object.keys(KIND_LABEL) as NoteKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
            <div className="grow">
              <label className="f" style={{ marginTop: 0 }}>Deck</label>
              <select className="input" value={deckId} onChange={(e) => setNav({ addDeck: Number(e.target.value) })}>
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <label className="f">
            {isCloze ? "Text" : "Front"}
            {isCloze && <button type="button" className="btn sm" style={{ marginLeft: 8 }} onClick={() => frontRef.current && wrapCloze(frontRef.current, front, setFront)}>[…] Cloze selection</button>}
          </label>
          <textarea ref={frontRef} className="input" value={front} onChange={(e) => setFront(e.target.value)}
            placeholder={isCloze ? "e.g. The derivative of sin x is {{c1::cos x}}" : kind === "type" ? "Question you'll answer by typing" : "Question"} />
          {dup && <div className="small" style={{ color: "var(--hard)", marginTop: 4 }}>⚠ A note with this exact front already exists.</div>}
          <label className="f">{isCloze ? "Extra (optional)" : kind === "type" ? "Correct answer (what you'll type)" : "Back"}</label>
          <textarea className="input" style={{ minHeight: 70 }} value={back} onChange={(e) => setBack(e.target.value)} />
          <label className="f">Tags (space separated, kept for the next card)</label>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. derivatives trap" />
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn pri" onClick={add}>Add <kbd style={{ background: "transparent", color: "inherit", borderColor: "currentColor" }}>Ctrl ↵</kbd></button>
            <span className="psub" style={{ margin: 0 }}>Creates {preview.length} card{preview.length === 1 ? "" : "s"}</span>
          </div>
          {isCloze && <p className="psub small" style={{ marginTop: 12 }}>Select words and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>. Each {"{{c1::…}}"}, {"{{c2::…}}"} becomes its own card. Add a hint like {"{{c1::cos x::trig}}"}.</p>}
        </div>

        <div className="card pad">
          <p className="ptitle" style={{ fontSize: 15 }}>Live preview</p>
          {preview.length ? preview.map((p) => (
            <div key={p.ord} className="preview-card">
              <div className="small muted" style={{ marginBottom: 6 }}>{isCloze ? `Card ${p.ord}` : kind === "rev" ? (p.ord === 2 ? "Reversed card" : "Forward card") : "Card"}</div>
              <div dangerouslySetInnerHTML={{ __html: p.question }} />
              {p.expected != null && <div className="z small" style={{ marginTop: 6 }}>[answer box]</div>}
              <hr />
              <div dangerouslySetInnerHTML={{ __html: p.expected != null ? rich(p.expected) : isCloze ? p.answer : rich(p.ord === 2 ? front : back) }} />
            </div>
          )) : <p className="psub" style={{ marginTop: 6 }}>Start typing to see the cards this note will create.</p>}
        </div>
      </div>
    </div>
  );
}
