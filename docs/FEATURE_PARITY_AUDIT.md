# Feature Parity Audit - Phase 8.2

Audit date: 2026-05-18

Scope: Electron 1.23.0 legacy surface vs Tauri 1.24.0-beta.2. This is a static parity audit for the beta.2 hotfix train. It records regressions and follow-up risk; it does not open Phase 9 or approve cutover.

Legend: 🟢 parity observed, 🟡 parity likely but needs soak/manual coverage, 🔴 known regression or beta.2 hotfix item.

## IPC Handler Parity

| Feature | Electron impl (file:line) | Tauri status |
|---|---|---|
| `window:minimize` | `main.js:1483` | 🟢 `src-tauri/src/commands/window.rs:5`; direct window command parity. |
| `window:toggleMaximize` | `main.js:1488` | 🟢 `src-tauri/src/commands/window.rs:11`; direct window command parity. |
| `window:close` | `main.js:1496` | 🟢 `src-tauri/src/commands/window.rs:22`; direct window command parity. |
| `data:load` | `main.js:1502`, app dir `main.js:86` | 🔴 beta.1 looked at Roaming identifier path; beta.2 hotfix reads `%LOCALAPPDATA%/AcademiQ` and migrates real legacy schema. |
| `data:save` | `main.js:1513` | 🟢 SQLite-backed save keeps renderer blob contract. |
| `data:saveDraft` | `main.js:1530` | 🟢 SQLite-backed draft save keeps renderer blob contract. |
| `pdf:save` | `main.js:1557` | 🟢 `src-tauri/src/commands/pdf.rs:99`; filesystem storage parity. |
| `pdf:load` | `main.js:1566` | 🟢 `src-tauri/src/commands/pdf.rs:116`; filesystem storage parity. |
| `pdf:exists` | `main.js:1573` | 🟢 `src-tauri/src/commands/pdf.rs:130`; boolean existence parity. |
| `pdf:delete` | `main.js:1582` | 🟢 `src-tauri/src/commands/pdf.rs:144`; delete result parity. |
| `pdf:showInExplorer` | `main.js:1590` | 🟢 `src-tauri/src/commands/pdf.rs:159`; opener/shell path parity. |
| `pdf:deleteWorkspaceFolder` | `main.js:1601` | 🟢 `src-tauri/src/commands/pdf.rs:333`; recursive workspace cleanup parity. |
| `pdf:syncAll` | `main.js:1609` | 🟡 `src-tauri/src/commands/pdf.rs:346`; callable, but large real library soak coverage recommended. |
| `app:openExternalUrl` | `main.js:1610` | 🟢 `src-tauri/src/commands/app.rs:5`; opener plugin replaces deprecated shell open. |
| `pdf:download` | `main.js:1620`, handler `main.js:1857` | 🔴 beta.1 missed UA/options/HTML fallback; beta.2 adds safe URL guard, UA, content length cap, HTML `citation_pdf_url`/`.pdf` fallback in `src-tauri/src/pdf/url_fallback.rs`. DOI/title verification remains Phase 9 polish. |
| `dialog:openPDF` | `main.js:1862` | 🟢 `src-tauri/src/commands/dialog.rs:7`; dialog plugin path parity. |
| `word:toHtml` | `main.js:1884` | 🟡 `src-tauri/src/commands/word.rs:5`; JS/browser mammoth path retained, manual Word import soak recommended. |
| `net:fetch-json` | `main.js:1899` | 🟢 `src-tauri/src/commands/net.rs:45`; reqwest singleton, timeout, ETag/rate-limit polish from Phase 4. |
| `net:fetch-text` | `main.js:1939` | 🟢 `src-tauri/src/commands/net.rs:65`; reqwest singleton parity. |
| `export:pdf` | `main.js:1965` | 🟡 `src-tauri/src/commands/export.rs:10`; Rust printpdf export passed Phase 5 gates, continue visual diff soak. |
| `pdf:exportAnnotated` | `main.js:2017` | 🟡 `src-tauri/src/commands/export.rs:21`; annotation support exists through Rust PDF path; old export shape needs soak. |
| `export:docx` | `main.js:2043` | 🟡 `src-tauri/src/commands/export.rs:16`; DOCX remains JS/browser path by design. |
| `sync:getSettings` | `main.js:2066` | 🟢 `src-tauri/src/commands/sync.rs:28`; settings JSON parity. |
| `sync:setSyncDir` | `main.js:2070` | 🟢 `src-tauri/src/commands/sync.rs:37`; settings JSON parity. |
| `sync:clearSyncDir` | `main.js:2083` | 🟢 `src-tauri/src/commands/sync.rs:51`; settings JSON parity. |
| `backup:create` | `main.js:2087` | 🟡 `src-tauri/src/commands/backup.rs:6`; zip-backed backup callable, large profile soak recommended. |
| `backup:restore` | `main.js:2102` | 🟡 `src-tauri/src/commands/backup.rs:33`; restore callable, destructive path requires manual recovery test. |
| `localMatrixAssistant:getStatus` | `main.js:2117` | 🟡 `src-tauri/src/commands/local_matrix.rs:4`; HTTP LLM path callable, endpoint soak recommended. |
| `localMatrixAssistant:rankCandidates` | `main.js:2125` | 🟡 `src-tauri/src/commands/local_matrix.rs:14`; behavior sample recommended. |
| `localMatrixAssistant:composeCells` | `main.js:2137` | 🟡 `src-tauri/src/commands/local_matrix.rs:23`; behavior sample recommended. |
| `browserCapture:getStatus` | `main.js:2149` | 🟢 `src-tauri/src/commands/browser_capture.rs:16`; sidecar bridge parity. |
| `browserCapture:prepareSetup` | `main.js:2157` | 🟢 `src-tauri/src/commands/browser_capture.rs:24`; sidecar bridge parity. |
| `browserCapture:runAction` | `main.js:2161` | 🟢 `src-tauri/src/commands/browser_capture.rs:32`; sidecar bridge parity. |
| `browserCapture:testConnection` | `main.js:2165` | 🟢 `src-tauri/src/commands/browser_capture.rs:41`; sidecar bridge parity. |
| `browserCapture:lookup` | `main.js:2169` | 🟢 `src-tauri/src/commands/browser_capture.rs:49`; sidecar bridge parity. |
| `browserCapture:openInstallDir` | `main.js:2173` | 🟢 `src-tauri/src/commands/browser_capture.rs:58`; sidecar bridge parity. |
| `browserCapture:openGuide` | `main.js:2180` | 🟢 `src-tauri/src/commands/browser_capture.rs:66`; sidecar bridge parity. |
| `browserCapture:updatePrefs` | `main.js:2187` | 🟢 `src-tauri/src/commands/browser_capture.rs:74`; sidecar bridge parity. |
| `browserCapture:createWorkspace` | `main.js:2216` | 🟢 `src-tauri/src/commands/browser_capture.rs:83`; sidecar bridge parity. |
| `browserCapture:rendererReady` | `main.js:2220` | 🟢 `src-tauri/src/commands/browser_capture.rs:92`; sidecar bridge parity. |
| `browserCapture:ackPayload` | `main.js:2228` | 🟢 `src-tauri/src/commands/browser_capture.rs:100`; sidecar bridge parity. |
| `app:getInfo` | `main.js:2251` | 🟢 `src-tauri/src/commands/app.rs:14`; app metadata parity. |
| `docHistory:get` | `main.js:2255` | 🟢 `src-tauri/src/commands/doc_history.rs:27`; revisions table parity. |
| `docHistory:restore` | `main.js:2259` | 🟢 `src-tauri/src/commands/doc_history.rs:59`; revisions restore parity. |
| `update:check` | `main.js:2266` | 🟡 `src-tauri/src/commands/update.rs:13`; updater plugin path, live endpoint soak pending. |
| `update:download` | `main.js:2279` | 🟡 `src-tauri/src/commands/update.rs:48`; signed updater path, live endpoint soak pending. |
| `update:setUrl` | `main.js:2315` | 🟡 `src-tauri/src/commands/update.rs:105`; Tauri endpoint dynamic limits documented, channel workaround used. |
| `update:restart` | `main.js:2322` | 🟢 `src-tauri/src/commands/update.rs:131`; app restart parity. |
| `ocr:recognize` | `main.js:2339` | 🟢 `src-tauri/src/commands/ocr.rs:4`; JS worker OCR retained by design. |
| `renderer:probeError` | `main.js:1478` | 🟢 `src-tauri/src/commands/app.rs:25`; renderer diagnostics parity. |

