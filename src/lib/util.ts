import { DAY, MIN } from "./types";

let lastId = 0;
/** Unique, increasing integer id (safe inside JS number range). */
export function newId(): number {
  let id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  if (id <= lastId) id = lastId + 1;
  lastId = id;
  return id;
}

export const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const nl2br = (s: string) => s.replace(/\n/g, "<br>");

/** End of the current study day (Anki-style rollover hour, default 4am). */
export function dayEnd(startHour = 4, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(startHour, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
export const dayStart = (startHour = 4, now = Date.now()) => dayEnd(startHour, now) - DAY;

/** Calendar key for a timestamp, shifted by the rollover hour. */
export function dayKey(t: number, startHour = 4): string {
  const d = new Date(t - startHour * 3_600_000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function fmtIvl(ms: number): string {
  const m = ms / MIN;
  if (m < 60) return Math.max(1, Math.round(m)) + "m";
  const h = m / 60;
  if (h < 24) return Math.round(h) + "h";
  const d = h / 24;
  if (d < 30) return Math.round(d) + "d";
  if (d < 365) return (d / 30).toFixed(1).replace(".0", "") + "mo";
  return (d / 365).toFixed(1).replace(".0", "") + "y";
}

export const splitTags = (s: string) =>
  s.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

export function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}
