# Release Checklist (Hardened Baseline)

Bu checklist, hardened baseline yayinlarinda davranisi bozmadan guvenli paket cikarmak icin kullanilir.

## 1) Dogrulama

```bash
npm test
npm run gate:release
```

Beklenen: tum testler gecer, gate `PASS` verir.

## 2) Build

```bash
npm run build
```

Beklenen artefaktlar:

- `dist/AcademiQ-Setup-<version>.exe`
- `dist/AcademiQ-Setup-<version>.exe.blockmap`

Not: Build oncesi uygulama aciksa Windows dosya kilidi olusabilir.

## 3) Hash olusturma

PowerShell:

```powershell
$h=(Get-FileHash "dist\AcademiQ-Setup-<version>.exe" -Algorithm SHA256).Hash.ToLower()
"$h  AcademiQ-Setup-<version>.exe" | Set-Content "dist\AcademiQ-Setup-<version>.exe.sha256"
```

## 4) Smoke test

- Paketlenmis uygulama aciliyor mu?
- Editor/PDF/notes temel akislar acilis aninda hata veriyor mu?
- Workspace bazli TOC + kaynakca izolasyonu korunuyor mu?

## 5) Release metni

- `RELEASE_NOTES_<version>.md` icerigini kullan.
- "No intentional breaking changes" notunu ekle.
- Bu surumun "behavior-preserving hardening baseline" oldugunu belirt.

