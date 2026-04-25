# Word-Level Editor Roadmap

This roadmap is the current handoff plan for moving AcademiQ's editor closer to Microsoft Word-level stability without destabilizing the app. It is intentionally incremental: first protect the writing loop, then improve layout, then deepen advanced document features.

## North Star

The editor should feel boringly reliable while writing:

- typing, selection, Backspace, Enter, undo, redo, paste, citation insertion, and toolbar commands never produce surprise focus jumps;
- APA 7 page geometry, spacing, headings, citations, references, lists, and exports use one consistent document model;
- recovery and autosave protect writing without being confused with Browser Capture queue durability;
- visual toolbar polish never ships at the expense of editor command safety.

## Hard Guardrails

- Do not rewrite the editor engine from scratch.
- Do not add broad visual toolbar changes before command/focus tests pass.
- Do not create a second command path for the same editor action.
- Do not let toolbar buttons steal or lose the ProseMirror selection.
- Do not conflate editor autosave/recovery with Browser Capture persistence.
- Do not ship export changes unless existing DOCX/PDF behavior still degrades safely.

## Current File Map

Command and focus:

- `src/ui-event-bindings.js`
- `src/tiptap-word-commands.js`
- `src/tiptap-word-toolbar.js`
- `src/tiptap-word-editor.js`
- `tests/ui-event-bindings.test.js`
- `tests/tiptap-word-toolbar.test.js`

Page layout and APA rendering:

- `src/tiptap-word-layout.js`
- `src/apa-style-engine.js`
- `src/tiptap-word-document.js`
- `academiq-research.html`

Citation and bibliography:

- `src/citation-runtime.js`
- `src/tiptap-word-citation.js`
- `src/citation-dom-state.js`
- `src/apa-utils.js`

Paste, import, export:

- `src/tiptap-word-paste.js`
- `src/tiptap-word-io.js`
- `src/docx-export.js`
- `src/reference-import-service.js`

Recovery and persistence:

- `src/editor-runtime.js`
- `src/main-process-storage.js`
- `src/data-migrations.js`
- `main.js`

## Phase 0: Freeze The Stable Toolbar Baseline

Goal: keep the two-page editor toolbar visually stable while deeper editor work continues.

Current status:

- Mostly stabilized.
- The editor toolbar is locked into a two-page, maximum two-row direction.
- Page 1 and page 2 have separate group layout responsibilities so document/source/find controls do not fight dense text-format controls.
- Toolbar event-binding tests protect dropdown/select handling and selection-safe command routing.
- Remaining risk is mostly visual width clipping at unusual app widths, so any future toolbar edits should be screenshot-smoked before release.

Tasks:

- Keep toolbar to maximum two rows per page.
- Keep page 1 focused on document, TOC, citation/source, bibliography, and find.
- Keep page 2 focused on text, heading, list, indent, insert, media/note, and transform.
- Add or preserve tests for event binding, active state sync, and dropdown handlers.
- Avoid markup/CSS churn unless a user-visible toolbar bug is being fixed.

Acceptance:

- Page 1 and page 2 do not clip at normal app widths.
- Active inline buttons still highlight.
- Dropdown buttons open in the expected place.
- Toolbar command tests pass.

## Phase 1: Command, Focus, Selection, Undo Contract

Goal: every editor command preserves selection, focus, undo history, layout sync, and autosave signaling predictably.

Current status:

- Started.
- Button-driven editor commands are covered by the centralized selection-safe command path.
- Select/change-driven formatting controls now use the same selection restoration pattern for font, point size, text color, highlight color, line spacing, page size, and paragraph spacing.
- Toolbar select/color controls capture editor selection on mousedown without preventing native dropdown/color-picker behavior.
- `/r` and `/t` citation triggers now share cleanup behavior, and citation insertion explicitly restores the caret to the citation end so writing can continue on the same line.
- Shortcut regression tests now protect the writing loop: plain Enter/Backspace/Delete/arrow keys remain native, modified Tab does not accidentally indent lists, and Ctrl+Z/Y/Shift+Z remain explicit undo/redo routes.
- Regression tests now verify command/action selection restoration order before editor mutation runs.

