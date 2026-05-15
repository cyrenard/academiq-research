# AcademiQ Research

**An open-source APA 7 writing workspace for academic papers, theses, and literature reviews.**

AcademiQ Research is built for people who lose focus while switching between Word, Zotero/Mendeley, Acrobat, Excel literature matrices, note apps, and AI tools during academic writing.

The goal is simple:

> **Type, cite, read, annotate, organize, and export from one focused academic writing environment.**

## Why it exists

Academic writing is not only writing. A typical workflow often means:

- drafting in Word,
- managing references in Zotero or Mendeley,
- reading and annotating PDFs in a separate reader,
- tracking studies in an Excel literature matrix,
- keeping notes somewhere else,
- fixing APA 7 citations and references repeatedly,
- exporting files for supervisors, journals, or AI tools.

AcademiQ brings these steps into a single local-first desktop workspace.

## Core idea

The center of the app is an APA 7-oriented editor.

The side panels support the writing flow:

- PDFs, annotations, metadata, and reference tools on one side,
- notes, tags, and the literature matrix on the other,
- automatic citation and reference handling inside the editor.

The main design principle is:

> **Do not break the writer's focus.**

## Killer feature: fast APA 7 citations

AcademiQ is designed around citation insertion that feels like typing.

- Type `/r` to insert a parenthetical citation: `(Bandura, 1997)`
- Type `/t` to insert a narrative citation: `Bandura (1997)`
- The APA 7 reference list updates automatically.

You can do citation management with Word + Zotero/Mendeley, but it often takes several clicks and breaks concentration. AcademiQ aims to make the same action part of the writing flow.

## Main features

### Academic editor

- APA 7-oriented writing environment
- APA 7 heading levels 1-5
- Automatic reference list generation
- Margin notes for writing tasks such as “revise this section” or “add citation here”
- Focus/zen writing mode
- DOCX import
- DOCX export
- PDF export

### Citation and reference workflow

- Fast `/r` parenthetical citations
- Fast `/t` narrative citations
- Automatic APA 7 references
- Add references from DOI
- Add references from BibTeX
- Add references from RIS
- Add references from pasted bibliography text
- Reference edit/delete tools
- Duplicate reference review
- Metadata health checks
- RIS/BibTeX/CSL JSON export
- Zotero import support

### PDF reading and annotation

- Built-in PDF reader
- Manual PDF attachment
- Open-access PDF download when available
- Highlights and annotations
- Send PDF highlights to notes
- Send PDF highlights to the literature matrix
- Annotated PDF export
- PDF search, zoom, navigation, thumbnails, outline, and related tools
- OCR support

### Notes and literature matrix

- Workspace notes
- Tags and note filters
- Insert notes into the editor
- Link notes to references
- Literature matrix for purpose, method, sample, findings, limitations, and personal notes
- Matrix editing inside the workspace
- Excel export for the literature matrix
- AI-assisted matrix auto-fill infrastructure in progress

### Browser capture and workspace files

- Browser capture agent/extension for saving sources while browsing
- Incoming browser captures can be added to the workspace
- Workspace PDFs are stored as files using article-title-based names
- This makes it easy to send a workspace PDF folder to tools such as NotebookLM or other AI research assistants

## Local-first and privacy-oriented

AcademiQ is designed as a local desktop app. Drafts, PDFs, notes, annotations, references, and workspaces are stored on the user's device.

Some features may use the internet when requested, such as DOI lookup, metadata lookup, open-access PDF retrieval, update checks, or browser capture workflows. The goal is to keep the core writing workflow local and transparent.

## Current status

AcademiQ Research is an early but actively used open-source project.

It is currently Turkish-first, and English localization is on the roadmap before broader global sharing.

The app is already used by its creator for real academic writing workflows. The main current focus is polishing the product, improving reliability, strengthening APA 7 edge cases, and preparing the English/global user experience.

## Development note

AcademiQ Research is an AI-assisted open-source project created from a real academic writing workflow.

I am not a professional software developer. I am building and testing the app as an academic user who needed a smoother APA 7 writing environment.

The project is developed transparently, with source code, changelogs, tests, and issues available in this repository. Technical contributions, code review, APA 7 edge-case reports, localization improvements, accessibility feedback, and workflow feedback are welcome.

## Reliability and testing

Recent releases have focused heavily on maintainability, modularization, and test coverage.

The current architecture includes:

- Electron desktop app
- React-based renderer shell
- local-first workspace storage
- test coverage for editor, citation, bibliography, PDF, import/export, metadata, and matrix workflows
- release gates for regression-sensitive flows
- security hardening for renderer boundaries and HTML rendering paths

Typical validation commands:

```bash
npm test
npm run typecheck
npm run test:renderer
npm run gate:release
npm run build:dir
```

## Known limitations

- The app is currently Windows-first.
- The interface is currently Turkish-first; English localization is planned before global promotion.
- Some legacy editor/PDF internals are still being gradually modularized.
- Advanced DOCX round-tripping can be difficult for any editor; real academic documents should be tested before relying on a new workflow.
- AI-assisted matrix features should be reviewed by users; they are intended to suggest and organize evidence, not replace scholarly judgment.

## Roadmap

Near-term priorities:

- English localization
- Global-ready README, screenshots, and demo video
- APA 7 document health/checking tools
- More citation/reference edge-case testing
- More polished onboarding and sample workspace
- Better first-run experience for new academic users
- Continued architecture cleanup and regression testing
- AI-assisted literature matrix auto-fill with user review

## Contributing

Contributions are welcome, especially in these areas:

- English localization and academic terminology
- APA 7 citation/reference edge cases
- DOCX import/export quality
- PDF annotation workflows
- accessibility
- code review and architecture hardening
- UI/UX polish
- tests and regression coverage
- documentation and tutorial writing

If you are an academic writer, graduate student, researcher, or developer who cares about writing workflows, feedback is very welcome.

## License

MIT

## Original hardened baseline notes

Earlier versions of AcademiQ included a security and maintainability hardening baseline. The baseline focused on reducing renderer risk and keeping privileged operations behind explicit preload/main-process APIs.

Delivered hardening included:

- stricter CSP
- `webSecurity: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- renderer network flows moved behind preload/main IPC APIs
- local bundled runtime dependencies instead of CDN scripts
- centralized event wiring
- local PDF.js worker path

These notes are kept here for transparency while the README is being repositioned as a product-facing page.