# Tauri Phase 0 and 0.5 Manual Smoke

These checks must be run after a Rust toolchain is installed and `cargo tauri dev` can start the WebView2 shell.

## 1. React renderer opens in WebView2

1. Run `npm run build:renderer`.
2. Run `cargo tauri dev`.
3. Confirm the main window opens with title `AcademiQ Research` at roughly 1400x900.
4. Confirm the first screen is the React/Tailwind shell from `src/renderer`, not the legacy `academiq-research.html` shell.

Expected result: the React shell renders without a blank WebView or CSP console error, and `window.electronAPI` plus `window.ocrAPI` exist.

## 2. AQ Engine mounts in React shell

1. Open the editor surface in the React shell.
2. Confirm an empty AQ Engine document/page is visible.
3. Type a short sentence.

Expected result: the AQ Engine surface accepts input, lays out the page, and no legacy-shell-only startup error appears.

## 3. Turkish IME input

1. Focus the AQ Engine editor surface.
2. Type normal Turkish characters: `ğ ş ı i ö ü ç`.
3. Type uppercase variants: `Ğ Ş I İ Ö Ü Ç`.
4. Type the same sequence through the active Turkish keyboard/dead-key path.

Expected result: every character appears exactly as typed, with no replacement squares, dropped dead-key output, or incorrect `ı/i/İ/I` mapping.

## 4. pdf.js worker through blob URL

1. Open a PDF in the app.
2. Watch the WebView2 devtools console.
3. Confirm `vendor/pdf.worker.min.js` loads and pdf.js can render at least page 1.

Expected result: no CSP violation for `worker-src`, no worker fallback error, and the page canvas renders.

## 5. Tiptap compat-shim command

1. Focus the editor.
2. Trigger Bold from the toolbar or run `editor.chain().focus().toggleBold().run()` from devtools if `editor` is exposed.
3. Type a short word.

Expected result: the command returns true and the typed word is bold.

## Results - 2026-05-17

Environment:

```text
rustc 1.95.0 (59807616e 2026-04-14)
cargo 1.95.0 (f2d3ce0bd 2026-03-21)
tauri-cli 2.11.2
WebView2 148.0.3967.54
MSVC Visual Studio Build Tools 2022
```

## Phase 8.2 Browser Capture Manual E2E — 2026-05-18

Firefox / Zen Browser checklist for beta.2 soak:

1. Open AcademiQ 1.24.0-beta.2 and keep it running.
2. Open Settings / browser capture and confirm `browserFamily=firefox` or the Zen Browser executable path is still present after migration.
3. In Firefox or Zen Browser, load the bundled extension from the app's capture guide path.
4. Open the extension popup and verify it connects to `127.0.0.1:27183`.
5. Capture a DOI page and a page with `citation_pdf_url`.
6. Expected result: the payload reaches the active workspace, the queue is acknowledged, and no sidecar console window opens.
7. If Firefox fails but Chrome/Edge works, record the extension popup error and sidecar queue file contents; this is not a cutover blocker unless the user depends on Firefox/Zen for browser capture.

Launch:

```text
cargo tauri dev
Vite ready in 1371 ms
Rust dev build finished in 52.63s
WebView2 app process observed after about 69s on cold dev build
```

1. React renderer opens in WebView2: PASS.

- WebView2 CDP page: title `AcademiQ Research`, URL `http://127.0.0.1:5173/`.
- Runtime checks: `window.electronAPI === true`, `window.ocrAPI === true`, `window.AQEngine === true`.
- Evidence: `tests/artifacts/tauri-react-shell-topmost-2026-05-16.png`.

2. AQ Engine mounts in React shell: PASS.

- Runtime check: `[data-aq-engine-editor]` exists in the WebView2 DOM.
- Empty document rendered, then accepted text in the AQ Engine surface.
- Evidence: `tests/artifacts/tauri-aq-engine-turkish-input-topmost-2026-05-16.png`.

3. Turkish IME input: PASS.

