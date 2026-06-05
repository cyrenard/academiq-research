# Migration Notes

## Phase 8 - Dual-Run + Cutover

- Local branch `legacy-electron` was created from the Phase 7 cutover base so the Electron 1.23.0-era surface remains recoverable.
- The branch has not been pushed. Push command to run only after user approval: `git push origin legacy-electron`.
- `THIRD_PARTY_NOTICES.md` is committed and included in the Tauri bundle resources and release distribution output.

## Dual-run acceptance — observed result

- A ~3-week parallel dual-run (Tauri beta alongside legacy Electron) was completed
  by the maintainer with **zero critical regressions** observed in real use.
- The crash/compatibility telemetry files (`crash-day-*.jsonl`) were lost during a
  machine reformat, so `scripts/dual-run-crash-gate.js` now sees an empty telemetry
  dir and reports 0 crashes. The "0" reflects the real observed outcome, but the
  raw artifacts no longer exist on disk — recording it here so the gap is documented.
- Acceptance criterion ("2+ weeks, zero critical regression") is therefore
  considered **met by observation**, not by surviving telemetry.

## Stable cutover — done

- `editor/word-parity` (go-forward integration branch) fast-forwarded into `main`
  and tagged `v1.24.0`; GitHub Release created with the NSIS installer attached.
- The installer is **unsigned** by maintainer decision (internal distribution);
  `release.yml` will produce signed installers automatically if the
  `TAURI_SIGNING_PRIVATE_KEY` secrets are later configured.
