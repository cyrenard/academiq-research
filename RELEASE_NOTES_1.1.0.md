# AcademiQ Research 1.1.0 - Hardened Baseline

## Release type

Security and refactor consolidation baseline.

## User-facing impact

- No intentional workflow changes.
- No intentional feature removals.
- Focus is stability and safer runtime behavior.

## Key improvements

- Stronger CSP and renderer hardening.
- Direct renderer network surface reduced.
- Inline event handling removed from HTML.
- Runtime dependencies bundled locally in `vendor/` (less external dependency risk).

## Developer notes

- Security boundary is clearer:
  - Renderer UI logic
  - Preload narrow API surface
  - Main process validation + host allowlist
- Build packaging now includes `vendor/**/*`.
- Release helper added: `npm run release:baseline`.

## Validation status

- `npm test`: pass
- `npm run gate:release`: pass
- `npm run build:dir`: pass
- Runtime startup smoke: pass

## Breaking changes

- None expected.
- This is a behavior-preserving hardening release.

## Remaining risks

- Large legacy runtime file still exists (`src/legacy-runtime.js`), though now externally isolated.
- Host allowlist may need controlled expansion if new data providers are added.
- Additional runtime smoke scenarios should be automated (PDF import/export, Word import, OA lookup paths).
