# Fedora Beta Bugs

Captured during Fedora live testing on 2026-06-21.

## Blockers

1. Browser capture setup is not opening.
   - Capture agent and extension installer/setup file does not open.
   - Expected: browser capture should be available end to end on Fedora.

2. Word import does not open a file picker.
   - Action: click Word import.
   - Actual: no dialog/window opens.
   - Expected: native file selection opens and import proceeds.

3. BibTeX import picker does not show `.bib` files.
   - Action: click bibliography/BibTeX import.
   - Actual: file picker opens, but `.bib` files are hidden/not selectable.
   - Expected: `.bib` files are visible and selectable.

4. Window dragging does not work.
   - Expected: app window can be dragged from the intended draggable/titlebar region.

5. PDF reader fullscreen breaks rendering.
   - Initial load: PDF is visible if fullscreen is not used.
   - Action: make PDF reader fullscreen.
   - Actual: PDF disappears; after returning to normal view it still does not render.
   - Expected: fullscreen resize keeps PDF rendered, and returning from fullscreen restores rendering.

## Initial Priority

1. Native file dialogs and Linux file filters: Word import and BibTeX import.
2. PDF viewer resize/fullscreen lifecycle.
3. Browser capture setup path and executable/open behavior.
4. Linux window drag regions/titlebar integration.