## DOM Event Handler Parity

| Feature | Electron impl (file:line) | Tauri status |
|---|---|---|
| Spell underline left click | Legacy spelling spans plus click handlers in `src/legacy-runtime.js`, new spans from `src/renderer/lib/spellcheck-controller.ts:51` and `:239` | 🔴 beta.1 regression; beta.2 adds `src/renderer/components/editor/SpellSuggestionPopup.tsx:61` and mounts it from `src/renderer/App.tsx:1798`. |
| Spell right click/context menu | `src/plain-citation-linking.js:941`, `src/renderer/components/shell/LegacyCompatibilityHost.tsx:2008` | 🟢 Right-click path remains intact; beta.2 did not alter it. |
| Plain citation linking context menu | `src/plain-citation-linking.js:843`, `:941` | 🟡 Loaded in shared page, but citation click/open behavior needs soak in React shell. |
| Global click routing for legacy modals | `src/legacy-runtime.js:2920`, `:7495`, `:10272`, `:11310` | 🟡 `LegacyCompatibilityHost.tsx:415` and `:2009-2011` bridge many clicks; modal-specific smoke recommended. |
| PDF panel click/change routing | `src/legacy-runtime.js:6247`, PDF list handlers near `:12844-12946` | 🟢 `LegacyCompatibilityHost.tsx:828-829`, `:2014-2018`; Phase 3/5 PDF smoke passed, keep soak coverage. |
| Keyboard shortcuts | `src/legacy-runtime.js:5114`, `:5129`, `:6066`, `:6177`, `:10988` | 🟡 `LegacyCompatibilityHost.tsx:951` and `:2017`; Ctrl+S/Z/Shift+Z/B/I/U should stay on beta checklist. |
| Drag/drop document or PDF | Legacy file input/upload handlers `src/legacy-runtime.js:2254`, `:5370`; no direct `drop` handler found in static search | 🟡 No obvious React shell `drop` handler in current audit; manual drag/drop test required. |
| Paste handlers | Formatting/paste cleanup section noted in `src/legacy-runtime.js:30`; no direct `paste` match in sampled files | 🟡 Clipboard image/HTML/URL paste should be manually verified; audit did not find a React-specific paste replacement. |
| Track changes controls | `src/legacy-runtime.js:7144-7171` | 🟡 Legacy events still loaded; React toolbar visibility/entry point needs manual check. |
| Document history/outline/caption click flows | `src/legacy-runtime.js:14202-14280` | 🟡 Commands are ported, but React shell affordances should be included in soak script. |
| Native `window.confirm` calls | `src/legacy-runtime.js` and React shell calls | 🔴 beta.1 ACL denial; beta.2 adds defensive dialog permissions and confirm shim, covered by `tests/regression/confirm-acl-bug.test.js`. |

