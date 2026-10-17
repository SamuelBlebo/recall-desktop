import type { Card, Note } from "./types";
import { esc, nl2br } from "./util";

const CZ = () => /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** Cloze numbers used in a text, e.g. [1, 2]. */
export function clozeOrds(text: string): number[] {
  return [...new Set([...text.matchAll(CZ())].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** Text with all cloze markup removed (for lists and search). */
export const stripCloze = (text: string) => text.replace(CZ(), "$2");

/** Which card ords a note produces. */
export function noteOrds(kind: Note["kind"], front: string): number[] {
  if (kind === "cloze") return clozeOrds(front);
  if (kind === "rev") return [1, 2];
  return [1];
}

export interface Faces {
  question: string; // HTML
  answer: string; // HTML (question side + answer)
  expected?: string; // for type-in cards
}

/** Builds the HTML for both sides of a card. All user text is escaped. */
export function renderCard(note: Note, card: Pick<Card, "ord">): Faces {
  if (note.kind === "cloze") {
    const side = (reveal: boolean) =>
      nl2br(
        esc(note.front).replace(CZ(), (_m, n, txt, hint) =>
          Number(n) === card.ord
            ? reveal
              ? `<span class="cz on">${txt}</span>`
              : `<span class="cz">[${hint || "…"}]</span>`
            : txt,
        ),
      );
    const extra = note.back.trim() ? `<div class="extra">${nl2br(esc(note.back))}</div>` : "";
    return { question: side(false), answer: side(true) + extra };
  }
  const front = card.ord === 2 ? note.back : note.front;
  const back = card.ord === 2 ? note.front : note.back;
  if (note.kind === "type") {
    return { question: nl2br(esc(front)), answer: nl2br(esc(front)), expected: back };
  }
  return { question: nl2br(esc(front)), answer: `${nl2br(esc(front))}<hr>${nl2br(esc(back))}` };
}
