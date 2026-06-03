# Doc-Engine Porting Impact Map (DOC_ENGINE_PORT_MAP)

This document maps all occurrences of `getCurrentDocument()`, `.docs`, `curDoc`, and `trackChanges` in `src/renderer` to formulate a migration strategy to `appStore` without breaking the legacy editor and backend integrations.

---

## 1. `getCurrentDocument()` / `getCurrentDoc()`

*   **src/renderer/components/shell/TopToolbar.tsx:L148-149 & L545-546**
    *   *Usage*: Reads the active document object to check track changes state and reference markers.
    *   *Classification*: **(a) Pure read**. Can be directly replaced with `useAppStore(selectCurrentDocument)` or `appStore.getState()`.
*   **src/renderer/lib/citation-builder.ts:L6 & L21 & L31**
    *   *Usage*: Custom fallback logic to resolve current document object from window or app store.
    *   *Classification*: **(a) Pure read**.
*   **src/renderer/lib/editor-adapter.ts:L502**
    *   *Usage*: Binds `win.getCurrentDocument = () => getCurrentDoc(win)` onto the window for legacy script calls.
    *   *Classification*: **(b) Legacy doc-engine dependency**. Must remain as is for compatibility, but its internal implementation can read from `appStore`.

---

## 2. `.docs` / `docs`

*   **src/renderer/App.tsx:L761 & L777 & L968 & L1995**
    *   *Usage*: Document array sizing, passing document lists down to modals and components, and copying draft values.
    *   *Classification*: **(a) Pure read/write**. Already fully reactive, reading from `appState`.
*   **src/renderer/components/shell/FeatureModals.tsx:L286**
    *   *Usage*: Searches state for document metadata inside the backup/history manager.
    *   *Classification*: **(a) Pure read**.
*   **src/renderer/components/shell/TopToolbar.tsx:L150 & L547**
    *   *Usage*: Fallback check: `win.S?.docs?.find(...)`.
    *   *Classification*: **(a) Pure read**.
*   **src/renderer/lib/legacy-doc-helpers.ts:L9 & L23 & L36**
    *   *Usage*: Reading document array for imports/exports.
    *   *Classification*: **(a) Pure read**.
*   **src/renderer/lib/editor-adapter.ts:L42 & L172 & L641**
    *   *Usage*: Syncing documents array to legacy and editor adapter schemas.
    *   *Classification*: **(b) Legacy doc-engine dependency**.

---

## 3. `curDoc`

*   **src/renderer/App.tsx:L969 & L1996**
    *   *Usage*: Tracking active document ID and syncing state.
    *   *Classification*: **(a) Pure read**.
*   **src/renderer/components/shell/FeatureModals.tsx:L63 & L73 & L78 & L88 & L227 & L286 & L447 & L799**
    *   *Usage*: Requesting document history, restoring snapshots, and identifying target document for backup UI via Electron IPC.
    *   *Classification*: **(c) Persistence / IPC payload**.
*   **src/renderer/lib/app-state.ts & helpers**
    *   *Usage*: Managing `curDoc` schema defaults, switching workspaces, deleting documents, etc.
    *   *Classification*: **(a) Pure read/write**.
*   **src/renderer/lib/editor-adapter.ts**
    *   *Usage*: Adapting current document ID for editor state binding.
    *   *Classification*: **(b) Legacy doc-engine dependency**.
*   **src/renderer/lib/legacy-doc-helpers.ts**
    *   *Usage*: Checking active document for writing changes.
    *   *Classification*: **(a) Pure read**.

---

## 4. `trackChanges` / `trackChangesEnabled`

*   **src/renderer/components/shell/TopToolbar.tsx:L134 & L151 & L552 & L588-589 & L826-830**
    *   *Usage*: Reads and mutates `doc.trackChangesEnabled` upon user clicking the track changes toggle.
    *   *Classification*: **(c) Persistence mutation**. Modifying this must trigger write-through to `win.S` so that the editor engine (`aq-engine`) can capture it, since editing `aq-engine` files is forbidden.
*   **src/renderer/lib/aq-engine/editor-commands-core.ts:L313-314**
    *   *Usage*: `currentDoc.trackChangesEnabled = next;` inside the Tiptap/ProseMirror commands implementation.
    *   *Classification*: **(b) Legacy doc-engine dependency**. Since this resides in `aq-engine/` (forbidden folder), it cannot be modified. It must read the state of track changes from the document object propagated via `win.S`.

---

## Migration Strategy Summary
1.  **Read side**: Migrate `TopToolbar` and other safe UI widgets to read `docs`, `curDoc` and `trackChanges` status directly from `appStore` instead of querying legacy globals.
2.  **Write side**: Keep `publishStateToLegacyWindow` active as the primary write-through so the mutated document states (`trackChangesEnabled`, `content`, etc.) propagate back to the legacy engine.
3.  **Forbidden areas**: Do not touch `aq-engine/` or its commands directly; they will continue to read `trackChangesEnabled` from the document record passed via `win.S`.
