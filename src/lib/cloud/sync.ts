import {
  collection, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot, type Unsubscribe,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { fb } from "./firebase";
import { setSync } from "./status";
import type { Persist } from "../persist";
import type { Card, Deck, Note, RemoteChanges, Revlog, Settings, Snapshot } from "../types";

/**
 * Cloud sync. Every local write is mirrored to Firestore under users/{uid}/{coll}/{id}
 * with a server timestamp `_u`; deletes leave a tombstone (`_d: true`) so other devices
 * learn about them. Each device remembers the newest `_u` it has seen and only pulls
 * documents changed after that, then listens for live changes.
 */
type Coll = "decks" | "notes" | "cards" | "revlog";
const COLLS: Coll[] = ["decks", "notes", "cards", "revlog"];
const SETTINGS = "settings";
type Op = { coll: Coll | typeof SETTINGS; id: string; data: DocumentData | null };

const emptyChanges = (): RemoteChanges => ({
  decks: [], notes: [], cards: [], revlog: [], del: { decks: [], notes: [], cards: [], revlog: [] },
});
/** JSON with sorted keys, so field order doesn't matter when comparing. */
const stable = (o: DocumentData) => JSON.stringify(o, Object.keys(o).sort());
const strip = ({ _u, _d, ...rest }: DocumentData) => rest;
// lastBackup is per device, so it is never synced
const cloudSettings = ({ lastBackup, ...rest }: Settings) => rest;

export class SyncedPersist implements Persist {
  kind;
  private uid: string | null = null;
  private signedOut = false;
  private pending: Op[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private cardNote = new Map<number, number>();
  private known: Record<Coll, Set<number>> = { decks: new Set(), notes: new Set(), cards: new Set(), revlog: new Set() };
  /** What we last sent per doc, so our own writes echoing back are ignored. */
  private sent = new Map<string, string>();
  private unsubs: Unsubscribe[] = [];
  private inbox = emptyChanges();
  private inboxSettings: Partial<Settings> | undefined;
  private inboxTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private local: Persist, private getSnapshot: () => Snapshot) {
    this.kind = local.kind;
  }

  /* ---------- Persist: local first, then mirror to the cloud ---------- */

  async load() {
    const s = await this.local.load();
    this.index(s);
    return s;
  }
  private index(s: Snapshot) {
    for (const c of COLLS) this.known[c] = new Set((s[c] as { id: number }[]).map((x) => x.id));
    this.cardNote = new Map(s.cards.map((c) => [c.id, c.noteId]));
  }

  saveDecks = (d: Deck[]) => (this.put("decks", d), this.local.saveDecks(d));
  deleteDecks = (ids: number[]) => (this.tomb("decks", ids), this.local.deleteDecks(ids));
  saveNotes = (n: Note[]) => (this.put("notes", n), this.local.saveNotes(n));
  deleteNotes = (ids: number[]) => {
    const set = new Set(ids);
    this.tomb("cards", [...this.cardNote].filter(([, n]) => set.has(n)).map(([c]) => c));
    this.tomb("notes", ids);
    return this.local.deleteNotes(ids);
  };
  saveCards = (c: Card[]) => {
    c.forEach((x) => this.cardNote.set(x.id, x.noteId));
    this.put("cards", c);
    return this.local.saveCards(c);
  };
  deleteCards = (ids: number[]) => (this.tomb("cards", ids), this.local.deleteCards(ids));
  addRevlog = (r: Revlog[]) => (this.put("revlog", r), this.local.addRevlog(r));
  deleteRevlog = (ids: number[]) => (this.tomb("revlog", ids), this.local.deleteRevlog(ids));
  saveSettings = (s: Settings) => (this.queue({ coll: SETTINGS, id: "main", data: cloudSettings(s) }), this.local.saveSettings(s));
  replaceAll = async (s: Snapshot) => {
    for (const c of COLLS) {
      const keep = new Set((s[c] as { id: number }[]).map((x) => x.id));
      this.tomb(c, [...this.known[c]].filter((id) => !keep.has(id)));
      this.put(c, s[c] as { id: number }[]);
    }
    this.queue({ coll: SETTINGS, id: "main", data: cloudSettings(s.settings as Settings) });
    await this.local.replaceAll(s);
    this.index(s);
  };
  backup = (keep: number) => this.local.backup(keep);
  openBackups = () => this.local.openBackups();
  saveFile = (name: string, contents: string) => this.local.saveFile(name, contents);

  private put(coll: Coll, items: { id: number }[]) {
    for (const x of items) {
      this.known[coll].add(x.id);
      this.queue({ coll, id: String(x.id), data: x as unknown as DocumentData });
    }
  }
  private tomb(coll: Coll, ids: number[]) {
    for (const id of ids) {
      this.known[coll].delete(id);
      if (coll === "cards") this.cardNote.delete(id);
      this.queue({ coll, id: String(id), data: null });
    }
  }
  private queue(op: Op) {
    // Hold writes until we're connected; when signed out, drop them
    // (the first sync after signing in uploads anything the cloud is missing).
    if (this.signedOut) return;
    this.pending.push(op);
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 300);
  }
  private flush() {
    if (!this.uid || !this.pending.length) return;
    const { db } = fb();
    const uid = this.uid;
    const ops = this.pending;
    this.pending = [];
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + 450)) {
        const data = op.data ? { ...op.data, _d: false } : { _d: true };
        this.sent.set(`${op.coll}/${op.id}`, stable(data));
        batch.set(doc(db, "users", uid, op.coll, op.id), { ...data, _u: serverTimestamp() });
      }
      // Resolves when the server confirms; offline it waits in Firestore's cache.
      batch.commit().catch((e) => {
        console.error("Cloud sync write failed", e);
        setSync({ state: "error", error: String(e?.message || e) });
      });
    }
  }

  /* ---------- connecting & receiving ---------- */

  start(onRemote: (c: RemoteChanges) => void) {
    const { auth } = fb();
    onAuthStateChanged(auth, (user) => {
      this.signedOut = !user;
      if (user) {
        setSync({ state: "syncing", email: user.email ?? "", error: "" });
        this.connect(user.uid, onRemote).catch((e) => {
          console.error(e);
          setSync({ state: "error", error: String(e?.message || e) });
        });
      } else {
        this.disconnect();
        this.pending = [];
        setSync({ state: "signedOut", email: "", error: "" });
      }
    });
  }

  private disconnect() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.uid = null;
  }

  private async connect(uid: string, onRemote: (c: RemoteChanges) => void) {
    this.disconnect();
    const { db } = fb();
    const key = `recall-sync:${uid}`;
    let since = 0;
    try {
      since = Number(localStorage.getItem(key) || 0);
    } catch {
      /* treat as first sync */
    }
    const first = !since;
    let newest = since;
    const col = (c: string) => collection(db, "users", uid, c);
    const changedSince = (c: string, t: number) => query(col(c), where("_u", ">=", Timestamp.fromMillis(t)));

    // 1. pull everything changed since our last sync
    const ch = emptyChanges();
    let remoteSettings: Partial<Settings> | undefined;
    const seen: Record<Coll, Set<number>> = { decks: new Set(), notes: new Set(), cards: new Set(), revlog: new Set() };
    for (const c of [...COLLS, SETTINGS] as const) {
      const snap = await getDocs(changedSince(c, since));
      snap.forEach((d) => {
        newest = Math.max(newest, this.stamp(d));
        if (c === SETTINGS) remoteSettings = strip(d.data()) as Partial<Settings>;
        else {
          seen[c].add(Number(d.id));
          this.take(ch, c, d);
        }
      });
    }

    // 2. first sync on this device: upload what the cloud doesn't have yet
    this.uid = uid;
    if (first) {
      const s = this.getSnapshot();
      for (const c of COLLS) this.put(c, (s[c] as { id: number }[]).filter((x) => !seen[c].has(x.id)));
      if (!remoteSettings) this.queue({ coll: SETTINGS, id: "main", data: cloudSettings(s.settings as Settings) });
    }
    await this.apply(ch, remoteSettings, onRemote);
    this.flush();

    // 3. live updates from other devices
    const remember = () => {
      try {
        localStorage.setItem(key, String(newest));
      } catch {
        /* ignore */
      }
    };
    remember();
    for (const c of [...COLLS, SETTINGS] as const) {
      this.unsubs.push(
        onSnapshot(
          changedSince(c, newest),
          (snap) => {
            for (const x of snap.docChanges()) {
              if (x.type === "removed" || x.doc.metadata.hasPendingWrites) continue;
              const t = this.stamp(x.doc);
              if (t > newest) newest = t;
              if (this.isEcho(c, x.doc)) continue;
              if (c === SETTINGS) this.inboxSettings = strip(x.doc.data()) as Partial<Settings>;
              else this.take(this.inbox, c, x.doc);
            }
            remember();
            this.scheduleInbox(onRemote);
            setSync({ state: snap.metadata.fromCache ? "offline" : "synced", error: "" });
          },
          (e) => setSync({ state: "error", error: String(e?.message || e) }),
        ),
      );
    }
    setSync({ state: "synced" });
  }

  private stamp(d: QueryDocumentSnapshot) {
    const u = d.get("_u");
    return u instanceof Timestamp ? u.toMillis() : 0;
  }
  private isEcho(c: string, d: QueryDocumentSnapshot) {
    const k = `${c}/${d.id}`;
    const mine = this.sent.get(k);
    if (mine === undefined) return false;
    const { _u, ...data } = d.data();
    if (stable(data) !== mine) return false;
    this.sent.delete(k);
    return true;
  }
  private take(ch: RemoteChanges, c: Coll, d: QueryDocumentSnapshot) {
    const data = d.data();
    if (data._d) ch.del[c].push(Number(d.id));
    else (ch[c] as unknown[]).push(strip(data));
  }

  // Changes in different collections from one write arrive separately; group them.
  private scheduleInbox(onRemote: (c: RemoteChanges) => void) {
    clearTimeout(this.inboxTimer);
    this.inboxTimer = setTimeout(() => {
      const ch = this.inbox;
      const st = this.inboxSettings;
      this.inbox = emptyChanges();
      this.inboxSettings = undefined;
      this.apply(ch, st, onRemote).catch((e) => console.error("Applying cloud changes failed", e));
    }, 300);
  }

  /** Puts remote changes into memory (onRemote) and the local database, without echoing them back up. */
  private async apply(ch: RemoteChanges, st: Partial<Settings> | undefined, onRemote: (c: RemoteChanges) => void) {
    const total = COLLS.reduce((n, c) => n + ch[c].length + ch.del[c].length, 0);
    if (!total && !st) return;
    if (st) ch.settings = st;
    onRemote(ch);
    const L = this.local;
    if (ch.decks.length) await L.saveDecks(ch.decks);
    if (ch.notes.length) await L.saveNotes(ch.notes);
    if (ch.cards.length) await L.saveCards(ch.cards);
    if (ch.revlog.length) await L.addRevlog(ch.revlog);
    if (ch.del.revlog.length) await L.deleteRevlog(ch.del.revlog);
    if (ch.del.cards.length) await L.deleteCards(ch.del.cards);
    if (ch.del.notes.length) await L.deleteNotes(ch.del.notes);
    if (ch.del.decks.length) await L.deleteDecks(ch.del.decks);
    if (st) await L.saveSettings(this.getSnapshot().settings as Settings);
    for (const c of COLLS) {
      (ch[c] as { id: number }[]).forEach((x) => this.known[c].add(x.id));
      ch.del[c].forEach((id) => this.known[c].delete(id));
    }
    ch.cards.forEach((x) => this.cardNote.set(x.id, x.noteId));
    ch.del.cards.forEach((id) => this.cardNote.delete(id));
  }
}
