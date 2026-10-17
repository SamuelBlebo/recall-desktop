import { useRef, useState } from "react";
import { S, backupNow, openBackups, restoreSnapshot, updateSettings, useStore } from "../lib/store";
import { loadSampleDecks } from "../lib/sample";
import { exportBackupJson, exportDeckCsv } from "../lib/exporter";
import { toast } from "../lib/toast";
import { openImport } from "../components/ImportCsv";
import { deckOptions } from "../components/NoteEditor";
import { confirmDialog } from "../components/ui";
import type { Settings } from "../lib/types";

/** Reviews per day relative to the 90% default (from FSRS's interval formula). */
const workload = (r: number) => Math.round(((1 / (1 / r - 1)) / (1 / (1 / 0.9 - 1))) * 100);

function Num({ label, k, min, max, hint }: { label: string; k: keyof Settings; min: number; max: number; hint?: string }) {
  const v = S.settings[k] as number;
  return (
    <>
      <label className="f">{label}</label>
      <input className="input" type="number" min={min} max={max} value={v}
        onChange={(e) => {
          const x = Math.round(Number(e.target.value));
          if (Number.isFinite(x)) updateSettings({ [k]: Math.min(max, Math.max(min, x)) } as Partial<Settings>);
        }} />
      {hint && <p className="psub small">{hint}</p>}
    </>
  );
}

export function SettingsPage() {
  useStore();
  const s = S.settings;
  const restoreRef = useRef<HTMLInputElement>(null);
  const [exportDeck, setExportDeck] = useState<number | "">("");
  const decks = deckOptions();

  const restore = async (f: File) => {
    try {
      const snap = JSON.parse(await f.text());
      if (!(await confirmDialog(`Replace everything in Recall with "${f.name}"? Your current collection is backed up first.`, { title: "Restore backup", confirm: "Restore", danger: true }))) return;
      await restoreSnapshot(snap);
      toast("Backup restored");
    } catch (e) {
      toast("Couldn't restore: " + ((e as Error)?.message || e));
    }
  };

  return (
    <>
      <div className="phead"><h1>Settings</h1></div>
      <div className="grid2">
        <div className="card pad">
          <p className="ptitle" style={{ fontSize: 15 }}>Scheduler (FSRS)</p>
          <label className="f">Desired retention: {Math.round(s.retention * 100)}%</label>
          <input type="range" min={70} max={97} value={Math.round(s.retention * 100)} style={{ width: "100%" }}
            onChange={(e) => updateSettings({ retention: Number(e.target.value) / 100 })} />
          <p className="psub small">How sure you want to be of remembering a card when it comes up. Daily workload ≈ <b>{workload(s.retention)}%</b> of the 90% default. Before exams, 92–95% is good.</p>
          <Num label="New cards per day" k="newPerDay" min={0} max={9999} />
          <Num label="Maximum reviews per day" k="reviewsPerDay" min={0} max={99999} />
          <Num label="Leech threshold (forgets before a card is suspended)" k="leechThreshold" min={2} max={99} />
          <Num label="Next day starts at (hour, 0–23)" k="dayStartHour" min={0} max={23} hint="Studying past midnight still counts as the same day until this hour." />
          <label className="check"><input type="checkbox" checked={s.fuzz} onChange={(e) => updateSettings({ fuzz: e.target.checked })} />Add small random variation to intervals so cards don't bunch up</label>
        </div>

        <div className="card pad">
          <p className="ptitle" style={{ fontSize: 15 }}>Appearance</p>
          <label className="f">Theme</label>
          <select className="input" value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as Settings["theme"] })}>
            <option value="system">Match Windows</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
          <label className="f">Your name</label>
          <input className="input" value={s.profileName} onChange={(e) => updateSettings({ profileName: e.target.value })} />

          <p className="ptitle" style={{ fontSize: 15, marginTop: 22 }}>Backups</p>
          <p className="psub small">
            {S.storage === "sqlite" ? "Saved automatically on this PC. " : "Browser preview mode: data is kept in this browser only. "}
            Last backup: {s.lastBackup ? new Date(s.lastBackup).toLocaleString() : "never"}
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => backupNow()}>Back up now</button>
            {S.storage === "sqlite" && <button className="btn" onClick={openBackups}>Open backups folder</button>}
          </div>
          <Num label="Automatic backup every (minutes)" k="backupEveryMin" min={5} max={1440} />
          <Num label="Backups to keep" k="keepBackups" min={3} max={500} />
        </div>
      </div>

      <div className="card pad mt">
        <p className="ptitle" style={{ fontSize: 15 }}>Import &amp; export</p>
        <div className="grid2">
          <div>
            <label className="f">Import cards</label>
            <div className="row">
              <button className="btn pri" onClick={() => openImport({})}>Import CSV / TSV / Anki text…</button>
            </div>
            <p className="psub small">Front, Back, Tags columns (with or without a header). You can also drag a CSV file onto the window.</p>
            <label className="f">Restore a full backup (.json)</label>
            <button className="btn" onClick={() => restoreRef.current?.click()}>Choose backup file…</button>
            <input ref={restoreRef} type="file" accept=".json" hidden onChange={(e) => (e.target.files?.[0] && restore(e.target.files[0]), (e.target.value = ""))} />
          </div>
          <div>
            <label className="f">Export a deck as CSV</label>
            <div className="row">
              <select className="input grow" style={{ width: "auto" }} value={exportDeck} onChange={(e) => setExportDeck(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Choose a deck…</option>
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button className="btn" disabled={exportDeck === ""} onClick={() => exportDeck !== "" && exportDeckCsv(exportDeck)}>Export</button>
            </div>
            <label className="f">Export everything (.json, includes review history)</label>
            <button className="btn" onClick={exportBackupJson}>Export full backup</button>
            <label className="f">Sample data</label>
            <button className="btn" onClick={() => toast(`Loaded ${loadSampleDecks()} sample cards`)}>Load sample decks</button>
          </div>
        </div>
      </div>
      <p className="psub small" style={{ marginTop: 16 }}>Recall {__APP_VERSION__} · works fully offline · storage: {S.storage === "sqlite" ? "SQLite on this PC" : "browser (preview)"}</p>
    </>
  );
}
