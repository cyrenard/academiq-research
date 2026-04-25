# Changelog

## 1.1.2

### Removed
- AI Writing Assistant fully removed from app: deleted `src/ai/` module, dropped `aiAPI` IPC bridge, removed AI UI panel and modals, purged on-disk `ai-secrets.enc` (encrypted API keys) and `ai-chat/` history. Startup performs one-shot cleanup of any residual files in both `APP_DIR` and Electron `userData`.
- Grammarly DOM integration cleanup: dropped non-functional `data-gramm*` attributes from editor surfaces (Grammarly desktop app handles spellcheck natively).

### Added
- Local OCR via Tesseract.js (`src/local-ocr.js`) replaces the AI-based PDF OCR. Runs in the main process, caches `tur+eng` language data under `<userData>/tesseract-cache`, exposed to the renderer via the new `ocrAPI.recognize` bridge and `ipcMain.handle('ocr:recognize')`.
- "Dosya gezgininde aç" entry in the Kaynakça inline card right-click menu.

### Security
- `createCaptureToken()` now uses `crypto.randomBytes(32)` instead of `Math.random()` to mint the local browser-capture bridge token (256-bit entropy).
- Renderer error log (`renderer-errors.log`) gains a 5 MB soft cap with tail rotation to prevent unbounded growth.

### Fixed
- Tests: bibliography fixtures aligned with accessibility attributes (`data-ref-id`, `tabindex`, `role="button"`); page-layout test mocks updated for the multi-target `#apapage-bg,#bibpage-bg,#tocpage-bg,#coverpage-bg` selector.
- `main.js` no longer references a non-existent `src/index.html` fallback path; missing bundled HTML now triggers a clean `app.quit()`.
- AI cleanup runs **before** storage init so subsequent code cannot recreate purged files.

### Internal
- Removed unreferenced cruft: root `legacy-runtime.js` and `tmp-dist-academiq-research.html` build artifacts.
- `src/legacy-runtime.js` OCR call path migrated from `aiAPI.ocrFromImage` → `ocrAPI.recognize`.

## 1.1.0 - Hardened Baseline

### Summary

Release-ready hardening baseline focused on security, maintainability, and behavior parity.

### Security

- CSP tightened to `script-src 'self'` and `connect-src 'self'`.
- Removed script-side `unsafe-inline` and `unsafe-eval` reliance.
- Renderer hardening with strict Electron webPreferences (`webSecurity/contextIsolation/sandbox`).
- Network access moved to controlled IPC surfaces with host allowlist checks.

### Refactor and structure

- Inline HTML event attributes removed from markup.
- Event wiring centralized under `src/ui-event-bindings.js`.
- Inline runtime script moved to external modules:
  - `src/legacy-runtime.js`
  - `src/app-bootstrap.js`

### Dependency and packaging

- CDN runtime script/CSS dependencies moved under `vendor/`.
- `pdfjs` worker switched to local path.
- `electron-builder` include list updated to package `vendor/**/*`.
- Packaged override sync updated to copy `vendor/` assets.

### Validation

- `npm run gate:release` passed.
- `npm run build:dir` passed.
- Runtime launch smoke check passed.

### Breaking changes

- None intended.
- Release goal: hardening with behavior preservation.
