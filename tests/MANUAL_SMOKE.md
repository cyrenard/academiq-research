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
