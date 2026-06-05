# TECH_DEBT — AcademiQ Research

Honest register of known technical debt after the 1.24.0 Tauri/Rust cutover.
Each item: what it is, why it exists, current state, and the concrete next step.
Kept in-repo so the debt is visible and not silently re-discovered. Updated 2026-06-05.

---

## 1. legacy-runtime.js monolith (13.5k lines) — 🟠 in progress

The vanilla-JS renderer monolith. The strangler migration to React/appStore is
partial: the React side is clean, but this file still carries a large dead tail.

**Done (state-retirement slices, see LEGACY_RUNTIME_SPLIT_PLAN.md):**
- Removed/stubbed no-op render fns whose DOM moved to React: `rLib`, `rWS`,
  `rDocTabs`, `rThemes`, `rNB`, `rNotes`, `renderRelatedPapers`, plus the label
  render chain and 13 orphan functions. ~14.8k → ~13.6k lines, ~30+ functions retired.

**Remaining (intentionally kept — NOT dead):**
- `rRefs` — delegates to `AQBibliographyState.syncReferenceViewsForState` and uses
  the dynamically-created `#reflist`; real work, do not remove.
- `showSidebarRefMenu` — writes to `#ctxmenu`, which React renders in
  `LegacyCompatibilityHost.tsx`; a live hybrid, do not remove.

**Next step:** audit the remaining `~240` `if(!x)return;` early-return render fns
the same way (DOM target exists? React-owned? delegate?). Stub the dead bodies,
keep delegates/hybrids. The end state is splitting the persistence/doc-engine core
into modules; that is a separate, large effort.

---

## 2. Dual state: `window.S` + appStore — 🔴 architectural risk

`window.S` (legacy canonical) and `appStore` (React) coexist. `appStore.setState`
write-throughs to `window.S` automatically, but the reverse —
`window.__aqReactSyncFromLegacy` — is **manual**. Any code path that mutates the
legacy `S` object and forgets to call the sync leaves React showing stale state.

**Why it exists:** unavoidable seam during a live strangler migration; legacy
runtime still owns some mutation paths (matrix, PDF runtime, persistence).

**Current state:** works, but it's the #1 source of latent "stale UI" bugs.

**Proxy auto-sync was evaluated and rejected** — it is not safe in this architecture:
1. `publishStateToLegacyWindow` reassigns `win.S = {...}` (a fresh object) on every
   React tick (App.tsx useEffect[appState]), so any Proxy wrapper is dropped each render.
2. legacy-runtime hydrate paths reassign `S` wholesale (`S = AQStateSchema.hydrate(...)`),
   bypassing a Proxy entirely (see legacy-state-bridge.ts header).
3. A top-level Proxy `set` trap never fires for nested mutation (`S.docs.push(...)`,
   `ws.lib[i].x = y`), which is the dominant legacy pattern.
A deep, reassign-surviving Proxy would be both slow and fragile.

**Actual fix (the only durable one): retire `S`.** As each legacy mutation domain is
ported to appStore (the legacy-runtime modularization track, item 1), its direct `S`
mutation + manual sync call disappears. The dual-state risk shrinks monotonically as
the monolith shrinks; it cannot be patched away in isolation. Current sync is already
called at the 6 main mutation seams (save chain, matrix, refsidebar, file-import) via
`__aqReactSyncFromLegacy`; the residual risk is only *newly added* legacy mutation
paths forgetting the call — mitigated by there being fewer and fewer such paths.

---

## 3. aq-engine "do-not-touch" zone — 🟡 structural constraint

`experiments/aq-engine/**` (editor engine: engine.js reflow/pagination,
document.js doc-model, compat-shim.js bridge, tiptap-adapter.js) is loaded as
UMD script-tags in global scope, not ES modules. It does not participate in HMR
(changes need a full reload) and is treated as a frozen contract.

**Why:** the editor is the highest-risk component; APA-7 typesetting, pagination,
and track-changes correctness live here and are validated by gates, not types.

**Current state:** stable but brittle — `trackChangesEnabled` is read inside the
engine and fed via `window.S` write-through (can't be cleanly typed/owned by React).

**Next step:** no rewrite planned. If touched, it must go through full
`tauri:dev` manual smoke (tests/MANUAL_SMOKE.md), not just unit tests. Document
the mount contract before any change.

---

## 4. Dev-server / build instability — 🟡 mitigated, not solved

`tauri:dev` repeatedly died during this work:
- **EBUSY**: Vite watched Rust's `target/debug` DLLs. **Fixed** via
  `vite.config.ts` `server.watch.ignored: ['**/src-tauri/**']`.
- **OneDrive**: the repo does not build under a OneDrive-synced path (file locks).
  Work from a local path (e.g. `C:\Dev\...`).
- **Process tree**: launching `tauri:dev` as a tracked background task killed the
  webview when the task ended; launch detached for long-lived dev sessions.

**Next step:** add a `CONTRIBUTING`/README note: build from a non-synced local path;
the watcher-ignore is already committed.

---

## 5. Line endings — ✅ resolved

`.gitattributes` added (LF normalization + binary protection). This eliminates the
"LF will be replaced by CRLF" churn. A one-time `git add --renormalize .` was
deliberately NOT run to avoid a massive diff and to protect binaries (.dic/.aff/.pdf
were corrupted in a test renormalize and reverted); future checkouts are now LF.

---

## 6. Version management — ✅ resolved

Version was hard-coded in 6 places and broke release-gate during cutover. Now a
single command: `npm run version:bump <semver>` (scripts/bump-version.js) keeps
package.json, package-lock.json, tauri.conf.json, Cargo.toml, Cargo.lock, and the
version-sync test in lockstep.

---

## 7. Release / signing — 🟡 by-decision

- Tag→release automation added (`.github/workflows/release.yml`): `v*` tags build
  the NSIS installer and attach it to the GitHub Release.
- **Installer is unsigned** by maintainer decision (internal distribution). Windows
  SmartScreen will warn. To sign: configure `TAURI_SIGNING_PRIVATE_KEY` repo secrets
  (CI path) or set a cert thumbprint for `scripts/sign-installer.ps1` (local path).

---

## 8. Doc/reality drift — 🟡 watch

`MIGRATION_BLOCKER.md` / migrate-plan marked phase 7 "release pipeline DONE", but
no release workflow existed until this cleanup. Treat migration-doc "DONE" claims
as needing verification against the actual tree.
