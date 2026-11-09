import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { S, answerCard, deckById, deckFullName, deckWithChildren, patchCards, undoAnswer, useStore, type AnswerResult } from "../lib/store";
import { counts, nextDueAfterNow, pickNext } from "../lib/queue";
import { previewIntervals, recallChance } from "../lib/scheduler";
import { renderCard } from "../lib/cloze";
import { renderMath } from "../lib/math";
import { esc, fmtIvl } from "../lib/util";
import { toast } from "../lib/toast";
import { LEARNING, NEW, RELEARNING, REVIEW, type Grade } from "../lib/types";
import { NoteEditor } from "../components/NoteEditor";
import { Icon, Modal, anyModalOpen, go, openModal, setNav, useNav } from "../components/ui";

const GRADES: [string, 1 | 2 | 3 | 4][] = [["Again", 1], ["Hard", 2], ["Good", 3], ["Easy", 4]];

export function StudyPage() {
  useStore();
  const nav = useNav();
  const ids = useMemo(() => deckWithChildren(nav.studyDeck), [nav.studyDeck, S.decks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cardId, setCardId] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const [skipPending, setSkipPending] = useState(false);
  const [typed, setTyped] = useState("");
  const [ahead, setAhead] = useState(false);
  const [done, setDone] = useState(0);
  const history = useRef<AnswerResult[]>([]);
  const started = useRef(Date.now());
  const typedRef = useRef<HTMLInputElement>(null);

  const loadNext = useCallback(
    (exclude?: number, aheadNow = ahead) => {
      const c = pickNext(ids, { ahead: aheadNow, exclude }) ?? (exclude ? pickNext(ids, { ahead: aheadNow }) : null);
      setCardId(c?.id ?? null);
      setShown(false);
      setSkipPending(false);
      setTyped("");
      started.current = Date.now();
    },
    [ids, ahead],
  );

  // new session whenever "Study" is pressed
  useEffect(() => {
    history.current = [];
    setDone(0);
    setAhead(false);
    loadNext(undefined, false);
  }, [nav.studySeq]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = cardId != null ? S.cards.find((c) => c.id === cardId) ?? null : null;
  const note = card ? S.notes.get(card.noteId) : undefined;
  // card was deleted/suspended from elsewhere → move on
  useEffect(() => {
    if (cardId != null && (!card || card.suspended)) loadNext();
  }, [cardId, card, loadNext]);

  const faces = card && note ? renderCard(note, card) : null;
  const k = counts(ids);
  const total = done + k.newCount + k.learn + k.due;

  const reveal = () => {
    if (!card || shown) return;
    setShown(true);
  };
  const rate = (g: Grade) => {
    if (!card || !shown) return;
    const r = answerCard(card.id, g, Date.now() - started.current);
    if (!r) return;
    history.current.push(r);
    setDone((d) => d + 1);
    if (r.leech) toast("Leech: you keep forgetting this card, so it was suspended and tagged \"leech\". Rewrite it in Browse.", 6000);
    if (g === 0) toast("Skipped: you'll see it again at the end of this session");
    loadNext(card.id);
  };
  const skip = () => {
    if (!card) return;
    if (!shown) {
      setShown(true);
      setSkipPending(true);
      return;
    }
    rate(0);
  };
  const undo = () => {
    const r = history.current.pop();
    if (!r) return toast("Nothing to undo");
    undoAnswer(r);
    setDone((d) => Math.max(0, d - 1));
    setCardId(r.prev.id);
    setShown(false);
    setSkipPending(false);
    setTyped("");
    toast("Undid last answer");
  };
  const flag = () => card && patchCards([card.id], { flag: card.flag ? 0 : 1 });
  const suspend = () => {
    if (!card) return;
    patchCards([card.id], { suspended: true });
    toast("Card suspended. Find it in Browse → Suspended.");
    loadNext(card.id);
  };
  const edit = () => {
    if (!card) return;
    openModal((close) => (
      <Modal title="Edit note" onClose={close}>
        <NoteEditor noteId={card.noteId} deckId={card.deckId} onSaved={close} />
      </Modal>
    ));
  };

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (anyModalOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.id === "typed") {
        if (e.key === "Enter") (e.preventDefault(), reveal());
        return;
      }
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      const key = e.key.toLowerCase();
      if (key === " " || key === "enter") {
        e.preventDefault();
        if (skipPending) skip();
        else if (shown) rate(3);
        else reveal();
      } else if (key === "0") skip();
      else if (shown && !skipPending && "1234".includes(key)) rate(Number(key) as Grade);
      else if (key === "z") undo();
      else if (key === "g") flag();
      else if (key === "e") edit();
      else if (key === "@" || (e.shiftKey && key === "2")) suspend();
      else if (key === "f") setNav({ focus: !nav.focus });
      else if (key === "escape") go("decks");
      else return;
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  useEffect(() => {
    if (card && note?.kind === "type" && !shown) typedRef.current?.focus();
  }, [card?.id, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const deckName = nav.studyDeck === "all" ? "All decks" : deckById(nav.studyDeck)?.name ?? "Deck";
  const isLearn = card && (card.state === LEARNING || card.state === RELEARNING);

  const head = (
    <div className="sbar">
      <button className="btn sm" onClick={() => go("decks")}>← Decks</button>
      <b>{deckName}</b>
      <div className="prog"><i style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div>
      <span title="New · Learning · Due">
        <span className="n" style={{ textDecoration: card?.state === NEW ? "underline" : undefined }}>{k.newCount}</span>{" · "}
        <span className="l" style={{ textDecoration: isLearn ? "underline" : undefined }}>{k.learn}</span>{" · "}
        <span className="d" style={{ textDecoration: card?.state === REVIEW ? "underline" : undefined }}>{k.due}</span>
      </span>
      <button className="btn sm" title="Focus mode (F)" onClick={() => setNav({ focus: !nav.focus })}><Icon name="expand" size={15} /></button>
    </div>
  );

  if (!card || !note || !faces) {
    const next = nextDueAfterNow(ids);
    return (
      <div className="stage">
        {head}
        <div className="card face">
          <div style={{ fontSize: 40 }}>🎉</div>
          <div style={{ fontWeight: 600 }}>{done ? "Deck finished for now" : "Nothing to study right now"}</div>
          <div className="extra">
            {done ? `You answered ${done} card${done === 1 ? "" : "s"} this session. ` : ""}
            {next ? `Next card is due in ${fmtIvl(Math.max(60_000, next - Date.now()))}.` : "Add some cards to get started."}
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
            {next && <button className="btn ghost" onClick={() => (setAhead(true), loadNext(undefined, true))}>Review 3 days ahead</button>}
            {history.current.length > 0 && <button className="btn ghost" onClick={undo}>Undo last</button>}
            <button className="btn pri" onClick={() => go("decks")}>Back to decks</button>
          </div>
        </div>
      </div>
    );
  }

  const now = Date.now();
  const ivl = shown && !skipPending ? previewIntervals(card, now) : null;
  const rc = recallChance(card, now);
  let body = shown ? faces.answer : faces.question;
  if (faces.expected != null && shown) {
    {
      const ok = typed.trim().toLowerCase() === faces.expected.trim().toLowerCase();
      body = faces.question + "<hr>" + renderMath(ok
        ? `<span class="ok">✓ ${esc(faces.expected)}</span>`
        : `${typed ? `<span class="bad">${esc(typed)}</span> → ` : ""}<span class="ok">${esc(faces.expected)}</span>`);
    }
  }
  // long answers read better left-aligned, like a paragraph, than centered
  const long = body.replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>|<[^>]+>/g, "").length > 160;
  const skipBtn = (
    <button className="g g0" onClick={skip} title="I don't know this at all">
      <small>back at end</small><b>Skip</b><small>Don't know <kbd>0</kbd></small>
    </button>
  );

  return (
    <div className="stage">
      {head}
      <div className={`card face${long ? " long" : ""}`}>
        <div dangerouslySetInnerHTML={{ __html: body }} />
        {faces.expected != null && !shown && (
          <div className="typed">
            <input id="typed" ref={typedRef} className="input" placeholder="Type your answer, press Enter" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
      </div>

      {skipPending ? (
        <>
          <div className="skipnote"><b>Marked as "don't know".</b> Read the answer carefully. This card restarts from scratch and comes back at the end of this session.</div>
          <button className="btn pri showbtn" style={{ marginTop: 14 }} onClick={skip}>Next card <kbd style={{ background: "transparent", color: "inherit", borderColor: "currentColor" }}>Space</kbd></button>
        </>
      ) : shown && ivl ? (
        <div className="grades">
          {skipBtn}
          {GRADES.map(([label, g]) => (
            <button key={g} className={`g g${g}`} onClick={() => rate(g)}>
              <small>{fmtIvl(ivl[g])}</small><b>{label}</b><small><kbd>{g}</kbd></small>
            </button>
          ))}
        </div>
      ) : (
        <div className="grades showrow">
          <button className="btn pri showbtn" onClick={reveal}>Show answer <kbd style={{ background: "transparent", color: "inherit", borderColor: "currentColor" }}>Space</kbd></button>
          {skipBtn}
        </div>
      )}

      <div className="meta">
        <span>
          {deckFullName(card.deckId).replace(/::/g, " › ")} · {note.kind === "cloze" ? `Cloze ${card.ord}` : note.kind === "type" ? "Type-in" : note.kind === "rev" ? (card.ord === 2 ? "Reversed" : "Forward") : "Basic"}
          {card.flag ? <span style={{ color: "var(--again)" }}> · ⚑ flagged</span> : null}
          {card.skipped ? <span className="l"> · skipped earlier</span> : null}
        </span>
        <span>{rc != null ? `Recall chance now ≈ ${Math.round(rc * 100)}% · ` : ""}Difficulty {card.difficulty ? card.difficulty.toFixed(1) : "–"}/10 · Lapses {card.lapses}</span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={undo}>Undo <kbd>Z</kbd></button>
        <button className="btn sm" onClick={flag}>{card.flag ? "Unflag" : "Flag"} <kbd>G</kbd></button>
        <button className="btn sm" onClick={edit}>Edit <kbd>E</kbd></button>
        <button className="btn sm" onClick={suspend}>Suspend <kbd>@</kbd></button>
      </div>
    </div>
  );
}

