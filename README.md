# AcademiQ Research

Electron-based desktop app for academic writing, citations, references, notes, and PDF workflows.

## Hardened Baseline (v1.1.0)

This release is a security and maintainability baseline. Behavior is preserved as much as possible.

### Security hardening delivered

- CSP tightened:
  - `script-src 'self'`
  - `connect-src 'self'`
  - `unsafe-inline` removed for scripts
  - `unsafe-eval` removed
- Renderer security:
  - `webSecurity: true`
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
- Network ownership:
  - Renderer external fetch flows moved behind preload/main IPC APIs
  - Main process network routes restricted with allowlisted hosts
- Inline handler cleanup:
  - Inline HTML event attributes removed from UI markup
  - Event wiring centralized in `src/ui-event-bindings.js`
- External dependency control:
  - CDN script/CSS dependencies moved to local `vendor/`
  - Local `pdfjs` worker path in runtime

### Why this baseline matters

- Reduces XSS impact by removing inline script execution paths.
- Reduces exfiltration risk by blocking direct renderer network access.
- Shrinks trust boundary: privileged/network operations are now explicit and narrow.
- Improves release reproducibility by bundling runtime web dependencies locally.

## Core files in hardened baseline

- `academiq-research.html`
- `main.js`
- `preload.js`
- `src/ui-event-bindings.js`
- `src/legacy-runtime.js`
- `src/app-bootstrap.js`
- `vendor/`

## Validate and build

```bash
npm test
npm run gate:release
npm run build:dir
```

For baseline release prep:

```bash
npm run release:baseline
```

## Packaging notes

- `vendor/**/*` is included in `electron-builder` file list.
- Packaged mode sync now copies both `src/` and `vendor/` assets to app override directory when needed.

## Breaking changes

No intentional user-facing breaking changes.

This baseline is a hardening release with behavior parity goals.
