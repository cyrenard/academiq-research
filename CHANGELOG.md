# Changelog

## 1.1.4 — Critical hotfixes: Browser Capture install + /t narrative citation

### Fixed (critical)
- **Browser Capture "Kur" button could not be clicked.** The button was being `disabled` by the renderer whenever the detected install strategy reported `supported: false` — which fired for Firefox users, users without a Windows default browser association, and users with non-standard browsers (Yandex / Whale / Opera GX / portable Chromium). The click handler never even ran, so users saw "click does nothing" with no error. The disable rule is removed; the install button is now always clickable. The same fix applies to the Repair and Launch buttons.
- **Silent click handlers** for install/update/repair/launch/restart-agent/stop-agent/test now route through a single `bindCaptureActionBtn` helper that:
  - Shows an "İşleniyor..." busy state on the button so the click is visibly registered.
  - Console-logs every step (`[browser-capture] dispatching action ...`).
  - Catches IPC errors and surfaces them in the status bar instead of swallowing them.
  - On a successful install/repair/update, automatically opens the extension folder in Explorer so the user can immediately see and locate the bundled extension files.
- **`/t` narrative citations rendered as parenthetical** (same as `/r`). Root cause: the ProseMirror `citation` mark schema did not declare `data-mode` as an allowed attribute, so on insert TipTap silently stripped `data-mode="textual"`. Then the DOM post-processor `normalizeCitationSpans` saw a `.cit` span without `data-mode` and rewrote its text into the parenthetical form. Adding `data-mode` to `addAttributes` (in both `src/tiptap-word-editor.js` and the inlined HTML mirror) preserves it through the editor pipeline so the "Yazar (Yıl)" format survives.

### Notes
- Extension files are bundled inside `app.asar` and copied on install to `%LOCALAPPDATA%\AcademiQ\browser-capture-extension\<family>\`. The auto-open after install makes that visible to the user without hunting through AppData.

## 1.1.3 — Hotfix: import & paste hardening

### Fixed
- **Word/RTF import:** `normalizeImportHTML` now detects `{\rtf` buffers and detokenises RTF control words (`\par`, `\line`, `\u<n>?`, `\'XX`, font/colour/style tables) before routing to the plain-text path. Previously, an RTF file would land in `formatPlainTextAPA` as raw bytes and the editor rendered control codes as visible prose. New helper `stripRtfControlCodes()` is exported.

### Performance
- **Paste size cap:** the editor's `apaPaste` ProseMirror plugin now drops HTML pastes larger than 2 MB and falls through to the plain-text path. Pastes from Notion/Google Docs/long Wikipedia tables can carry 10+ MB of markup that turned the editor unresponsive on subsequent interactions.
- **Removed redundant click listener** in `editor-runtime.attachSurfaceHandlers`. The capture-phase handler duplicated `onSelectionUpdate`'s linked-note resolution; on a bloated paste it walked the ancestor chain twice per click. Selection updates already cover the same path, so the click listener is dropped.

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
