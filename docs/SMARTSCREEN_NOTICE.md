# SmartScreen Notice

AcademiQ Research uses a self-signed Authenticode certificate for the Tauri installer during the migration period.

## What Users Will See

Windows SmartScreen can show an "Unknown publisher" warning for the installer.

Expected path:

1. Click "More info".
2. Click "Run anyway".
3. Continue the NSIS installer.

This warning is expected with self-signed certificates. The binary is technically signed, but the certificate does not have Microsoft reputation.

## Why Self-Signed

- EV code signing certificates cost roughly hundreds of dollars per year.
- Standard code signing certificates still cost money and do not instantly remove reputation prompts.
- SignPath.io free tier is mainly for public open-source repositories.
- Self-signed signing has no royalty and no license cost.

## Security Boundary

Auto-update security does not rely on SmartScreen reputation. `tauri-plugin-updater` verifies update signatures with the updater public key embedded in `tauri.conf.json`.

Some corporate antivirus or group policy setups may still block self-signed installers. If that happens, users can whitelist the certificate thumbprint or AcademiQ can switch the same signing pipeline to an EV certificate later.

## Developer Test Flow

During development, do not install the self-signed certificate into `CurrentUser\Root` or `TrustedPublisher`. Keep it only in `CurrentUser\My` for `signtool sign`.

That means a locally signed `.exe` should still behave like an end-user download: SmartScreen can warn, and `signtool verify /pa` can fail because the root is not trusted. This is intentional. It preserves user-reality fidelity so the migration can test the actual warning path instead of hiding it on the dev machine.

Use `signtool verify /v <installer.exe>` only as a technical "has a signature" check during local development.

## Future Upgrade

After cutover, the signing script can switch to SignPath.io OSS, Sectigo, DigiCert, or Azure Trusted Signing by changing only the signing certificate source in `scripts/sign-installer.ps1`.
