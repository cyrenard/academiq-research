# Migration Notes

## Phase 8 - Dual-Run + Cutover

- Local branch `legacy-electron` was created from the Phase 7 cutover base so the Electron 1.23.0-era surface remains recoverable.
- The branch has not been pushed. Push command to run only after user approval: `git push origin legacy-electron`.
- `THIRD_PARTY_NOTICES.md` is committed and included in the Tauri bundle resources and release distribution output.
