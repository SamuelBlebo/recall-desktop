import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { getToasts, subscribeToasts } from "../lib/toast";

/* ---------------- tiny router ---------------- */

export type View = "decks" | "study" | "browse" | "add" | "stats" | "settings";
interface Nav {
  view: View;
  studyDeck: number | "all";
  studySeq: number; // bumps to start a fresh session
  browseQuery: string;
  browseSel: number | null;
  addDeck: number | null;
  focus: boolean;
}
let nav: Nav = { view: "decks", studyDeck: "all", studySeq: 0, browseQuery: "", browseSel: null, addDeck: null, focus: false };
const navSubs = new Set<() => void>();
export function go(view: View, patch: Partial<Nav> = {}) {
  nav = { ...nav, ...patch, view, focus: view === "study" ? nav.focus || !!patch.focus : false };
  navSubs.forEach((f) => f());
  document.querySelector("main")?.scrollTo(0, 0);
}
export const setNav = (patch: Partial<Nav>) => {
  nav = { ...nav, ...patch };
  navSubs.forEach((f) => f());
};
export const getNav = () => nav;
export const useNav = () =>
  useSyncExternalStore(
    (f) => (navSubs.add(f), () => navSubs.delete(f)),
    () => nav,
  );
export const study = (deck: number | "all") => go("study", { studyDeck: deck, studySeq: nav.studySeq + 1 });

/* ---------------- modals ---------------- */

type ModalRender = (close: () => void) => ReactNode;
let modals: { id: number; render: ModalRender }[] = [];
const modalSubs = new Set<() => void>();
let mseq = 0;
export function openModal(render: ModalRender) {
  const id = ++mseq;
  const close = () => {
    modals = modals.filter((m) => m.id !== id);
    modalSubs.forEach((f) => f());
  };
  modals = [...modals, { id, render: () => render(close) }];
  modalSubs.forEach((f) => f());
  return close;
}
export const anyModalOpen = () => modals.length > 0;

export function ModalHost() {
  const list = useSyncExternalStore((f) => (modalSubs.add(f), () => modalSubs.delete(f)), () => modals);
  return <>{list.map((m) => <div key={m.id}>{m.render(() => {})}</div>)}</>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card pad modal ${wide ? "wide" : ""}`} role="dialog" aria-label={title}>
        <div className="row" style={{ marginBottom: 6 }}>
          <p className="ptitle grow">{title}</p>
          <button className="btn sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function confirmDialog(message: string, opts: { title?: string; confirm?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    openModal((close) => {
      const done = (v: boolean) => (close(), resolve(v));
      return (
        <Modal title={opts.title ?? "Are you sure?"} onClose={() => done(false)}>
          <p style={{ marginTop: 4 }}>{message}</p>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn" onClick={() => done(false)}>Cancel</button>
            <button className={`btn pri ${opts.danger ? "danger" : ""}`} autoFocus onClick={() => done(true)}>{opts.confirm ?? "OK"}</button>
          </div>
        </Modal>
      );
    });
  });
}

function PromptBody({ initial, hint, onDone }: { initial: string; hint?: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  return (
    <form onSubmit={(e) => (e.preventDefault(), onDone(v.trim() || null))}>
      {hint && <p className="psub" style={{ marginBottom: 8 }}>{hint}</p>}
      <input ref={ref} className="input" value={v} autoFocus onChange={(e) => setV(e.target.value)} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button>
        <button className="btn pri">Save</button>
      </div>
    </form>
  );
}
export function promptDialog(title: string, initial = "", hint?: string): Promise<string | null> {
  return new Promise((resolve) => {
    openModal((close) => {
      const done = (v: string | null) => (close(), resolve(v));
      return (
        <Modal title={title} onClose={() => done(null)}>
          <PromptBody initial={initial} hint={hint} onDone={done} />
        </Modal>
      );
    });
  });
}

/* ---------------- toasts ---------------- */

export function Toasts() {
  const list = useSyncExternalStore(subscribeToasts, getToasts);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  );
}

/* ---------------- icons ---------------- */

const PATHS: Record<string, string> = {
  decks: "M4 6h16M4 12h16M4 18h10",
  study: "M5 4h14v16H5zM9 9h6M9 13h4",
  browse: "M11 5a6 6 0 1 0 0 12a6 6 0 1 0 0-12zM20 20l-4.5-4.5",
  add: "M12 5v14M5 12h14",
  stats: "M5 20V10M12 20V4M19 20v-7",
  settings: "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
  search: "M11 5a6 6 0 1 0 0 12a6 6 0 1 0 0-12zM20 20l-4.5-4.5",
  calendar: "M5 5h14v15H5zM5 10h14M9 3v4M15 3v4",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
};
export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  if (name === "dots")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

/** Small "⋯" dropdown menu. */
export function Menu({ items }: { items: [string, () => void, boolean?][] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="btn sm" aria-label="More" onClick={() => setOpen(!open)}><Icon name="dots" size={16} /></button>
      {open && (
        <div className="menu-pop">
          {items.map(([label, fn, danger]) => (
            <button key={label} className={danger ? "danger" : ""} style={danger ? { color: "var(--again)" } : undefined} onClick={() => (setOpen(false), fn())}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
