# Release Checklist (Hardened Baseline)

Bu checklist, hardened baseline yayinlarinda davranisi bozmadan guvenli paket cikarmak icin kullanilir.

## 1) Dogrulama

```bash
npm test
npm run gate:editor
npm run gate:release
```

Beklenen: tum testler gecer, gate `PASS` verir.

Uzun flakiness turu gerekiyorsa:

```powershell
$env:AQ_EDITOR_GATE_CYCLES=10; npm run gate:editor
```

## 2) Editor manuel smoke

Bu kisim release oncesi paketlenmis uygulamada elle yapilir:

- Uygulamayi ac, mevcut workspace ve kaynaklarin kaybolmadigini kontrol et.
- Uc paragraf yaz ve metni sayfa sonuna dogru tasir; alt margin korunmali, editor blink/jump yapmamali.
- `/r` ile parenthetical citation ekle; citation sonrasi ayni satirda yazmaya devam edebiliyor olmalisin.
- `/t` ile narrative citation ekle; format `Yazar (Yil)` olmali ve ayni satirda yazmaya devam etmeli.
- Kaynakca guncelle; kaynakca ilk sayfayi doldurursa sonraki sayfaya devam etmeli.
- H1-H5 uygula; APA 7 stilleri ve toolbar active state mantikli gorunmeli.
- Bold/italic/underline/strike/subscript/superscript ac-kapat; active highlight kaybolmamali.
- Sol/orta/sag hizalama, girinti artir/azalt ve sayfa sonu butonlarini dene.
- Bullet, ordered ve multilevel liste olustur; Enter/Tab/Shift+Tab/Backspace Word benzeri davranmali.
- Find/replace ac; arama kutusuna yazarken focus editor'e kacmamali, temizleyince highlight kalmamali.
- DOCX export al; dosya uzantisi `.docx` olmali, Word/LibreOffice repair istememeli.
- Uygulamayi kapat/ac; son yazilan belge, kaynaklar ve capture gelenleri korunmali.

## 3) Build

```bash
npm run build
```

Beklenen artefaktlar:

- `dist/AcademiQ-Setup-<version>.exe`
- `dist/AcademiQ-Setup-<version>.exe.blockmap`

Not: Build oncesi uygulama aciksa Windows dosya kilidi olusabilir.

## 4) Hash olusturma

PowerShell:

```powershell
$h=(Get-FileHash "dist\AcademiQ-Setup-<version>.exe" -Algorithm SHA256).Hash.ToLower()
"$h  AcademiQ-Setup-<version>.exe" | Set-Content "dist\AcademiQ-Setup-<version>.exe.sha256"
```

## 5) Smoke test

- Paketlenmis uygulama aciliyor mu?
- Editor/PDF/notes temel akislar acilis aninda hata veriyor mu?
- Workspace bazli TOC + kaynakca izolasyonu korunuyor mu?
- Browser Capture Agent status ayarlarda dogru gorunuyor mu?
- Extension uygulama kapaliyken workspace listesini ve queue durumunu gorebiliyor mu?

## 6) Release metni

- `RELEASE_NOTES_<version>.md` icerigini kullan.
- "No intentional breaking changes" notunu ekle.
- Bu surumun "behavior-preserving hardening baseline" oldugunu belirt.
