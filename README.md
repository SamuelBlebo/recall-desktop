# Recall Desktop

An offline, Anki-style flashcard app for your PC. Built with Tauri 2, React, TypeScript, SQLite and FSRS (ts-fsrs). No internet is needed to use it.

## One-time setup on Windows

1. **Node.js**: install the LTS version from nodejs.org, then install pnpm with `npm install -g pnpm`.
2. **Rust**: install from rustup.rs. When it asks, let it install the **Visual Studio C++ Build Tools** ("Desktop development with C++").
3. **WebView2**: already built into Windows 10 and 11.

Then open a terminal in this folder and run:

```bash
pnpm install
```

This step and step 3 need internet once. After that, the app itself never uses the internet.

## Run it

```bash
pnpm tauri dev
```

The first run compiles Rust and takes a few minutes. Later runs are fast.

## Make the installer (.exe)

```bash
pnpm tauri build
```

The installer is created at `src-tauri/target/release/bundle/nsis/Recall_0.1.0_x64-setup.exe`. Install it and Recall appears in your Start menu like any other app.

## Preview in a browser (optional)

`pnpm dev`, then open http://localhost:1420. In the browser, data is saved in browser storage instead of SQLite. This mode is useful for quick UI changes.

## Web version and sync

The web version is at **https://recall-dp-app.web.app** (Firebase project `recall-dp-app`).

Sign in with the same email and password in the desktop app (Settings → Cloud sync) and on the web. Every change is mirrored to Firestore and other signed-in devices pick it up within seconds. Each device keeps its own local copy, so the app still works offline and catches up when it reconnects. The first sign-in on a device uploads the cards already on it.

To publish a new web version:

```bash
pnpm build
firebase deploy
```

## Where your data lives

- **Collection:** `%APPDATA%\com.blebo.recall\recall.db`
- **Backups:** `%APPDATA%\com.blebo.recall\backups\`. A backup is made every 30 minutes and when you close the app, and the newest 30 are kept. Settings → Open backups folder takes you there.

## Features (Phase 1)

- **Decks:** subdecks (`UG Courses::MATH 122`), plus rename, delete, collapse and per-deck menus.
- **Review activity panel:** a 4-month heatmap, streak, retention, today's numbers and the recall-chance chart.
- **Study:** FSRS scheduling with interval previews on each button.
- **Skip (don't know):** shows the answer, restarts the card from scratch and moves it to the end of the session.
- **Card types:** Basic, Basic + reversed, Cloze (`{{c1::answer::hint}}`) and Type-in.
- **During study:** undo, flag, suspend, edit, automatic leech detection and focus mode.
- **Browse:** Anki search syntax (`deck:` `tag:` `is:due` `is:new` `is:skipped` `lapses:>=3` `"phrase"` `-tag:x`), sorting, editing and bulk actions (suspend, flag, tag, move, reset, delete).
- **Add:** live preview, duplicate warning, cloze shortcut, and tags that stay filled in for the next card.
- **CSV import:**
  - Reads Front, Back, Tags and Deck columns, and detects the header row and separator.
  - Lets you map each column, skips duplicates and adds extra tags.
  - Fronts containing `{{c1::…}}` become cloze cards.
  - Anki "Notes in plain text" `.txt` exports work too.
  - You can drag a CSV onto the window.
- **Export:** a deck as CSV, or everything as a JSON backup; restore from JSON.
- **Statistics:** recall chart, 30-day forecast, answer buttons, card states, heatmap and struggling cards.
- **Settings:** desired retention (with a workload estimate), daily limits, leech threshold, day rollover hour, theme (light/dark/system) and backup settings.
- **Ctrl+K command palette.**

## Keyboard shortcuts

| Where | Keys |
|---|---|
| Anywhere | `Ctrl+K` command palette · `D` decks · `S` study · `B` browse · `A` add · `T` stats |
| Study | `Space` show / Good · `1–4` Again/Hard/Good/Easy · `0` Skip · `Z` undo · `G` flag · `E` edit · `@` suspend · `F` focus · `Esc` back |
| Add | `Ctrl+Enter` add · `Ctrl+Shift+C` cloze the selection |
| Browse | `/` focus search |

## Project layout

```
src/            React app (pages/, components/, lib/)
  lib/store.ts      in-memory collection + all changes (writes go to SQLite)
  lib/scheduler.ts  FSRS (ts-fsrs) + Skip logic
  lib/queue.ts      what card comes next, daily limits
  lib/search.ts     Anki-style search
  lib/csv.ts        CSV parsing / detection
  lib/persist/      sqlite.ts (desktop) and local.ts (browser preview)
src-tauri/      Rust shell: SQLite plugin, migrations.sql, backup commands
```

## Next phases

- **Phase 2:** .apkg/.colpkg import, images and audio, offline maths (KaTeX), template editor.
- **Phase 3:** FSRS optimizer trained on your own history, exam-date mode, smart filtered decks, Image Occlusion.
- **Phase 4:** polish, plugins, optional sync with a phone app.
