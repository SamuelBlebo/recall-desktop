import type { Card, Deck, Note, Revlog, Settings, Snapshot } from "../types";
import { cloudConfigured } from "../cloud/config";

/**
 * Storage backend. The desktop app uses SQLite (sqlite.ts);
 * the web version uses IndexedDB (local.ts). Either can be wrapped with cloud sync (cloud/sync.ts).
 */
export interface Persist {
  kind: "sqlite" | "browser";
  load(): Promise<Snapshot>;
  saveDecks(d: Deck[]): Promise<void>;
  deleteDecks(ids: number[]): Promise<void>;
  saveNotes(n: Note[]): Promise<void>;
  deleteNotes(ids: number[]): Promise<void>; // also deletes their cards
  saveCards(c: Card[]): Promise<void>;
  deleteCards(ids: number[]): Promise<void>;
  addRevlog(r: Revlog[]): Promise<void>;
  deleteRevlog(ids: number[]): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  replaceAll(s: Snapshot): Promise<void>;
  /** Makes a backup copy; returns where it went. */
  backup(keep: number): Promise<string>;
  openBackups(): Promise<void>;
  /** Saves a text file for the user (Downloads folder on desktop). Returns location. */
  saveFile(name: string, contents: string): Promise<string>;
}

export const isDesktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function createLocal(getSnapshot: () => Snapshot): Promise<Persist> {
  if (isDesktop()) {
    const { SqlitePersist } = await import("./sqlite");
    return SqlitePersist.open();
  }
  const { BrowserPersist } = await import("./local");
  return new BrowserPersist(getSnapshot);
}

/** Local storage, wrapped with cloud sync when Firebase is configured. */
export async function createPersist(getSnapshot: () => Snapshot): Promise<Persist> {
  const local = await createLocal(getSnapshot);
  if (!cloudConfigured()) return local;
  const { SyncedPersist } = await import("../cloud/sync");
  return new SyncedPersist(local, getSnapshot);
}