- Normal WebView2 input path accepted Turkish characters.
- WebView2 CDP IME composition path completed with `Input.imeSetComposition + Input.insertText`.
- DOM evidence after composition: `[data-aq-engine-editor]` text included `ime: ğ ş ı i ö ü ç`.
- Evidence: `tests/artifacts/tauri-aq-engine-ime-composition-2026-05-16.png`.

4. pdf.js worker through blob URL: PASS.

CDP evaluation in the real WebView2 page:

```json
{
  "ok": true,
  "phase": "constructed",
  "bytes": 4692537
}
```

This fetched `/vendor/pdf.worker.min.js`, wrapped it in a `Blob`, created a blob URL, and constructed a `Worker` without CSP violation.

5. Tiptap compat-shim command: PASS.

CDP evaluation in the real WebView2 page:

```json
{
  "ok": true,
  "source": "global-candidate"
}
```

The evaluated command was `editor.chain().focus().toggleBold().run()`.

Electron legacy shell guard: PASS.

- `npm start -- --remote-debugging-port=9444` opened the legacy Electron renderer.
- CDP page: title `AcademiQ — Yerel`, URL `academiq-research.html`.
- DOM check: legacy shell present, React `#root` absent.

Automated checks:

```text
node --test tests/tauri-smoke.test.js: 8 pass, 0 fail
npm test: 942 pass, 0 fail
npm run test:renderer: 25 files pass, 482 pass, 0 fail
npm run gate:editor: PASS
npm run build:renderer: PASS
```

## Phase 1 Results - 2026-05-17

Environment:

```text
rustc 1.95.0 (59807616e 2026-04-14)
cargo 1.95.0 (f2d3ce0bd 2026-03-21)
tauri-cli 2.11.2
```

Tauri dev launch:

```text
cargo tauri dev
Vite ready in 409 ms on the warm run
Rust dev build finished in 53.73s
WebView2 CDP page: title AcademiQ Research, URL http://127.0.0.1:5173/
```

IPC live smoke in the real WebView2 window: PASS.

```json
{
  "title": "AcademiQ Research",
  "hasRoot": true,
  "hasAQ": true,
  "directSave": { "ok": true },
  "directLoadOk": true,
  "savePdfOk": true,
  "existsBeforeDelete": true,
  "loadPdfOk": true,
  "deletePdfOk": true,
  "existsAfterDelete": false,
  "netJsonOk": true,
  "appInfoOk": true,
  "updateCheckShape": true,
  "exportStub": "not_implemented_phase_5",
  "browserStub": "not_implemented_phase_6",
  "browserPromptSeen": true,
  "ocrStub": "OCR_NOT_IMPLEMENTED_PHASE_4",
  "toggleOk": true,
  "confirmType": "boolean"
}
```

Notes:

- `window.electronAPI` and `window.ocrAPI` remained the only renderer-facing contract.
- Tauri v2 injected `window.__TAURI_INTERNALS__.invoke`; the Phase 1 shim now uses that runtime path.
- `data_save` and `data_load` were verified by direct Tauri invoke to avoid React shell autosave racing the smoke payload.
- PDF round-trip wrote, loaded, and deleted `phase-1-smoke-pdf.pdf` under the Tauri app data directory.
- `netFetchJSON` successfully fetched CrossRef DOI `10.1038/nphys1170` and returned status `ok`.
- `openPDFDialog` was invoked from the real WebView2 window and entered the native picker pending state. The cancel automation was interrupted by the operator, but the dialog command reached native UI without app crash.
- `window.confirm` now returns a synchronous boolean guard in Tauri, preventing legacy browser-capture startup from throwing on Tauri's async confirm bridge.
- `wordToHtml` now uses the Phase 1 JS shim path: Rust reads the DOCX bytes and `src/tauri-api.ts` converts them through browser `mammoth.convertToHtml`.
- `downloadUpdate` now performs an HTTPS download to a temp file and returns `{ ok, path, size, url }`.
- Browser Capture, export, and OCR returned explicit phase-deferred stubs as planned.

