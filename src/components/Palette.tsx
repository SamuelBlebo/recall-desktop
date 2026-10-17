import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { S, backupNow, deckFullName, updateSettings } from "../lib/store";
import { openImport } from "./ImportCsv";
import { go, study, type View } from "./ui";
import { newDeckFlow } from "../pages/Decks";

let open = false;
const subs = new Set<() => void>();
export const setPalette = (v: boolean) => ((open = v), subs.forEach((f) => f()));
export const paletteOpen = () => open;

interface Item { label: string; hint: string; run: () => void }

function items(): Item[] {
  const views: [View, string][] = [["decks", "Decks"], ["study", "Study"], ["browse", "Browse"], ["add", "Add cards"], ["stats", "Statistics"], ["settings", "Settings"]];
  const list: Item[] = views.map(([v, l]) => ({ label: `Go to ${l}`, hint: "page", run: () => go(v) }));
  list.push({ label: "Study all decks", hint: "study", run: () => study("all") });
  for (const d of S.decks) {
    const name = deckFullName(d.id).replace(/::/g, " › ");
    list.push({ label: `Study ${name}`, hint: "deck", run: () => study(d.id) });
    list.push({ label: `Add cards to ${name}`, hint: "deck", run: () => go("add", { addDeck: d.id }) });
  }
  list.push(
    { label: "Import CSV…", hint: "action", run: () => openImport({}) },
    { label: "New deck…", hint: "action", run: () => newDeckFlow() },
    { label: "Back up now", hint: "action", run: () => backupNow() },
    { label: "Search: due today", hint: "browse", run: () => go("browse", { browseQuery: "is:due", browseSel: null }) },
    { label: "Search: struggling cards", hint: "browse", run: () => go("browse", { browseQuery: "lapses:>=3", browseSel: null }) },
    { label: "Toggle dark mode", hint: "action", run: () => {
      const dark = S.settings.theme === "dark" || (S.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      updateSettings({ theme: dark ? "light" : "dark" });
    } },
  );
  return list;
}

export function Palette() {
  const isOpen = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => open);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen) (setQ(""), setI(0), setTimeout(() => ref.current?.focus(), 0));
  }, [isOpen]);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items().filter((x) => words.every((w) => x.label.toLowerCase().includes(w))).slice(0, 10);
  }, [q, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isOpen) return null;
  const run = (k: number) => {
    const x = list[k];
    setPalette(false);
    x?.run();
  };
  return (
    <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && setPalette(false)}>
      <div className="card pal" role="dialog" aria-label="Command palette">
        <input ref={ref} className="input" placeholder="Type a command or deck name…" value={q}
          onChange={(e) => (setQ(e.target.value), setI(0))}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPalette(false);
            else if (e.key === "ArrowDown") (e.preventDefault(), setI(Math.min(list.length - 1, i + 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setI(Math.max(0, i - 1)));
            else if (e.key === "Enter") (e.preventDefault(), run(i));
          }} />
        {list.map((x, k) => (
          <div key={x.label} className={`it ${k === i ? "on" : ""}`} onMouseEnter={() => setI(k)} onClick={() => run(k)}>
            <span>{x.label}</span><small>{x.hint}</small>
          </div>
        ))}
        {!list.length && <div className="it z">No matches</div>}
      </div>
    </div>
  );
}
