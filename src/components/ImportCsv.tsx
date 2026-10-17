import { useMemo, useRef, useState } from "react";
import { S, addNotes, deckFullName, ensureDeckPath, type NewNote } from "../lib/store";
import { detectDelimiter, guessMapping, parseDelimited, type ColumnRole } from "../lib/csv";
import { clozeOrds } from "../lib/cloze";
import { splitTags } from "../lib/util";
import { toast } from "../lib/toast";
import type { NoteKind } from "../lib/types";
import { deckOptions } from "./NoteEditor";
import { Icon, Modal, go, openModal } from "./ui";

const DELIMS: [string, string][] = [[",", "Comma"], ["\t", "Tab"], [";", "Semicolon"], ["|", "Pipe"]];
const ROLES: [ColumnRole, string][] = [["front", "Front"], ["back", "Back"], ["tags", "Tags"], ["deck", "Deck"], ["ignore", "Ignore"]];

/** Reads Anki "Notes in plain text" headers (#separator:tab, #html:true …) and removes them. */
function readAnkiHeaders(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const meta: Record<string, string> = {};
  let i = 0;
  while (i < lines.length && /^#[a-z ]+:/i.test(lines[i])) {
    const m = lines[i].match(/^#([a-z ]+):(.*)$/i)!;
    meta[m[1].trim().toLowerCase()] = m[2].trim();
    i++;
  }
  const sep = meta.separator?.toLowerCase();
  const delim = sep === "tab" ? "\t" : sep === "comma" ? "," : sep === "semicolon" ? ";" : sep === "pipe" ? "|" : sep === "space" ? " " : undefined;
  return { body: lines.slice(i).join("\n"), delim, html: meta.html === "true" };
}

/** Turns simple HTML from Anki exports into plain text with line breaks. */
function htmlToText(s: string) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function openImport(opts: { deckId?: number; file?: File }) {
  openModal((close) => (
    <Modal title="Import cards from CSV" onClose={close} wide>
      <ImportWizard initialDeck={opts.deckId} initialFile={opts.file} onDone={close} />
    </Modal>
  ));
}

interface Parsed {
  name: string;
  text: string;
  html: boolean;
}

function ImportWizard({ initialDeck, initialFile, onDone }: { initialDeck?: number; initialFile?: File; onDone: () => void }) {
  const [file, setFile] = useState<Parsed | null>(null);
  const [delim, setDelim] = useState(",");
  const [hasHeader, setHasHeader] = useState(false);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const decks = deckOptions();
  const [deckId, setDeckId] = useState<number | "new">(initialDeck ?? decks[0]?.id ?? "new");
  const [newDeck, setNewDeck] = useState("");
  const [kind, setKind] = useState<NoteKind>("basic");
  const [skipDupes, setSkipDupes] = useState(true);
  const [extraTags, setExtraTags] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedInitial = useRef(false);

  const load = async (f: File) => {
    setError("");
    if (f.size > 50 * 1024 * 1024) return setError("That file is over 50 MB. Split it into smaller files.");
    const raw = await f.text();
    const { body, delim: ankiDelim, html } = readAnkiHeaders(raw);
    const d = ankiDelim ?? (f.name.toLowerCase().endsWith(".tsv") ? "\t" : detectDelimiter(body));
    const rows = parseDelimited(body, d);
    if (!rows.length) return setError("The file is empty.");
    const g = guessMapping(rows);
    setFile({ name: f.name, text: body, html });
    setDelim(d);
    setHasHeader(g.hasHeader);
    setRoles(g.roles);
    if (!initialDeck && deckId === "new" && !newDeck) setNewDeck(f.name.replace(/\.[^.]+$/, ""));
  };
  if (initialFile && !loadedInitial.current) {
    loadedInitial.current = true;
    void load(initialFile);
  }

  const rows = useMemo(() => (file ? parseDelimited(file.text, delim) : []), [file, delim]);
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const roleOf = (i: number): ColumnRole => roles[i] ?? "ignore";
  const col = (r: ColumnRole) => roles.indexOf(r);

  /** Builds the notes that would be imported, with counts of what gets skipped. */
  const plan = useMemo(() => {
    const fi = col("front"), bi = col("back"), ti = col("tags"), di = col("deck");
    const clean = (s: string) => (file?.html ? htmlToText(s) : s.trim());
    const existing = new Set<string>();
    if (skipDupes) for (const n of S.notes.values()) existing.add(n.front.trim().toLowerCase());
    const seen = new Set<string>();
    const out: { front: string; back: string; tags: string[]; deck: string | null; kind: NoteKind }[] = [];
    let empty = 0, dupes = 0;
    for (const r of dataRows) {
      const front = fi >= 0 ? clean(r[fi] ?? "") : "";
      const back = bi >= 0 ? clean(r[bi] ?? "") : "";
      if (!front) {
        empty++;
        continue;
      }
      const key = front.toLowerCase();
      if (skipDupes && (existing.has(key) || seen.has(key))) {
        dupes++;
        continue;
      }
      seen.add(key);
      // a front with {{c1::…}} is imported as a cloze note automatically
      const k: NoteKind = clozeOrds(front).length ? "cloze" : kind;
      if (k !== "cloze" && !back) {
        empty++;
        continue;
      }
      out.push({ front, back, tags: [...(ti >= 0 ? splitTags(r[ti] ?? "") : []), ...splitTags(extraTags)], deck: di >= 0 ? (r[di] ?? "").trim() || null : null, kind: k });
    }
    return { out, empty, dupes };
  }, [dataRows, roles, file, skipDupes, kind, extraTags]); // eslint-disable-line react-hooks/exhaustive-deps

  const doImport = () => {
    if (col("front") < 0) return setError("Choose which column is the Front.");
    if (!plan.out.length) return setError("Nothing to import with these settings.");
    let target: number;
    try {
      target = deckId === "new" ? ensureDeckPath(newDeck || "Imported") : deckId;
    } catch (e) {
      return setError(String((e as Error).message));
    }
    const items: NewNote[] = plan.out.map((x) => ({ kind: x.kind, front: x.front, back: x.back, tags: x.tags, deckId: x.deck ? ensureDeckPath(x.deck) : target }));
    const n = addNotes(items);
    toast(`Imported ${items.length} notes (${n} cards)${plan.dupes ? ` · skipped ${plan.dupes} duplicates` : ""}`, 5000);
    onDone();
    go("decks");
  };

  if (!file)
    return (
      <div>
        <div className="card empty" style={{ borderStyle: "dashed", cursor: "pointer", padding: 40 }} onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void load(f); }}>
          <Icon name="upload" size={28} />
          <div className="big" style={{ marginTop: 8 }}>Choose a CSV file</div>
          <p className="psub">or drop it here · .csv, .tsv, .txt (Anki "Notes in plain text" exports work too)</p>
        </div>
        <input ref={inputRef} type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        {error && <p style={{ color: "var(--again)" }}>{error}</p>}
        <p className="psub small" style={{ marginTop: 14 }}>Expected columns: <b>Front, Back, Tags</b> (tags optional, separated by spaces). A header row is detected automatically. Fronts containing {"{{c1::…}}"} become cloze cards.</p>
      </div>
    );

  return (
    <div>
      <p className="psub"><b style={{ color: "var(--ink)" }}>{file.name}</b> · {dataRows.length.toLocaleString()} rows · <a style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setFile(null)}>choose another file</a></p>
      <div className="row" style={{ alignItems: "flex-end", marginTop: 6 }}>
        <div>
          <label className="f">Separator</label>
          <select className="input" value={delim} onChange={(e) => { setDelim(e.target.value); const g = guessMapping(parseDelimited(file.text, e.target.value)); setRoles(g.roles); setHasHeader(g.hasHeader); }}>
            {DELIMS.map(([d, l]) => <option key={l} value={d}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="f">Note type</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
            <option value="basic">Basic</option><option value="rev">Basic + reversed</option><option value="type">Type in the answer</option>
          </select>
        </div>
        <div className="grow">
          <label className="f">Into deck</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <select className="input" value={deckId} onChange={(e) => setDeckId(e.target.value === "new" ? "new" : Number(e.target.value))}>
              {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              <option value="new">+ New deck…</option>
            </select>
            {deckId === "new" && <input className="input" placeholder="e.g. UG Courses::STAT 112" value={newDeck} onChange={(e) => setNewDeck(e.target.value)} />}
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <label className="check"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />First row is a header</label>
        <label className="check"><input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />Skip cards whose front already exists</label>
        <label className="check" style={{ flex: 1 }}>Extra tags <input className="input" style={{ maxWidth: 220, padding: "4px 8px" }} placeholder="e.g. week5" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} /></label>
      </div>

      <div className="card mt" style={{ overflow: "auto", maxHeight: 300 }}>
        <table>
          <thead>
            <tr>
              {Array.from({ length: width }, (_, i) => (
                <th key={i}>
                  <select className="input" style={{ padding: "3px 6px", width: "auto" }} value={roleOf(i)}
                    onChange={(e) => {
                      const next = [...roles];
                      while (next.length < width) next.push("ignore");
                      const r = e.target.value as ColumnRole;
                      if (r !== "ignore" && r !== "tags") next.forEach((x, j) => x === r && (next[j] = "ignore"));
                      next[i] = r;
                      setRoles(next);
                    }}>
                    {ROLES.map(([r, l]) => <option key={r} value={r}>{l}</option>)}
                  </select>
                  {hasHeader && <div className="small" style={{ marginTop: 4 }}>{rows[0]?.[i]}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.slice(0, 6).map((r, i) => (
              <tr key={i}>{Array.from({ length: width }, (_, j) => <td key={j} className={roleOf(j) === "ignore" ? "z" : ""}><div className="trunc" style={{ maxWidth: 260 }}>{r[j]}</div></td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="psub small" style={{ marginTop: 8 }}>
        Showing the first {Math.min(6, dataRows.length)} rows. Will import <b style={{ color: "var(--ink)" }}>{plan.out.length.toLocaleString()}</b> notes
        {plan.dupes ? ` · ${plan.dupes} duplicates skipped` : ""}{plan.empty ? ` · ${plan.empty} empty rows skipped` : ""}
        {col("deck") >= 0 ? " · the Deck column decides each card's deck" : deckId !== "new" ? ` into ${deckFullName(deckId)}` : ""}.
      </p>
      {error && <p style={{ color: "var(--again)" }}>{error}</p>}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
        <button className="btn" onClick={onDone}>Cancel</button>
        <button className="btn pri" onClick={doImport} disabled={!plan.out.length}>Import {plan.out.length.toLocaleString()} notes</button>
      </div>
    </div>
  );
}