Electron legacy shell guard: PASS.

```text
npm start -- --remote-debugging-port=9444
CDP page title: AcademiQ — Yerel
CDP page URL: file:///.../academiq-research.html
```

Because current `main.js` prefers `dist/renderer/index.html` when the built renderer exists, this check temporarily moved `dist/renderer` aside and restored it after the process exited. No Electron source files were changed.

Build and automated checks:

```text
node --test tests/ipc-parity.test.js tests/tauri-smoke.test.js: 12 pass, 0 fail
npm test: 946 pass, 0 fail
npm run test:renderer: 25 files pass, 482 pass, 0 fail
npm run gate:editor: PASS
cargo check: PASS
cargo tauri build --no-bundle: PASS
Built application at src-tauri/target/release/academiq-research-tauri.exe
```

## Phase 2 Results - 2026-05-17

Data layer migration: PASS.

- `rusqlite` was selected over `sqlx` for Phase 2 because the plan preferred the smaller MSVC surface; async isolation is handled with `tokio::task::spawn_blocking`.
- `src-tauri/migrations/0001_init.sql` creates `schema_version`, documents/revisions/tabs/library/citation/annotation/highlight tables, `kv`, FTS5 table, FTS triggers, and required indexes.
- `electronAPI.loadData()` still returns the same renderer blob shape from `kv.state_blob`; SQL tables are a projection for search/history.
- `electronAPI.saveData()` and `saveEditorDraft()` write transactionally through SQLite.
- Legacy `academiq-data.json` migration always copies `academiq-data.json.bak.<timestamp>` before SQLite writes. The original JSON is not deleted by default.

Manual Tauri dev smoke:

```text
cargo tauri dev
WebView2 page title: AcademiQ Research
URL: http://127.0.0.1:5173/
data load/save/load round-trip through window.electronAPI: PASS
legacy JSON migration created academiq.sqlite and academiq-data.json.bak.<timestamp>: PASS
```

Note: WebView2/Tauri uses the real Windows app data path for `com.academiq.research`; after the manual smoke, the temporary smoke SQLite created during validation was removed so the user's legacy `academiq-data.json` remains the active source until the next app launch. The backup copy was intentionally left in place.

Automated checks:

```text
node --test tests/data-migration.test.js tests/library-fts.test.js: 8 pass, 0 fail
node --test tests/ipc-parity.test.js tests/tauri-smoke.test.js: 12 pass, 0 fail
npm test: 954 pass, 0 fail
npm run test:renderer: 25 files pass, 482 pass, 0 fail
npm run gate:editor: PASS
cargo check: PASS
cargo tauri build --no-bundle: PASS
```

FTS performance:

```text
library_search 1000+ entry fixture: PASS under 50ms Rust budget
Turkish character search (Türkçe / ğ / ş / ı / ö fixture terms): PASS
```
## Phase 3 - pdf-lib call sites

Inventory command:

```text
rg -n "pdf-lib|PDFDocument\.load|pdfDoc\.|PDFDocument" src tests package.json main.js preload.js
```

Call sites:

- `src/main-process-pdf-annotate.js`: native annotated PDF flatten path currently uses `pdf-lib` (`PDFDocument.load`, page drawing, text wrapping). Phase 3 Rust replacement command is `pdf_apply_annotations`; export flatten remains deferred to Phase 5.
- `tests/main-process-pdf-annotate.test.js`: pdf-lib fixture generation and reload assertions for the old Electron annotate helper. Keep until Phase 5 removes that JS path.
- `src/legacy-runtime.js`: `pdfDoc.*` occurrences are pdf.js viewer/runtime calls (`getPage`, `getData`, `getOutline`, page render/search). These are viewer calls, not `pdf-lib`; pdf.js viewer remains untouched in Phase 3.
- `package.json`: `pdf-lib` dependency remains installed by rule; do not remove before Phase 5.

## Phase 3 perf

Rust fixture gate:

```text
100 page PDF, 100 highlight annotations: PASS under 2s
pdf_render_page, warmed 150 DPI render: PASS under 500ms
```

The first render includes PDFium dynamic library startup and is intentionally warmed before measuring the per-page render budget.

## Phase 3 Results - 2026-05-17

PDF Rust pipeline: PASS.

- `lopdf = 0.34`, `pdfium-render = 0.8` with `thread_safe`, and PNG encoding compile on Windows MSVC.
- `scripts/fetch-pdfium.ps1` downloads `pdfium-win-x64.tgz` and copies `pdfium.dll` to `src-tauri/binaries/pdfium.dll`.
- `tauri.conf.json` bundles `binaries/pdfium.dll` as a resource.
- Added Rust modules under `src-tauri/src/pdf/`: metadata, annotations, render, extract, pdfium_init.
- Added Tauri commands: `pdf_extract_metadata`, `pdf_apply_annotations`, `pdf_read_annotations`, `pdf_render_page`, `pdf_extract_text`, `pdf_get_outline`, `library_ingest_pdf`.
- `library_ingest_pdf` writes metadata into `library_items`; annotation apply writes both the PDF annotation object and the `annotations` DB cache.
- `pdf_read_annotations` reads DB cache first, then falls back to parsing the PDF file.
- `src/tauri-api.ts` added `electronAPI.pdf.*` wrappers only; renderer modules were not changed.
- `cargo tauri dev` launched the Tauri debug executable and WebView2 process; the validation command was stopped after the 60s smoke window so no long-running dev server remained.

Automated checks:

```text
node --test tests/pdf-rust.test.js: PASS
node --test tests/ipc-parity.test.js tests/tauri-smoke.test.js tests/data-migration.test.js tests/library-fts.test.js tests/pdf-rust.test.js: 21 pass, 0 fail
cargo check: PASS
npm test: 955 pass, 0 fail
npm run test:renderer: 25 files pass, 482 pass, 0 fail
npm run gate:editor: PASS
cargo tauri build --no-bundle: PASS
cargo test --release phase3_pdf_perf_budget_large_annotation_and_render -- --nocapture: PASS
```

## Phase 4 - nspell and tesseract.js call sites

Inventory commands:

```text
rg -n nspell src tests package.json scripts src-tauri
rg -n "tesseract\.js|Tesseract\.|tesseract\.|ocrAPI|local-ocr|recognize" src tests package.json scripts src-tauri
```

nspell call sites:

- `src/renderer/lib/spellcheck.ts`: the only runtime nspell service. Phase 4 keeps the fallback and routes Tauri through `window.electronAPI.spell.*`.
- `src/renderer/lib/spellcheck-controller.ts`: service coordinator only; now uses the async Rust spell path when Tauri exposes it. `SpellcheckPanel` UI was not changed.
- `src/renderer/lib/spellcheck.test.ts` and `src/renderer/lib/spellcheck-controller.test.ts`: fake nspell tests retained for fallback/tokenization behavior.
- `package.json`: `nspell` remains installed as the Phase 8 fallback.
- `scripts/sync-dictionary.js`: now copies `dictionary-tr` to both `public/dictionary/tr/` and `src-tauri/resources/dict/tr/`.

tesseract.js/OCR call sites:

- `src/local-ocr.js`: Electron-side local OCR service uses `tesseract.js`, lazy worker creation, `tesseract-cache`, and worker reuse.
- `main.js`: `ocr:recognize` sanitizes payloads and delegates to `localOcr.recognize`; Electron OCR behavior is unchanged.
- `preload.js`: exposes `window.ocrAPI.recognize`.
- `src/legacy-runtime.js`: PDF OCR batch flow already tracks queued/running/progress/fail/cancel state through `pdfOcrRunToken`, caches OCR text items per tab, and calls `window.ocrAPI.recognize`.
- `src-tauri/src/commands/ocr.rs`: remains an explicit Phase 4 JS-shim/stub boundary; no tesseract-rs migration was attempted.

OCR review result: PASS.

