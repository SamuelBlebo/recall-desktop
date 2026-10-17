import { S, deckFullName, deckWithChildren, saveFile, snapshot } from "./store";
import { csvCell } from "./csv";
import { toast } from "./toast";

const today = () => new Date().toISOString().slice(0, 10);
const safe = (s: string) => s.replace(/::/g, "-").replace(/[^\w\- ]+/g, "").trim() || "deck";

/** Exports a deck (and subdecks) as Front,Back,Tags,Deck CSV — re-importable here and in Anki. */
export async function exportDeckCsv(deckId: number) {
  const ids = deckWithChildren(deckId);
  const seen = new Set<number>();
  const lines = ["Front,Back,Tags,Deck"];
  for (const c of S.cards) {
    if (!ids.has(c.deckId) || seen.has(c.noteId)) continue;
    seen.add(c.noteId);
    const n = S.notes.get(c.noteId);
    if (!n) continue;
    lines.push([n.front, n.back, n.tags.join(" "), deckFullName(c.deckId)].map(csvCell).join(","));
  }
  try {
    const where = await saveFile(`${safe(deckFullName(deckId))}-${today()}.csv`, "﻿" + lines.join("\r\n"));
    toast(`Exported ${lines.length - 1} notes to ${where}`, 5000);
  } catch (e) {
    toast("Export failed: " + e);
  }
}

/** Full collection as JSON (decks, notes, cards, review history, settings). */
export async function exportBackupJson() {
  try {
    const where = await saveFile(`recall-backup-${today()}.json`, JSON.stringify(snapshot()));
    toast(`Backup exported to ${where}`, 5000);
  } catch (e) {
    toast("Export failed: " + e);
  }
}
