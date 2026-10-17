import type { Persist } from "./index";
import type { Snapshot } from "../types";

const KEY = "recall-desktop-v1";

/** Browser fallback used by `npm run dev` outside the desktop shell. */
export class BrowserPersist implements Persist {
  kind = "browser" as const;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private getSnapshot: () => Snapshot) {}

  private schedule = async () => {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.getSnapshot()));
      } catch (e) {
        console.error("Could not save", e);
      }
    }, 250);
  };

  async load(): Promise<Snapshot> {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
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
    localStorage.setItem(KEY, JSON.stringify(s));
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
