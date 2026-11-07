// Core data model. Mirrors the SQLite tables in src-tauri/migrations.sql.

export type NoteKind = "basic" | "rev" | "cloze" | "type";

/** FSRS card states (same numbers as ts-fsrs `State`). */
export const NEW = 0;
export const LEARNING = 1;
export const REVIEW = 2;
export const RELEARNING = 3;
export type CardState = 0 | 1 | 2 | 3;

/** 0 = Skip ("don't know at all"), 1 Again, 2 Hard, 3 Good, 4 Easy */
export type Grade = 0 | 1 | 2 | 3 | 4;

export interface Deck {
  id: number;
  name: string;
  parentId: number | null;
  position: number;
  collapsed: boolean;
  created: number;
}

export interface Note {
  id: number;
  kind: NoteKind;
  front: string; // for cloze: the text with {{c1::...}}
  back: string; // for cloze: "extra" text
  tags: string[];
  created: number;
  modified: number;
}

export interface Card {
  id: number;
  noteId: number;
  deckId: number;
  ord: number; // basic=1, reversed=2, cloze number
  state: CardState;
  due: number; // ms timestamp
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
  flag: number;
  suspended: boolean;
  skipped: boolean; // marked "don't know" — shown again at the end of the session
}

export interface Revlog {
  id: number;
  cardId: number;
  deckId: number;
  time: number;
  rating: Grade;
  stateBefore: CardState;
  elapsedDays: number;
  scheduledDays: number;
  durationMs: number;
}

export interface Settings {
  retention: number;
  newPerDay: number;
  reviewsPerDay: number;
  leechThreshold: number;
  dayStartHour: number;
  fuzz: boolean;
  theme: "system" | "light" | "dark";
  profileName: string;
  backupEveryMin: number;
  keepBackups: number;
  lastBackup: number;
}

export const DEFAULT_SETTINGS: Settings = {
  retention: 0.9,
  newPerDay: 20,
  reviewsPerDay: 200,
  leechThreshold: 8,
  dayStartHour: 4,
  fuzz: true,
  theme: "system",
  profileName: "Blebo",
  backupEveryMin: 30,
  keepBackups: 30,
  lastBackup: 0,
};

export interface Snapshot {
  decks: Deck[];
  notes: Note[];
  cards: Card[];
  revlog: Revlog[];
  settings: Partial<Settings>;
}

/** Changes pulled from the cloud (made on another device). */
export interface RemoteChanges {
  decks: Deck[];
  notes: Note[];
  cards: Card[];
  revlog: Revlog[];
  settings?: Partial<Settings>;
  del: { decks: number[]; notes: number[]; cards: number[]; revlog: number[] };
}

export const MIN = 60_000;
export const DAY = 86_400_000;
