# Changelog

## 1.24.1-beta.23 - 2026-08-28

Restores live citation search after the `/r` and `/t` popup opens.

- Enables and focuses the citation search input on Windows as well as Linux.
- Keeps popup typing authoritative so AQ Engine's delayed slash refresh cannot
  erase the first characters of a search query.
- Preserves the editor trigger range while the popup owns keyboard input, so
  inserting a selected reference still replaces the original slash command.
- Allows pointer focus for the search and citation-mode controls while keeping
  citation result clicks isolated from the editor.
- Restores editor focus when the popup is dismissed with Escape.
- Adds Windows regression coverage and real-browser keyboard verification for
  `/r`, `/t`, matching queries, and empty results.

## 1.24.1-beta.22 - 2026-08-27

Windows and Linux citation popup visibility correction confirmed with live
keyboard input in a real browser renderer.

- Clears the stale `aq-hidden` class left by asynchronous startup hydration
  before opening the `/r` or `/t` citation picker. That utility used
  `display: none !important`, so earlier fixes detected the command while the
  popup remained visually hidden.
- Makes the explicit `show` state authoritative in CSS and keeps close/open
  transitions synchronized with the shared transient-visibility utility.
- Recognizes AQ Engine capture, Windows writing-assist, and legacy editable
  surfaces in the eager keyboard fallback on both Windows and Linux.
- Adds a live regression fixture that begins with the real startup-hidden
  state and verifies visible `/r` and `/t` results after actual key input.
- Retains beta.21 autosave recovery, serialized persistence, and eager popup
  ownership changes.

## 1.24.1-beta.21 - 2026-08-27

Packaged Windows citation popup correction based on the last live-tested
working ownership model.

- Restores the eager citation popup host from beta.15 so `/r` and `/t` do not
  depend on the lazy compatibility tree mounting in WebView2.
- Opens slash citations immediately from AQ Engine's authoritative document
  and caret offsets, while retaining the delayed refresh as a fallback.
- Rebinds the citation runtime when popup DOM mounts after early startup and
  pins explicitly opened triggers against stale selection refreshes.
- Keeps the extra global key fallback Windows-only; Linux retains its editable
  popup-input and focus behavior.
- Retains beta.20 autosave serialization, startup recovery, and storage fixes.

## 1.24.1-beta.20 - 2026-08-26

Windows citation slash-trigger correction after packaged-app live testing.

- Restores the beta.9 direct AQ Engine-to-citation-runtime ownership path for
  typed `/r` and `/t` commands; React command routing is fallback-only.
- Adds a real AQ Engine input test that types `/r` while the React router is
  mounted and asserts that the citation runtime receives the refresh.
- Adds popup behavior coverage for both inline (`/r`) and textual (`/t`) modes,
  plus a browser fixture used to verify that the visible picker opens.
- Retains beta.19 startup recovery, serialized autosave, Windows input, and
  Linux/WebKit focus behavior.

## 1.24.1-beta.19 - 2026-08-25

Release-candidate reliability pass following Windows live testing.

- Prevents the React and legacy editor runtimes from racing during startup and
  replacing hydrated content with a temporary blank document.
- Preserves documents, workspaces, references, notes, and notebooks across all
  partial editor-save sources while keeping explicit delete operations intact.
- Recovers a clearly truncated generic-autosave state from the richest recent
  automatic backup once, without applying recovery to explicit user saves.
- Keeps the Windows `/r` and `/t` citation picker behavior from beta.18 and the
  Linux/WebKit focus path covered by the platform regression suite.
- Repairs Turkish status text, visual Turkish heading recognition, and
  all-uppercase English bibliography navigation.
- Removes stale current-build dependencies on the archived Electron-era HTML
  shell from the Electron fallback and release-quality gates.

## 1.24.0-beta.9 - 2026-05-26

Performance + reliability pass on top of beta.8.

- **SQLite WAL mode**: main database connection now uses Write-Ahead
  Logging so reads (renderer load, library search) no longer block
  while autosave is writing, and vice versa. Editor responsiveness
  under heavy autosave is markedly better, and recovery after an
  ungraceful shutdown is more predictable.
