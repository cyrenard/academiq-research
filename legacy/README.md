# legacy/

Frozen, non-shipping artifacts kept for reference only. **Nothing here is built,
imported, or served by the live Tauri/React app.**

## academiq-research.html

The original single-file Electron-era build of AcademiQ (~40k lines of inlined
HTML/CSS/JS). Superseded by the Tauri shell + `src/renderer` React app. It is no
longer referenced by any build script, `tauri.conf.json`, or `index.html`.

Kept here (instead of deleted) as a quick read-only reference for legacy behavior
during the strangler migration. The full history also lives in git and on the
`legacy-electron` branch. Safe to delete once the legacy-runtime.js retirement is
complete and no longer needs a behavior reference.