Tasks:

- Keep selection-safe toolbar commands centralized in `EDITOR_SELECTION_SAFE_COMMANDS`.
- Route all editor toolbar commands through `callEditorCommandAndSync` or a clearly named equivalent.
- Add tests for each high-risk command: heading, alignment, list, multilevel list, indent, outdent, page break, subscript, superscript, and paragraph style.
- Audit `/r` and `/t` citation insertion so typing continues after the inserted citation.
- Verify find/replace does not fight editor focus.
- Add a manual test checklist for Enter, Backspace, undo, redo, selection across paragraphs, and selected-text formatting.

Acceptance:

- `/r` inserts parenthetical citation and leaves cursor ready to continue writing.
- `/t` inserts narrative citation like `Author (Year)` and leaves cursor ready to continue writing.
- Toolbar commands do not move text to another line or lose focus.
- Undo/redo does not jump unexpectedly after toolbar actions.

## Phase 2: APA Page Layout Contract

Goal: page layout behaves like a real APA writing surface, not just a styled scroll area.

Current status:

- Started.
- Regression tests now protect the page-bottom behavior that matters most for writing: normal paragraphs are not pushed wholesale to the next page when enough space remains, but they can be pushed when only a tiny unusable remainder is left.
- APA top/bottom margin mask positions are now explicitly tested across multiple pages.
- Heading keep-with-next behavior remains covered and can be disabled explicitly.
- Layout gap calculation is now covered for idempotency: repeated syncs with the same inputs keep existing gap CSS stable instead of clearing and rewriting it, reducing blink/jump risk.

Tasks:

- Keep A4/Letter metrics, page gaps, and bottom margin handling in `src/tiptap-word-layout.js`.
- Separate visual page sheets from editable document semantics.
- Make layout sync idempotent to avoid blinking.
- Preserve bottom whitespace at page ends without forcing whole paragraphs to the next page too early.
- Add heading keep-with-next rules only where APA/document semantics require it.
- Add regression fixtures for long paragraphs, citation-heavy lines, headings near page bottoms, and references spilling onto the next page.

Acceptance:

- APA top/bottom margins remain visible.
- Long paragraphs can split across pages naturally.
- References create new pages when needed.
- Typing near page boundaries does not blink or jump.

## Phase 3: Lists, Indentation, And Multilevel Lists

Goal: lists behave close to Word while still using the existing editor engine.

Current status:

- Started.
- Regression tests now cover the list keymap contract: Enter splits non-empty list items and lifts empty ones, Tab sinks the current item, Shift+Tab lifts it, and Backspace only lifts at the start of an empty list item — all routed through existing TipTap `splitListItem` / `sinkListItem` / `liftListItem` commands instead of a parallel command path.
- `isListContextActive` and `isCurrentListItemEmpty` helpers are covered so list-aware shortcuts stay off when the caret is outside a list.
- Multilevel list templates (bullet, number, outline, mixed) are now regression-tested: the template table is stable, unknown templates are rejected without side effects, toggling only happens when the target list type is not already active, and the first-level style is stamped via the shared list-style update path.
- Old-document compatibility is now protected: `<ul>` / `<ol>` elements authored before list-style metadata existed parse back as `null` instead of a fabricated style, `renderListStyleTypeAttrs` emits an empty attribute bag for missing/unknown values, and `applyListStyle` refuses unknown style names without touching chain/dispatch.

Tasks:

- Reuse existing TipTap list nodes and commands.
- Support bullet, ordered, and multilevel styles through node attributes or safe command metadata.
- Ensure Enter continues lists and exits from empty list items.
- Ensure Tab and Shift+Tab change list levels without corrupting paragraphs.
- Map toolbar list style dropdowns to existing commands.
- Preserve old documents with no list style metadata.

