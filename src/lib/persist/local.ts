import type { Persist } from "./index";
import type { Snapshot } from "../types";

const KEY = "recall-desktop-v1";

// IndexedDB holds far more than localStorage's ~5 MB, which a big collection can outgrow.
function idb(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open("recall", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((ok, fail) => {
    const r = db.transaction("kv").objectStore("kv").get(key);
    r.onsuccess = () => ok(r.result as T | undefined);
    r.onerror = () => fail(r.error);
  });
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((ok, fail) => {
    const t = db.transaction("kv", "readwrite");
    t.objectStore("kv").put(value, key);
    t.oncomplete = () => ok();
    t.onerror = () => fail(t.error);
  });
}

/** Storage for the web version (outside the desktop shell). */
export class BrowserPersist implements Persist {
  kind = "browser" as const;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private getSnapshot: () => Snapshot) {}

  private write = (s: Snapshot) =>
    idbSet(KEY, s).catch((e) => {
      console.error("Could not save", e);
      throw e;
    });

  private schedule = async () => {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.write(this.getSnapshot()).catch(() => {}), 250);
  };

  async load(): Promise<Snapshot> {
    try {
      const s = await idbGet<Snapshot>(KEY);
      if (s) return s;
      // move data saved by older versions out of localStorage
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const old = JSON.parse(raw) as Snapshot;
        await this.write(old);
        localStorage.removeItem(KEY);
        return old;
      }
    } catch {
      /* start empty */
    }
    return { decks: [], notes: [], cards: [], revlog: [], settings: {} };
  }

  saveDecks = this.schedule;
  deleteDecks = this.schedule;
  saveNotes = this.schedule;
  deleteNotes = this.schedule;
  saveCards = this.schedule;
  deleteCards = this.schedule;
  addRevlog = this.schedule;
  deleteRevlog = this.schedule;
  saveSettings = this.schedule;
  replaceAll = async (s: Snapshot) => {
    await this.write(s);
  };

  backup = async () => {
    await this.saveFile(`recall-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(this.getSnapshot()));
    return "your Downloads folder";
  };
  openBackups = async () => {};
  saveFile = async (name: string, contents: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return "your Downloads folder";
  };
}