- **Open-access PDF download tightening**: extra guards in
  `pdf::url_fallback` for redirect handling and content-length
  verification, reducing the rare cases where a 200 OK reply still
  produced a zero-byte or malformed PDF on disk.
- **Virtualised sidebar lists**: `RefSidebar` and `NoteSidebar` now
  render through a new `VirtualList` primitive at
  `src/renderer/components/ui/VirtualList.tsx`. Workspaces with
  thousands of references or notes scroll without paint stalls. The
  buffer is set to 5 items above and below the viewport to prevent
  white flickers when row heights vary.
- **Error telemetry surface enabled**: `app.rs` now records uncaught
  renderer errors with structured fields, complementing the existing
  `events-day-*.jsonl` stream.

beta.8 installer preserved as `.bak` for rollback.

## 1.24.0-beta.8 - 2026-05-24

Soak-test hotfix for two beta.7 user-visible regressions.

- **Editor click hijack removed.** `plain-citation-linking.js` was
  registering a global capture-phase `click` listener that, after a
  user typed any inline citation, treated every subsequent left
  click as a candidate for the single-link modal and reopened it
  with preventDefault — the editor became unusable. The ambient
  registration is gone; the right-click context menu and the
  toolbar's `openPlainCitationLinking` entry continue to work.
  Strengthened regression test now fails if the ambient listener is
  re-added.
- **CrossRef modal routed to the React shell with a cosmetic backup.**
  `tiptap-word-footnotes.js::showCrossRefDialog` now defers to
  `window.__aqOpenReactCrossRefModal` when the React shell has
  registered it (App.tsx installs the hook on mount, eliminating the
  ~1s race window where the legacy HTML modal would still appear).
  The legacy renderer is kept as a fallback and now ships with
  inline styles so its filter chips and format previews remain
  readable even when the `aq-crd-*` CSS rules don't reach the page.

beta.7 installer preserved as `.bak` for rollback.

## 1.24.0-beta.7 - 2026-05-24

Four new major features landed in one tour: WinRT-based native
Windows OCR (alternative to tesseract.js), startup rolling backup
of the SQLite database, Cargo release-profile size optimisations,
and a live citation auditor with new CrossRef, PlainCitationLinker,
and ReferenceImport modals. Spell engine expanded with Turkish
morphology + custom rules.

## 1.24.0-beta.6 - 2026-05-19

Stabilisation and test-repair pass: 250-line robustness expansion
in `db::migrate`, polish on `InlineInteractionHandler` and
`SectionTabs`, minor aq-engine patches, four test-suite repairs,
and refreshed manual-smoke checklist.

## 1.24.0-beta.5 - 2026-05-18

Stabilisation + polish pass on top of beta.4. No new user-facing
features; tightens hot paths and diagnostics so the next bug report
arrives with enough log signal to debug from.

- `pdf_download` no longer round-trips 25 MB+ PDF bodies through
  `serde_json::Value::Array<u8>` on the way to `pdf_save`. A new
  internal helper `save_pdf_bytes` writes the owned `Vec<u8>` straight
  to disk, dropping peak memory ~8× on large open-access downloads.
- Capture sidecar now respawns once when the prior child crashed or
  wedged. Transport-shaped errors (`capture_sidecar_write_failed`,
  `capture_sidecar_response_closed`, `capture_sidecar_timeout`) trigger
  a one-shot retry instead of silently failing every subsequent
  invocation. Protocol-level errors from the sidecar surface as before.
- New `telemetry::record_event(name, payload)` API writes structured
  events to `events-day-<unix_day>.jsonl` next to the existing
  `compat-day-*.jsonl`. Wired in for sidecar respawn/spawn failure,
  PDF download success/failure (host-only, no full URLs), and SQLite
  state-save failures broken down by stage (open / begin_tx /
  write_blob / commit).
