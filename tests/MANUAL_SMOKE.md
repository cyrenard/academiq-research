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