- Worker path exists and remains JS/Tesseract based.
- Cancel/progress/batch state already exists in the PDF runtime.
- OCR cache already syncs per PDF tab; no new OCR feature was added in Phase 4.

## Phase 4 Results - 2026-05-17

Spell + network Rust pipeline: PASS.

- `spellbook = 0.4.0` added; `dictionary-tr` aff/dic files are bundled under `src-tauri/resources/dict/tr/`.
- `dictionary-tr` numeric Hunspell flag `0` is remapped in memory for spellbook compatibility; source dictionary files are unchanged.
- `spell_check`, `spell_suggest`, `spell_add_user_word`, and `spell_get_user_dictionary` are registered Tauri commands.
- User dictionary persists in SQLite `kv` as `spell_user_dict_tr`.
- `src/tauri-api.ts` exposes `electronAPI.spell.*`.
- `src/renderer/lib/spellcheck.ts` uses Rust spell when Tauri exposes it and keeps nspell fallback for Electron/tests.
- `SpellcheckPanel` UI component was not changed.
- Network commands now use a singleton reqwest client with HTTP/2, pooled connections, 30s timeout default, shared User-Agent, per-host rate scoping, and ETag cache via SQLite `kv`.

Automated checks so far:

```text
cargo check: PASS
cargo test phase4_spell_ -- --nocapture: 3 pass, 0 fail
cargo test phase4_network_ -- --nocapture: 3 pass, 0 fail
node --test tests/spell-rust.test.js: PASS
node --test tests/network-rust.test.js: PASS
node --test tests/ipc-parity.test.js: 4 pass, 0 fail
npm run test:renderer -- src/renderer/lib/spellcheck.test.ts src/renderer/lib/spellcheck-controller.test.ts: 26 pass, 0 fail
node --test tests/ipc-parity.test.js tests/tauri-smoke.test.js tests/data-migration.test.js tests/library-fts.test.js tests/pdf-rust.test.js tests/spell-rust.test.js tests/network-rust.test.js: 23 pass, 0 fail
npm test: 957 pass, 0 fail
npm run test:renderer: 25 files pass, 482 pass, 0 fail
npm run gate:editor: PASS
cargo tauri build --no-bundle: PASS
```

## Phase 5 Results - 2026-05-17

PDF export Rust pipeline: PASS.

- `printpdf = 0.7` and `ttf-parser = 0.21` compile on Windows MSVC.
- No Microsoft proprietary TTF files are bundled. Bundled resources are limited to `src-tauri/resources/fonts/fallback/` with Liberation Serif/Sans, Carlito, and license files.
- Runtime font resolution uses system Times New Roman from `%WINDIR%/Fonts/times*.ttf` first, then falls back to bundled Liberation Serif with warning metadata.
- `export_pdf(layoutJson, options)` accepts aq-engine paginate output and draws layout JSON to PDF without duplicating aq-engine pagination.
- APA running head and page number drawing are handled in Rust.
- `src/renderer/lib/export-pdf.ts` serializes layout JSON and emits warning events if fallback font substitution occurs.
- DOCX export was reviewed and remains JS/browser-side through `src/docx-export.js`.
- `pdf-lib` npm dependency was removed; `npm ls pdf-lib` reports `(empty)`.

Font metrics gate:

```text
tests/font-metrics-parity.test.js: PASS
source: system-times-new-roman
fontDir: C:\WINDOWS\Fonts
max_diff: 0
avg_diff: 0
p99_diff: 0
```

PDF export evidence:

```text
tests/pdf-export.test.js: PASS
tests/artifacts/phase5-50-page-apa.pdf generated
```

Automated checks:

```text
node --test tests/ipc-parity.test.js tests/tauri-smoke.test.js tests/data-migration.test.js tests/library-fts.test.js tests/pdf-rust.test.js tests/spell-rust.test.js tests/network-rust.test.js tests/font-metrics-parity.test.js tests/pdf-export.test.js tests/main-process-pdf-annotate.test.js: 33 pass, 0 fail
npm test: 959 pass, 0 fail
npm run test:renderer: 25 files pass, 482 pass, 0 fail
npm run gate:editor: PASS
cargo tauri build --no-bundle: PASS, built academiq-research-tauri.exe
node scripts/export-quality-gate.js: PASS
```