## Vendor Entry Path Audit

| Feature | Electron impl (file:line) | Tauri status |
|---|---|---|
| Tiptap bundle | `index.html:37`, build copy `scripts/build-renderer.js:22` | 🟢 Shared Vite page loads the same `tiptap-bundle.js` before app scripts. |
| AQ Engine load order | `index.html:38-43` | 🟢 `document.js`, `engine.js`, `selection.js`, `input.js`, `tiptap-adapter.js`, `compat-shim.js` loaded in required order. |
| pdf.js viewer | `index.html:44`, worker CSP from Tauri config | 🟢 `vendor/pdf.min.js` stays untouched; beta.2 did not alter viewer path. |
| Mammoth browser import | `index.html:46` | 🟢 `vendor/mammoth.browser.min.js` stays browser-side for DOCX import/export paths. |
| html2pdf fallback | `index.html:47` | 🟡 Still loaded; Rust PDF export is primary, legacy fallback should be removed only after cutover approval. |
| Legacy `src/*.js` state/runtime scripts | `index.html:83`, `index.html:114`, surrounding script block | 🟢 Shared page keeps legacy state modules loaded beside React shell. |
| React entry | `index.html` body plus `src/renderer/main.tsx` | 🟢 Tauri shell uses React root while preserving legacy globals. |

## Backlog Candidates For Beta.3+

1. Deep-port `pdf:download` DOI/title/author verification from `downloadPDFfromURLMain` to Rust; beta.2 only verifies PDF bytes.
2. Add manual/automated drag-drop and paste coverage for React shell.
3. Add explicit soak cases for citation click, footnote click, cross-reference click, image selection panel, and table toolbar.
4. Exercise live updater endpoints before stable cutover.
5. Run a large real-library `pdf:syncAll` and backup/restore recovery test before stable cutover.
