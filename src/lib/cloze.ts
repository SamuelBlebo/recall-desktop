import type { Card, Note } from "./types";
import { CZ_HIDE, CZ_HIDE_END, CZ_OFF, CZ_ON, plain, rich } from "./rich";

const CZ = () => /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** Cloze numbers used in a text, e.g. [1, 2]. */
export function clozeOrds(text: string): number[] {
  return [...new Set([...text.matchAll(CZ())].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** Plain text with cloze markup and HTML removed (for lists and search). */
export const stripCloze = (text: string) => plain(text.replace(CZ(), "$2"));

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

/** Builds the HTML for both sides of a card: HTML, Markdown and LaTeX in the text are rendered safely. */
export function renderCard(note: Note, card: Pick<Card, "ord">): Faces {
  if (note.kind === "cloze") {
    const side = (reveal: boolean) =>
      rich(
        note.front.replace(CZ(), (_m, n, txt, hint) =>
          Number(n) === card.ord ? (reveal ? CZ_ON + txt + CZ_OFF : CZ_HIDE + (hint || "…") + CZ_HIDE_END) : txt,
        ),
      );
    const extra = note.back.trim() ? `<div class="extra">${rich(note.back)}</div>` : "";
    return { question: side(false), answer: side(true) + extra };
  }
  const front = card.ord === 2 ? note.back : note.front;
  const back = card.ord === 2 ? note.front : note.back;
  if (note.kind === "type") {
    return { question: rich(front), answer: rich(front), expected: back };
  }
  return { question: rich(front), answer: `${rich(front)}<hr>${rich(back)}` };
}
