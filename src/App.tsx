import { useEffect, useState, type JSX } from "react";
import { S, backupNow, deckWithChildren, useStore } from "./lib/store";
import { counts } from "./lib/queue";
import { isDesktop } from "./lib/persist";
import { DecksPage } from "./pages/Decks";
import { StudyPage } from "./pages/Study";
import { BrowsePage } from "./pages/Browse";
import { AddPage } from "./pages/Add";
import { StatsPage } from "./pages/Stats";
import { SettingsPage } from "./pages/Settings";
import { Palette, paletteOpen, setPalette } from "./components/Palette";
import { openImport } from "./components/ImportCsv";
import { Icon, ModalHost, Toasts, anyModalOpen, go, useNav, type View } from "./components/ui";
import { WebSignIn } from "./components/Account";
import { cloudConfigured } from "./lib/cloud/config";
import { syncLabel, useSync } from "./lib/cloud/status";

const NAV: [View, string][] = [["decks", "Decks"], ["study", "Study"], ["browse", "Browse"], ["add", "Add cards"]];

function Side() {
  const nav = useNav();
  const sync = useSync();
  const k = counts(deckWithChildren("all"));
  const due = k.due + k.learn;
  const btn = ([v, label]: [View, string]) => (
    <button key={v} className={`nav ${nav.view === v ? "on" : ""}`} onClick={() => (v === "study" ? go("study", { studyDeck: nav.view === "study" ? nav.studyDeck : "all", studySeq: nav.view === "study" ? nav.studySeq : nav.studySeq + 1 }) : go(v))}>
      <Icon name={v} />{label}
      {v === "study" && due > 0 && <span className="badge">{due}</span>}
    </button>
  );
  return (
    <aside className="side">
      <div className="logo"><i />recall</div>
      <button className="search" onClick={() => setPalette(true)}><Icon name="search" size={16} />Search<kbd>Ctrl K</kbd></button>
      {NAV.map(btn)}
      <div className="navlbl">Analyze</div>
      {btn(["stats", "Statistics"])}
      <div className="foot">
        {btn(["settings", "Settings"])}
        <div className="user">
          <div className="av">{(S.settings.profileName || "?").slice(0, 1).toUpperCase()}</div>
          <div><b>{S.settings.profileName || "You"}</b><span>{sync.state !== "off" && sync.state !== "signedOut" ? syncLabel(sync) : S.storage === "sqlite" ? "Offline · saved on this PC" : "This browser only"}</span></div>
        </div>
      </div>
    </aside>
  );
}

const PAGES: Record<View, () => JSX.Element> = {
  decks: DecksPage, study: StudyPage, browse: BrowsePage, add: AddPage, stats: StatsPage, settings: SettingsPage,
};

export default function App() {
  const s = useStore();
  const nav = useNav();
  const sync = useSync();
  const [skipSignIn, setSkipSignIn] = useState(() => {
    try {
      return localStorage.getItem("recall-skip-signin") === "1";
    } catch {
      return false;
    }
  });
  const [dragging, setDragging] = useState(false);

  // global shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(!paletteOpen());
        return;
      }
      if (paletteOpen() || anyModalOpen() || nav.view === "study" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key === "/" && nav.view === "browse") (e.preventDefault(), document.getElementById("browse-q")?.focus());
      const v = ({ d: "decks", s: "study", b: "browse", a: "add", t: "stats" } as Record<string, View>)[e.key.toLowerCase()];
      if (v === "study") go("study", { studyDeck: "all", studySeq: nav.studySeq + 1 });
      else if (v) go(v);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [nav.view, nav.studySeq]);

  // automatic backups (desktop): shortly after start, then every N minutes, and when the window closes
  useEffect(() => {
    if (!s.ready || S.storage !== "sqlite") return;
    const due = () => Date.now() - S.settings.lastBackup >= S.settings.backupEveryMin * 60_000;
    const first = setTimeout(() => due() && backupNow(true), 15_000);
    const every = setInterval(() => due() && backupNow(true), 60_000);
    let unlisten: (() => void) | undefined;
    if (isDesktop())
      import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        const w = getCurrentWindow();
        unlisten = await w.onCloseRequested(async (ev) => {
          ev.preventDefault();
          try {
            if (S.revlog.length && Date.now() - S.settings.lastBackup > 5 * 60_000) await backupNow(true);
          } finally {
            await w.destroy();
          }
        });
      });
    return () => (clearTimeout(first), clearInterval(every), unlisten?.());
  }, [s.ready]);

  // drag a CSV onto the window to import it
  useEffect(() => {
    let depth = 0;
    const hasFile = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    const enter = (e: DragEvent) => hasFile(e) && !anyModalOpen() && (depth++, setDragging(true));
    const leave = (e: DragEvent) => hasFile(e) && --depth <= 0 && ((depth = 0), setDragging(false));
    const over = (e: DragEvent) => hasFile(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      depth = 0;
      setDragging(false);
      if (anyModalOpen()) return;
      e.preventDefault();
      const f = e.dataTransfer?.files[0];
      if (f && /\.(csv|tsv|txt)$/i.test(f.name)) openImport({ file: f });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  if (s.loadError)
    return (
      <div className="loading" style={{ padding: 30, textAlign: "center" }}>
        <div>
          <p className="ptitle">Recall couldn't open your collection</p>
          <p className="psub" style={{ maxWidth: 520 }}>{s.loadError}</p>
          <p className="psub">Your backups are in the "backups" folder next to recall.db.</p>
        </div>
      </div>
    );
  if (!s.ready) return <div className="loading">Loading your cards…</div>;
  if (!isDesktop() && cloudConfigured() && sync.state === "signedOut" && !skipSignIn)
    return (
      <WebSignIn onSkip={() => {
        try {
          localStorage.setItem("recall-skip-signin", "1");
        } catch {
          /* ignore */
        }
        setSkipSignIn(true);
      }} />
    );

  const Page = PAGES[nav.view];
  return (
    <div className={`app ${nav.focus && nav.view === "study" ? "focus" : ""}`}>
      <Side />
      <main><div className="wrap"><Page /></div></main>
      <Palette />
      <ModalHost />
      <Toasts />
      {dragging && <div className="drop">Drop a CSV file to import it</div>}
    </div>
  );
}
