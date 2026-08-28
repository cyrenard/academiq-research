# Tauri Release Pipeline

## One-Time Local Setup

Generate the updater signing key:

```powershell
cargo tauri signer generate --ci -w "$env:USERPROFILE\.tauri\academiq-updater.key"
```

The public key is committed in `src-tauri/tauri.conf.json`. The private key stays outside the repo.

Generate a local self-signed Authenticode certificate:

```powershell
.\scripts\generate-signing-cert.ps1
```

This writes `scripts/.signing-thumbprint`, which is ignored by Git.

## Local Windows Build

```powershell
npm run build
```

The Tauri build script:

1. Builds the React renderer.
2. Runs `cargo tauri build`, injecting `bundle.windows.signCommand` for signed Windows builds.
3. Authenticode-signs Windows binaries during Tauri bundling, before Tauri creates the updater `.sig`.
4. Copies artifacts to `dist/tauri`.
5. Writes `SHA256SUMS.txt` and `latest.json`.

When no updater private key is available, local/PR builds explicitly disable
updater artifact generation. They remain valid setup files for live testing,
but their `latest.json` signature is intentionally empty and must never be
published as an update channel.

For a temporary unsigned local build:

```powershell
$env:ACADEMIQ_SKIP_SIGN = "1"
npm run build
```

## GitHub Release Build

Pushing a `v*` tag runs `.github/workflows/release.yml`.

The workflow builds:

- Windows NSIS installer on `windows-latest`.
- Fedora beta Linux bundles on `ubuntu-22.04` as `.rpm` and `.AppImage`.
- A single GitHub Release that contains both platform artifact sets.

Beta tags such as `v1.24.1-beta.1` are published as prereleases.

Tag releases are fail-closed and require these GitHub secrets:

- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` for
  the Tauri updater signature on both Windows and Linux.
- `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` for
  Windows Authenticode signing.

The workflow rebuilds the capture sidecar from the tagged commit. The bundle
gate verifies sidecar presence, updater signature, HTTPS manifest URL, package
version, installer signature on Windows, and every installer SHA-256.

The Linux job does not change the committed Windows Tauri config. It runs:

```bash
ACADEMIQ_TAURI_BUNDLES=rpm,appimage node scripts/configure-tauri-linux.js
ACADEMIQ_TAURI_BUNDLES=rpm,appimage ACADEMIQ_REQUIRE_UPDATER_SIGNATURE=1 npm run build
```

That temporary CI config switches bundle targets to `rpm,appimage` and bundles `binaries/libpdfium.so`.

## Updater Manifest

`dist/tauri/latest.json` follows the Tauri updater shape:

```json
{
  "version": "1.23.0",
  "notes": "AcademiQ Research Tauri release",
  "pub_date": "2026-05-17T00:00:00.000Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<minisign signature>",
      "url": "https://updates.academiq.research/windows-x86_64/1.23.0/AcademiQ_Research_1.23.0_x64-setup.exe"
    }
  }
}
```

The endpoint placeholder configured in Tauri is:

```text
https://updates.academiq.research/{{target}}/{{current_version}}
```

Runtime endpoint mutation is not supported by Tauri 2 updater. `update:setUrl` stores channel metadata in SQLite `kv` under `update_channel`; endpoint routing remains server-side.
