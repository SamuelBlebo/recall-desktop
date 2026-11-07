import { useSyncExternalStore } from "react";
import { createPersist, type Persist } from "./persist";
import { configureScheduler, answer } from "./scheduler";
import { noteOrds } from "./cloze";
import { toast } from "./toast";
import { newId } from "./util";
import {
  DEFAULT_SETTINGS, NEW, REVIEW,
  type Card, type Deck, type Grade, type Note, type NoteKind, type RemoteChanges, type Revlog, type Settings, type Snapshot,
} from "./types";

interface State {
  ready: boolean;
  loadError: string | null;
  decks: Deck[];
  notes: Map<number, Note>;
  cards: Card[];
  revlog: Revlog[];
  settings: Settings;
  storage: "sqlite" | "browser";
  version: number;
}

export const S: State = {
  ready: false,
  loadError: null,
  decks: [],
  notes: new Map(),
  cards: [],
  revlog: [],
  settings: { ...DEFAULT_SETTINGS },
  storage: "browser",
  version: 0,
};

let P: Persist;
const listeners = new Set<() => void>();
function bump() {
  S.version++;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** Re-renders the component whenever the collection changes. */
export function useStore(): State {
  useSyncExternalStore(subscribe, () => S.version);
  return S;
}

const save = (p: Promise<unknown>) =>
  p.catch((e) => {
    console.error(e);
    toast("Could not save to disk: " + (e?.message || e));
  });

export function snapshot(): Snapshot {
  return { decks: S.decks, notes: [...S.notes.values()], cards: S.cards, revlog: S.revlog, settings: S.settings };
}

function hydrate(snap: Snapshot) {
  S.decks = snap.decks ?? [];
  S.notes = new Map((snap.notes ?? []).map((n) => [n.id, n]));
  S.cards = snap.cards ?? [];
  S.revlog = (snap.revlog ?? []).sort((a, b) => a.time - b.time);
  S.settings = { ...DEFAULT_SETTINGS, ...(snap.settings ?? {}) };
  configureScheduler(S.settings);
  applyTheme();
}

export async function init() {
  try {
    P = await createPersist(snapshot);
    S.storage = P.kind;
    hydrate(await P.load());
    S.ready = true;
  } catch (e) {
    console.error(e);
    S.loadError = String((e as Error)?.message || e);
  }
  bump();
  if (S.ready && "start" in P) (P as Persist & { start(f: typeof applyRemote): void }).start(applyRemote);
}

/** Merges changes made on another device into memory (the sync layer saves them locally). */
export function applyRemote(ch: RemoteChanges) {
  const merge = <T extends { id: number }>(list: T[], add: T[], del: number[]) => {
    if (!add.length && !del.length) return list;
    const m = new Map(list.map((x) => [x.id, x]));
    add.forEach((x) => m.set(x.id, x));
    del.forEach((id) => m.delete(id));
    return [...m.values()];
  };
  S.decks = merge(S.decks, ch.decks, ch.del.decks);
  ch.notes.forEach((n) => S.notes.set(n.id, n));
  ch.del.notes.forEach((id) => S.notes.delete(id));
  const deadNotes = new Set(ch.del.notes);
  S.cards = merge(S.cards, ch.cards, ch.del.cards).filter((c) => !deadNotes.has(c.noteId));
  S.revlog = merge(S.revlog, ch.revlog, ch.del.revlog);
  if (ch.revlog.length) S.revlog.sort((a, b) => a.time - b.time);
  if (ch.settings) {
    S.settings = { ...S.settings, ...ch.settings, lastBackup: S.settings.lastBackup };
    configureScheduler(S.settings);
    applyTheme();
  }
  bump();
}

export function applyTheme() {
  const t = S.settings.theme;
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

/* ---------------- decks ---------------- */

export const deckById = (id: number) => S.decks.find((d) => d.id === id);
export function deckFullName(id: number): string {
  const d = deckById(id);
  if (!d) return "?";
  return d.parentId ? `${deckFullName(d.parentId)}::${d.name}` : d.name;
}
/** The deck plus all its subdecks. */
export function deckWithChildren(id: number | "all"): Set<number> {
  if (id === "all") return new Set(S.decks.map((d) => d.id));
  const out = new Set<number>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of S.decks) if (d.parentId != null && out.has(d.parentId) && !out.has(d.id)) (out.add(d.id), (grew = true));
  }
  return out;
}
export const childDecks = (parent: number | null) =>
  S.decks.filter((d) => d.parentId === parent).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

