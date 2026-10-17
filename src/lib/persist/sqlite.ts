import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import type { Persist } from "./index";
import type { Card, Deck, Note, Revlog, Settings, Snapshot } from "../types";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

const DECK_COLS = ["id", "name", "parent_id", "position", "collapsed", "created"];
const NOTE_COLS = ["id", "kind", "front", "back", "tags", "created", "modified"];
const CARD_COLS = ["id", "note_id", "deck_id", "ord", "state", "due", "stability", "difficulty", "elapsed_days", "scheduled_days", "learning_steps", "reps", "lapses", "last_review", "flag", "suspended", "skipped"];
const REV_COLS = ["id", "card_id", "deck_id", "time", "rating", "state_before", "elapsed_days", "scheduled_days", "duration_ms"];

const deckRow = (d: Deck) => [d.id, d.name, d.parentId, d.position, d.collapsed ? 1 : 0, d.created];
const noteRow = (x: Note) => [x.id, x.kind, x.front, x.back, x.tags.join(" "), x.created, x.modified];
const cardRow = (c: Card) => [c.id, c.noteId, c.deckId, c.ord, c.state, c.due, c.stability, c.difficulty, c.elapsedDays, c.scheduledDays, c.learningSteps, c.reps, c.lapses, c.lastReview, c.flag, c.suspended ? 1 : 0, c.skipped ? 1 : 0];
const revRow = (r: Revlog) => [r.id, r.cardId, r.deckId, r.time, r.rating, r.stateBefore, r.elapsedDays, r.scheduledDays, r.durationMs];

export class SqlitePersist implements Persist {
  kind = "sqlite" as const;
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(private db: Database) {}

  static async open() {
    const db = await Database.load("sqlite:recall.db");
    await db.execute("PRAGMA foreign_keys = OFF");
    return new SqlitePersist(db);
  }

  /** All writes run one after another so they never interleave. */
  private run<T>(job: () => Promise<T>): Promise<T> {
    const p = this.queue.then(job, job);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async upsert(table: string, cols: string[], rows: unknown[][]) {
    if (!rows.length) return;
    const per = Math.max(1, Math.floor(4000 / cols.length));
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per);
      let k = 0;
      const values = chunk.map(() => `(${cols.map(() => `$${++k}`).join(",")})`).join(",");
      await this.db.execute(`INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES ${values}`, chunk.flat());
    }
  }

  private async del(table: string, col: string, ids: number[]) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await this.db.execute(`DELETE FROM ${table} WHERE ${col} IN (${chunk.map((_, j) => `$${j + 1}`).join(",")})`, chunk);
    }
  }

  async load(): Promise<Snapshot> {
    const [decks, notes, cards, revlog, settings] = await Promise.all([
      this.db.select<Row[]>("SELECT * FROM decks"),
      this.db.select<Row[]>("SELECT * FROM notes"),
      this.db.select<Row[]>("SELECT * FROM cards"),
      this.db.select<Row[]>("SELECT * FROM revlog ORDER BY time"),
      this.db.select<Row[]>("SELECT * FROM settings"),
    ]);
    const s: Partial<Settings> = {};
    for (const r of settings) {
      try {
        (s as Record<string, unknown>)[String(r.key)] = JSON.parse(String(r.value));
      } catch {
        /* ignore bad value */
      }
    }
    return {
      decks: decks.map((r) => ({ id: n(r.id), name: String(r.name), parentId: r.parent_id == null ? null : n(r.parent_id), position: n(r.position), collapsed: !!n(r.collapsed), created: n(r.created) })),
      notes: notes.map((r) => ({ id: n(r.id), kind: String(r.kind) as Note["kind"], front: String(r.front), back: String(r.back ?? ""), tags: String(r.tags ?? "").split(" ").filter(Boolean), created: n(r.created), modified: n(r.modified) })),
      cards: cards.map((r) => ({
        id: n(r.id), noteId: n(r.note_id), deckId: n(r.deck_id), ord: n(r.ord), state: n(r.state) as Card["state"], due: n(r.due),
        stability: n(r.stability), difficulty: n(r.difficulty), elapsedDays: n(r.elapsed_days), scheduledDays: n(r.scheduled_days),
        learningSteps: n(r.learning_steps), reps: n(r.reps), lapses: n(r.lapses), lastReview: r.last_review == null ? null : n(r.last_review),
        flag: n(r.flag), suspended: !!n(r.suspended), skipped: !!n(r.skipped),
      })),
      revlog: revlog.map((r) => ({ id: n(r.id), cardId: n(r.card_id), deckId: n(r.deck_id), time: n(r.time), rating: n(r.rating) as Revlog["rating"], stateBefore: n(r.state_before) as Revlog["stateBefore"], elapsedDays: n(r.elapsed_days), scheduledDays: n(r.scheduled_days), durationMs: n(r.duration_ms) })),
      settings: s,
    };
  }

  saveDecks = (d: Deck[]) => this.run(() => this.upsert("decks", DECK_COLS, d.map(deckRow)));
  deleteDecks = (ids: number[]) => this.run(() => this.del("decks", "id", ids));
  saveNotes = (x: Note[]) => this.run(() => this.upsert("notes", NOTE_COLS, x.map(noteRow)));
  deleteNotes = (ids: number[]) =>
    this.run(async () => {
      await this.del("cards", "note_id", ids);
      await this.del("notes", "id", ids);
    });
  saveCards = (c: Card[]) => this.run(() => this.upsert("cards", CARD_COLS, c.map(cardRow)));
  deleteCards = (ids: number[]) => this.run(() => this.del("cards", "id", ids));
  addRevlog = (r: Revlog[]) => this.run(() => this.upsert("revlog", REV_COLS, r.map(revRow)));
  deleteRevlog = (ids: number[]) => this.run(() => this.del("revlog", "id", ids));
  saveSettings = (s: Settings) =>
    this.run(() => this.upsert("settings", ["key", "value"], Object.entries(s).map(([k, v]) => [k, JSON.stringify(v)])));

  replaceAll = (s: Snapshot) =>
    this.run(async () => {
      for (const t of ["decks", "notes", "cards", "revlog", "settings"]) await this.db.execute(`DELETE FROM ${t}`);
      await this.upsert("decks", DECK_COLS, s.decks.map(deckRow));
      await this.upsert("notes", NOTE_COLS, s.notes.map(noteRow));
      await this.upsert("cards", CARD_COLS, s.cards.map(cardRow));
      await this.upsert("revlog", REV_COLS, s.revlog.map(revRow));
      await this.upsert("settings", ["key", "value"], Object.entries(s.settings).map(([k, v]) => [k, JSON.stringify(v)]));
    });

  backup = (keep: number) =>
    this.run(async () => {
      const dir = await invoke<string>("backups_dir");
      const d = new Date();
      const p2 = (x: number) => String(x).padStart(2, "0");
      const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
      const path = await join(dir, `recall-${stamp}.db`);
      // VACUUM INTO writes a clean, consistent copy of the live database.
      await this.db.execute(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
      await invoke("prune_backups", { keep });
      return path;
    });

  openBackups = () => invoke<void>("open_backups");
  saveFile = (name: string, contents: string) => invoke<string>("save_to_downloads", { name, contents });
}
