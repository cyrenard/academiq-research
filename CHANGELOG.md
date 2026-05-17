# Changelog

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
