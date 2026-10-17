/** Parses CSV/TSV text. Handles quotes, "" escapes, line breaks inside quotes and a UTF-8 BOM. */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') (cell += '"'), i++;
        else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) (row.push(cell), (cell = ""));
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** Picks the delimiter that gives the most consistent multi-column rows. */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 20000);
  let best = ",", bestScore = -1;
  for (const d of [",", "\t", ";", "|"]) {
    const rows = parseDelimited(sample, d).slice(0, 30);
    if (!rows.length) continue;
    const widths = rows.map((r) => r.length);
    const common = mode(widths);
    if (common < 2) continue;
    const score = widths.filter((w) => w === common).length * 10 + common;
    if (score > bestScore) (bestScore = score), (best = d);
  }
  return best;
}

function mode(xs: number[]): number {
  const m = new Map<number, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

export type ColumnRole = "front" | "back" | "tags" | "deck" | "ignore";

const HEADER_NAMES: Record<string, ColumnRole> = {
  front: "front", question: "front", q: "front", term: "front", prompt: "front", text: "front",
  back: "back", answer: "back", a: "back", definition: "back", meaning: "back", extra: "back",
  tags: "tags", tag: "tags", deck: "deck",
};

/** Guesses whether row 0 is a header and what each column means. */
export function guessMapping(rows: string[][]): { hasHeader: boolean; roles: ColumnRole[] } {
  const width = Math.max(...rows.slice(0, 20).map((r) => r.length), 0);
  const first = rows[0] ?? [];
  const known = first.map((h) => HEADER_NAMES[h.toLowerCase().replace(/[^a-z]/g, "")]);
  const hasHeader = known.filter(Boolean).length >= 1 && first.every((h) => h.length < 40);
  const roles: ColumnRole[] = [];
  for (let i = 0; i < width; i++) {
    if (hasHeader && known[i]) roles.push(known[i]!);
    else roles.push(i === 0 ? "front" : i === 1 ? "back" : i === 2 ? "tags" : "ignore");
  }
  // never map two columns to front/back/deck
  for (const r of ["front", "back", "deck"] as ColumnRole[]) {
    let seen = false;
    roles.forEach((x, i) => {
      if (x === r) {
        if (seen) roles[i] = "ignore";
        seen = true;
      }
    });
  }
  return { hasHeader, roles };
}

/** Escapes a value for CSV export. */
export const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
