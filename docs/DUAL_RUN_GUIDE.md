# Dual-Run Guide: Electron 1.23.0 and Tauri 1.24.0-beta.1

This guide is for the beta week before the stable cutover. Keep Electron 1.23.0 as the rollback path and test Tauri 1.24.0-beta.1 against the same user data.

## Setup

1. Keep the local `legacy-electron` branch as the Electron 1.23.0 reference.
2. Install the Tauri beta from `dist/AcademiQ-Setup-1.24.0-beta.1.exe`.
3. Do not delete `data.json` backups. Tauri creates `data.json.bak.<timestamp>` during SQLite migration.
4. If rollback is needed, run the rollback command or restore the latest `.bak` before reopening Electron.

## Test Matrix

- Open a small document and confirm layout, save, close, and reopen.
- Open a 50-page document with citations, table, image, list, and bibliography.
- Type Turkish text with `ğ`, `ş`, `ı`, `i`, `ö`, `ü`, `ç`.
- Add, open, annotate, and reopen a PDF.
- Export PDF and DOCX, then open both outputs on the same machine.
- Use spell check on a long Turkish document and confirm typing stays responsive.
- Use browser capture from Chrome. Firefox is useful to test, but Chrome is the release gate.
- Trigger update check on the beta channel and confirm the updater response is parsed.

## Crash Reporting

Tauri writes local-only logs under:

`%APPDATA%/academiq-research/telemetry/`

No log is uploaded automatically. If a crash happens, attach the newest `crash-day-*.jsonl` file to the support report with the action that caused it.

## One-Week Gate

Cutover can proceed when:

- Tauri crash count is below `Electron baseline * 1.1`.
- No semantic diffs appear in the cutover fixture comparison.
- PDF export and storage rollback tests stay green.
- Browser capture works in Chrome without sidecar process leaks.

Run:

```powershell
node scripts/dual-run-crash-gate.js --baseline 10
```

Replace `10` with the measured Electron baseline crash count for the same beta window.