- App.tsx no longer duplicates `window.S` publish logic in five
  places — extracted into `src/renderer/lib/legacy-state-bridge.ts`
  with a docstring that explains why mutation is unsafe here (legacy
  hydrate paths reassign `S` wholesale).
- `.gitignore` now pattern-matches the SQLite recovery snapshots that
  Phase 8.3 history-recovery code writes next to the live database.

Test gate: 994 node tests, 495 vitest, 47 cargo lib, full
`cargo tauri build --no-bundle` all pass. No behaviour changes vs
beta.4; beta.4 installer is preserved as `.bak` for rollback.

## 1.24.0-beta.4 - 2026-05-18

Broad parity advance covering Phase 8.3 soak feedback in a single
release. Frameless Tauri window chrome, open-access PDF download
flow repair, autosave persistence chain restoration, idempotent
`window.electronAPI` bundle guard, renderer workspace + confirm
flow stabilisation, empty-revisions history recovery, drop router,
section tab parity, and a refreshed Phase 8.2 parity audit.

## 1.24.0-beta.3 - 2026-05-18

Hotfix release for beta.2 soak-test regressions.

- Restores legacy document history when an existing beta SQLite database has documents but an empty `revisions` table; adds a manual Storage action for force remigration.
- Keeps `kv.state_blob` as the lossless data-load source so references saved in workspaces survive app restarts.
- Commits fresh AQ Engine HTML before workspace/document transitions to prevent workspace content loss.
- Prevents workspace add from entering a switch loop by keeping the transition path explicit.
- Uses the React confirm dialog for document/workspace delete flows instead of native confirm fallback.
- Adds frontend OA PDF download tracing via `aq.lastPdfDownloadAttempt` and verifies React flows call `pdf:download`.

## 1.24.0-beta.2 - 2026-05-18

Hotfix release for the beta cutover soak test.

- Fixed legacy data detection to read the real Electron root at `%LOCALAPPDATA%\AcademiQ\` instead of treating the Tauri app-data directory as the migration source.
- Migrates `academiq-data.json`, `document-history.json`, settings, session state, capture state, PDFs, and workspace folders into the Tauri app-data layout without modifying the source directory.
- Added a regression fixture for Turkish workspace paths and the LOCALAPPDATA migration path.
- Added defensive Tauri dialog permissions and a synchronous confirm fallback so `plugin:dialog|confirm` ACL rejection no longer opens the beta console/probe path.
- Restored open-access PDF downloads with a Rust-side User-Agent, content length cap, safe URL guard, and HTML `citation_pdf_url` / `.pdf` fallback.
- Restored left-click spell suggestions and added a shared inline interaction bridge for citations, footnotes, cross-references, links, images, and tables in the React shell.
- Added visible React shell bridges for literature matrix navigation, APA linter status access, track changes toggle, margin notes, footnotes, and shortcut help.
- Hid the browser capture sidecar console window on Windows.
- Added Phase 8.2 parity regression coverage and a feature parity audit status update.

## 1.24.0-beta.1 - 2026-05-17

Beta release for the Electron 42 to Tauri 2 cutover.

- Replaced the Electron host path with a Tauri 2 shell and Rust command layer while keeping the renderer API stable.
- Moved application data to SQLite with FTS5 search and guarded legacy `data.json` migration backups.
- Added Rust PDF storage, annotation, metadata, rendering, and PDF export paths.
- Moved Turkish spell checking to Rust while keeping OCR in the existing JavaScript worker.
- Packaged browser capture through a Node sidecar and stdio JSON-RPC bridge.
- Added Tauri updater, NSIS packaging, self-signed signing scripts, and beta release artifacts.
- Kept `THIRD_PARTY_NOTICES.md` in the distribution output and app bundle resources.

Known limits:

- Windows SmartScreen can show an "unknown publisher" warning because this beta uses a self-signed certificate.
- Telemetry is local-only and opt-in by support workflow; no crash log is uploaded automatically.

Observed migration targets from the phase gates:

- Lower memory pressure from removing Electron from the primary runtime.
- Smaller installer footprint from the Tauri bundle path.
- Faster spell checking through the Rust spell path.