Phase 5 fallback events:

```text
No fallback event during this run. System Times New Roman was available and embedded.
```

## Phase 5 Font Metrics - 2026-05-17T14:24:07.104Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-17T14:32:05.187Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-17T14:44:33.772Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-17T15:36:10.008Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-17T15:36:29.705Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 6 Results — 2026-05-17

Browser Capture sidecar architecture and packaging:

```text
PASS docs/PHASE6_CAPTURE_ARCHITECTURE.md documents the existing Electron capture protocol.
PASS src-sidecar/capture-agent runs as a standalone Node JSON-RPC sidecar.
PASS pkg produced src-tauri/binaries/capture-agent-x86_64-pc-windows-msvc.exe.
PASS tauri.conf.json includes the sidecar externalBin and packaged extension resources.
PASS Tauri browserCapture commands call the sidecar bridge instead of Phase 1 stubs.
PASS Tauri window Destroyed event sends sidecar shutdown and kill fallback.
```

Automated bridge and extension protocol checks:

```text
node --test tests/browser-capture-bridge.test.js
PASS 4/4
- JSON-RPC getStatus/createWorkspace/rendererReady/ackPayload
- packaged .exe JSON-RPC getStatus
- prepareSetup writes Chromium extension manifest + config.js
- extension-style HTTP /hello and /capture accepted with X-AQ-Token
```

Chromium extension real-browser smoke:

```text
Chrome path check: NOT INSTALLED at the standard Program Files locations.
Microsoft Edge Chromium path: C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
Launched Edge with --load-extension=<prepared installDir> and temp profile.
PASS extension background sent /hello to the sidecar bridge.
extensionVersion: 1.0.1
protocolVersion: 1
browserFamily: chromium
```

Firefox extension:

```text
NOT RUN in this environment. Per Phase 6 acceptance, Firefox can be deferred when Chromium passes.
```

Regression checks:

```text
node --test tests/browser-capture-bridge.test.js tests/ipc-parity.test.js tests/tauri-smoke.test.js: 14 pass, 0 fail
node --test tests/data-migration.test.js tests/library-fts.test.js tests/pdf-rust.test.js: 9 pass, 0 fail
node --test tests/spell-rust.test.js tests/network-rust.test.js tests/font-metrics-parity.test.js tests/pdf-export.test.js: 4 pass, 0 fail
npm test: 961 pass, 0 fail
npm run test:renderer: 25 files pass, 482 pass, 0 fail
npm run gate:editor: PASS
cargo check: PASS
cargo tauri build --no-bundle: PASS
```

Notes:

```text
The real-browser smoke used Edge Chromium because Google Chrome is not installed on this machine.
The extension protocol and manifest are Chromium-compatible and the same extension background path reached the sidecar bridge.
End-user popup click capture was represented by the extension HTTP /capture protocol test because GUI extension action automation is not available in this shell.
```

## Phase 5 Font Metrics - 2026-05-17T15:51:12.081Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-17T15:54:32.219Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 7 Results — 2026-05-17

Updater + release pipeline:

```text
PASS tauri-plugin-updater registered and update:* commands are wired to the plugin.
PASS update:setUrl uses the documented SQLite kv channel workaround because Tauri 2 updater endpoints are static at runtime.
PASS updater public key is committed in tauri.conf.json; private key remains outside the repo at %USERPROFILE%\.tauri\academiq-updater.key.
PASS tauri-plugin-opener replaces the deprecated shell open path for app:openExternalUrl.
```

Signing and SmartScreen behavior:

```text
PASS scripts/generate-signing-cert.ps1 stores the self-signed code signing cert only in CurrentUser\My.
PASS no automatic import into CurrentUser\Root or TrustedPublisher.
PASS scripts/sign-installer.ps1 signs with signtool + RFC3161 timestamping.
PASS local signature presence check uses signtool verify /v; /pa trust verification can fail for self-signed certs and is intentionally not required.
EXPECTED signtool reports "certificate chain ... root certificate ... not trusted" on this dev machine.
EXPECTED SmartScreen / unknown-publisher warning remains visible for end-user-reality testing.
```

Build and artifact checks:

```text
npm run build: PASS
  - renderer build PASS
  - cargo tauri build PASS
  - NSIS installer produced: dist/tauri/AcademiQ Research_1.23.0_x64-setup.exe
  - installer size: 27,603,448 bytes
  - dist/tauri/latest.json written
  - dist/tauri/SHA256SUMS.txt written

npm run gate:release: PASS
  - syntax checks PASS
  - export-quality-gate PASS
  - editor-stability-gate PASS
  - node --test tests/*.test.js PASS 970/970
  - tauri-bundle-gate PASS
```

Regression checks:

```text
npm test: PASS 970/970
npm run test:renderer: PASS 25 files, 482/482
npm run gate:editor: PASS
node --test tests/release-pipeline.test.js tests/updater.test.js: PASS 7/7
node --test tests/browser-capture-bridge.test.js: PASS 4/4
node --test tests/data-migration.test.js: PASS 5/5
```

Installer manual note:

```text
NSIS installer launch in a clean VM was not executed from this local shell to avoid modifying the developer machine.
The installer artifact itself was produced by cargo tauri build, signed, timestamped, copied to dist/tauri, and validated by tauri-bundle-gate.
Before external release, run one clean Windows VM smoke: open the installer, verify expected SmartScreen/unknown-publisher prompt, complete current-user install, launch AcademiQ Research, then uninstall.
```

## Phase 8 Results — 2026-05-17

Cutover preparation:

```text
PASS THIRD_PARTY_NOTICES.md was already committed and is bundled as a Tauri resource.
PASS local legacy-electron branch exists to preserve the Electron 1.23.0 cutover base.
PASS package.json, package-lock.json, src-tauri/Cargo.toml, Cargo.lock, and tauri.conf.json are synchronized at 1.24.0-beta.1.
PASS MIGRATION_NOTES.md records that legacy-electron is local only and must not be pushed without user approval.
PASS cutover and legacy cleanup were NOT executed; both still require explicit user approval.
```

Dual-run comparison gates:

```text
PASS node --test tests/dual-run-comparison.test.js tests/aq-engine-cross-shell.test.js tests/pdf-export-diff.test.js tests/storage-roundtrip-cutover.test.js
  - 9 pass, 0 fail
PASS golden snapshot fixtures cover small-doc, large-doc, turkish-heavy, bibliography-heavy, and annotated-pdf cutover classes.
PASS AQ Engine cross-shell parity confirms React shell entry and legacy script order are both preserved.
PASS PDF export diff gate produced tests/artifacts/phase5-50-page-apa.pdf.
PASS storage roundtrip keeps data.json.bak rollback path green.
```

Telemetry and crash gate:

```text
PASS src-tauri/src/telemetry.rs writes local-only compatibility and crash jsonl logs under app_data_dir/telemetry.
PASS no automatic upload endpoint is configured.
PASS 30-day local rotation is implemented.
PASS node --test tests/dual-run-crash-gate.test.js
  - 3 pass, 0 fail
```

Beta build artifacts:

```text
PASS npm run build
  - renderer build PASS
  - cargo tauri build PASS
  - signed NSIS beta installer produced
  - copied root artifact: dist/AcademiQ-Setup-1.24.0-beta.1.exe
  - copied updater artifact: dist/tauri/AcademiQ-Setup-1.24.0-beta.1.exe
  - SHA256 for both copied beta artifacts: 340E08709ED4030C3F5C939A5F8CAAE2024B06805B9540D0D12F599D4BB4BA69
  - dist/tauri/latest.json version: 1.24.0-beta.1
  - latest.json URL: https://updates.academiq.research/windows-x86_64/1.24.0-beta.1/AcademiQ-Setup-1.24.0-beta.1.exe
  - dist/THIRD_PARTY_NOTICES.md copied
EXPECTED signtool verify /v reports an untrusted root chain for the self-signed certificate; signature presence and timestamp are still visible.
```

