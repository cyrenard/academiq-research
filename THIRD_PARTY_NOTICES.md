# Third Party Notices — AcademiQ Research

AcademiQ Research (the "Software") is distributed by AcademiQ under the MIT License
(see [LICENSE](LICENSE) if present, or `package.json`'s `license` field).

The Software bundles, links against, or relies on third-party software and assets
listed below. All bundled components are permissively licensed and free for
commercial redistribution. This document satisfies the attribution and notice
requirements of those licenses.

If you discover a missing attribution please open an issue.

---

## 1. Bundled Fonts (Fallback Only)

The Software targets Microsoft fonts (Times New Roman, Arial, Calibri) for APA 7
output. **No Microsoft fonts are bundled.** At runtime, the Software reads fonts
from the end user's Windows installation (e.g. `%WINDIR%\Fonts\times.ttf`) and
embeds them into the generated PDF. This mirrors how Microsoft Word, LibreOffice,
and Adobe products handle user-installed fonts and is permitted by the operating
system's font use license.

When system fonts are unavailable, the Software falls back to the following
open-licensed metric-compatible alternatives, which **are** bundled.

### Liberation Sans, Liberation Serif

- Source: <https://github.com/liberationfonts/liberation-fonts>
- License: SIL Open Font License 1.1
- License text: `src-tauri/resources/fonts/fallback/LICENSE-Liberation.txt`
- Files bundled:
  - LiberationSerif-Regular.ttf, LiberationSerif-Bold.ttf,
    LiberationSerif-Italic.ttf, LiberationSerif-BoldItalic.ttf
  - LiberationSans-Regular.ttf, LiberationSans-Bold.ttf,
    LiberationSans-Italic.ttf, LiberationSans-BoldItalic.ttf

### Carlito

- Source: <https://fontlibrary.org/en/font/carlito>
- License: SIL Open Font License 1.1
- License text: `src-tauri/resources/fonts/fallback/LICENSE-Carlito.txt`
- Files bundled: Carlito-Regular.ttf, Carlito-Bold.ttf, Carlito-Italic.ttf,
  Carlito-BoldItalic.ttf

---

## 2. Bundled Binaries

### PDFium

- Source: <https://github.com/bblanchon/pdfium-binaries>
  (upstream: <https://pdfium.googlesource.com/pdfium/>)
- License: BSD 3-Clause (PDFium) + Apache 2.0 (build scripts)
- File bundled: `src-tauri/binaries/pdfium.dll`
- Used for: PDF page rendering, exotic PDF parsing, OCR pre-processing

PDFium Copyright (c) 2014 The PDFium Authors. All rights reserved.
The full BSD-3-Clause license text:

```
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.
    * Neither the name of Google Inc. nor the names of its contributors may
be used to endorse or promote products derived from this software without
specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

### capture-agent sidecar (Node.js runtime via pkg)

- File bundled: `src-tauri/binaries/capture-agent-x86_64-pc-windows-msvc.exe`
- Contents: AcademiQ-authored JavaScript (`src-sidecar/capture-agent/`) packaged
  with `pkg`, which embeds a Node.js runtime.
- Node.js License: MIT, with additional licenses for its dependencies
  (V8: BSD-3, OpenSSL: Apache-2.0, etc.)
- Node.js project license summary: <https://github.com/nodejs/node/blob/main/LICENSE>
- pkg License: MIT

---

## 3. Bundled Dictionaries

### dictionary-tr (Turkish spell dictionary)

- Source: <https://github.com/wooorm/dictionaries> (npm package `dictionary-tr`)
- License: MIT
- License text: `src-tauri/resources/dict/tr/LICENSE`
- Copyright: (c) 2014 Harun Reşit Zafer
- Files bundled: `index.aff`, `index.dic`

---

## 4. Vendored JavaScript Libraries (`vendor/`)

These libraries are checked into the repository and shipped to the browser at
runtime.

| File | Library | Version | License | Source |
|---|---|---|---|---|
| `pdf.min.js`, `pdf.worker.min.js`, `pdf_viewer.css` | Mozilla PDF.js | bundled | Apache 2.0 | <https://github.com/mozilla/pdf.js> |
| `mammoth.browser.min.js` | mammoth.js | bundled | BSD 2-Clause | <https://github.com/mwilliamson/mammoth.js> |
| `html2pdf.bundle.min.js` | html2pdf.js (includes jsPDF, html2canvas) | bundled | MIT | <https://github.com/eKoopmans/html2pdf.js> |
| `file-saver-shim.js` | AcademiQ-authored shim around FileSaver.js | n/a | MIT (FileSaver) | <https://github.com/eligrey/FileSaver.js> |

### Tiptap

- File: `tiptap-bundle.js` (vendored pre-built bundle of the Tiptap editor + ProseMirror)
- License: MIT
- Source: <https://github.com/ueberdosis/tiptap>
- Tiptap is built on ProseMirror (MIT, Marijn Haverbeke).

---

## 5. Rust Dependencies (top-level)

The following crates are direct dependencies declared in `src-tauri/Cargo.toml`.
Each crate's own license applies; the list below is sourced from each crate's
metadata at the time of writing.

| Crate | Version | License | Purpose |
|---|---|---|---|
| `tauri` | 2 | MIT OR Apache-2.0 | Desktop application framework |
| `tauri-build` | 2 | MIT OR Apache-2.0 | Build helper |
| `tauri-plugin-dialog` | 2 | MIT OR Apache-2.0 | Native file dialogs |
| `tauri-plugin-opener` | 2 | MIT OR Apache-2.0 | External URL opener |
| `tauri-plugin-shell` | 2 | MIT OR Apache-2.0 | Sidecar process control |
| `tauri-plugin-updater` | 2 | MIT OR Apache-2.0 | Auto-update |
| `serde`, `serde_json` | 1 | MIT OR Apache-2.0 | Serialization |
| `tokio` | 1 | MIT | Async runtime |
| `reqwest` | 0.12 | MIT OR Apache-2.0 | HTTP client (CrossRef, DOI, etc.) |
| `rusqlite` | 0.37 (bundled SQLite) | MIT (binding) + Public Domain (SQLite engine) | Local database |
| `spellbook` | 0.4 | Apache-2.0 | Hunspell-compatible spell checker |
| `printpdf` | 0.7 | MIT OR Apache-2.0 | PDF generation |
| `lopdf` | 0.34 | MIT | PDF reading & lightweight annotation |
| `pdfium-render` | 0.8 | MIT OR Apache-2.0 | PDFium bindings |
| `ttf-parser` | 0.21 | MIT OR Apache-2.0 | Font metrics |
| `image` | 0.25 | MIT OR Apache-2.0 | PNG encoding |
| `base64` | 0.22 | MIT OR Apache-2.0 | Binary encoding |
| `zip` | 4 | MIT | Backup archive |

A complete transitive dependency list with verbatim license texts can be
generated at any time with:

```bash
cargo install cargo-about
cd src-tauri
cargo about generate about.hbs > ../THIRD_PARTY_LICENSES_FULL.html
```

---

## 6. JavaScript / TypeScript Dependencies

The following npm packages are runtime or build-time dependencies. All are
MIT-licensed unless noted otherwise.

### Runtime (renderer)

| Package | License | Source |
|---|---|---|
| `dictionary-tr` | MIT | <https://github.com/wooorm/dictionaries> |
| `nspell` | MIT | <https://github.com/wooorm/nspell> (legacy fallback, removed during Phase 8) |
| `tesseract.js` | Apache 2.0 | <https://github.com/naptha/tesseract.js> |

### Frontend framework

| Package | License | Source |
|---|---|---|
| `react`, `react-dom` | MIT | <https://github.com/facebook/react> |
| `vite` | MIT | <https://github.com/vitejs/vite> |
| `tailwindcss`, `@tailwindcss/postcss` | MIT | <https://github.com/tailwindlabs/tailwindcss> |
| `postcss` | MIT | <https://github.com/postcss/postcss> |
| `@vitejs/plugin-react` | MIT | <https://github.com/vitejs/vite-plugin-react> |
| `clsx` | MIT | <https://github.com/lukeed/clsx> |
| `lucide-react` | ISC | <https://github.com/lucide-icons/lucide> |
| `@tauri-apps/api` | MIT OR Apache-2.0 | <https://github.com/tauri-apps/tauri> |
| `@tauri-apps/plugin-updater` | MIT OR Apache-2.0 | <https://github.com/tauri-apps/plugins-workspace> |
| `typescript` | Apache 2.0 | <https://github.com/microsoft/TypeScript> |

### Dev / test

| Package | License | Source |
|---|---|---|
| `vitest` | MIT | <https://github.com/vitest-dev/vitest> |
| `jsdom` | MIT | <https://github.com/jsdom/jsdom> |
| `@testing-library/react`, `/user-event`, `/jest-dom` | MIT | <https://github.com/testing-library> |
| `@types/*` | MIT | DefinitelyTyped |

### Legacy build path (Phase 8 retirement)

The Electron-based build path remains as a legacy fallback during the Tauri
migration. It will be retired after the dual-run cutover.

| Package | License | Notes |
|---|---|---|
| `electron` | MIT (with multiple BSD/Apache subcomponents — Chromium, V8, Node) | Removed in Phase 8 |
| `electron-builder` | MIT | Removed in Phase 8 |

---

## 7. System / Runtime Components (Not Bundled)

### Microsoft Edge WebView2 Runtime

- Provided by the operating system on Windows 10/11; absent installations are
  prompted to install the **Evergreen Bootstrapper** by the NSIS installer.
- License: Microsoft Software License Terms for the Microsoft Edge WebView2
  Runtime (freely redistributable per the WebView2 distribution allowance).
- AcademiQ does not bundle the WebView2 binaries; the installer uses Microsoft's
  official Evergreen bootstrapper.

### Microsoft Visual C++ Redistributable

- Required by Rust MSVC-toolchain binaries. May be installed by the NSIS
  installer on first run if absent.
- Distribution allowed under Microsoft's Visual Studio redistribution license.

### Microsoft Times New Roman / Arial / Calibri (system fonts)

- **Not bundled.** Read from `%WINDIR%\Fonts\` at runtime, embedded into
  user-generated PDF output. This is the standard mechanism used by Microsoft
  Word, LibreOffice, Adobe Acrobat, and similar applications. End users are
  responsible for the licensing of fonts installed on their own systems.

### Local LLM (optional, user-supplied)

- The `localMatrixAssistant:*` features make HTTP requests to a local LLM
  endpoint (e.g. LM Studio, Ollama) supplied by the user. No model weights are
  bundled or distributed by AcademiQ. The user is responsible for the license
  of any local model they choose to use.

---

## 8. Browser Extensions (`browser-capture-extension/`)

The Chromium and Firefox extension code under `browser-capture-extension/` is
AcademiQ-authored and distributed under the same MIT terms as the main
application.

---

## 9. Application Icon and Branding

### Icon (`icon.ico`, `icon.png`)

The application icon is **generated programmatically** by the Node.js script
[`create-icon.js`](create-icon.js) bundled at the repository root. The script
uses deterministic mathematical drawing (geometric primitives, RGBA pixel
manipulation) — it is not the output of a generative-image AI model.

The `create-icon.js` source was produced through AI-assisted coding (the same
manner as code written with GitHub Copilot, ChatGPT, or similar assistants),
reviewed, integrated and customised by AcademiQ. The script and its output are
treated as standard AI-assisted software work product. Copyright in the script
and its deterministic output is held by AcademiQ, subject to the limits that
each jurisdiction places on AI-assisted works.

### Wordmark

"**AcademiQ**" and "**AcademiQ Research**" are used as the project's wordmark
and product name by AcademiQ. Any registered trademark rights in these names
belong to AcademiQ.

### Permitted use

Third parties may reproduce the icon and wordmark only:

- To accurately reference the AcademiQ Research project (e.g. in articles,
  reviews, compatibility notices).
- Within unmodified distributions of this software.

Use of the icon or wordmark in a manner that suggests endorsement, affiliation,
or that creates user confusion is not permitted without prior written consent
from AcademiQ.

---

## 10. Reproducing the Full License List

This document lists direct, bundled, and runtime dependencies. To produce the
full transitive license list (recommended before each release):

```bash
# Rust transitive
cargo install cargo-about
cd src-tauri
cargo about generate about.hbs > ../THIRD_PARTY_LICENSES_FULL.html

# Node transitive
npx license-checker --production --csv > THIRD_PARTY_NPM.csv
```

---

## Acknowledgements

AcademiQ Research stands on the shoulders of the open source community. Many of
the dependencies listed above are maintained by volunteers; if you find this
software useful, please consider supporting the projects above.

— AcademiQ
