# Changelog

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
