# LEGACY_RUNTIME_SPLIT_PLAN — legacy-runtime.js emekliye ayırma

> Hedef: `src/legacy-runtime.js` (~14.8k satır) doc-engine monolitini, **state
> emekliliği** yoluyla aşamalı küçültmek. Her dilim: tek domain → state
> okuma/yazmasını appStore'a bağla (legacy `S` yalnızca write-through alıcısı
> kalır) → `tsc --noEmit` + `vitest` yeşil → canlı `tauri:dev` doğrulaması →
> ayrı commit. Son güncelleme: 2026-06-04.

## 0) Mevcut mimari (keşif)
```
S (global, legacy-runtime.js:108) ──write-through (legacy-state-bridge)──► appStore ──► React (selector)
   │
   ├── *-state.js singleton'ları (index.html:94-117) ZATEN ayrılmış:
   │     notes / notebook / highlight / annotation / pdf-tabs / state-schema /
   │     document / bibliography / library / doc-tabs / sync
   │
   └── legacy-runtime.js = DAVRANIŞ/RENDER/UI katmanı (script-tag, global scope, IIFE değil)
```
- Yükleme: `index.html` sırayla script-tag; `legacy-runtime.js` EN SON (satır 118).
- `S` kanonik kalıcı state; appStore write-through ile besleniyor. React tarafı
  appStore selector'larıyla okur.
- `academiq-research.html` (kök) = ESKİ tek-dosya arşiv sürümü; canlı uygulamanın
  parçası DEĞİL. Dokunma.
- DOKUNMA YASAĞI: `experiments/aq-engine/**` (editör motoru). `trackChangesEnabled`
  okumaları oradan write-through ile beslenir.

## 1) Domain sınıflandırması (legacy-runtime.js TOC'a göre)
- **Kategori A — saf veri / CRUD** (appStore'a en kolay; çoğu React'e zaten taşınmış):
  DOCUMENT TABS, WORKSPACES, NOTEBOOKS, NOTES, REFS, APA 7, CITATION COUNT, CUSTOM LABELS.
- **Kategori B — DOM-ağır UI** (React'e taşınabilir): UI/modals, SYNC SETTINGS UI,
  THUMBNAIL, OUTLINE/TOC, FIND & REPLACE.
- **Kategori C — pdfjs/imperatif** (taşınmaz; legacy kalır veya ayrı modül):
  PDF UPLOAD/RENDER/TABS/ANNOTATIONS/DRAWING/SEARCH/SYNC, HIGHLIGHT PERSIST,
  TIPTAP INIT (aq-engine sınırı), EXPORT, KEYBOARD SHORTCUTS.

## 2) Çalışma yöntemi (dikey dilim, en düşük riskten)
Her domain için adımlar:
1. React+appStore tarafında domain'in zaten karşılığı var mı tespit et
   (varsa legacy fonksiyonlar **ölü kod** → güvenle kaldır).
2. Yoksa: legacy fonksiyonun `S.*` okuma/yazmasını appStore'a yönlendir; mutasyonu
   `appStore.setState` veya ilgili `*-state.js` API'sine devret.
3. Her fonksiyonun TÜM çağıranlarını say (legacy-runtime içi + diğer src/*.js +
   React + HTML onclick + window expose). 1 occurrence = yalnız tanım = ölü.
4. `tsc --noEmit` + `vitest run` yeşil; canlı doğrulama; ayrı commit (sadece kendi
   dosyaların `git add`, `-A` kullanma).

## 3) Dilim sırası ve durum
| # | Dilim | Satır (yakl.) | Durum | Not |
|---|-------|---------------|-------|-----|
| 1 | DOCUMENT TABS — ölü fonksiyonlar | 1182-1235 | ✅ tamam | createDoc/switchDoc/renameDoc/deleteDoc/showDocMenu/nextDocName kaldırıldı (~54 satır). React (DocumentTabs+appStore) tam karşılıyor. `rDocTabs` (12 iç çağrı + browser-capture guard) KALDI. tsc+vitest(720) yeşil; canlı doğrulandı (belge sekmesi ekle/değiştir). |
| 2 | CUSTOM LABELS | ~12380+ | ⬜ | Basit veri dizisi; appStore'a. |
| 3 | WORKSPACES (rWS/rDocTabs ölü-kod taraması) | 1151-1181, 1423-1513 | ⬜ | React WorkspaceTabs tam karşılıyor; `rDocTabs` ve `rWS` çağrı yerleri no-op mu? |
| 4 | REFS kart aksiyonları | 6655-7257 | ⬜ | RefSidebar ile örtüşme. |
| 5 | UI modals / dropdowns | 8346-8619 | ⬜ | React modal'a. |
| 6 | PDF / TIPTAP / EXPORT (Kategori C) | — | ⬜ | Büyük ölçüde legacy kalır; kapsam dışı. |

## 4) Bulgular (dilim 1 analizi)
- React `DocumentTabs` (App.tsx:2016) handler'ları TAMAMEN appStore:
  `switchDocument` / `addDocument` / `renameDocument` / `deleteDocument`
  (app-state.ts saf fn → `persistState`). Legacy `createDoc/switchDoc/...` çağrılmıyor.
- `#doctabs` DOM elementi index.html'de YOK → `rDocTabs` no-op.
- Kaldırılan 6 fonksiyonun HTML onclick / window expose çağrısı yok (yalnızca
  `academiq-research.html` arşivinde duplicate tanım var — canlı değil).
