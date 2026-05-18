# Migration Blocker: Phase 0 / 0.5 Tauri PoC

## Decision

FAIL. Do not move to Phase 1 yet.

## What happened

- The Phase 0 and Phase 0.5 code path has been prepared against the React/Tailwind renderer shell at `src/renderer`.
- The old Electron shell remains in place; the Tauri config points at `../dist/renderer`, produced from the root Vite React entry.
- Automated JS smoke coverage for the React shell + AQ Engine mount contract passes.
- `cargo`, `rustc`, and `rustup` are not installed or are not discoverable on PATH in this environment.
- Because of that, `cargo install tauri-cli --version "^2"` and `cargo tauri dev` cannot run, so the required WebView2 window smoke cannot be completed here.
- `npm start` also could not be visually verified in this shell: Electron exited with a Windows singleton lock warning before a process/window was observable.

## Passing checks

```text
npm run build:renderer
npm run typecheck
node --test tests/tauri-smoke.test.js
npm test
npm run test:renderer
npm run gate:editor
```

Observed results:

```text
tests/tauri-smoke.test.js: 8 pass, 0 fail
npm test: 942 pass, 0 fail
npm run test:renderer: 25 files pass, 482 pass, 0 fail
npm run gate:editor: PASS
```

## Blocking logs

```text
cargo : The term 'cargo' is not recognized as the name of a cmdlet, function, script file, or operable program.
rustc : The term 'rustc' is not recognized as the name of a cmdlet, function, script file, or operable program.
rustup : The term 'rustup' is not recognized as the name of a cmdlet, function, script file, or operable program.
```

`cargo install tauri-cli --version "^2"`:

```text
cargo : The term 'cargo' is not recognized as the name of a cmdlet, function, script file, or operable program.
```

`cargo tauri dev`:

```text
cargo : The term 'cargo' is not recognized as the name of a cmdlet, function, script file, or operable program.
```

`npm start`:

```text
[27420:0516/222540.374:ERROR:chrome\browser\process_singleton_win.cc:457] Lock file can not be created! Error code: 5
```

## Possible workaround

1. Install Rust via rustup on Windows and reopen the shell so `cargo`, `rustc`, and `rustup` are on PATH.
2. Run `cargo install tauri-cli --version "^2"`.
3. Re-run `npm run build:renderer`.
4. Run `cargo tauri dev` and complete the WebView2 manual checks in `tests/MANUAL_SMOKE.md`.
5. Retry `npm start` after clearing the local Electron singleton lock or from a fresh user-data environment.

## Should the plan be cancelled?

Not yet. The current blocker is environment/tooling verification, not evidence that Tauri/WebView2 or the React AQ Engine mount is incompatible with AcademiQ Research. Phase 1 must remain paused until the Rust toolchain is available and `cargo tauri dev` is visually verified.

## RESOLVED — 2026-05-17

The blocker is resolved. Do not delete this file; it remains as the Phase 0 / 0.5 decision record.

What changed:

- Rust toolchain, MSVC Build Tools, WebView2, and `tauri-cli 2.11.2` are installed and discoverable when run outside the workspace sandbox.
- Tauri launches the React/Tailwind renderer at `http://127.0.0.1:5173/`.
- The app process `academiq-research-tauri.exe` opens a WebView2 page titled `AcademiQ Research`.
- The NSIS config was aligned with the Tauri 2.11 schema: `installMode: "currentUser"` and `languages: ["Turkish", "English"]`.
- The previous `npm start` singleton lock error was a sandbox/userData write issue. Running Electron outside the sandbox opened the legacy renderer; CDP confirmed `academiq-research.html`, title `AcademiQ — Yerel`, legacy DOM present, React `#root` absent.

Verification commands:

```text
rustc --version
cargo --version
cargo tauri --version
cargo tauri info
cargo tauri dev
npm run build:renderer
node --test tests/tauri-smoke.test.js
npm test
npm run test:renderer
npm run gate:editor
npm start -- --remote-debugging-port=9444
```

Observed results:

```text
rustc 1.95.0 (59807616e 2026-04-14)
cargo 1.95.0 (f2d3ce0bd 2026-03-21)
tauri-cli 2.11.2
WebView2 148.0.3967.54
Vite ready in 1371 ms
Rust dev build finished in 52.63s
WebView2 app process observed after about 69s on cold dev build
tests/tauri-smoke.test.js: 8 pass, 0 fail
npm test: 942 pass, 0 fail
npm run test:renderer: 25 files pass, 482 pass, 0 fail
npm run gate:editor: PASS
npm run build:renderer: PASS
```

Manual smoke evidence:

- `tests/MANUAL_SMOKE.md`
- `tests/artifacts/tauri-react-shell-topmost-2026-05-16.png`
- `tests/artifacts/tauri-aq-engine-turkish-input-topmost-2026-05-16.png`
- `tests/artifacts/tauri-aq-engine-ime-composition-2026-05-16.png`

Decision:

Phase 0 and Phase 0.5 are complete. Phase 1 remains paused until the user explicitly says to proceed.

## Phase 8.2 / 8.3 deferred parity items — 2026-05-18

These items were intentionally kept out of the beta.2 hotfix implementation because each one either requires a deeper React port or broader destructive/manual workflows than the two-day hotfix budget allows.

- B7 drop router for editor / notes / library: needs real import paths for PDF, Word, BibTeX/RIS, and image insertion without regressing existing file inputs. Estimated extra time: 2-3 days.
- B8 central keyboard router: replacing legacy and React listeners safely requires an app-wide shortcut contract and manual editor focus soak. Estimated extra time: 2 days.
- C1 label manager modal: RefSidebar already exposes label creation and filtering, but a full modal with color management is separate UI work. Estimated extra time: 1 day.
- C2 linter/history React side panel: beta.2 now opens the existing lean linter and existing history modal; a combined React tabbed side panel is a UI port. Estimated extra time: 1-2 days.
- C4 PDF viewer custom controls: legacy PDF controls remain loaded; React controls need pdf.js state synchronization and manual PDF soak. Estimated extra time: 2 days.
- C5 export pipeline validation suite: broad export artifact validation is valuable but slow and fixture-heavy. Estimated extra time: 1-2 days.
- C6 localMatrixAssistant behavior tests: mock-server tests require locking down the HTTP contract. Estimated extra time: 1 day.
- C7 IPC behavior sample suite: category sampling is feasible, but all write-paths need isolated temp app-data contracts. Estimated extra time: 1-2 days.

Recommendation: do not block beta.2 on these. Keep them as post-beta stabilization tasks before stable cutover if soak testing shows user-facing impact.
