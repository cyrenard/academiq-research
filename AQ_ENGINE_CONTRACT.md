# AQ_ENGINE_CONTRACT — the frozen editor core

`experiments/aq-engine/**` is the editor engine: APA-7 typesetting, pagination,
selection, input/IME, and the TipTap/ProseMirror adapter. It is a **do-not-touch
zone** (TECH_DEBT #3). This file documents its contract so anyone who *must* touch
it does so safely, and so the React side knows exactly what it may rely on.

## Why frozen
- Correctness (APA-7 reflow, pagination, track-changes) is validated by gates and
  manual smoke, **not by the type system** — it is plain UMD JS in global scope.
- It does not participate in Vite HMR. **Any change needs a full reload**, not HMR.
- It is large and battle-tested through the beta train; ad-hoc edits are high-risk.

## Load order (index.html, before legacy-runtime.js)
UMD script-tags, dependency order — do not reorder:
```
document.js        → doc model (paragraphs, runs, APA heading/bib/blockquote styles)
engine.js          → reflow / pagination loop
selection.js       → selection model
input.js           → keyboard / IME / composition
tiptap-adapter.js  → ProseMirror ↔ aq-engine bridge
compat-shim.js     → legacy bridge (largest; wires window.* surface)
```

## Public window surface (what React/legacy may call — stable contract)
- `window.AQTipTapWordInit.init()` → mounts the editor; returns the editor handle
  (`editor._aqEngine === true`). Called once by `editor-adapter.ts::createAcademiqEditor`.
- `window.AQTipTapWordIO.repairWordImportHTML(html)` → Word-paste cleanup.
- `window.AQEditorCore.{focus,getContent,setContent,insertHTML}` → content I/O.
- `window.__aqEngineComments` → selection / clipboard / comment / setCaret bridge
  (used by CommentsFeature + citation finder).
- `window.__aqEngineActive: boolean` → engine mounted flag.
- `window.__aqSuppressNextInputUntil` → IME guard timestamp.
- `window.__aqSetEditorDoc(html, focusAtEnd)` → replace document content.

## The trackChanges seam (the one cross-boundary state read)
- `aq-engine/editor-commands-core.ts` reads/writes `currentDoc.trackChangesEnabled`
  on the document record it receives via `window.S` (DOC_ENGINE_PORT_MAP §4).
- React owns the toggle UI (TopToolbar) and writes through appStore → `window.S`.
  The engine reads the propagated flag. **Do not** try to make the engine read
  appStore directly — the write-through is the contract.

## Rules for touching aq-engine (if unavoidable)
1. Treat the `window.*` surface above as a stable API — additive changes only.
2. After ANY edit: full `tauri:dev` reload + `tests/MANUAL_SMOKE.md` (APA typeset,
   pagination, IME/Turkish input, track-changes accept/reject), not just unit tests.
3. Keep it UMD/global — do not convert to ES modules piecemeal (the load-order
   contract and legacy-runtime globals depend on it).
4. State flows in via `window.S` write-through and out via `__aqEngineComments` /
   editor events. Do not add new hidden cross-boundary state paths.

## React-side guarantees (what you can rely on)
- The engine will not exist until `AQTipTapWordInit.init()` resolves; guard every
  `window.AQ*` / `__aq*` call with `typeof === 'function'` (the codebase already does).
- `editor._aqEngine` distinguishes the aq-engine editor from a plain TipTap fallback.