Regression checks:

```text
PASS npm run gate:release
  - export-quality-gate PASS
  - editor-stability-gate PASS
  - node --test tests/*.test.js PASS 983/983
  - tauri-bundle-gate PASS
PASS npm run test:renderer
  - 25 files PASS
  - 482 tests PASS
PASS node --test tests/release-pipeline.test.js
  - 5 pass, 0 fail
PASS cargo check
  - PASS with existing pdf/fonts.rs dead_code warnings only
PASS cargo test telemetry::tests
  - 2 pass, 0 fail
```

Manual notes:

```text
Clean Windows VM installer launch was not executed from this shell to avoid modifying the developer machine.
Dual-run week remains a user-operated beta exercise using docs/DUAL_RUN_GUIDE.md and scripts/dual-run-crash-gate.js.
Stable 1.24.0 cutover, main merge, tag, and legacy Electron cleanup are intentionally paused until the user explicitly says "cutover et".
```

## Phase 8 Beta Hotfix — 2026-05-17

User-reported beta install issue:

```text
Observed: the app opened, but a black console window also opened with:
[renderer:probeError] ... "Command plugin:dialog|confirm not allowed by ACL"
```

Fix:

```text
PASS release binary now uses cfg_attr(not(debug_assertions), windows_subsystem = "windows") in src-tauri/src/main.rs.
PASS src/tauri-api.ts confirm guard now consumes rejected Tauri dialog Promise values and returns safe false for synchronous window.confirm call sites.
PASS node --test tests/ipc-parity.test.js tests/release-pipeline.test.js
  - 10 pass, 0 fail
PASS cargo check
  - PASS with existing pdf/fonts.rs dead_code warnings only
PASS npm run build
  - rebuilt signed NSIS beta installer
PASS node scripts/tauri-bundle-gate.js
  - PASS
PASS refreshed beta artifact SHA256:
  - dist/AcademiQ-Setup-1.24.0-beta.1.exe
  - dist/tauri/AcademiQ-Setup-1.24.0-beta.1.exe
  - 8E1E91E495E1FE57361B122B2B5297B1D4E9242D0D00001EE7DC19201BEF0077
```

## Phase 5 Font Metrics - 2026-05-17T18:16:26.862Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-18T07:40:19.794Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-18T07:51:08.414Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-18T08:19:43.166Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-18T08:23:17.326Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-18T08:34:00.247Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-18T08:45:36.844Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 8.3 Tauri API Bundle Guard - 2026-05-18

- `node --test tests/regression/tauri-api-idempotent.test.js`: PASS (2/2)
- `npm run build:renderer`: PASS
- Built renderer bundle check:
  - `__AQ_TAURI_API_READY__`: 1 occurrence in `index-7qCxgr74.js`
  - `downloadPDFfromURL`: 2 occurrences in `index-7qCxgr74.js`
  - `Cannot assign to read only`: 0 occurrences
- DevTools expectation after beta.3 reinstall:
  - `typeof window.electronAPI.downloadPDFfromURL === 'function'`
  - `Object.isFrozen(window.electronAPI) === true`
  - `Object.keys(window.electronAPI).length >= 45`

## Phase 5 Font Metrics - 2026-05-18T20:00:17.801Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-19T11:01:33.742Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-19T11:13:30.505Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-19T12:11:54.088Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-19T20:32:50.124Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```

## Phase 5 Font Metrics - 2026-05-19T20:37:13.191Z

System Times New Roman gate:

```json
{
  "source": "system-times-new-roman",
  "fontDir": "C:\\WINDOWS\\Fonts",
  "max_diff": 0,
  "avg_diff": 0,
  "p99_diff": 0,
  "worst": null
}
```
