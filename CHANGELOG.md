# Changelog

## 1.1.0 - Hardened Baseline

### Summary

Release-ready hardening baseline focused on security, maintainability, and behavior parity.

### Security

- CSP tightened to `script-src 'self'` and `connect-src 'self'`.
- Removed script-side `unsafe-inline` and `unsafe-eval` reliance.
- Renderer hardening with strict Electron webPreferences (`webSecurity/contextIsolation/sandbox`).
- Network access moved to controlled IPC surfaces with host allowlist checks.

### Refactor and structure

- Inline HTML event attributes removed from markup.
- Event wiring centralized under `src/ui-event-bindings.js`.
- Inline runtime script moved to external modules:
  - `src/legacy-runtime.js`
  - `src/app-bootstrap.js`

### Dependency and packaging

- CDN runtime script/CSS dependencies moved under `vendor/`.
- `pdfjs` worker switched to local path.
- `electron-builder` include list updated to package `vendor/**/*`.
- Packaged override sync updated to copy `vendor/` assets.

### Validation

- `npm run gate:release` passed.
- `npm run build:dir` passed.
- Runtime launch smoke check passed.

### Breaking changes

- None intended.
- Release goal: hardening with behavior preservation.