/** Finds or creates a deck from a path like "UG Courses::MATH 122". Returns the leaf id. */
export function ensureDeckPath(path: string): number {
  const parts = path.split("::").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Deck name is empty");
  let parent: number | null = null;
  const created: Deck[] = [];
  for (const p of parts) {
    let d: Deck | undefined = S.decks.find((x) => x.parentId === parent && x.name.toLowerCase() === p.toLowerCase());
    if (!d) {
      d = { id: newId(), name: p, parentId: parent, position: childDecks(parent).length, collapsed: false, created: Date.now() };
      S.decks.push(d);
      created.push(d);
    }
    parent = d.id;
  }
  if (created.length) {
    save(P.saveDecks(created));
    bump();
  }
  return parent!;
}

export function renameDeck(id: number, name: string) {
  const d = deckById(id);
  if (!d || !name.trim()) return;
  d.name = name.trim().replace(/::/g, " ");
  save(P.saveDecks([d]));
  bump();
}

export function moveDeck(id: number, parentId: number | null) {
  const d = deckById(id);
  if (!d || deckWithChildren(id).has(parentId as number)) return;
  d.parentId = parentId;
  save(P.saveDecks([d]));
  bump();
}

export function toggleCollapsed(id: number) {
  const d = deckById(id);
  if (!d) return;
  d.collapsed = !d.collapsed;
  save(P.saveDecks([d]));
  bump();
}

/** Deletes a deck, its subdecks and every card inside them. */
export function deleteDeck(id: number) {
  const ids = deckWithChildren(id);
  const doomed = S.cards.filter((c) => ids.has(c.deckId));
  const doomedIds = new Set(doomed.map((c) => c.id));
  S.cards = S.cards.filter((c) => !doomedIds.has(c.id));
  const stillUsed = new Set(S.cards.map((c) => c.noteId));
  const deadNotes = [...new Set(doomed.map((c) => c.noteId))].filter((n) => !stillUsed.has(n));
  deadNotes.forEach((n) => S.notes.delete(n));
  S.decks = S.decks.filter((d) => !ids.has(d.id));
  save(P.deleteCards([...doomedIds]).then(() => P.deleteNotes(deadNotes)).then(() => P.deleteDecks([...ids])));
  bump();
  return doomed.length;
}

/* ---------------- notes & cards ---------------- */

export interface NewNote {
  kind: NoteKind;
  front: string;
  back: string;
  tags: string[];
  deckId: number;
}

function buildCards(note: Note, deckId: number, ords: number[], now: number): Card[] {
  return ords.map((ord) => ({
    id: newId(), noteId: note.id, deckId, ord, state: NEW, due: now, stability: 0, difficulty: 0,
    elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReview: null,
    flag: 0, suspended: false, skipped: false,
  }));
}

/** Adds many notes at once (used by Add and CSV import). Returns number of cards created. */
export function addNotes(items: NewNote[]): number {
  const now = Date.now();
  const notes: Note[] = [];
  const cards: Card[] = [];
  for (const it of items) {
    const ords = noteOrds(it.kind, it.front);
    if (!ords.length) continue;
    const note: Note = { id: newId(), kind: it.kind, front: it.front, back: it.back, tags: it.tags, created: now, modified: now };
    notes.push(note);
    cards.push(...buildCards(note, it.deckId, ords, now));
  }
  notes.forEach((n) => S.notes.set(n.id, n));
  S.cards.push(...cards);
  save(P.saveNotes(notes).then(() => P.saveCards(cards)));
  bump();
  return cards.length;
}

/** Edits a note and keeps its cards in sync (e.g. new cloze numbers create cards). */
export function updateNote(noteId: number, patch: { front: string; back: string; tags: string[]; deckId?: number }) {
  const note = S.notes.get(noteId);
  if (!note) return;
  const { deckId: newDeck, ...fields } = patch;
  Object.assign(note, fields, { modified: Date.now() });
  const mine = S.cards.filter((c) => c.noteId === noteId);
  const deckId = newDeck ?? mine[0]?.deckId;
  const want = noteOrds(note.kind, note.front);
  const have = new Set(mine.map((c) => c.ord));
  const removed = mine.filter((c) => !want.includes(c.ord)).map((c) => c.id);
  const added = buildCards(note, deckId!, want.filter((o) => !have.has(o)), Date.now());
  if (removed.length && want.length) {
    S.cards = S.cards.filter((c) => !removed.includes(c.id));
    save(P.deleteCards(removed));
  }
  S.cards.push(...added);
  const changed = S.cards.filter((c) => c.noteId === noteId);
  if (newDeck) changed.forEach((c) => (c.deckId = newDeck));
  save(P.saveNotes([note]).then(() => P.saveCards(changed)));
  bump();
}

