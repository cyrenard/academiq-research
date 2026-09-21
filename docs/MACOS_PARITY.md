# macOS parity track (Beta 23 baseline)

This work starts from the live-verified `1.24.1-beta.23` Windows baseline. It does
not change the Windows NSIS or Fedora Linux release configuration. The macOS
workflow creates **test-only** Apple Silicon and Intel DMGs; it does not publish
a release or update channel.

## Automated gates

- Both macOS architectures run TypeScript, Node, renderer, and editor-stability
  suites before packaging.
- Each build uses architecture-matched PDFium and capture-agent binaries.
- macOS bundles include a compiled native Vision OCR helper for PDF OCR.
- The bundle gate checks version, architecture-specific updater manifest,
  sidecar presence, resources, and SHA-256. The workflow checks the assembled
  app bundle and its ad-hoc code signature.
- `/r` and `/t` popup search has a macOS keyboard-ownership regression test;
  the original Windows and Linux cases remain in place.

## Required live Mac acceptance before release

Test the DMG on a real Apple Silicon Mac and an Intel Mac (or disclose which
architecture remains untested). On each machine:

1. Open the app and confirm the editor and existing workspace load.
2. Type `/r` and `/t`; confirm the popup appears, receives typing immediately,
   keeps the full query after one second, filters sources, and inserts a citation.
3. Edit a document, close the app, reopen it, and confirm autosave restores the
   document and current workspace.
4. Open and render a PDF; test page navigation, search, annotations, and export.
5. Run OCR on a scanned Turkish/English PDF; confirm extracted text is usable.
6. Test the browser capture extension connection and import a reference.
7. Test DOCX import/export, bibliography, and updater behavior independently.

The ad-hoc signature is for development testing. It is **not** an Apple
Developer ID signature or notarization, so Gatekeeper may block first launch.
Do not call this a production-ready macOS release until native testing and
Developer ID signing/notarization are complete.
