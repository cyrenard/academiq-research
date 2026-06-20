# Fedora Beta Release

Fedora is a beta target for the 1.24.1 line. Windows remains the release-candidate target; Linux artifacts are published so they can be installed and smoke-tested on a real Fedora machine.

## GitHub Release Artifacts

Pushing a tag such as `v1.24.1-beta.1` runs `.github/workflows/release.yml` and publishes:

- `AcademiQ-Setup-<version>.exe` for Windows
- one `.rpm` package for Fedora beta testing
- one `.AppImage` for portable Linux testing
- `latest-windows.json`, `latest-linux.json`
- `SHA256SUMS-windows.txt`, `SHA256SUMS-linux.txt`

## Linux Runtime Inputs

The Linux release workflow fetches `libpdfium.so` from the official `pdfium-binaries` release feed during the build. Tauri expects the packaged sidecar name to resolve from `externalBin: ["binaries/capture-agent"]`, so the generated file name is:

```text
src-tauri/binaries/capture-agent-x86_64-unknown-linux-gnu
```

## Fedora Live Smoke

On Fedora, download the `.rpm` from the prerelease and run:

```bash
sudo dnf install ./academiq-research-*.rpm
academiq-research-tauri
```

Smoke criteria:

- App launches without missing WebKit/PDFium/sidecar errors.
- Existing migrated data opens read-only first, then normal save/autosave works.
- PDF open/render works.
- Browser capture setup opens and the sidecar status responds.
- DOCX export and PDF export produce files.
- App closes and relaunches with the same workspace/document state.

If `dnf install` reports missing runtime libraries, record the exact package names and add them to the Linux dependency checklist before promoting Linux beyond beta.