export function deleteNotes(noteIds: number[]) {
  const set = new Set(noteIds);
  S.cards = S.cards.filter((c) => !set.has(c.noteId));
  noteIds.forEach((id) => S.notes.delete(id));
  save(P.deleteNotes(noteIds));
  bump();
}

export function patchCards(ids: number[], patch: Partial<Pick<Card, "suspended" | "flag" | "deckId" | "skipped">>) {
  const set = new Set(ids);
  const changed = S.cards.filter((c) => set.has(c.id));
  changed.forEach((c) => Object.assign(c, patch));
  save(P.saveCards(changed));
  bump();
}

export function resetCards(ids: number[]) {
  const set = new Set(ids);
  const now = Date.now();
  const changed = S.cards.filter((c) => set.has(c.id));
  for (const c of changed)
    Object.assign(c, { state: NEW, due: now, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReview: null, skipped: false, suspended: false });
  const noteIds = new Set(changed.map((c) => c.noteId));
  const notes = [...noteIds].map((id) => S.notes.get(id)!).filter(Boolean);
  notes.forEach((n) => (n.tags = n.tags.filter((t) => t !== "leech")));
  save(P.saveCards(changed).then(() => P.saveNotes(notes)));
  bump();
}

export function addTagsToNotes(noteIds: number[], tags: string[]) {
  const notes = noteIds.map((id) => S.notes.get(id)!).filter(Boolean);
  notes.forEach((n) => (n.tags = [...new Set([...n.tags, ...tags])]));
  save(P.saveNotes(notes));
  bump();
}

/* ---------------- reviewing ---------------- */

export interface AnswerResult {
  prev: Card;
  revlogId: number;
  leech: boolean;
}

export function answerCard(cardId: number, grade: Grade, durationMs: number): AnswerResult | null {
  const i = S.cards.findIndex((c) => c.id === cardId);
  if (i < 0) return null;
  const prev = S.cards[i];
  const now = Date.now();
  const next = answer(prev, grade, now);
  const log: Revlog = {
    id: newId(), cardId, deckId: prev.deckId, time: now, rating: grade, stateBefore: prev.state,
    elapsedDays: prev.lastReview ? Math.floor((now - prev.lastReview) / 86_400_000) : 0,
    scheduledDays: next.scheduledDays, durationMs: Math.min(durationMs, 600_000),
  };
  let leech = false;
  const note = S.notes.get(prev.noteId);
  if (grade === 1 && prev.state === REVIEW && next.lapses >= S.settings.leechThreshold) {
    leech = true;
    next.suspended = true;
    if (note && !note.tags.includes("leech")) {
      note.tags = [...note.tags, "leech"];
      save(P.saveNotes([note]));
    }
  }
  S.cards[i] = next;
  S.revlog.push(log);
  save(P.saveCards([next]).then(() => P.addRevlog([log])));
  bump();
  return { prev, revlogId: log.id, leech };
}

export function undoAnswer(r: AnswerResult) {
  const i = S.cards.findIndex((c) => c.id === r.prev.id);
  if (i >= 0) S.cards[i] = r.prev;
  S.revlog = S.revlog.filter((x) => x.id !== r.revlogId);
  save(P.saveCards([r.prev]).then(() => P.deleteRevlog([r.revlogId])));
  bump();
}

/* ---------------- settings, backup, restore ---------------- */

export function updateSettings(patch: Partial<Settings>) {
  S.settings = { ...S.settings, ...patch };
  configureScheduler(S.settings);
  if ("theme" in patch) applyTheme();
  save(P.saveSettings(S.settings));
  bump();
}

export async function backupNow(silent = false): Promise<string | null> {
  try {
    const where = await P.backup(S.settings.keepBackups);
    S.settings.lastBackup = Date.now();
    await P.saveSettings(S.settings);
    bump();
    if (!silent) toast("Backup saved");
    return where;
  } catch (e) {
    console.error(e);
    if (!silent) toast("Backup failed: " + ((e as Error)?.message || e));
    return null;
  }
}
export const openBackups = () => P.openBackups().catch((e) => toast("Could not open folder: " + e));
export const saveFile = (name: string, contents: string) => P.saveFile(name, contents);

export async function restoreSnapshot(snap: Snapshot) {
  if (!Array.isArray(snap.decks) || !Array.isArray(snap.cards) || !Array.isArray(snap.notes)) throw new Error("Not a Recall backup file");
  await backupNow(true); // safety copy first
  hydrate(snap);
  await P.replaceAll(snapshot());
  bump();
}

export const storageKind = () => S.storage;