Acceptance:

- Bullet lists show bullets, not plain paragraphs.
- Ordered lists advance automatically on Enter.
- Styled lists render in-editor and degrade safely in export.
- Existing non-list paragraphs are not accidentally converted.

## Phase 4: APA Style-First Document Model

Goal: APA formatting should be semantic and shared by editor, export, and recovery.

Current status:

- Started.
- APA style engine already exposes shared heading/block contracts for editor CSS and export CSS.
- DOCX OOXML baseline can now carry optional APA metadata for Times New Roman 12pt, double spacing, first-line indentation, and hanging reference indentation.
- Current app DOCX export still primarily uses Word-compatible HTML, so the OOXML helper is infrastructure for future deeper DOCX fidelity rather than the only export path.
- Engine defensive contracts now have regression coverage: `normalizeLevel` clamps 0/6/negative/string/null/undefined to Heading 2, `getHeadingStyle`/`getBlockStyle` return fresh copies so mutation cannot leak into the shared table, and every declared block id is required to produce `text-align` + `text-indent` attrs with a predictable (string or null) className.
- Export heading CSS is pinned to APA 7 keep-with-next (`page-break-after:avoid` and `break-after:avoid-page`) for every heading level so exported documents stop a page break from orphaning a heading from its body.

Tasks:

- Define one style contract for Normal, Heading 1-5, Quote, Reference Entry, Abstract, Keywords, Table/Figure labels, and captions.
- Apply styles through command attributes, not CSS-only side effects.
- Make toolbar state reflect semantic style, not only visual classes.
- Keep H1-H5 aligned with APA 7 rules.
- Use the same style definitions in DOCX export where practical.

Acceptance:

- Heading buttons create APA-correct headings.
- Exported DOCX headings match the editor reasonably.
- Style-less old content still renders safely as Normal.

## Phase 5: Autosave, Recovery, And Update Safety

Goal: writing survives crashes, restarts, and updates.

Current status:

- Started.
- Added a lightweight editor draft channel separate from the normal debounced full save path.
- Renderer edits now schedule a short-debounce draft write through `electronAPI.saveEditorDraft`, while the existing full save path remains the source of truth after successful save.
- Drafts are persisted atomically in `editor-draft.json` and are considered only after an unclean shutdown when the draft timestamp is newer than the last full save.
- Successful full saves clear the editor draft, so clean app exits do not resurrect stale draft content.
- App info now exposes editor draft health (`exists`, `valid`, timestamp, size, newer-than-save, recoverable-after-crash), and the data safety surface can mention ready or invalid draft state without blocking normal autosave.
- Storage regression tests now cover recovering a newer draft after unclean shutdown, ignoring draft content after clean shutdown, reporting draft health, and surviving an invalid draft file.
- Update safety now validates downloaded HTML runtime assets before writing a versioned runtime override: the file must look like an AcademiQ runtime and must not introduce remote script URLs.
- Updater regression tests now verify unrelated/corrupt HTML updates are rejected before `runtime-overrides/<version>` is created.
- AppData cleanup now explicitly separates user data from stale runtime files: document history, crash draft, session state, capture queue/targets/agent state, extension config, PDF cache, settings, and primary/recovery data files stay in place while stray old `.html` / `.js` / `src` / `vendor` runtime leftovers are archived under `runtime-legacy`.
- Updater tests now cover that cleanup allowlist so future update hardening cannot accidentally delete local writing/capture data.
- Runtime override cleanup now has regression coverage for the important split: the current version with a matching renderer signature stays active, stale versioned overrides are archived, and non-version garbage folders are ignored rather than treated as valid runtime.

Tasks:

- Keep bounded recovery snapshots with timestamps and document IDs.
- Use atomic writes for editor data and recovery metadata.
- Add recovery status visibility without noisy UI.
- Test app close, OS shutdown simulation where practical, and restart after dirty state.
- Keep migration/update cleanup from deleting user data.

Acceptance:

- Last safe draft can be restored after unclean exit.
- Updates do not mix stale runtime files with current app code.
- User data survives complete app quit and restart.

## Phase 6: Paste, Import, And Export Fidelity

Goal: Word, web, PDF, extension capture, and reference imports normalize into clean academic structure.

Current status:

- Started.
- Paste cleaning already strips dangerous HTML, Office/Web junk classes, hidden markup, and unsafe style properties.
- Plain-text paste can normalize paragraph and list-like content into cleaner APA-friendly structure.
- DOCX export is now guarded as `.docx` only; the legacy `.doc`/`application/msword` fallback is removed from the app runtime.
- `scripts/export-quality-gate.js` and `scripts/release-gate.js` now block regressions that would reintroduce `.doc` export behavior.
- Export quality gate also guards the composite export path so cover, table of contents, main document, bibliography, page-break markers, bibliography heading protection, and line-spacing normalization cannot be silently removed.
- Document export regression tests now verify composite export sections survive DOCX HTML generation and bibliography headings/reference entries receive export-safe classes.
- Cover page and references export behavior still needs a real app-level manual smoke pass with Word/LibreOffice before calling this phase complete.

Tasks:

- Normalize pasted HTML before it reaches the document.
- Preserve headings, lists, tables, citations, notes, and references when possible.
- Prevent junk classes and hidden spans from Word/web paste.
- Ensure DOCX export is `.docx`.
- Include cover page and references page in export when present.
- Keep unsupported features safe rather than corrupting output.

Acceptance:

- Word/web paste does not break paragraphs or lists.
- DOCX export opens in Word without repair prompts.
- APA references and citations survive export.

## Phase 7: Performance And Regression Gate

Goal: large documents remain responsive.

Current status:

- Started.
- Added `scripts/editor-stability-gate.js` as a repeated high-risk editor regression gate for citation insertion, editor commands, page layout, find/replace, shortcuts, toolbar state, UI event bindings, and editor runtime effects.
- Wired the editor stability gate into `scripts/release-gate.js`, with `AQ_EDITOR_GATE_CYCLES` available for longer local stress runs when needed.
- Added large-document smoke coverage for deterministic repeated page-layout sync and duplicate-safe citation collection on many citation spans.

Tasks:

- Add repeatable smoke tests for large documents.
- Avoid layout recalculation on every keystroke when a throttled/idempotent sync is enough.
- Track slow paths in citation rendering, bibliography refresh, layout sync, and toolbar state sync.
- Create a short manual release checklist focused on editor stability.

Acceptance:

- Typing stays responsive in long documents.
- Toolbar state updates do not cause visible flicker.
- Bibliography refresh does not block normal writing longer than necessary.

## Manual Smoke Test Before Release

Run this after any editor runtime change:

1. Type three paragraphs across a page boundary.
2. Insert `/r` parenthetical citation, continue typing on the same line.
3. Insert `/t` narrative citation, continue typing on the same line.
4. Apply H1-H5 and return to Normal.
5. Toggle bold, italic, underline, strike, subscript, superscript, and verify active states.
6. Apply left, center, right alignment.
7. Create bullet, ordered, and multilevel lists; press Enter, Tab, Shift+Tab, and Backspace.
8. Use find, next, previous, replace one, replace all, then clear find input.
9. Insert/update bibliography and verify it can continue onto a new page.
10. Export DOCX and reopen it in Word or LibreOffice.
11. Close and reopen the app; verify document content and references remain.

## Claude Handoff Notes

- Start with tests and contracts, not visual changes.
- If touching toolbar behavior, update `tests/ui-event-bindings.test.js`.
- If touching command behavior, inspect `src/tiptap-word-commands.js` and `src/tiptap-word-editor.js` together.
- If touching page layout, add a fixture/manual case to this roadmap.
- If touching citations, verify both `/r` and `/t` before stopping.
- If touching persistence, do not remove or overwrite existing AppData user data.
- Keep this roadmap updated with completed items and newly discovered risks.
