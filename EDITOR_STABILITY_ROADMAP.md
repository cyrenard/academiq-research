# Editor Stability Roadmap

AcademiQ's editor should behave predictably before more advanced writing features are added. This roadmap keeps the work incremental and testable.

For the current Claude/Codex handoff plan, see `WORD_LEVEL_EDITOR_ROADMAP.md`.

## Phase 1: Command and Selection Contract

Goal: every toolbar/editor command should preserve the active editor selection, run through one command path, sync UI state, and trigger persistence/layout effects consistently.

Scope:
- Centralize toolbar command execution in `src/ui-event-bindings.js`.
- Keep TipTap command behavior in `src/tiptap-word-commands.js`.
- Reduce one-off calls to `ec(...)` from toolbar handlers.
- Protect selection before toolbar `mousedown`, then restore it immediately before command execution.
- Add tests around command behavior where functions are exported.

Success criteria:
- Heading, alignment, list, indent, page break, and inline formatting commands do not lose selection.
- Command behavior is not duplicated between multiple ad-hoc handlers.
- UI active state still updates after each command.

## Phase 2: APA Style Engine

Goal: APA 7 styles should be semantic, consistent, and shared by editor rendering and export.

Scope:
- Define style contracts for Normal, Heading 1-5, Quote, Reference Entry, Table/Figure labels, Abstract, Keywords.
- Apply APA styles via command attrs, not only CSS.
- Keep CSS override layers from fighting style commands.
- Add export mapping for APA semantic styles.

Success criteria:
- Existing documents render safely.
- Toolbar H1-H5 produce APA-correct output.
- Export uses the same style definitions.

## Phase 3: Page Layout Engine

Goal: pages should feel Word-like without cursor blink or layout jumps.

Scope:
- Keep A4/Letter metrics, margin masks, page sheets, and split hints in `src/tiptap-word-layout.js`.
- Add reliable bottom margin handling, widow/orphan rules, and keep-with-next for headings.
- Ensure layout sync is throttled and idempotent.

Success criteria:
- Page bottoms preserve APA margins.
- Paragraphs and headings do not create large unexplained gaps.
- Typing does not cause visual blinking.

## Phase 4: Lists and Indentation

Goal: Word-like list behavior without rewriting the list engine.

Scope:
- Keep TipTap list nodes.
- Centralize Enter, Tab, Shift+Tab, Backspace, and autoformat list behavior.
- Preserve ordered/bullet/multilevel list styles in editor state and export.

Success criteria:
- Enter continues lists and exits from empty items.
- Tab and Shift+Tab change levels.
- Numbering and bullets render correctly and export safely.

## Phase 5: Autosave and Recovery

Goal: writing should survive crashes, restarts, and accidental closes.

Scope:
- Keep editor document recovery separate from browser capture queue durability.
- Use atomic writes and bounded history snapshots.
- Persist active document, workspace, selection, and recovery metadata.
- Surface recovery status clearly in the UI.

Success criteria:
- Crash recovery can restore the latest safe draft.
- Normal data files are not corrupted by partial writes.
- Explicit quit and OS shutdown are handled safely.

## Phase 6: Paste, Import, and Export Fidelity

Goal: pasted/imported/exported content should preserve academic structure without carrying junk.

Scope:
- Normalize Word/PDF/web paste.
- Preserve headings, lists, tables, citations, notes, and APA references.
- Make DOCX/PDF export use the same semantic document model.

Success criteria:
- Word/PDF/web paste does not corrupt paragraphs or lists.
- DOCX export is `.docx`, not legacy `.doc`.
- Cover, abstract, references, citations, lists, and headings export consistently.
