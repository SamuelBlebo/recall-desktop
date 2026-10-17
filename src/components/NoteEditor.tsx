import { useEffect, useState } from "react";
import { S, deckFullName, updateNote } from "../lib/store";
import { clozeOrds } from "../lib/cloze";
import { splitTags } from "../lib/util";
import { toast } from "../lib/toast";
import type { Note } from "../lib/types";

export const KIND_LABEL: Record<Note["kind"], string> = {
  basic: "Basic",
  rev: "Basic (and reversed card)",
  cloze: "Cloze",
  type: "Basic (type in the answer)",
};

/** All decks sorted by their full path, for <select>s. */
export const deckOptions = () =>
  S.decks.map((d) => ({ id: d.id, name: deckFullName(d.id) })).sort((a, b) => a.name.localeCompare(b.name));

/** Wraps the selected text of a textarea in the next {{cN::…}}. */
export function wrapCloze(el: HTMLTextAreaElement, value: string, set: (v: string) => void) {
  const s = el.selectionStart, e = el.selectionEnd;
  const n = (clozeOrds(value).slice(-1)[0] ?? 0) + 1;
  const sel = value.slice(s, e) || "answer";
  const next = value.slice(0, s) + `{{c${n}::${sel}}}` + value.slice(e);
  set(next);
  requestAnimationFrame(() => {
    el.focus();
    const start = s + `{{c${n}::`.length;
    el.setSelectionRange(start, start + sel.length);
  });
}

/** Edits one note (all of its cards). Used by Browse and the study screen. */
export function NoteEditor({ noteId, deckId, onSaved }: { noteId: number; deckId: number; onSaved?: () => void }) {
  const note = S.notes.get(noteId);
  const [front, setFront] = useState(note?.front ?? "");
  const [back, setBack] = useState(note?.back ?? "");
  const [tags, setTags] = useState(note?.tags.join(" ") ?? "");
  const [deck, setDeck] = useState(deckId);
  useEffect(() => {
    setFront(note?.front ?? "");
    setBack(note?.back ?? "");
    setTags(note?.tags.join(" ") ?? "");
    setDeck(deckId);
  }, [noteId, deckId, note?.modified]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!note) return <p className="psub">This note no longer exists.</p>;
  const isCloze = note.kind === "cloze";
  const dirty = front !== note.front || back !== note.back || tags !== note.tags.join(" ") || deck !== deckId;
  const save = () => {
    if (!front.trim()) return toast("Front can't be empty");
    if (isCloze && !clozeOrds(front).length) return toast("A cloze note needs at least one {{c1::…}}");
    updateNote(noteId, { front, back, tags: splitTags(tags), deckId: deck !== deckId ? deck : undefined });
    toast("Saved");
    onSaved?.();
  };
  return (
    <div onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && (e.preventDefault(), save())}>
      <p className="psub">{KIND_LABEL[note.kind]}</p>
      <label className="f">
        {isCloze ? "Text" : "Front"}
        {isCloze && (
          <button type="button" className="btn sm" style={{ marginLeft: 8 }}
            onClick={(e) => wrapCloze(e.currentTarget.parentElement!.nextElementSibling as HTMLTextAreaElement, front, setFront)}>
            […] Cloze selection
          </button>
        )}
      </label>
      <textarea className="input" value={front} onChange={(e) => setFront(e.target.value)} />
      <label className="f">{isCloze ? "Extra (optional)" : "Back"}</label>
      <textarea className="input" style={{ minHeight: 70 }} value={back} onChange={(e) => setBack(e.target.value)} />
      <label className="f">Tags (space separated)</label>
      <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
      <label className="f">Deck</label>
      <select className="input" value={deck} onChange={(e) => setDeck(Number(e.target.value))}>
        {deckOptions().map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn pri" disabled={!dirty} onClick={save}>Save <kbd style={{ background: "transparent", color: "inherit", borderColor: "currentColor" }}>Ctrl ↵</kbd></button>
      </div>
    </div>
  );
}
